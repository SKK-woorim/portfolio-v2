create extension if not exists supabase_vault with schema vault;

create schema if not exists portfolio_private;
revoke all on schema portfolio_private from public, anon, authenticated;
grant usage on schema portfolio_private to service_role;

-- Keep Vault privileges with the database owner. The two private functions
-- restrict access to the portfolio's provider keys even for service callers.
create function portfolio_private.get_ai_provider_keys(p_include_values boolean)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if p_include_values is true then
    select jsonb_agg(jsonb_build_object(
      'provider', provider.name, 'updated_at', secret.updated_at, 'api_key', secret.decrypted_secret
    ))
    into v_result
    from (values ('openai'), ('gemini')) as provider(name)
    join vault.decrypted_secrets as secret on secret.name = 'portfolio.ai_provider.' || provider.name;
  else
    select jsonb_agg(jsonb_build_object('provider', provider.name, 'updated_at', secret.updated_at))
    into v_result
    from (values ('openai'), ('gemini')) as provider(name)
    join vault.secrets as secret on secret.name = 'portfolio.ai_provider.' || provider.name;
  end if;
  return coalesce(v_result, '[]'::jsonb);
end;
$$;

create function portfolio_private.set_ai_provider_key(p_provider text, p_api_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_id uuid;
begin
  if p_provider is null or p_provider not in ('openai', 'gemini') then
    raise exception 'Invalid AI provider' using errcode = '22023';
  end if;
  if p_api_key is not null and (length(p_api_key) not between 1 and 4096 or p_api_key ~ '[^!-~]') then
    raise exception 'Invalid provider credential' using errcode = '22023';
  end if;

  v_name := 'portfolio.ai_provider.' || p_provider;
  perform pg_advisory_xact_lock(hashtextextended(v_name, 0));
  select id into v_id from vault.secrets where name = v_name;

  if p_api_key is null then
    delete from vault.secrets where id = v_id;
  elsif v_id is null then
    perform vault.create_secret(p_api_key, v_name);
  else
    perform vault.update_secret(v_id, p_api_key);
  end if;
end;
$$;

create function public.get_ai_provider_keys(p_include_values boolean)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select portfolio_private.get_ai_provider_keys(p_include_values);
$$;

create function public.set_ai_provider_key(p_provider text, p_api_key text)
returns void
language sql
security invoker
set search_path = ''
as $$
  select portfolio_private.set_ai_provider_key(p_provider, p_api_key);
$$;

revoke all on function portfolio_private.get_ai_provider_keys(boolean) from public, anon, authenticated;
revoke all on function portfolio_private.set_ai_provider_key(text, text) from public, anon, authenticated;
revoke all on function public.get_ai_provider_keys(boolean) from public, anon, authenticated;
revoke all on function public.set_ai_provider_key(text, text) from public, anon, authenticated;
grant execute on function portfolio_private.get_ai_provider_keys(boolean) to service_role;
grant execute on function portfolio_private.set_ai_provider_key(text, text) to service_role;
grant execute on function public.get_ai_provider_keys(boolean) to service_role;
grant execute on function public.set_ai_provider_key(text, text) to service_role;
