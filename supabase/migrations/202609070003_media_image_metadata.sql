-- Record dimensions and a checksum for newly normalized media uploads.
-- Existing rows remain valid and can be backfilled independently.

alter table public.media
  add column width integer check (width is null or width between 1 and 12000),
  add column height integer check (height is null or height between 1 and 12000),
  add column checksum_sha256 text check (
    checksum_sha256 is null or checksum_sha256 ~ '^[0-9a-f]{64}$'
  );

create index media_checksum_sha256_index
  on public.media (checksum_sha256)
  where checksum_sha256 is not null;

comment on column public.media.width is 'Pixel width of the normalized public image.';
comment on column public.media.height is 'Pixel height of the normalized public image.';
comment on column public.media.checksum_sha256 is 'SHA-256 of the normalized public image bytes.';

create or replace function public.update_media_alt_atomic(
  p_media_id uuid,
  p_alt text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_alt text := trim(coalesce(p_alt, ''));
  v_media public.media%rowtype;
begin
  if not public.is_admin() then
    raise exception 'administrator_access_required' using errcode = '42501';
  end if;
  if length(v_alt) > 200 then
    raise exception 'invalid_media_alt' using errcode = '22023';
  end if;

  update public.media
     set alt = v_alt
   where id = p_media_id
   returning * into v_media;
  if not found then
    raise exception 'media_not_found' using errcode = 'P0002';
  end if;

  insert into public.audit_logs (actor_id, action, target_type, target_id, metadata)
  values (
    auth.uid(),
    'update_alt',
    'media',
    p_media_id,
    jsonb_build_object('alt', v_alt)
  );

  return jsonb_build_object('id', v_media.id, 'alt', v_media.alt);
end;
$$;

revoke all on function public.update_media_alt_atomic(uuid, text) from public, anon, authenticated;
grant execute on function public.update_media_alt_atomic(uuid, text) to authenticated;

comment on function public.update_media_alt_atomic(uuid, text) is
  'Updates media alternative text and its audit entry in one transaction.';

create or replace function public.register_media_atomic(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_storage_key text;
  v_public_url text;
  v_alt text;
  v_mime_type text;
  v_size_bytes bigint;
  v_width integer;
  v_height integer;
  v_checksum text;
  v_media public.media%rowtype;
begin
  if not public.is_admin() then
    raise exception 'administrator_access_required' using errcode = '42501';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'invalid_media_payload' using errcode = '22023';
  end if;

  begin
    v_storage_key := trim(p_payload ->> 'storage_key');
    v_public_url := trim(p_payload ->> 'public_url');
    v_alt := trim(coalesce(p_payload ->> 'alt', ''));
    v_mime_type := trim(p_payload ->> 'mime_type');
    v_size_bytes := (p_payload ->> 'size_bytes')::bigint;
    v_width := (p_payload ->> 'width')::integer;
    v_height := (p_payload ->> 'height')::integer;
    v_checksum := trim(p_payload ->> 'checksum_sha256');
  exception when others then
    raise exception 'invalid_media_payload' using errcode = '22023';
  end;

  if v_storage_key is null
     or v_storage_key !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}/[0-9a-f-]{36}\.webp$'
     or v_public_url is null or length(v_public_url) not between 1 and 2048
     or v_public_url !~ '^https?://'
     or length(v_alt) > 200
     or v_mime_type is distinct from 'image/webp'
     or v_size_bytes is null or v_size_bytes not between 1 and 5242880
     or v_width is null or v_width not between 1 and 12000
     or v_height is null or v_height not between 1 and 12000
     or v_checksum is null or v_checksum !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_media_payload' using errcode = '22023';
  end if;

  insert into public.media (
    storage_key, public_url, alt, mime_type, size_bytes,
    width, height, checksum_sha256, created_by
  ) values (
    v_storage_key, v_public_url, v_alt, v_mime_type, v_size_bytes,
    v_width, v_height, v_checksum, auth.uid()
  ) returning * into v_media;

  insert into public.audit_logs (actor_id, action, target_type, target_id, metadata)
  values (
    auth.uid(),
    'upload',
    'media',
    v_media.id,
    jsonb_build_object(
      'storageKey', v_media.storage_key,
      'mimeType', v_media.mime_type,
      'size', v_media.size_bytes,
      'width', v_media.width,
      'height', v_media.height,
      'checksumSha256', v_media.checksum_sha256
    )
  );

  return jsonb_build_object(
    'id', v_media.id,
    'public_url', v_media.public_url,
    'alt', v_media.alt,
    'storage_key', v_media.storage_key
  );
end;
$$;

create or replace function public.update_site_profile_atomic(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_display_name text;
  v_role_title text;
  v_headline text;
  v_bio text;
  v_email text;
  v_skills jsonb;
  v_social_links jsonb;
  v_profile public.site_profile%rowtype;
begin
  if not public.is_admin() then
    raise exception 'administrator_access_required' using errcode = '42501';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'invalid_site_profile_payload' using errcode = '22023';
  end if;

  v_display_name := trim(p_payload ->> 'display_name');
  v_role_title := trim(p_payload ->> 'role_title');
  v_headline := trim(p_payload ->> 'headline');
  v_bio := trim(p_payload ->> 'bio');
  v_email := lower(trim(p_payload ->> 'email'));
  v_skills := p_payload -> 'skills';
  v_social_links := p_payload -> 'social_links';

  if v_display_name is null or length(v_display_name) not between 1 and 80
     or v_role_title is null or length(v_role_title) not between 1 and 120
     or v_headline is null or length(v_headline) not between 1 and 180
     or v_bio is null or length(v_bio) not between 1 and 600
     or v_email is null or length(v_email) not between 3 and 254
     or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or jsonb_typeof(v_skills) is distinct from 'array'
     or jsonb_typeof(v_social_links) is distinct from 'array' then
    raise exception 'invalid_site_profile_payload' using errcode = '22023';
  end if;

  if jsonb_array_length(v_skills) > 50
     or exists (
       select 1 from jsonb_array_elements(v_skills) as skill(value)
        where jsonb_typeof(skill.value) <> 'string'
           or length(trim(skill.value #>> '{}')) not between 1 and 80
     ) then
    raise exception 'invalid_site_profile_payload' using errcode = '22023';
  end if;

  if jsonb_array_length(v_social_links) > 20
     or exists (
       select 1 from jsonb_array_elements(v_social_links) as link(value)
        where jsonb_typeof(link.value) <> 'object'
           or jsonb_typeof(link.value -> 'label') is distinct from 'string'
           or length(trim(link.value ->> 'label')) not between 1 and 60
           or jsonb_typeof(link.value -> 'href') is distinct from 'string'
           or length(trim(link.value ->> 'href')) not between 8 and 2048
           or trim(link.value ->> 'href') !~ '^https://'
           or trim(link.value ->> 'href') ~ '^https://[^/]*@'
           or trim(link.value ->> 'href') ~ '[[:space:]]'
     ) then
    raise exception 'invalid_site_profile_payload' using errcode = '22023';
  end if;

  insert into public.site_profile (
    id, display_name, role_title, headline, bio, skills, contact, social_links
  ) values (
    true,
    v_display_name,
    v_role_title,
    v_headline,
    v_bio,
    v_skills,
    jsonb_build_object('email', v_email),
    v_social_links
  )
  on conflict (id) do update
    set display_name = excluded.display_name,
        role_title = excluded.role_title,
        headline = excluded.headline,
        bio = excluded.bio,
        skills = excluded.skills,
        contact = excluded.contact,
        social_links = excluded.social_links
  returning * into v_profile;

  insert into public.audit_logs (actor_id, action, target_type, target_id, metadata)
  values (
    auth.uid(),
    'update',
    'site_profile',
    null,
    jsonb_build_object('updatedAt', v_profile.updated_at)
  );

  return jsonb_build_object('updated_at', v_profile.updated_at);
end;
$$;

-- Supersede the earlier toggle RPC so the state change and audit row commit or
-- roll back together.
create or replace function public.set_chatbot_runtime_enabled(p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_settings public.chatbot_runtime_settings%rowtype;
begin
  if not public.is_admin() then
    raise exception 'administrator_access_required' using errcode = '42501';
  end if;
  if p_enabled is null then
    raise exception 'invalid_chatbot_runtime_state' using errcode = '22023';
  end if;

  insert into public.chatbot_runtime_settings (id, enabled, updated_at, updated_by)
  values (true, p_enabled, now(), auth.uid())
  on conflict (id) do update
    set enabled = excluded.enabled,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by
  returning * into v_settings;

  insert into public.audit_logs (actor_id, action, target_type, target_id, metadata)
  values (
    auth.uid(),
    case when v_settings.enabled then 'enable' else 'disable' end,
    'chatbot_runtime',
    null,
    jsonb_build_object('enabled', v_settings.enabled)
  );

  return jsonb_build_object(
    'enabled', v_settings.enabled,
    'updated_at', v_settings.updated_at
  );
end;
$$;

revoke all on function public.register_media_atomic(jsonb) from public, anon, authenticated;
revoke all on function public.update_site_profile_atomic(jsonb) from public, anon, authenticated;
revoke all on function public.set_chatbot_runtime_enabled(boolean) from public, anon, authenticated;
grant execute on function public.register_media_atomic(jsonb) to authenticated;
grant execute on function public.update_site_profile_atomic(jsonb) to authenticated;
grant execute on function public.set_chatbot_runtime_enabled(boolean) to authenticated;

comment on function public.register_media_atomic(jsonb) is
  'Registers normalized media metadata and its audit entry atomically.';
comment on function public.update_site_profile_atomic(jsonb) is
  'Updates the singleton public profile and its audit entry atomically.';

create table public.media_deletion_outbox (
  media_id uuid primary key,
  storage_key text not null unique,
  requested_by uuid references auth.users(id) on delete set null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_attempt_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.media_deletion_outbox enable row level security;
create policy "media deletion outbox: admin read"
  on public.media_deletion_outbox for select
  using (public.is_admin());
revoke all on table public.media_deletion_outbox from public, anon, authenticated;
grant select on table public.media_deletion_outbox to authenticated;

-- Supersede the metadata-first delete from 202609070001. The durable outbox is
-- committed in the same transaction, so a failed Storage request remains
-- visible and retryable after the metadata row has gone.
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

  select storage_key into v_storage_key
    from public.media_deletion_outbox
   where media_id = p_media_id;
  if found then
    return jsonb_build_object('id', p_media_id, 'storage_key', v_storage_key, 'retry', true);
  end if;

  delete from public.media
   where id = p_media_id
   returning storage_key into v_storage_key;
  if not found then
    raise exception 'media_not_found' using errcode = 'P0002';
  end if;

  insert into public.media_deletion_outbox (
    media_id, storage_key, requested_by
  ) values (
    p_media_id, v_storage_key, auth.uid()
  );

  insert into public.audit_logs (actor_id, action, target_type, target_id, metadata)
  values (
    auth.uid(),
    'delete_requested',
    'media',
    p_media_id,
    jsonb_build_object('storageKey', v_storage_key)
  );

  return jsonb_build_object('id', p_media_id, 'storage_key', v_storage_key, 'retry', false);
end;
$$;

create or replace function public.record_media_deletion_failure(p_media_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'administrator_access_required' using errcode = '42501';
  end if;

  update public.media_deletion_outbox
     set attempt_count = attempt_count + 1,
         last_attempt_at = now()
   where media_id = p_media_id;
  if not found then
    raise exception 'media_deletion_job_not_found' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.complete_media_deletion(p_media_id uuid)
returns void
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

  delete from public.media_deletion_outbox
   where media_id = p_media_id
   returning storage_key into v_storage_key;
  if not found then
    raise exception 'media_deletion_job_not_found' using errcode = 'P0002';
  end if;

  insert into public.audit_logs (actor_id, action, target_type, target_id, metadata)
  values (
    auth.uid(),
    'delete_completed',
    'media',
    p_media_id,
    jsonb_build_object('storageKey', v_storage_key)
  );
end;
$$;

revoke all on function public.delete_media_atomic(uuid) from public, anon, authenticated;
revoke all on function public.record_media_deletion_failure(uuid) from public, anon, authenticated;
revoke all on function public.complete_media_deletion(uuid) from public, anon, authenticated;
grant execute on function public.delete_media_atomic(uuid) to authenticated;
grant execute on function public.record_media_deletion_failure(uuid) to authenticated;
grant execute on function public.complete_media_deletion(uuid) to authenticated;

comment on table public.media_deletion_outbox is
  'Durable retry records for Storage objects whose media metadata deletion was requested.';

-- Contract migrations intentionally require an out-of-band operator approval.
-- Keeping this marker private makes a routine `supabase db push` stop before a
-- rollback-breaking privilege contraction is applied by accident.
create table public.deployment_contract_approvals (
  contract_key text primary key check (length(contract_key) between 1 and 120),
  approval_note text not null check (length(trim(approval_note)) between 1 and 500),
  approved_at timestamptz not null default now()
);

alter table public.deployment_contract_approvals enable row level security;
revoke all on table public.deployment_contract_approvals from public, anon, authenticated;

comment on table public.deployment_contract_approvals is
  'Private operator markers required before rollback-breaking contract migrations can run.';
