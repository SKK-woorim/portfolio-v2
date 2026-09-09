-- Portfolio chatbot: source fields, pgvector knowledge index, sync queue, and RPCs.
-- The sync trigger functions are installed in 202608210002_chatbot_sync_triggers.sql.

create extension if not exists vector with schema extensions;

alter table public.portfolio_items
  add column if not exists content_text text not null default '';

alter table public.site_profile
  add column if not exists skills jsonb not null default '[]'::jsonb;

alter table public.site_profile
  drop constraint if exists site_profile_skills_is_array;

alter table public.site_profile
  add constraint site_profile_skills_is_array
  check (jsonb_typeof(skills) = 'array');

create table public.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('profile', 'portfolio', 'post')),
  source_id text not null,
  source_slug text,
  title text not null,
  source_url text not null check (
    source_url in ('/', '/about')
    or source_url like '/portfolio/%'
    or source_url like '/blog/%'
  ),
  source_updated_at timestamptz not null,
  desired_revision uuid not null default gen_random_uuid(),
  active_revision uuid,
  index_status text not null default 'pending'
    check (index_status in ('pending', 'processing', 'ready', 'failed', 'disabled')),
  content_hash text check (content_hash is null or content_hash ~ '^[0-9a-f]{64}$'),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text,
  queued_at timestamptz not null default now(),
  indexed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_type, source_id)
);

create table public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.knowledge_documents(id) on delete cascade,
  revision_id uuid not null,
  chunk_index integer not null check (chunk_index >= 0),
  heading text,
  content text not null check (length(trim(content)) > 0),
  token_count integer not null check (token_count > 0),
  embedding extensions.vector(768) not null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  unique (document_id, revision_id, chunk_index)
);

