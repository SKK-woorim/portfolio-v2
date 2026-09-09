-- The RAG worker reads published source rows through PostgREST. The portfolio
-- backfill additionally updates only the derived content_text column.

grant usage on schema public to service_role;

grant select on table
  public.site_profile,
  public.portfolio_items,
  public.portfolio_tags,
  public.portfolio_links,
  public.tags,
  public.posts,
  public.post_tags,
  public.categories
to service_role;

grant update (content_text) on table public.portfolio_items to service_role;
