-- Qualify the claimed job column so it cannot be confused with the
-- RETURNS TABLE output parameter of the same name.

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

  update public.knowledge_sync_jobs as claimed_job
     set status = 'processing',
         attempt_count = claimed_job.attempt_count + 1,
         locked_at = now(),
         locked_by = trim(p_worker_id),
         last_error = null
   where claimed_job.id = v_job.id
   returning claimed_job.* into v_job;

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
