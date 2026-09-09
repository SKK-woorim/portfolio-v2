import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationDirectory = path.resolve(scriptDirectory, "../supabase/migrations");
const entries = (await readdir(migrationDirectory)).filter((name) => name.endsWith(".sql")).sort();

if (new Set(entries.map((name) => name.slice(0, 14))).size !== entries.length) {
  throw new Error("Migration timestamps must be unique.");
}

const migrations = new Map(await Promise.all(entries.map(async (name) => [
  name,
  (await readFile(path.join(migrationDirectory, name), "utf8")).toLowerCase(),
])));

function requireContract(file, patterns) {
  const sql = migrations.get(file);
  if (!sql) throw new Error(`Required migration is missing: ${file}`);
  for (const pattern of patterns) {
    if (!sql.includes(pattern.toLowerCase())) {
      throw new Error(`${file} is missing required contract: ${pattern}`);
    }
  }
}

function requireOccurrences(file, pattern, minimum) {
  const sql = migrations.get(file);
  if (!sql) throw new Error(`Required migration is missing: ${file}`);
  const count = sql.split(pattern.toLowerCase()).length - 1;
  if (count < minimum) {
    throw new Error(`${file} must contain ${minimum} occurrences of: ${pattern}`);
  }
}

function requireFunctionContract(file, signature, patterns) {
  const sql = migrations.get(file);
  if (!sql) throw new Error(`Required migration is missing: ${file}`);

  const functionStart = `create or replace function ${signature.toLowerCase()}`;
  const start = sql.indexOf(functionStart);
  if (start === -1) {
    throw new Error(`${file} is missing required function: ${signature}`);
  }

  const end = sql.indexOf("$$;", start);
  if (end === -1) {
    throw new Error(`${file} has an unterminated function: ${signature}`);
  }
  const body = sql.slice(start, end + 3);
  for (const pattern of patterns) {
    if (!body.includes(pattern.toLowerCase())) {
      throw new Error(`${file} function ${signature} is missing required contract: ${pattern}`);
    }
  }
}

function requireStatementContract(file, statementStart, patterns) {
  const sql = migrations.get(file);
  if (!sql) throw new Error(`Required migration is missing: ${file}`);

  const start = sql.indexOf(statementStart.toLowerCase());
  if (start === -1) {
    throw new Error(`${file} is missing required statement: ${statementStart}`);
  }
  const end = sql.indexOf(";", start);
  if (end === -1) {
    throw new Error(`${file} has an unterminated statement: ${statementStart}`);
  }
  const statement = sql.slice(start, end + 1);
  for (const pattern of patterns) {
    if (!statement.includes(pattern.toLowerCase())) {
      throw new Error(`${file} statement ${statementStart} is missing required contract: ${pattern}`);
    }
  }
}

const expansionOne = "202609070001_secure_login_and_media_usage.sql";
const expansionTwo = "202609070002_atomic_content_mutations.sql";
const expansionThree = "202609070003_media_image_metadata.sql";
const contractMigration = "202609070004_enforce_rpc_boundaries.sql";

requireContract(expansionOne, [
  "create table public.login_attempt_reservations",
  "token uuid primary key default gen_random_uuid()",
  "email_hash text not null check (email_hash ~ '^[0-9a-f]{64}$')",
  "ip_hash text not null check (ip_hash ~ '^[0-9a-f]{64}$')",
  "add constraint media_public_url_nonempty",
  "check (length(trim(public_url)) > 0) not valid",
  "create table public.post_media",
  "media_id uuid not null references public.media(id) on delete restrict",
  "on length(trim(media.public_url)) > 0",
  "relation.media_id = media.id",
  "post.cover_media_id = media.id",
  "profile.avatar_media_id = media.id",
  "create trigger media_prevent_used_delete",
]);

requireFunctionContract(expansionOne, "public.reserve_login_attempt_trusted(", [
  "delete from public.login_attempt_reservations where expires_at <= v_now",
  "for update",
  "v_email.failed_attempts + v_email_active >= 5",
  "v_ip.failed_attempts + v_ip_active >= 25",
  "insert into public.login_attempt_reservations",
  "'reservation_token', v_token",
]);
requireFunctionContract(expansionOne, "public.finalize_login_attempt_trusted(", [
  "p_outcome not in ('success', 'failure', 'abandoned')",
  "where token = p_reservation_token",
  "for update",
  "delete from public.login_attempt_reservations where token = p_reservation_token",
  "if p_outcome = 'success'",
  "elsif p_outcome = 'failure'",
]);
requireContract(expansionOne, [
  "revoke all on function public.reserve_login_attempt_trusted(text, text) from public, anon, authenticated",
  "revoke all on function public.finalize_login_attempt_trusted(uuid, text) from public, anon, authenticated",
  "grant execute on function public.reserve_login_attempt_trusted(text, text) to service_role",
  "grant execute on function public.finalize_login_attempt_trusted(uuid, text) to service_role",
]);

