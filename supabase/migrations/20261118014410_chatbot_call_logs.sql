create extension if not exists pg_cron;

create table portfolio_private.chatbot_call_requests (
  request_id uuid primary key,
  started_at timestamptz not null check (isfinite(started_at)),
  key_lookup_status text check (key_lookup_status in ('failed', 'missing_openai', 'missing_gemini', 'missing_both'))
);

create index chatbot_call_requests_started_at_idx
  on portfolio_private.chatbot_call_requests (started_at desc, request_id desc);

create table portfolio_private.chatbot_call_attempts (
  request_id uuid not null references portfolio_private.chatbot_call_requests (request_id) on delete cascade,
  attempt_order integer not null check (attempt_order > 0),
  provider text not null check (provider in ('openai', 'gemini', 'local')),
  model text check (model ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$'),
  started_at timestamptz not null check (isfinite(started_at)),
  duration_ms integer not null check (duration_ms >= 0),
  status text not null check (status in ('success', 'error', 'timeout', 'cancelled')),
  http_status integer check (http_status between 100 and 599),
  error_class text check (error_class in (
    'HTTPStatusError', 'TimeoutError', 'CancelledError', 'RequestError', 'OSError',
    'ValueError', 'TypeError', 'AttributeError', 'KeyError', 'RuntimeError',
    'EmptyResponse', 'IncompleteResponse', 'FirstTokenTimeout', 'GenerationTimeout',
    'RemoteBudgetTimeout', 'UnexpectedError'
  )),
  input_tokens integer check (input_tokens >= 0),
  output_tokens integer check (output_tokens >= 0),
  total_tokens integer check (total_tokens >= 0),
  primary key (request_id, attempt_order)
);

alter table portfolio_private.chatbot_call_requests enable row level security;
alter table portfolio_private.chatbot_call_attempts enable row level security;
revoke all on table portfolio_private.chatbot_call_requests, portfolio_private.chatbot_call_attempts
  from public, anon, authenticated, service_role;
grant select, insert on table portfolio_private.chatbot_call_requests, portfolio_private.chatbot_call_attempts
  to service_role;

create function public.record_chatbot_call_log(
  p_request_id uuid,
  p_attempts jsonb,
  p_key_lookup_status text default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_started_at timestamptz;
  v_attempt_count integer;
begin
  if jsonb_typeof(p_attempts) is distinct from 'array' then
    raise exception 'Expected an array of chatbot call attempts' using errcode = '22023';
  end if;

  v_attempt_count := jsonb_array_length(p_attempts);
  if v_attempt_count = 0 and p_key_lookup_status is null then
    return;
  end if;

  v_started_at := coalesce((p_attempts -> 0 ->> 'started_at')::timestamptz, statement_timestamp());
  if v_started_at <= statement_timestamp() - interval '30 days' then
    return;
  end if;

  insert into portfolio_private.chatbot_call_requests (request_id, started_at, key_lookup_status)
  values (p_request_id, v_started_at, p_key_lookup_status)
  on conflict (request_id) do nothing;

  if not found then
    return;
  end if;

  insert into portfolio_private.chatbot_call_attempts (
    request_id, attempt_order, provider, model, started_at, duration_ms, status,
    http_status, error_class, input_tokens, output_tokens, total_tokens
  )
  select p_request_id, attempt.position, attempt.provider, attempt.model,
    attempt.started_at, attempt.duration_ms, attempt.status, attempt.http_status,
    attempt.error_class, attempt.input_tokens, attempt.output_tokens, attempt.total_tokens
  from rows from (jsonb_to_recordset(p_attempts) as (
    provider text, model text, started_at timestamptz, duration_ms integer, status text,
    http_status integer, error_class text, input_tokens integer, output_tokens integer, total_tokens integer
  )) with ordinality as attempt (
    provider, model, started_at, duration_ms, status, http_status, error_class,
    input_tokens, output_tokens, total_tokens, position
  );
end;
$$;

create function public.list_chatbot_call_logs(p_limit integer default 20, p_offset integer default 0)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with page as (
    select request_id, started_at, key_lookup_status
    from portfolio_private.chatbot_call_requests
    where started_at > statement_timestamp() - interval '30 days'
    order by started_at desc, request_id desc
    limit greatest(1, least(coalesce(p_limit, 20), 100))
    offset greatest(0, coalesce(p_offset, 0))
  )
  select jsonb_build_object(
    'requests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'request_id', page.request_id,
        'started_at', page.started_at,
        'key_lookup_status', page.key_lookup_status,
        'attempts', coalesce((
          select jsonb_agg(jsonb_build_object(
            'attempt_order', attempt.attempt_order,
            'provider', attempt.provider,
            'model', attempt.model,
            'started_at', attempt.started_at,
            'duration_ms', attempt.duration_ms,
            'status', attempt.status,
            'http_status', attempt.http_status,
            'error_class', attempt.error_class,
            'input_tokens', attempt.input_tokens,
            'output_tokens', attempt.output_tokens,
            'total_tokens', attempt.total_tokens
          ) order by attempt.attempt_order)
          from portfolio_private.chatbot_call_attempts as attempt
          where attempt.request_id = page.request_id
        ), '[]'::jsonb)
      ) order by page.started_at desc, page.request_id desc)
      from page
    ), '[]'::jsonb),
    'total_count', (
      select count(*) from portfolio_private.chatbot_call_requests
      where started_at > statement_timestamp() - interval '30 days'
    )
  );
$$;

revoke all on function public.record_chatbot_call_log(uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.list_chatbot_call_logs(integer, integer) from public, anon, authenticated;
grant execute on function public.record_chatbot_call_log(uuid, jsonb, text) to service_role;
grant execute on function public.list_chatbot_call_logs(integer, integer) to service_role;

select cron.schedule(
  'portfolio-chatbot-call-log-retention',
  '*/15 * * * *',
  $job$delete from portfolio_private.chatbot_call_requests
    where started_at <= statement_timestamp() - interval '30 days';$job$
);