create table public.knowledge_sync_jobs (
  id bigint generated always as identity primary key,
  document_id uuid not null references public.knowledge_documents(id) on delete cascade,
  revision_id uuid not null,
  action text not null check (action in ('upsert', 'disable', 'delete')),
  status text not null default 'queued' check (status in ('queued', 'processing', 'done', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_id, revision_id)
);

-- The route handler stores only keyed hashes, never raw IP addresses or session IDs.
create table public.chat_rate_limits (
  identifier_kind text not null check (identifier_kind in ('session_minute', 'ip_hour')),
  identifier_hash text not null check (length(identifier_hash) between 1 and 256),
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (identifier_kind, identifier_hash)
);

create index knowledge_documents_status_index
  on public.knowledge_documents (index_status, source_type, source_updated_at desc);
create index knowledge_documents_indexed_at_index
  on public.knowledge_documents (indexed_at desc nulls last);
create index knowledge_chunks_document_revision_index
  on public.knowledge_chunks (document_id, revision_id, chunk_index);
create index knowledge_chunks_embedding_hnsw_index
  on public.knowledge_chunks using hnsw (embedding extensions.vector_cosine_ops)
  with (m = 16, ef_construction = 64);
create index knowledge_sync_jobs_claim_index
  on public.knowledge_sync_jobs (status, available_at, created_at)
  where status in ('queued', 'processing');
create unique index knowledge_sync_jobs_one_queued_per_document_index
  on public.knowledge_sync_jobs (document_id)
  where status = 'queued';
create index chat_rate_limits_updated_at_index
  on public.chat_rate_limits (updated_at);

create trigger knowledge_documents_set_updated_at
  before update on public.knowledge_documents
  for each row execute procedure public.set_updated_at();
create trigger knowledge_sync_jobs_set_updated_at
  before update on public.knowledge_sync_jobs
  for each row execute procedure public.set_updated_at();

alter table public.knowledge_documents enable row level security;
alter table public.knowledge_chunks enable row level security;
alter table public.knowledge_sync_jobs enable row level security;
alter table public.chat_rate_limits enable row level security;

create policy "knowledge documents: admin read"
  on public.knowledge_documents for select to authenticated
  using (public.is_admin());
create policy "knowledge jobs: admin read"
  on public.knowledge_sync_jobs for select to authenticated
  using (public.is_admin());

-- The public app can never query knowledge text/vectors or queue rows directly.
revoke all on table public.knowledge_documents from anon, authenticated;
revoke all on table public.knowledge_chunks from anon, authenticated;
revoke all on table public.knowledge_sync_jobs from anon, authenticated;
revoke all on table public.chat_rate_limits from anon, authenticated;
revoke all on sequence public.knowledge_sync_jobs_id_seq from anon, authenticated;
grant select on table public.knowledge_documents to authenticated;
grant select on table public.knowledge_sync_jobs to authenticated;
grant select, insert, update, delete on table public.knowledge_documents to service_role;
grant select, insert, update, delete on table public.knowledge_chunks to service_role;
grant select, insert, update, delete on table public.knowledge_sync_jobs to service_role;
grant usage, select on sequence public.knowledge_sync_jobs_id_seq to service_role;

-- Vector search is service-role-only and always verifies the active revision.
create or replace function public.match_knowledge_chunks(
  p_query_embedding extensions.vector(768),
  p_match_count integer default 12
)
returns table (
  chunk_id uuid,
  document_id uuid,
  revision_id uuid,
  chunk_index integer,
  heading text,
  content text,
  token_count integer,
  metadata jsonb,
  source_type text,
  source_id text,
  source_slug text,
  title text,
  source_url text,
  source_updated_at timestamptz,
  similarity double precision
)
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select
    chunk.id,
    document.id,
    chunk.revision_id,
    chunk.chunk_index,
    chunk.heading,
    chunk.content,
    chunk.token_count,
    chunk.metadata,
    document.source_type,
    document.source_id,
    document.source_slug,
    document.title,
    document.source_url,
    document.source_updated_at,
    (1 - (chunk.embedding <=> p_query_embedding))::double precision as similarity
  from public.knowledge_chunks as chunk
  inner join public.knowledge_documents as document
    on document.id = chunk.document_id
   and document.active_revision = chunk.revision_id
  where document.index_status = 'ready'
  order by chunk.embedding <=> p_query_embedding
  limit least(greatest(coalesce(p_match_count, 12), 1), 50);
$$;

-- Claims exactly one current job. A crashed worker's lock becomes claimable again.
create or replace function public.claim_knowledge_sync_job(
  p_worker_id text,
  p_lock_timeout_seconds integer default 600
)
returns table (
  job_id bigint,
  document_id uuid,
  revision_id uuid,
  action text,
  attempt_count integer,
  source_type text,
  source_id text,
  source_slug text,
  title text,
  source_url text,
  source_updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_job public.knowledge_sync_jobs%rowtype;
  v_timeout interval;
begin
  if p_worker_id is null or length(trim(p_worker_id)) not between 1 and 200 then
    raise exception 'A worker ID between 1 and 200 characters is required';
  end if;

  v_timeout := make_interval(secs => least(greatest(coalesce(p_lock_timeout_seconds, 600), 30), 3600));

  -- Superseded work must never be reclaimed or activated.
  update public.knowledge_sync_jobs as job
     set status = 'done', locked_at = null, locked_by = null, last_error = null
    from public.knowledge_documents as document
   where job.document_id = document.id
     and job.status in ('queued', 'processing')
     and job.revision_id <> document.desired_revision;

  -- A fourth crashed/expired attempt is terminal just like a fourth reported failure.
  with exhausted as (
    update public.knowledge_sync_jobs as job
       set status = 'failed',
           locked_at = null,
           locked_by = null,
           last_error = coalesce(job.last_error, 'Worker lock expired after the final attempt')
      from public.knowledge_documents as document
     where job.document_id = document.id
       and job.revision_id = document.desired_revision
       and job.status = 'processing'
       and job.attempt_count >= 4
       and job.locked_at <= now() - v_timeout
    returning job.document_id, job.revision_id, job.attempt_count, job.last_error
  )
  update public.knowledge_documents as document
     set index_status = 'failed',
         attempt_count = exhausted.attempt_count,
         last_error = left(exhausted.last_error, 1000)
    from exhausted
   where document.id = exhausted.document_id
     and document.desired_revision = exhausted.revision_id;

  select job.*
    into v_job
    from public.knowledge_sync_jobs as job
    inner join public.knowledge_documents as document
      on document.id = job.document_id
     and document.desired_revision = job.revision_id
   where job.attempt_count < 4
     and (
       (job.status = 'queued' and job.available_at <= now())
       or (
         job.status = 'processing'
         and job.locked_at <= now() - v_timeout
       )
     )
   order by job.available_at, job.created_at, job.id
   -- Lock the document before changing its queued job. The enqueue path uses the
   -- same document -> job lock order, preventing save/claim deadlocks.
   for update of document skip locked
   limit 1;

  if not found then
    return;
  end if;

  update public.knowledge_sync_jobs
     set status = 'processing',
         attempt_count = attempt_count + 1,
         locked_at = now(),
         locked_by = trim(p_worker_id),
         last_error = null
   where id = v_job.id
   returning * into v_job;

  update public.knowledge_documents
     set index_status = 'processing',
         attempt_count = v_job.attempt_count,
         last_error = null
   where id = v_job.document_id
     and desired_revision = v_job.revision_id;

  return query
  select
    v_job.id,
    document.id,
    v_job.revision_id,
    v_job.action,
    v_job.attempt_count,
    document.source_type,
    document.source_id,
    document.source_slug,
    document.title,
    document.source_url,
    document.source_updated_at
  from public.knowledge_documents as document
  where document.id = v_job.document_id;
end;
$$;

-- Stores a full revision and activates it in one transaction. JSON chunks contain:
-- chunk_index, heading, content, token_count, embedding (768-number array), metadata.
create or replace function public.complete_knowledge_sync_job(
  p_job_id bigint,
  p_worker_id text,
  p_revision_id uuid,
  p_content_hash text default null,
  p_chunks jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_job public.knowledge_sync_jobs%rowtype;
  v_document public.knowledge_documents%rowtype;
  v_chunk_count integer := 0;
begin
  select * into v_job
    from public.knowledge_sync_jobs
   where id = p_job_id
   for update;

  if not found
     or v_job.status <> 'processing'
     or v_job.locked_by <> p_worker_id
     or v_job.revision_id <> p_revision_id then
    return jsonb_build_object('completed', false, 'reason', 'invalid_claim');
  end if;

  select * into v_document
    from public.knowledge_documents
   where id = v_job.document_id
   for update;

  if not found then
    return jsonb_build_object('completed', false, 'reason', 'document_missing');
  end if;

  if v_document.desired_revision <> p_revision_id then
    delete from public.knowledge_chunks
     where document_id = v_document.id and revision_id = p_revision_id;
    update public.knowledge_sync_jobs
       set status = 'done', locked_at = null, locked_by = null, last_error = null
     where id = p_job_id;
    return jsonb_build_object('completed', false, 'reason', 'stale');
  end if;

  if v_job.action = 'upsert' then
    if p_content_hash is null or p_content_hash !~ '^[0-9a-f]{64}$' then
      raise exception 'A lowercase SHA-256 content hash is required for upsert jobs';
    end if;
    if jsonb_typeof(p_chunks) <> 'array' or jsonb_array_length(p_chunks) = 0 then
      raise exception 'At least one chunk is required for upsert jobs';
    end if;

    delete from public.knowledge_chunks
     where document_id = v_document.id and revision_id = p_revision_id;

    insert into public.knowledge_chunks (
      document_id, revision_id, chunk_index, heading, content,
      token_count, embedding, metadata
    )
    select
      v_document.id,
      p_revision_id,
      (chunk.value ->> 'chunk_index')::integer,
      nullif(trim(chunk.value ->> 'heading'), ''),
      chunk.value ->> 'content',
      (chunk.value ->> 'token_count')::integer,
      (chunk.value -> 'embedding')::text::extensions.vector(768),
      coalesce(chunk.value -> 'metadata', '{}'::jsonb)
    from jsonb_array_elements(p_chunks) as chunk(value);
    get diagnostics v_chunk_count = row_count;

    update public.knowledge_documents
       set active_revision = p_revision_id,
           index_status = 'ready',
           content_hash = p_content_hash,
           attempt_count = v_job.attempt_count,
           last_error = null,
           indexed_at = now()
     where id = v_document.id
       and desired_revision = p_revision_id;

    if not found then
      raise exception 'Desired revision changed while activating chunks';
    end if;

    delete from public.knowledge_chunks
     where document_id = v_document.id and revision_id <> p_revision_id;

    update public.knowledge_sync_jobs
       set status = 'done', locked_at = null, locked_by = null, last_error = null
     where id = p_job_id;

    return jsonb_build_object('completed', true, 'reason', 'activated', 'chunk_count', v_chunk_count);
  end if;

  delete from public.knowledge_chunks where document_id = v_document.id;

  if v_job.action = 'disable' then
    update public.knowledge_documents
       set active_revision = null,
           index_status = 'disabled',
           content_hash = null,
           attempt_count = v_job.attempt_count,
           last_error = null,
           indexed_at = now()
     where id = v_document.id
       and desired_revision = p_revision_id;
    update public.knowledge_sync_jobs
       set status = 'done', locked_at = null, locked_by = null, last_error = null
     where id = p_job_id;
    return jsonb_build_object('completed', true, 'reason', 'disabled', 'chunk_count', 0);
  end if;

  -- Deleting the document cascades to its chunks and job history, including this job.
  delete from public.knowledge_documents
   where id = v_document.id and desired_revision = p_revision_id;
  return jsonb_build_object('completed', true, 'reason', 'deleted', 'chunk_count', 0);
end;
$$;

create or replace function public.fail_knowledge_sync_job(
  p_job_id bigint,
  p_worker_id text,
  p_revision_id uuid,
  p_error text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_job public.knowledge_sync_jobs%rowtype;
  v_document public.knowledge_documents%rowtype;
  v_error text := left(coalesce(nullif(trim(p_error), ''), 'Unknown indexing error'), 1000);
  v_delay interval;
begin
  select * into v_job
    from public.knowledge_sync_jobs
   where id = p_job_id
   for update;

  if not found
     or v_job.status <> 'processing'
     or v_job.locked_by <> p_worker_id
     or v_job.revision_id <> p_revision_id then
    return jsonb_build_object('failed', false, 'reason', 'invalid_claim');
  end if;

  select * into v_document
    from public.knowledge_documents
   where id = v_job.document_id
   for update;

  if not found then
    return jsonb_build_object('failed', false, 'reason', 'document_missing');
  end if;

  if v_document.desired_revision <> p_revision_id then
    update public.knowledge_sync_jobs
       set status = 'done', locked_at = null, locked_by = null, last_error = null
     where id = p_job_id;
    return jsonb_build_object('failed', false, 'reason', 'stale');
  end if;

  if v_job.attempt_count >= 4 then
    update public.knowledge_sync_jobs
       set status = 'failed', locked_at = null, locked_by = null, last_error = v_error
     where id = p_job_id;
    update public.knowledge_documents
       set index_status = 'failed',
           active_revision = null,
           attempt_count = v_job.attempt_count,
           last_error = v_error
     where id = v_document.id and desired_revision = p_revision_id;
    return jsonb_build_object('failed', true, 'reason', 'exhausted', 'attempt_count', v_job.attempt_count);
  end if;

  v_delay := case v_job.attempt_count
    when 1 then interval '10 seconds'
    when 2 then interval '30 seconds'
    else interval '2 minutes'
  end;

  update public.knowledge_sync_jobs
     set status = 'queued',
         available_at = now() + v_delay,
         locked_at = null,
         locked_by = null,
         last_error = v_error
   where id = p_job_id;
  update public.knowledge_documents
     set index_status = 'pending',
         active_revision = null,
         attempt_count = v_job.attempt_count,
         last_error = v_error
   where id = v_document.id and desired_revision = p_revision_id;

  return jsonb_build_object(
    'failed', true,
    'reason', 'retry_scheduled',
    'attempt_count', v_job.attempt_count,
    'retry_after_seconds', extract(epoch from v_delay)::integer
  );
end;
$$;

-- Atomically checks both quotas before consuming either one.
create or replace function public.consume_chat_rate_limit(
  p_session_hash text,
  p_ip_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_session public.chat_rate_limits%rowtype;
  v_ip public.chat_rate_limits%rowtype;
  v_session_retry integer := 0;
  v_ip_retry integer := 0;
  v_retry integer := 0;
begin
  if p_session_hash is null or length(p_session_hash) not between 1 and 256
     or p_ip_hash is null or length(p_ip_hash) not between 1 and 256 then
    raise exception 'Rate-limit hashes must be between 1 and 256 characters';
  end if;

  insert into public.chat_rate_limits (identifier_kind, identifier_hash, window_started_at, request_count)
  values ('session_minute', p_session_hash, v_now, 0)
  on conflict do nothing;
  insert into public.chat_rate_limits (identifier_kind, identifier_hash, window_started_at, request_count)
  values ('ip_hour', p_ip_hash, v_now, 0)
  on conflict do nothing;

  select * into v_session
    from public.chat_rate_limits
   where identifier_kind = 'session_minute' and identifier_hash = p_session_hash
   for update;
  select * into v_ip
    from public.chat_rate_limits
   where identifier_kind = 'ip_hour' and identifier_hash = p_ip_hash
   for update;

  if v_session.window_started_at <= v_now - interval '1 minute' then
    v_session.window_started_at := v_now;
    v_session.request_count := 0;
  end if;
  if v_ip.window_started_at <= v_now - interval '1 hour' then
    v_ip.window_started_at := v_now;
    v_ip.request_count := 0;
  end if;

  if v_session.request_count >= 5 then
    v_session_retry := greatest(1, ceil(extract(epoch from (v_session.window_started_at + interval '1 minute' - v_now)))::integer);
  end if;
  if v_ip.request_count >= 30 then
    v_ip_retry := greatest(1, ceil(extract(epoch from (v_ip.window_started_at + interval '1 hour' - v_now)))::integer);
  end if;
  v_retry := greatest(v_session_retry, v_ip_retry);

  if v_retry > 0 then
    -- Persist window resets without consuming a request from either quota.
    update public.chat_rate_limits
       set window_started_at = v_session.window_started_at,
           request_count = v_session.request_count,
           updated_at = v_now
     where identifier_kind = 'session_minute' and identifier_hash = p_session_hash;
    update public.chat_rate_limits
       set window_started_at = v_ip.window_started_at,
           request_count = v_ip.request_count,
           updated_at = v_now
     where identifier_kind = 'ip_hour' and identifier_hash = p_ip_hash;
    return jsonb_build_object('allowed', false, 'retry_after_seconds', v_retry);
  end if;

  update public.chat_rate_limits
     set window_started_at = v_session.window_started_at,
         request_count = v_session.request_count + 1,
         updated_at = v_now
   where identifier_kind = 'session_minute' and identifier_hash = p_session_hash;
  update public.chat_rate_limits
     set window_started_at = v_ip.window_started_at,
         request_count = v_ip.request_count + 1,
         updated_at = v_now
   where identifier_kind = 'ip_hour' and identifier_hash = p_ip_hash;

  return jsonb_build_object('allowed', true, 'retry_after_seconds', 0);
end;
$$;

revoke all on function public.match_knowledge_chunks(extensions.vector, integer) from public, anon, authenticated;
revoke all on function public.claim_knowledge_sync_job(text, integer) from public, anon, authenticated;
revoke all on function public.complete_knowledge_sync_job(bigint, text, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.fail_knowledge_sync_job(bigint, text, uuid, text) from public, anon, authenticated;
revoke all on function public.consume_chat_rate_limit(text, text) from public, anon, authenticated;

grant execute on function public.match_knowledge_chunks(extensions.vector, integer) to service_role;
grant execute on function public.claim_knowledge_sync_job(text, integer) to service_role;
grant execute on function public.complete_knowledge_sync_job(bigint, text, uuid, text, jsonb) to service_role;
grant execute on function public.fail_knowledge_sync_job(bigint, text, uuid, text) to service_role;
grant execute on function public.consume_chat_rate_limit(text, text) to anon, authenticated;
