-- Count only failed password checks. The original function incremented before
-- authentication, which could lock an account after successful logins.
alter table public.login_rate_limits
  add column if not exists failed_attempts integer not null default 0 check (failed_attempts >= 0);

create or replace function public.is_login_locked(p_identifier text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.login_rate_limits
    where identifier_hash = encode(extensions.digest(lower(trim(p_identifier)), 'sha256'), 'hex')
      and failed_attempts >= 5
      and window_started_at >= now() - interval '15 minutes'
  );
$$;

create or replace function public.record_failed_login_attempt(p_identifier text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_hash text := encode(extensions.digest(lower(trim(p_identifier)), 'sha256'), 'hex');
begin
  insert into public.login_rate_limits (identifier_hash, attempts, failed_attempts, window_started_at, updated_at)
  values (v_hash, 0, 1, now(), now())
  on conflict (identifier_hash) do update
  set
    failed_attempts = case
      when public.login_rate_limits.window_started_at < now() - interval '15 minutes' then 1
      else least(public.login_rate_limits.failed_attempts + 1, 5)
    end,
    window_started_at = case
      when public.login_rate_limits.window_started_at < now() - interval '15 minutes' then now()
      else public.login_rate_limits.window_started_at
    end,
    updated_at = now();
end;
$$;

create or replace function public.clear_failed_login_attempt(p_identifier text)
returns void language sql security definer set search_path = public as $$
  update public.login_rate_limits
  set failed_attempts = 0, updated_at = now()
  where identifier_hash = encode(extensions.digest(lower(trim(p_identifier)), 'sha256'), 'hex');
$$;

-- Keep the old RPC harmless while a previous application deployment is still
-- serving requests. New code uses the three functions above.
create or replace function public.consume_login_attempt(p_identifier text)
returns boolean language sql stable security definer set search_path = public as $$
  select not public.is_login_locked(p_identifier);
$$;

grant execute on function public.is_login_locked(text) to anon, authenticated;
grant execute on function public.record_failed_login_attempt(text) to anon, authenticated;
grant execute on function public.clear_failed_login_attempt(text) to anon, authenticated;