for (const signature of ["public.save_portfolio_atomic(", "public.save_post_atomic("]) {
  requireFunctionContract(expansionTwo, signature, [
    "(v_content_json ->> 'type') is distinct from 'markdown'",
    "jsonb_typeof(v_content_json -> 'markdown') is distinct from 'string'",
    "jsonb_typeof(media.value) <> 'string'",
    "media_id::uuid",
    "v_matching_count <> v_requested_count",
    "raise exception 'unknown_inline_media'",
    "v_cover_media_id is not null",
    "select 1 from public.media where id = v_cover_media_id",
    "insert into public.audit_logs",
  ]);
}
requireContract(expansionTwo, [
  "create or replace function public.transition_content_status_atomic",
  "create or replace function public.reorder_portfolio_items_atomic",
  "raise exception 'content_version_required'",
  "raise exception 'content_version_conflict'",
]);
requireOccurrences(expansionTwo, "(v_content_json ->> 'type') is distinct from 'markdown'", 2);
requireOccurrences(expansionTwo, "count(distinct lower(trim(tag_name)))", 2);
requireOccurrences(expansionTwo, "join public.tags as tag on lower(trim(tag.name)) = lower(requested.name)", 2);

requireFunctionContract(expansionThree, "public.update_media_alt_atomic(", [
  "update public.media",
  "insert into public.audit_logs",
  "'update_alt'",
]);
requireFunctionContract(expansionThree, "public.register_media_atomic(", [
  "v_public_url is null or length(v_public_url) not between 1 and 2048",
  "v_public_url !~ '^https?://'",
  "insert into public.media",
  "insert into public.audit_logs",
  "'upload'",
]);
requireFunctionContract(expansionThree, "public.update_site_profile_atomic(", [
  "insert into public.site_profile",
  "on conflict (id) do update",
  "insert into public.audit_logs",
  "'site_profile'",
]);
requireFunctionContract(expansionThree, "public.set_chatbot_runtime_enabled(", [
  "insert into public.chatbot_runtime_settings",
  "on conflict (id) do update",
  "insert into public.audit_logs",
  "'chatbot_runtime'",
]);
requireContract(expansionThree, [
  "create table public.media_deletion_outbox",
  "media_id uuid primary key",
  "storage_key text not null unique",
  "alter table public.media_deletion_outbox enable row level security",
  "create policy \"media deletion outbox: admin read\"",
  "create table public.deployment_contract_approvals",
  "revoke all on table public.deployment_contract_approvals from public, anon, authenticated",
]);
requireFunctionContract(expansionThree, "public.delete_media_atomic(", [
  "from public.media_deletion_outbox",
  "delete from public.media",
  "insert into public.media_deletion_outbox",
  "insert into public.audit_logs",
  "'delete_requested'",
  "'retry', true",
  "'retry', false",
]);
for (const signature of ["public.record_media_deletion_failure(", "public.complete_media_deletion("]) {
  requireFunctionContract(expansionThree, signature, [
    "public.media_deletion_outbox",
    "if not found then",
  ]);
}
requireContract(expansionThree, [
  "grant execute on function public.delete_media_atomic(uuid) to authenticated",
  "grant execute on function public.record_media_deletion_failure(uuid) to authenticated",
  "grant execute on function public.complete_media_deletion(uuid) to authenticated",
]);

requireContract(contractMigration, [
  "contract_key = '202609070004_enforce_rpc_boundaries'",
  "raise exception 'contract_phase_not_approved'",
  "drop function if exists public.consume_login_attempt(text)",
  "drop function if exists public.is_login_locked(text)",
  "drop function if exists public.record_failed_login_attempt(text)",
  "drop function if exists public.clear_failed_login_attempt(text)",
  "drop function if exists public.check_login_rate_limit_trusted(text, text)",
  "drop function if exists public.record_failed_login_attempt_trusted(text, text)",
  "drop function if exists public.clear_failed_login_attempt_trusted(text)",
  "drop table if exists public.login_rate_limits",
  "revoke insert, update, delete on table",
  "drop policy if exists \"media bucket: admin update\" on storage.objects",
]);
requireStatementContract(contractMigration, "revoke insert, update, delete on table", [
  "public.profiles",
  "public.media",
  "public.site_profile",
  "public.tags",
  "public.categories",
  "public.portfolio_items",
  "public.portfolio_tags",
  "public.portfolio_item_media",
  "public.portfolio_links",
  "public.posts",
  "public.post_tags",
  "public.post_media",
  "public.audit_logs",
  "from authenticated",
]);

console.log(`Migration contracts verified across ${entries.length} forward SQL files.`);
