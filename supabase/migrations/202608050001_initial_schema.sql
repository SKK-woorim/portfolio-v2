-- Portfolio V2: application tables, Row Level Security, Storage, and rate limiting.
-- Apply this file to both staging and production Supabase projects in order.

create extension if not exists pgcrypto with schema extensions;

create type public.app_role as enum ('admin', 'editor');
create type public.portfolio_status as enum ('draft', 'published', 'hidden', 'trashed');
create type public.post_status as enum ('draft', 'published', 'private', 'trashed');
create type public.media_role as enum ('cover', 'gallery', 'inline');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null default 'editor',
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.media (
  id uuid primary key default gen_random_uuid(),
  storage_key text not null unique,
  public_url text not null,
  alt text not null default '',
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.site_profile (
  id boolean primary key default true check (id),
  display_name text not null,
  role_title text not null,
  headline text not null,
  bio text not null,
  avatar_media_id uuid references public.media(id) on delete set null,
  contact jsonb not null default '{}'::jsonb,
  social_links jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table public.portfolio_items (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  type text not null,
  summary text not null,
  content_json jsonb not null default '{"type":"doc","content":[]}'::jsonb,
  start_date date,
  end_date date,
  status public.portfolio_status not null default 'draft',
  status_before_trash public.portfolio_status,
  sort_order integer not null default 0 check (sort_order >= 0),
  is_featured boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);

create table public.portfolio_tags (
  portfolio_item_id uuid not null references public.portfolio_items(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  primary key (portfolio_item_id, tag_id)
);

create table public.portfolio_item_media (
  portfolio_item_id uuid not null references public.portfolio_items(id) on delete cascade,
  media_id uuid not null references public.media(id) on delete restrict,
  role public.media_role not null default 'gallery',
  sort_order integer not null default 0 check (sort_order >= 0),
  primary key (portfolio_item_id, media_id)
);

create table public.portfolio_links (
  id uuid primary key default gen_random_uuid(),
  portfolio_item_id uuid not null references public.portfolio_items(id) on delete cascade,
  label text not null,
  url text not null,
  link_type text not null default 'external',
  sort_order integer not null default 0 check (sort_order >= 0)
);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  excerpt text not null,
  content_json jsonb not null default '{"type":"doc","content":[]}'::jsonb,
  content_text text not null default '',
  category_id uuid references public.categories(id) on delete set null,
  cover_media_id uuid references public.media(id) on delete set null,
  status public.post_status not null default 'draft',
  status_before_trash public.post_status,
  published_at timestamptz,
  seo_title text,
  seo_description text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'published' and published_at is not null) or status <> 'published')
);

