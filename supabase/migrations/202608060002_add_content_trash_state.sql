-- Keep a reversible state transition when CMS content enters the trash.
alter table public.portfolio_items
  add column if not exists status_before_trash public.portfolio_status;

alter table public.posts
  add column if not exists status_before_trash public.post_status;
