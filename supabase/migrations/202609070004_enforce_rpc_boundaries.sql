-- Contract phase: apply only after the RPC-based web deployment is healthy and
-- its rollback window has closed. This removes legacy authentication data and
-- makes database mutation invariants enforceable through narrow RPCs.

do $$
begin
  if not exists (
    select 1
      from public.deployment_contract_approvals
     where contract_key = '202609070004_enforce_rpc_boundaries'
  ) then
    raise exception 'contract_phase_not_approved'
      using errcode = '55000',
            hint = 'Record the approved rollback-window closure before applying this migration.';
  end if;
end;
$$;

drop function if exists public.consume_login_attempt(text);
drop function if exists public.is_login_locked(text);
drop function if exists public.record_failed_login_attempt(text);
drop function if exists public.clear_failed_login_attempt(text);
drop function if exists public.check_login_rate_limit_trusted(text, text);
drop function if exists public.record_failed_login_attempt_trusted(text, text);
drop function if exists public.clear_failed_login_attempt_trusted(text);

-- The retired table stores unsalted hashes of normalized emails. It is no
-- longer needed by the reservation protocol and must not remain in backups as
-- a dictionary-recoverable identifier store.
drop table if exists public.login_rate_limits;

-- The authenticated role may read rows allowed by RLS and invoke guarded RPCs,
-- but cannot bypass validation, optimistic concurrency, relation updates, or
-- audit writes with direct PostgREST mutations.
revoke insert, update, delete on table
  public.profiles,
  public.media,
  public.site_profile,
  public.tags,
  public.categories,
  public.portfolio_items,
  public.portfolio_tags,
  public.portfolio_item_media,
  public.portfolio_links,
  public.posts,
  public.post_tags,
  public.post_media,
  public.audit_logs
from authenticated;

-- Normalized uploads create immutable object keys; overwriting an existing
-- object would make its checksum and dimensions untrustworthy.
drop policy if exists "media bucket: admin update" on storage.objects;

comment on table public.login_rate_limit_buckets is
  'Server-only failed-login buckets; active attempts are tracked by expiring reservation tokens.';
