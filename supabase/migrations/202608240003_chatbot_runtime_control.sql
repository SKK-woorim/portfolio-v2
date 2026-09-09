-- Keep the local model running while allowing an administrator to disconnect
-- public chat traffic immediately. Direct table access stays private; callers
-- can only use the narrow status and administrator mutation RPCs below.
create table if not exists public.chatbot_runtime_settings (
  id boolean primary key default true check (id = true),
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.chatbot_runtime_settings (id, enabled)
values (true, false)
on conflict (id) do nothing;

alter table public.chatbot_runtime_settings enable row level security;

revoke all on table public.chatbot_runtime_settings from public, anon, authenticated;

create or replace function public.get_chatbot_runtime_status()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'enabled', coalesce(settings.enabled, false),
    'updated_at', settings.updated_at
  )
  from (select true as singleton) as seed
  left join public.chatbot_runtime_settings as settings on settings.id = seed.singleton;
$$;

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
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  insert into public.chatbot_runtime_settings (id, enabled, updated_at, updated_by)
  values (true, p_enabled, now(), auth.uid())
  on conflict (id) do update
    set enabled = excluded.enabled,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by
  returning * into v_settings;

  return jsonb_build_object(
    'enabled', v_settings.enabled,
    'updated_at', v_settings.updated_at
  );
end;
$$;

revoke all on function public.get_chatbot_runtime_status() from public, anon, authenticated;
revoke all on function public.set_chatbot_runtime_enabled(boolean) from public, anon, authenticated;

grant execute on function public.get_chatbot_runtime_status() to anon, authenticated;
grant execute on function public.set_chatbot_runtime_enabled(boolean) to authenticated;

comment on table public.chatbot_runtime_settings is 'Private runtime switches for public chatbot traffic.';
comment on function public.get_chatbot_runtime_status() is 'Returns the public chatbot connection status without exposing the settings table.';
comment on function public.set_chatbot_runtime_enabled(boolean) is 'Allows an authenticated administrator to connect or disconnect public chat traffic.';
