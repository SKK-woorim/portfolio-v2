-- Portfolio chatbot: debounced source-change queueing and administrator reindex RPCs.

create or replace function public.queue_knowledge_sync(
  p_source_type text,
  p_source_id text,
  p_source_slug text,
  p_title text,
  p_source_updated_at timestamptz,
  p_action text
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_document_id uuid;
  v_revision_id uuid := gen_random_uuid();
  v_source_url text;
begin
  if p_source_type not in ('profile', 'portfolio', 'post') then
    raise exception 'Unsupported knowledge source type';
  end if;
  if p_action not in ('upsert', 'disable', 'delete') then
    raise exception 'Unsupported knowledge sync action';
  end if;

  v_source_url := case p_source_type
    when 'profile' then '/about'
    when 'portfolio' then '/portfolio/' || p_source_slug
    when 'post' then '/blog/' || p_source_slug
  end;

  insert into public.knowledge_documents (
    source_type, source_id, source_slug, title, source_url,
    source_updated_at, desired_revision, active_revision, index_status,
    content_hash, attempt_count, last_error, queued_at
  ) values (
    p_source_type,
    p_source_id,
    nullif(p_source_slug, ''),
    coalesce(nullif(trim(p_title), ''), 'Untitled'),
    v_source_url,
    coalesce(p_source_updated_at, now()),
    v_revision_id,
    null,
    'pending',
    null,
    0,
    null,
    now()
  )
  on conflict (source_type, source_id) do update
    set source_slug = excluded.source_slug,
        title = excluded.title,
        source_url = excluded.source_url,
        source_updated_at = excluded.source_updated_at,
        desired_revision = excluded.desired_revision,
        active_revision = case when p_action = 'upsert' then public.knowledge_documents.active_revision else null end,
        index_status = 'pending',
        content_hash = case when p_action = 'upsert' then public.knowledge_documents.content_hash else null end,
        attempt_count = 0,
        last_error = null,
        queued_at = now()
  returning id into v_document_id;

  -- Private/trashed/deleted source text is removed immediately, not after worker polling.
  if p_action <> 'upsert' then
    delete from public.knowledge_chunks where document_id = v_document_id;
  end if;

  insert into public.knowledge_sync_jobs (
    document_id, revision_id, action, status, attempt_count,
    available_at, locked_at, locked_by, last_error
  ) values (
    v_document_id, v_revision_id, p_action, 'queued', 0,
    now() + interval '2 seconds', null, null, null
  )
  on conflict (document_id) where status = 'queued' do update
    set revision_id = excluded.revision_id,
        action = excluded.action,
        attempt_count = 0,
        available_at = excluded.available_at,
        locked_at = null,
        locked_by = null,
        last_error = null;

  return v_document_id;
end;
$$;

create or replace function public.queue_site_profile_knowledge()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    perform public.queue_knowledge_sync('profile', 'site', null, old.display_name, old.updated_at, 'delete');
    return old;
  end if;
  perform public.queue_knowledge_sync('profile', 'site', null, new.display_name, new.updated_at, 'upsert');
  return new;
end;
$$;

create or replace function public.queue_portfolio_item_knowledge()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_action text;
begin
  if tg_op = 'DELETE' then
    perform public.queue_knowledge_sync('portfolio', old.id::text, old.slug, old.title, old.updated_at, 'delete');
    return old;
  end if;
  v_action := case new.status::text
    when 'published' then 'upsert'
    when 'trashed' then 'delete'
    else 'disable'
  end;
  perform public.queue_knowledge_sync('portfolio', new.id::text, new.slug, new.title, new.updated_at, v_action);
  return new;
end;
$$;

create or replace function public.queue_post_knowledge()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_action text;
begin
  if tg_op = 'DELETE' then
    perform public.queue_knowledge_sync('post', old.id::text, old.slug, old.title, old.updated_at, 'delete');
    return old;
  end if;
  v_action := case new.status::text
    when 'published' then 'upsert'
    when 'trashed' then 'delete'
    else 'disable'
  end;
  perform public.queue_knowledge_sync('post', new.id::text, new.slug, new.title, new.updated_at, v_action);
  return new;
end;
$$;

create or replace function public.queue_portfolio_relation_knowledge()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_old_id uuid;
  v_new_id uuid;
  v_item public.portfolio_items%rowtype;
  v_action text;
begin
  v_old_id := case when tg_op in ('UPDATE', 'DELETE') then old.portfolio_item_id else null end;
  v_new_id := case when tg_op in ('INSERT', 'UPDATE') then new.portfolio_item_id else null end;

  for v_item in
    select item.* from public.portfolio_items as item
     where item.id in (v_old_id, v_new_id)
  loop
    v_action := case v_item.status::text
      when 'published' then 'upsert'
      when 'trashed' then 'delete'
      else 'disable'
    end;
    perform public.queue_knowledge_sync('portfolio', v_item.id::text, v_item.slug, v_item.title, v_item.updated_at, v_action);
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.queue_post_tag_knowledge()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_old_id uuid;
  v_new_id uuid;
  v_post public.posts%rowtype;
  v_action text;
begin
  v_old_id := case when tg_op in ('UPDATE', 'DELETE') then old.post_id else null end;
  v_new_id := case when tg_op in ('INSERT', 'UPDATE') then new.post_id else null end;

  for v_post in
    select post.* from public.posts as post
     where post.id in (v_old_id, v_new_id)
  loop
    v_action := case v_post.status::text
      when 'published' then 'upsert'
      when 'trashed' then 'delete'
      else 'disable'
    end;
    perform public.queue_knowledge_sync('post', v_post.id::text, v_post.slug, v_post.title, v_post.updated_at, v_action);
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists site_profile_queue_knowledge on public.site_profile;
create trigger site_profile_queue_knowledge
  after insert or update or delete on public.site_profile
  for each row execute procedure public.queue_site_profile_knowledge();

drop trigger if exists portfolio_items_queue_knowledge on public.portfolio_items;
create trigger portfolio_items_queue_knowledge
  after insert or update or delete on public.portfolio_items
  for each row execute procedure public.queue_portfolio_item_knowledge();

drop trigger if exists posts_queue_knowledge on public.posts;
create trigger posts_queue_knowledge
  after insert or update or delete on public.posts
  for each row execute procedure public.queue_post_knowledge();

drop trigger if exists portfolio_tags_queue_knowledge on public.portfolio_tags;
create trigger portfolio_tags_queue_knowledge
  after insert or update or delete on public.portfolio_tags
  for each row execute procedure public.queue_portfolio_relation_knowledge();

drop trigger if exists portfolio_links_queue_knowledge on public.portfolio_links;
create trigger portfolio_links_queue_knowledge
  after insert or update or delete on public.portfolio_links
  for each row execute procedure public.queue_portfolio_relation_knowledge();

drop trigger if exists post_tags_queue_knowledge on public.post_tags;
create trigger post_tags_queue_knowledge
  after insert or update or delete on public.post_tags
  for each row execute procedure public.queue_post_tag_knowledge();

create or replace function public.reindex_knowledge_document(p_document_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_document public.knowledge_documents%rowtype;
  v_profile public.site_profile%rowtype;
  v_portfolio public.portfolio_items%rowtype;
  v_post public.posts%rowtype;
  v_action text;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  select * into v_document
    from public.knowledge_documents
   where id = p_document_id;
  if not found then
    raise exception 'Knowledge document not found' using errcode = 'P0002';
  end if;

  if v_document.source_type = 'profile' then
    select * into v_profile from public.site_profile where id = true;
    if found then
      return public.queue_knowledge_sync('profile', 'site', null, v_profile.display_name, v_profile.updated_at, 'upsert');
    end if;
    return public.queue_knowledge_sync('profile', 'site', null, v_document.title, v_document.source_updated_at, 'delete');
  end if;

  if v_document.source_type = 'portfolio' then
    select * into v_portfolio from public.portfolio_items where id = v_document.source_id::uuid;
    if not found then
      return public.queue_knowledge_sync('portfolio', v_document.source_id, v_document.source_slug, v_document.title, v_document.source_updated_at, 'delete');
    end if;
    v_action := case v_portfolio.status::text when 'published' then 'upsert' when 'trashed' then 'delete' else 'disable' end;
    return public.queue_knowledge_sync('portfolio', v_portfolio.id::text, v_portfolio.slug, v_portfolio.title, v_portfolio.updated_at, v_action);
  end if;

  select * into v_post from public.posts where id = v_document.source_id::uuid;
  if not found then
    return public.queue_knowledge_sync('post', v_document.source_id, v_document.source_slug, v_document.title, v_document.source_updated_at, 'delete');
  end if;
  v_action := case v_post.status::text when 'published' then 'upsert' when 'trashed' then 'delete' else 'disable' end;
  return public.queue_knowledge_sync('post', v_post.id::text, v_post.slug, v_post.title, v_post.updated_at, v_action);
end;
$$;

create or replace function public.reindex_all_knowledge_documents()
returns integer
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_profile public.site_profile%rowtype;
  v_portfolio public.portfolio_items%rowtype;
  v_post public.posts%rowtype;
  v_orphan public.knowledge_documents%rowtype;
  v_action text;
  v_count integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  for v_profile in select * from public.site_profile loop
    perform public.queue_knowledge_sync('profile', 'site', null, v_profile.display_name, v_profile.updated_at, 'upsert');
    v_count := v_count + 1;
  end loop;

  for v_portfolio in select * from public.portfolio_items loop
    v_action := case v_portfolio.status::text when 'published' then 'upsert' when 'trashed' then 'delete' else 'disable' end;
    perform public.queue_knowledge_sync('portfolio', v_portfolio.id::text, v_portfolio.slug, v_portfolio.title, v_portfolio.updated_at, v_action);
    v_count := v_count + 1;
  end loop;

  for v_post in select * from public.posts loop
    v_action := case v_post.status::text when 'published' then 'upsert' when 'trashed' then 'delete' else 'disable' end;
    perform public.queue_knowledge_sync('post', v_post.id::text, v_post.slug, v_post.title, v_post.updated_at, v_action);
    v_count := v_count + 1;
  end loop;

  for v_orphan in
    select document.*
      from public.knowledge_documents as document
     where (document.source_type = 'profile' and not exists (select 1 from public.site_profile where id = true))
        or (document.source_type = 'portfolio' and not exists (select 1 from public.portfolio_items where id::text = document.source_id))
        or (document.source_type = 'post' and not exists (select 1 from public.posts where id::text = document.source_id))
  loop
    perform public.queue_knowledge_sync(
      v_orphan.source_type, v_orphan.source_id, v_orphan.source_slug,
      v_orphan.title, v_orphan.source_updated_at, 'delete'
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.queue_knowledge_sync(text, text, text, text, timestamptz, text) from public, anon, authenticated;
revoke all on function public.queue_site_profile_knowledge() from public, anon, authenticated;
revoke all on function public.queue_portfolio_item_knowledge() from public, anon, authenticated;
revoke all on function public.queue_post_knowledge() from public, anon, authenticated;
revoke all on function public.queue_portfolio_relation_knowledge() from public, anon, authenticated;
revoke all on function public.queue_post_tag_knowledge() from public, anon, authenticated;
revoke all on function public.reindex_knowledge_document(uuid) from public, anon, authenticated;
revoke all on function public.reindex_all_knowledge_documents() from public, anon, authenticated;

grant execute on function public.reindex_knowledge_document(uuid) to authenticated;
grant execute on function public.reindex_all_knowledge_documents() to authenticated;

-- Queue all current sources once. Subsequent changes are handled by the triggers above.
do $$
declare
  v_profile public.site_profile%rowtype;
  v_portfolio public.portfolio_items%rowtype;
  v_post public.posts%rowtype;
  v_action text;
begin
  for v_profile in select * from public.site_profile loop
    perform public.queue_knowledge_sync('profile', 'site', null, v_profile.display_name, v_profile.updated_at, 'upsert');
  end loop;
  for v_portfolio in select * from public.portfolio_items loop
    v_action := case v_portfolio.status::text when 'published' then 'upsert' when 'trashed' then 'delete' else 'disable' end;
    perform public.queue_knowledge_sync('portfolio', v_portfolio.id::text, v_portfolio.slug, v_portfolio.title, v_portfolio.updated_at, v_action);
  end loop;
  for v_post in select * from public.posts loop
    v_action := case v_post.status::text when 'published' then 'upsert' when 'trashed' then 'delete' else 'disable' end;
    perform public.queue_knowledge_sync('post', v_post.id::text, v_post.slug, v_post.title, v_post.updated_at, v_action);
  end loop;
end;
$$;