create table public.post_tags (
  post_id uuid not null references public.posts(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  primary key (post_id, tag_id)
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.login_rate_limits (
  identifier_hash text primary key,
  window_started_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0),
  updated_at timestamptz not null default now()
);

create index portfolio_items_public_index on public.portfolio_items (status, is_featured desc, sort_order asc, start_date desc);
create index posts_public_index on public.posts (status, published_at desc);
create index posts_category_index on public.posts (category_id);
create index media_created_at_index on public.media (created_at desc);
create index audit_logs_target_index on public.audit_logs (target_type, target_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles for each row execute procedure public.set_updated_at();
create trigger site_profile_set_updated_at before update on public.site_profile for each row execute procedure public.set_updated_at();
create trigger portfolio_items_set_updated_at before update on public.portfolio_items for each row execute procedure public.set_updated_at();
create trigger posts_set_updated_at before update on public.posts for each row execute procedure public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name) values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- Five attempts per email address per 15-minute window. This server-action-only RPC
-- keeps the counter in Postgres instead of a per-instance memory store.
create or replace function public.consume_login_attempt(p_identifier text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_hash text := encode(extensions.digest(lower(trim(p_identifier)), 'sha256'), 'hex');
  v_row public.login_rate_limits%rowtype;
begin
  select * into v_row from public.login_rate_limits where identifier_hash = v_hash for update;
  if not found then
    insert into public.login_rate_limits (identifier_hash, attempts) values (v_hash, 1);
    return true;
  end if;
  if v_row.window_started_at < now() - interval '15 minutes' then
    update public.login_rate_limits set window_started_at = now(), attempts = 1, updated_at = now() where identifier_hash = v_hash;
    return true;
  end if;
  if v_row.attempts >= 5 then return false; end if;
  update public.login_rate_limits set attempts = attempts + 1, updated_at = now() where identifier_hash = v_hash;
  return true;
end;
$$;

alter table public.profiles enable row level security;
alter table public.media enable row level security;
alter table public.site_profile enable row level security;
alter table public.tags enable row level security;
alter table public.categories enable row level security;
alter table public.portfolio_items enable row level security;
alter table public.portfolio_tags enable row level security;
alter table public.portfolio_item_media enable row level security;
alter table public.portfolio_links enable row level security;
alter table public.posts enable row level security;
alter table public.post_tags enable row level security;
alter table public.audit_logs enable row level security;
alter table public.login_rate_limits enable row level security;

create policy "profiles: read own or admin" on public.profiles for select using (auth.uid() = id or public.is_admin());
create policy "profiles: admin manage" on public.profiles for all using (public.is_admin()) with check (public.is_admin());
create policy "site profile: public read" on public.site_profile for select using (true);
create policy "site profile: admin manage" on public.site_profile for all using (public.is_admin()) with check (public.is_admin());
create policy "tags: public read" on public.tags for select using (true);
create policy "tags: admin manage" on public.tags for all using (public.is_admin()) with check (public.is_admin());
create policy "categories: public read" on public.categories for select using (true);
create policy "categories: admin manage" on public.categories for all using (public.is_admin()) with check (public.is_admin());
create policy "portfolio: public published read" on public.portfolio_items for select using (status = 'published');
create policy "portfolio: admin manage" on public.portfolio_items for all using (public.is_admin()) with check (public.is_admin());
create policy "portfolio tags: public published read" on public.portfolio_tags for select using (exists (select 1 from public.portfolio_items item where item.id = portfolio_item_id and item.status = 'published'));
create policy "portfolio tags: admin manage" on public.portfolio_tags for all using (public.is_admin()) with check (public.is_admin());
create policy "portfolio media: public published read" on public.portfolio_item_media for select using (exists (select 1 from public.portfolio_items item where item.id = portfolio_item_id and item.status = 'published'));
create policy "portfolio media: admin manage" on public.portfolio_item_media for all using (public.is_admin()) with check (public.is_admin());
create policy "portfolio links: public published read" on public.portfolio_links for select using (exists (select 1 from public.portfolio_items item where item.id = portfolio_item_id and item.status = 'published'));
create policy "portfolio links: admin manage" on public.portfolio_links for all using (public.is_admin()) with check (public.is_admin());
create policy "posts: public published read" on public.posts for select using (status = 'published');
create policy "posts: admin manage" on public.posts for all using (public.is_admin()) with check (public.is_admin());
create policy "post tags: public published read" on public.post_tags for select using (exists (select 1 from public.posts post where post.id = post_id and post.status = 'published'));
create policy "post tags: admin manage" on public.post_tags for all using (public.is_admin()) with check (public.is_admin());
create policy "media: public used media read" on public.media for select using (
  exists (select 1 from public.portfolio_item_media rel join public.portfolio_items item on item.id = rel.portfolio_item_id where rel.media_id = id and item.status = 'published')
  or exists (select 1 from public.posts post where post.cover_media_id = id and post.status = 'published')
);
create policy "media: admin manage" on public.media for all using (public.is_admin()) with check (public.is_admin());
create policy "audit logs: admin read" on public.audit_logs for select using (public.is_admin());
create policy "audit logs: admin insert" on public.audit_logs for insert with check (public.is_admin());

insert into storage.buckets (id, name, public) values ('media', 'media', true) on conflict (id) do update set public = true;
create policy "media bucket: admin upload" on storage.objects for insert to authenticated with check (bucket_id = 'media' and public.is_admin());
create policy "media bucket: admin update" on storage.objects for update to authenticated using (bucket_id = 'media' and public.is_admin()) with check (bucket_id = 'media' and public.is_admin());
create policy "media bucket: admin delete" on storage.objects for delete to authenticated using (bucket_id = 'media' and public.is_admin());

grant execute on function public.consume_login_attempt(text) to anon, authenticated;
