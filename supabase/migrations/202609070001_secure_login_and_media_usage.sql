-- Add a server-trusted login-rate-limit surface and DB-enforced media usage.
-- This is a forward-only migration; previously deployed migrations stay immutable.

-- The legacy functions accepted raw email addresses and were executable with the
-- publishable key. Keep them temporarily available so the old web release remains
-- compatible while this expansion migration and the new web release roll out.
-- A later contract migration removes both the functions and their reversible hashes.

-- Only keyed hashes produced in the Next.js server boundary are stored. Email
-- and IP-prefix buckets have separate limits so both targeted and distributed
-- password attacks are bounded.
create table public.login_rate_limit_buckets (
  identifier_kind text not null check (identifier_kind in ('email', 'ip_prefix')),
  identifier_hash text not null check (identifier_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null default now(),
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  updated_at timestamptz not null default now(),
  primary key (identifier_kind, identifier_hash)
);

create index login_rate_limit_buckets_updated_at_index
  on public.login_rate_limit_buckets (updated_at);

alter table public.login_rate_limit_buckets enable row level security;
revoke all on table public.login_rate_limit_buckets from public, anon, authenticated;

create table public.login_attempt_reservations (
  token uuid primary key default gen_random_uuid(),
  email_hash text not null check (email_hash ~ '^[0-9a-f]{64}$'),
  ip_hash text not null check (ip_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  check (expires_at > created_at)
);

create index login_attempt_reservations_email_index
  on public.login_attempt_reservations (email_hash, expires_at);
create index login_attempt_reservations_ip_index
  on public.login_attempt_reservations (ip_hash, expires_at);
create index login_attempt_reservations_expiry_index
  on public.login_attempt_reservations (expires_at);

alter table public.login_attempt_reservations enable row level security;
revoke all on table public.login_attempt_reservations from public, anon, authenticated;

-- Legacy rows were allowed to contain an empty public URL. Enforce the invariant
-- for new writes without making rollout depend on cleaning historical rows first.
alter table public.media
  add constraint media_public_url_nonempty
  check (length(trim(public_url)) > 0) not valid;

create or replace function public.check_login_rate_limit_trusted(
  p_email_hash text,
  p_ip_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_email public.login_rate_limit_buckets%rowtype;
  v_ip public.login_rate_limit_buckets%rowtype;
  v_email_retry integer := 0;
  v_ip_retry integer := 0;
  v_retry integer := 0;
begin
  if p_email_hash is null or p_email_hash !~ '^[0-9a-f]{64}$'
     or p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_login_rate_limit_hash';
  end if;

  -- Always acquire an email bucket before an IP bucket. The matching order in
  -- the record function prevents cycles when concurrent attempts share an IP.
  select * into v_email
    from public.login_rate_limit_buckets
   where identifier_kind = 'email' and identifier_hash = p_email_hash
   for update;
  if found then
    if v_email.window_started_at <= v_now - interval '15 minutes' then
      update public.login_rate_limit_buckets
         set window_started_at = v_now, failed_attempts = 0, updated_at = v_now
       where identifier_kind = 'email' and identifier_hash = p_email_hash;
      v_email.failed_attempts := 0;
      v_email.window_started_at := v_now;
    elsif v_email.failed_attempts >= 5 then
      v_email_retry := greatest(
        1,
        ceil(extract(epoch from (v_email.window_started_at + interval '15 minutes' - v_now)))::integer
      );
    end if;
  end if;

  select * into v_ip
    from public.login_rate_limit_buckets
   where identifier_kind = 'ip_prefix' and identifier_hash = p_ip_hash
   for update;
  if found then
    if v_ip.window_started_at <= v_now - interval '15 minutes' then
      update public.login_rate_limit_buckets
         set window_started_at = v_now, failed_attempts = 0, updated_at = v_now
       where identifier_kind = 'ip_prefix' and identifier_hash = p_ip_hash;
      v_ip.failed_attempts := 0;
      v_ip.window_started_at := v_now;
    elsif v_ip.failed_attempts >= 25 then
      v_ip_retry := greatest(
        1,
        ceil(extract(epoch from (v_ip.window_started_at + interval '15 minutes' - v_now)))::integer
      );
    end if;
  end if;

  v_retry := greatest(v_email_retry, v_ip_retry);
  return jsonb_build_object(
    'allowed', v_retry = 0,
    'retry_after_seconds', v_retry
  );
end;
$$;

create or replace function public.record_failed_login_attempt_trusted(
  p_email_hash text,
  p_ip_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_email public.login_rate_limit_buckets%rowtype;
  v_ip public.login_rate_limit_buckets%rowtype;
  v_email_retry integer := 0;
  v_ip_retry integer := 0;
  v_retry integer := 0;
begin
  if p_email_hash is null or p_email_hash !~ '^[0-9a-f]{64}$'
     or p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_login_rate_limit_hash';
  end if;

  insert into public.login_rate_limit_buckets (
    identifier_kind, identifier_hash, window_started_at, failed_attempts, updated_at
  ) values ('email', p_email_hash, v_now, 0, v_now)
  on conflict do nothing;
  insert into public.login_rate_limit_buckets (
    identifier_kind, identifier_hash, window_started_at, failed_attempts, updated_at
  ) values ('ip_prefix', p_ip_hash, v_now, 0, v_now)
  on conflict do nothing;

  select * into strict v_email
    from public.login_rate_limit_buckets
   where identifier_kind = 'email' and identifier_hash = p_email_hash
   for update;
  select * into strict v_ip
    from public.login_rate_limit_buckets
   where identifier_kind = 'ip_prefix' and identifier_hash = p_ip_hash
   for update;

  if v_email.window_started_at <= v_now - interval '15 minutes' then
    v_email.window_started_at := v_now;
    v_email.failed_attempts := 0;
  end if;
  if v_ip.window_started_at <= v_now - interval '15 minutes' then
    v_ip.window_started_at := v_now;
    v_ip.failed_attempts := 0;
  end if;

  v_email.failed_attempts := least(v_email.failed_attempts + 1, 5);
  v_ip.failed_attempts := least(v_ip.failed_attempts + 1, 25);

  update public.login_rate_limit_buckets
     set window_started_at = v_email.window_started_at,
         failed_attempts = v_email.failed_attempts,
         updated_at = v_now
   where identifier_kind = 'email' and identifier_hash = p_email_hash;
  update public.login_rate_limit_buckets
     set window_started_at = v_ip.window_started_at,
         failed_attempts = v_ip.failed_attempts,
         updated_at = v_now
   where identifier_kind = 'ip_prefix' and identifier_hash = p_ip_hash;

  if v_email.failed_attempts >= 5 then
    v_email_retry := greatest(
      1,
      ceil(extract(epoch from (v_email.window_started_at + interval '15 minutes' - v_now)))::integer
    );
  end if;
  if v_ip.failed_attempts >= 25 then
    v_ip_retry := greatest(
      1,
      ceil(extract(epoch from (v_ip.window_started_at + interval '15 minutes' - v_now)))::integer
    );
  end if;
  v_retry := greatest(v_email_retry, v_ip_retry);

  return jsonb_build_object(
    'allowed', v_retry = 0,
    'retry_after_seconds', v_retry
  );
end;
$$;

create or replace function public.clear_failed_login_attempt_trusted(
  p_email_hash text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_email_hash is null or p_email_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_login_rate_limit_hash';
  end if;

  -- A successful account authentication clears only that account's bucket. A
  -- success must not erase an IP-wide signal accumulated across many accounts.
  delete from public.login_rate_limit_buckets
   where identifier_kind = 'email' and identifier_hash = p_email_hash;
end;
$$;

revoke all on function public.check_login_rate_limit_trusted(text, text) from public, anon, authenticated;
revoke all on function public.record_failed_login_attempt_trusted(text, text) from public, anon, authenticated;
revoke all on function public.clear_failed_login_attempt_trusted(text) from public, anon, authenticated;

-- Reserve capacity before checking a password. Active reservations are counted
-- with failures while the bucket rows are locked, so a concurrent burst cannot
-- pass multiple independent read-then-record checks.
create or replace function public.reserve_login_attempt_trusted(
  p_email_hash text,
  p_ip_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_email public.login_rate_limit_buckets%rowtype;
  v_ip public.login_rate_limit_buckets%rowtype;
  v_email_active integer := 0;
  v_ip_active integer := 0;
  v_email_retry integer := 0;
  v_ip_retry integer := 0;
  v_retry integer := 0;
  v_token uuid;
begin
  if p_email_hash is null or p_email_hash !~ '^[0-9a-f]{64}$'
     or p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_login_rate_limit_hash' using errcode = '22023';
  end if;

  -- Do not hold a bucket lock while waiting on a reservation row that another
  -- finalizer may already own.
  delete from public.login_attempt_reservations where expires_at <= v_now;

  insert into public.login_rate_limit_buckets (
    identifier_kind, identifier_hash, window_started_at, failed_attempts, updated_at
  ) values ('email', p_email_hash, v_now, 0, v_now)
  on conflict do nothing;
  insert into public.login_rate_limit_buckets (
    identifier_kind, identifier_hash, window_started_at, failed_attempts, updated_at
  ) values ('ip_prefix', p_ip_hash, v_now, 0, v_now)
  on conflict do nothing;

  -- Every command uses email then IP order to avoid lock cycles.
  select * into strict v_email
    from public.login_rate_limit_buckets
   where identifier_kind = 'email' and identifier_hash = p_email_hash
   for update;
  select * into strict v_ip
    from public.login_rate_limit_buckets
   where identifier_kind = 'ip_prefix' and identifier_hash = p_ip_hash
   for update;

  if v_email.window_started_at <= v_now - interval '15 minutes' then
    v_email.window_started_at := v_now;
    v_email.failed_attempts := 0;
    update public.login_rate_limit_buckets
       set window_started_at = v_now, failed_attempts = 0, updated_at = v_now
     where identifier_kind = 'email' and identifier_hash = p_email_hash;
  end if;
  if v_ip.window_started_at <= v_now - interval '15 minutes' then
    v_ip.window_started_at := v_now;
    v_ip.failed_attempts := 0;
    update public.login_rate_limit_buckets
       set window_started_at = v_now, failed_attempts = 0, updated_at = v_now
     where identifier_kind = 'ip_prefix' and identifier_hash = p_ip_hash;
  end if;

  select count(*) into v_email_active
    from public.login_attempt_reservations
   where email_hash = p_email_hash and expires_at > v_now;
  select count(*) into v_ip_active
    from public.login_attempt_reservations
   where ip_hash = p_ip_hash and expires_at > v_now;

  if v_email.failed_attempts >= 5 then
    v_email_retry := greatest(
      1,
      ceil(extract(epoch from (v_email.window_started_at + interval '15 minutes' - v_now)))::integer
    );
  elsif v_email.failed_attempts + v_email_active >= 5 then
    select greatest(1, ceil(extract(epoch from (min(expires_at) - v_now)))::integer)
      into v_email_retry
      from public.login_attempt_reservations
     where email_hash = p_email_hash and expires_at > v_now;
  end if;

  if v_ip.failed_attempts >= 25 then
    v_ip_retry := greatest(
      1,
      ceil(extract(epoch from (v_ip.window_started_at + interval '15 minutes' - v_now)))::integer
    );
  elsif v_ip.failed_attempts + v_ip_active >= 25 then
    select greatest(1, ceil(extract(epoch from (min(expires_at) - v_now)))::integer)
      into v_ip_retry
      from public.login_attempt_reservations
     where ip_hash = p_ip_hash and expires_at > v_now;
  end if;

  v_retry := greatest(coalesce(v_email_retry, 0), coalesce(v_ip_retry, 0));
  if v_retry > 0 then
    return jsonb_build_object(
      'allowed', false,
      'retry_after_seconds', v_retry,
      'reservation_token', null
    );
  end if;

  insert into public.login_attempt_reservations (
    email_hash, ip_hash, created_at, expires_at
  ) values (
    p_email_hash, p_ip_hash, v_now, v_now + interval '2 minutes'
  ) returning token into v_token;

  return jsonb_build_object(
    'allowed', true,
    'retry_after_seconds', 0,
    'reservation_token', v_token
  );
end;
$$;

create or replace function public.finalize_login_attempt_trusted(
  p_reservation_token uuid,
  p_outcome text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_reservation public.login_attempt_reservations%rowtype;
  v_email public.login_rate_limit_buckets%rowtype;
  v_ip public.login_rate_limit_buckets%rowtype;
begin
  if p_reservation_token is null
     or p_outcome is null
     or p_outcome not in ('success', 'failure', 'abandoned') then
    raise exception 'invalid_login_attempt_finalization' using errcode = '22023';
  end if;

  select * into strict v_reservation
    from public.login_attempt_reservations
   where token = p_reservation_token
   for update;

  select * into strict v_email
    from public.login_rate_limit_buckets
   where identifier_kind = 'email' and identifier_hash = v_reservation.email_hash
   for update;
  select * into strict v_ip
    from public.login_rate_limit_buckets
   where identifier_kind = 'ip_prefix' and identifier_hash = v_reservation.ip_hash
   for update;

  delete from public.login_attempt_reservations where token = p_reservation_token;

  if p_outcome = 'success' then
    -- Clear only the account signal. IP failures accumulated across accounts
    -- remain intact, while other in-flight reservations stay in their own rows.
    update public.login_rate_limit_buckets
       set window_started_at = v_now, failed_attempts = 0, updated_at = v_now
     where identifier_kind = 'email' and identifier_hash = v_reservation.email_hash;
  elsif p_outcome = 'failure' then
    if v_email.window_started_at <= v_now - interval '15 minutes' then
      v_email.window_started_at := v_now;
      v_email.failed_attempts := 0;
    end if;
    if v_ip.window_started_at <= v_now - interval '15 minutes' then
      v_ip.window_started_at := v_now;
      v_ip.failed_attempts := 0;
    end if;

    update public.login_rate_limit_buckets
       set window_started_at = v_email.window_started_at,
           failed_attempts = least(v_email.failed_attempts + 1, 5),
           updated_at = v_now
     where identifier_kind = 'email' and identifier_hash = v_reservation.email_hash;
    update public.login_rate_limit_buckets
       set window_started_at = v_ip.window_started_at,
           failed_attempts = least(v_ip.failed_attempts + 1, 25),
           updated_at = v_now
     where identifier_kind = 'ip_prefix' and identifier_hash = v_reservation.ip_hash;
  end if;
end;
$$;

revoke all on function public.reserve_login_attempt_trusted(text, text) from public, anon, authenticated;
revoke all on function public.finalize_login_attempt_trusted(uuid, text) from public, anon, authenticated;
grant execute on function public.reserve_login_attempt_trusted(text, text) to service_role;
grant execute on function public.finalize_login_attempt_trusted(uuid, text) to service_role;

-- Posts previously had only a cover FK. Explicit inline relations make media
-- use queryable and allow deletion to be rejected by the database.
create table public.post_media (
  post_id uuid not null references public.posts(id) on delete cascade,
  media_id uuid not null references public.media(id) on delete restrict,
  role public.media_role not null default 'inline' check (role = 'inline'),
  sort_order integer not null default 0 check (sort_order >= 0),
  primary key (post_id, media_id)
);

create index post_media_media_id_index on public.post_media (media_id);

alter table public.post_media enable row level security;

create policy "post media: public published read"
  on public.post_media for select
  using (
    exists (
      select 1 from public.posts as post
       where post.id = post_id and post.status = 'published'
    )
  );
create policy "post media: admin manage"
  on public.post_media for all
  using (public.is_admin())
  with check (public.is_admin());

grant select on table public.post_media to anon;
grant select, insert, update, delete on table public.post_media to authenticated;

-- Protect media already embedded in Markdown before the editor began sending
-- explicit relation IDs. Exact public URL matching intentionally favors a
-- conservative false-positive (preventing deletion) over a broken live image.
insert into public.post_media (post_id, media_id, role, sort_order)
select matched.post_id, matched.media_id, 'inline', matched.sort_order
  from (
    select post.id as post_id,
           media.id as media_id,
           (row_number() over (
             partition by post.id
             order by strpos(coalesce(post.content_json ->> 'markdown', ''), media.public_url), media.id
           ) - 1)::integer as sort_order
      from public.posts as post
      join public.media as media
        on length(trim(media.public_url)) > 0
       and strpos(coalesce(post.content_json ->> 'markdown', ''), media.public_url) > 0
  ) as matched
on conflict (post_id, media_id) do nothing;

insert into public.portfolio_item_media (portfolio_item_id, media_id, role, sort_order)
select matched.portfolio_item_id, matched.media_id, 'inline', matched.sort_order
  from (
    select item.id as portfolio_item_id,
           media.id as media_id,
           (row_number() over (
             partition by item.id
             order by strpos(coalesce(item.content_json ->> 'markdown', ''), media.public_url), media.id
           ) - 1)::integer as sort_order
      from public.portfolio_items as item
      join public.media as media
        on length(trim(media.public_url)) > 0
       and strpos(coalesce(item.content_json ->> 'markdown', ''), media.public_url) > 0
     where not exists (
       select 1 from public.portfolio_item_media as existing
        where existing.portfolio_item_id = item.id and existing.media_id = media.id
     )
  ) as matched;

-- Keep chatbot source revisions in sync when inline or portfolio media changes.
drop trigger if exists post_media_queue_knowledge on public.post_media;
create trigger post_media_queue_knowledge
  after insert or update or delete on public.post_media
  for each row execute procedure public.queue_post_tag_knowledge();

drop trigger if exists portfolio_item_media_queue_knowledge on public.portfolio_item_media;
create trigger portfolio_item_media_queue_knowledge
  after insert or update or delete on public.portfolio_item_media
  for each row execute procedure public.queue_portfolio_relation_knowledge();

drop policy if exists "media: public used media read" on public.media;
create policy "media: public used media read" on public.media for select using (
  exists (
    select 1
      from public.portfolio_item_media as relation
      join public.portfolio_items as item on item.id = relation.portfolio_item_id
     where relation.media_id = media.id and item.status = 'published'
  )
  or exists (
    select 1 from public.posts as post
     where post.cover_media_id = media.id and post.status = 'published'
  )
  or exists (
    select 1
      from public.post_media as relation
      join public.posts as post on post.id = relation.post_id
     where relation.media_id = media.id and post.status = 'published'
  )
  or exists (
    select 1 from public.site_profile as profile
     where profile.avatar_media_id = media.id
  )
);

create or replace function public.prevent_used_media_delete()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if exists (select 1 from public.site_profile where avatar_media_id = old.id)
     or exists (select 1 from public.posts where cover_media_id = old.id)
     or exists (select 1 from public.post_media where media_id = old.id)
     or exists (select 1 from public.portfolio_item_media where media_id = old.id) then
    raise exception using
      errcode = '23503',
      message = 'media_in_use',
      constraint = 'media_usage_prevents_delete';
  end if;
  return old;
end;
$$;

drop trigger if exists media_prevent_used_delete on public.media;
create trigger media_prevent_used_delete
  before delete on public.media
  for each row execute procedure public.prevent_used_media_delete();

revoke all on function public.prevent_used_media_delete() from public, anon, authenticated;

create or replace function public.delete_media_atomic(p_media_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_storage_key text;
begin
  if not public.is_admin() then
    raise exception 'administrator_access_required' using errcode = '42501';
  end if;

  -- DELETE holds the media row lock. A concurrent FK insert either becomes
  -- visible to the usage trigger first or fails after this delete commits.
  delete from public.media
   where id = p_media_id
   returning storage_key into v_storage_key;

  if not found then
    raise exception 'media_not_found' using errcode = 'P0002';
  end if;

  insert into public.audit_logs (actor_id, action, target_type, target_id, metadata)
  values (
    auth.uid(),
    'delete',
    'media',
    p_media_id,
    jsonb_build_object('storageKey', v_storage_key)
  );

  return jsonb_build_object('id', p_media_id, 'storage_key', v_storage_key);
end;
$$;

revoke all on function public.delete_media_atomic(uuid) from public, anon, authenticated;
grant execute on function public.delete_media_atomic(uuid) to authenticated;

comment on table public.login_rate_limit_buckets is
  'Server-only login failure buckets keyed by HMAC email and IP-prefix identifiers.';
comment on table public.post_media is
  'Explicit post inline-media usage used for rendering policy and deletion safety.';
comment on function public.delete_media_atomic(uuid) is
  'Deletes an unused media metadata row and writes its audit log in one transaction.';
