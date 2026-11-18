create table portfolio_private.ai_provider_settings (
  singleton boolean primary key default true check (singleton),
  provider_order text[] not null,
  constraint ai_provider_order_is_permutation check (
    (array_dims(provider_order) = '[1:3]' and
      provider_order @> array['openai', 'gemini', 'local']::text[]) is true
  )
);

alter table portfolio_private.ai_provider_settings enable row level security;

revoke all on table portfolio_private.ai_provider_settings
  from public, anon, authenticated, service_role;
grant select, insert, update on table portfolio_private.ai_provider_settings
  to service_role;

create function public.get_ai_provider_configuration(p_include_values boolean)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'provider_order', coalesce(
      (select provider_order from portfolio_private.ai_provider_settings where singleton),
      array['openai', 'gemini', 'local']::text[]
    ),
    'keys', portfolio_private.get_ai_provider_keys(p_include_values)
  );
$$;

create function public.set_ai_provider_order(p_provider_order text[])
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into portfolio_private.ai_provider_settings (singleton, provider_order)
  values (true, p_provider_order)
  on conflict (singleton) do update
    set provider_order = excluded.provider_order;
$$;

revoke all on function public.get_ai_provider_configuration(boolean) from public, anon, authenticated;
revoke all on function public.set_ai_provider_order(text[]) from public, anon, authenticated;
grant execute on function public.get_ai_provider_configuration(boolean) to service_role;
grant execute on function public.set_ai_provider_order(text[]) to service_role;
