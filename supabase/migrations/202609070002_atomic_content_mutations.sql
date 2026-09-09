-- Atomic administrator content commands with optimistic concurrency checks.

create or replace function public.content_tag_slug(p_name text)
returns text
language sql
immutable
strict
security invoker
set search_path = public, extensions, pg_temp
as $$
  with normalized as (
    select trim(both '-' from regexp_replace(lower(trim(p_name)), '[^a-z0-9가-힣]+', '-', 'g')) as base
  )
  select left(case when base = '' then 'tag' else base end, 80)
         || '-'
         || substr(encode(extensions.digest(lower(trim(p_name)), 'sha256'), 'hex'), 1, 10)
    from normalized;
$$;

revoke all on function public.content_tag_slug(text) from public, anon, authenticated;

create or replace function public.save_portfolio_atomic(
  p_payload jsonb,
  p_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_id uuid;
  v_title text;
  v_slug text;
  v_type text;
  v_summary text;
  v_content_json jsonb;
  v_content_text text;
  v_start_date date;
  v_end_date date;
  v_status public.portfolio_status;
  v_sort_order integer;
  v_is_featured boolean;
  v_cover_media_id uuid;
  v_tag_names jsonb := coalesce(p_payload -> 'tag_names', '[]'::jsonb);
  v_inline_media_ids jsonb;
  v_inline_was_supplied boolean := p_payload ? 'inline_media_ids';
  v_requested_count integer;
  v_distinct_count integer;
  v_matching_count integer;
  v_previous public.portfolio_items%rowtype;
  v_saved public.portfolio_items%rowtype;
begin
  if not public.is_admin() then
    raise exception 'administrator_access_required' using errcode = '42501';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'invalid_portfolio_payload' using errcode = '22023';
  end if;

  begin
    v_id := nullif(p_payload ->> 'id', '')::uuid;
    v_title := trim(p_payload ->> 'title');
    v_slug := trim(p_payload ->> 'slug');
    v_type := trim(p_payload ->> 'type');
    v_summary := trim(p_payload ->> 'summary');
    v_content_json := p_payload -> 'content_json';
    v_content_text := coalesce(p_payload ->> 'content_text', '');
    v_start_date := nullif(p_payload ->> 'start_date', '')::date;
    v_end_date := nullif(p_payload ->> 'end_date', '')::date;
    v_status := (p_payload ->> 'status')::public.portfolio_status;
    v_sort_order := (p_payload ->> 'sort_order')::integer;
    v_is_featured := (p_payload ->> 'is_featured')::boolean;
    v_cover_media_id := nullif(p_payload ->> 'cover_media_id', '')::uuid;
  exception when others then
    raise exception 'invalid_portfolio_payload' using errcode = '22023';
  end;

  if v_title is null or length(v_title) not between 1 and 160
     or v_slug is null or length(v_slug) not between 3 and 100
     or v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
     or v_type is null or length(v_type) not between 1 and 80
     or v_summary is null or length(v_summary) not between 1 and 300
     or v_sort_order is null or v_sort_order not between 0 and 9999
     or v_is_featured is null
     or v_status is null or v_status = 'trashed'
     or (v_end_date is not null and v_start_date is not null and v_end_date < v_start_date)
     or v_content_json is null
     or jsonb_typeof(v_content_json) <> 'object'
     or (v_content_json ->> 'type') is distinct from 'markdown'
     or jsonb_typeof(v_content_json -> 'markdown') is distinct from 'string'
     or length(v_content_json ->> 'markdown') not between 1 and 100000
     or length(v_content_text) > 100000 then
    raise exception 'invalid_portfolio_payload' using errcode = '22023';
  end if;

  if jsonb_typeof(v_tag_names) <> 'array'
     or exists (
       select 1 from jsonb_array_elements(v_tag_names) as tag(value)
        where jsonb_typeof(tag.value) <> 'string'
     ) then
    raise exception 'invalid_tag_names' using errcode = '22023';
  end if;
  select count(*), count(distinct lower(trim(tag_name)))
    into v_requested_count, v_distinct_count
    from jsonb_array_elements_text(v_tag_names) as requested(tag_name);
  if v_requested_count > 50
     or v_requested_count <> v_distinct_count
     or exists (
       select 1 from jsonb_array_elements_text(v_tag_names) as requested(tag_name)
        where length(trim(tag_name)) not between 1 and 80
     ) then
    raise exception 'invalid_tag_names' using errcode = '22023';
  end if;

  if v_inline_was_supplied then
    v_inline_media_ids := p_payload -> 'inline_media_ids';
    if jsonb_typeof(v_inline_media_ids) <> 'array'
       or exists (
         select 1 from jsonb_array_elements(v_inline_media_ids) as media(value)
          where jsonb_typeof(media.value) <> 'string'
       ) then
      raise exception 'invalid_inline_media_ids' using errcode = '22023';
    end if;
    begin
      select count(*), count(distinct media_id)
        into v_requested_count, v_distinct_count
        from jsonb_array_elements_text(v_inline_media_ids) as requested(media_id);
      if v_requested_count > 200 or v_requested_count <> v_distinct_count then
        raise exception 'invalid_inline_media_ids' using errcode = '22023';
      end if;
      select count(*) into v_matching_count
        from public.media
       where id in (
         select media_id::uuid
           from jsonb_array_elements_text(v_inline_media_ids) as requested(media_id)
       );
    exception when invalid_text_representation then
      raise exception 'invalid_inline_media_ids' using errcode = '22023';
    end;
    if v_matching_count <> v_requested_count then
      raise exception 'unknown_inline_media' using errcode = '23503';
    end if;
  end if;

  if v_cover_media_id is not null
     and not exists (select 1 from public.media where id = v_cover_media_id) then
    raise exception 'unknown_cover_media' using errcode = '23503';
  end if;

  if v_id is null then
    if p_expected_updated_at is not null then
      raise exception 'unexpected_content_version' using errcode = '22023';
    end if;
    insert into public.portfolio_items (
      title, slug, type, summary, content_json, content_text,
      start_date, end_date, status, status_before_trash,
      sort_order, is_featured, created_by
    ) values (
      v_title, v_slug, v_type, v_summary, v_content_json, v_content_text,
      v_start_date, v_end_date, v_status, null,
      v_sort_order, v_is_featured, auth.uid()
    ) returning * into v_saved;
    v_id := v_saved.id;
  else
    select * into v_previous
      from public.portfolio_items
     where id = v_id
     for update;
    if not found then
      raise exception 'portfolio_not_found' using errcode = 'P0002';
    end if;
    if v_previous.status = 'trashed' then
      raise exception 'trashed_content_must_be_restored' using errcode = '22023';
    end if;
    if p_expected_updated_at is null then
      raise exception 'content_version_required' using errcode = '22023';
    end if;
    if v_previous.updated_at <> p_expected_updated_at then
      raise exception 'content_version_conflict' using errcode = '40001';
    end if;

    update public.portfolio_items
       set title = v_title,
           slug = v_slug,
           type = v_type,
           summary = v_summary,
           content_json = v_content_json,
           content_text = v_content_text,
           start_date = v_start_date,
           end_date = v_end_date,
           status = v_status,
           status_before_trash = null,
           sort_order = v_sort_order,
           is_featured = v_is_featured
     where id = v_id
       and updated_at = p_expected_updated_at
     returning * into v_saved;
    if not found then
      raise exception 'content_version_conflict' using errcode = '40001';
    end if;
  end if;

  insert into public.tags (name, slug)
  select requested.name, public.content_tag_slug(requested.name)
    from (
      select distinct trim(tag_name) as name
        from jsonb_array_elements_text(v_tag_names) as tags(tag_name)
    ) as requested
  -- The slug function is case-insensitive, so its unique constraint is also
  -- the canonical key for case-only variants such as `React` and `react`.
  on conflict do nothing;

  delete from public.portfolio_tags where portfolio_item_id = v_id;
  insert into public.portfolio_tags (portfolio_item_id, tag_id)
  select v_id, tag.id
    from (
      select distinct trim(tag_name) as name
        from jsonb_array_elements_text(v_tag_names) as tags(tag_name)
    ) as requested
    join public.tags as tag on lower(trim(tag.name)) = lower(requested.name);

  if v_inline_was_supplied then
    delete from public.portfolio_item_media
     where portfolio_item_id = v_id and role = 'inline';
  end if;

  delete from public.portfolio_item_media
   where portfolio_item_id = v_id and role = 'cover';
  if v_cover_media_id is not null then
    -- A portfolio media row has one role. Promote an existing gallery/inline
    -- use to cover rather than violating the composite primary key.
    delete from public.portfolio_item_media
     where portfolio_item_id = v_id and media_id = v_cover_media_id;
    insert into public.portfolio_item_media (
      portfolio_item_id, media_id, role, sort_order
    ) values (v_id, v_cover_media_id, 'cover', 0);
  end if;

  if v_inline_was_supplied then
    insert into public.portfolio_item_media (
      portfolio_item_id, media_id, role, sort_order
    )
    select v_id, requested.media_id::uuid, 'inline', requested.position - 1
      from jsonb_array_elements_text(v_inline_media_ids)
        with ordinality as requested(media_id, position)
     where requested.media_id::uuid is distinct from v_cover_media_id
       and not exists (
         select 1 from public.portfolio_item_media as existing
          where existing.portfolio_item_id = v_id
            and existing.media_id = requested.media_id::uuid
       );
  end if;

  insert into public.audit_logs (actor_id, action, target_type, target_id, metadata)
  values (
    auth.uid(),
    case when v_previous.id is null then 'create' else 'update' end,
    'portfolio_item',
    v_id,
    jsonb_strip_nulls(jsonb_build_object(
      'title', v_saved.title,
      'slug', v_saved.slug,
      'previousStatus', v_previous.status,
      'status', v_saved.status
    ))
  );

  return jsonb_build_object(
    'id', v_saved.id,
    'slug', v_saved.slug,
    'status', v_saved.status,
    'updated_at', v_saved.updated_at
  );
end;
$$;

create or replace function public.save_post_atomic(
  p_payload jsonb,
  p_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_id uuid;
  v_title text;
  v_slug text;
  v_excerpt text;
  v_content_json jsonb;
  v_content_text text;
  v_category_id uuid;
  v_cover_media_id uuid;
  v_status public.post_status;
  v_seo_title text;
  v_seo_description text;
  v_tag_names jsonb := coalesce(p_payload -> 'tag_names', '[]'::jsonb);
  v_inline_media_ids jsonb;
  v_inline_was_supplied boolean := p_payload ? 'inline_media_ids';
  v_requested_count integer;
  v_distinct_count integer;
  v_matching_count integer;
  v_previous public.posts%rowtype;
  v_saved public.posts%rowtype;
begin
  if not public.is_admin() then
    raise exception 'administrator_access_required' using errcode = '42501';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'invalid_post_payload' using errcode = '22023';
  end if;

  begin
    v_id := nullif(p_payload ->> 'id', '')::uuid;
    v_title := trim(p_payload ->> 'title');
    v_slug := trim(p_payload ->> 'slug');
    v_excerpt := trim(p_payload ->> 'excerpt');
    v_content_json := p_payload -> 'content_json';
    v_content_text := coalesce(p_payload ->> 'content_text', '');
    v_category_id := nullif(p_payload ->> 'category_id', '')::uuid;
    v_cover_media_id := nullif(p_payload ->> 'cover_media_id', '')::uuid;
    v_status := (p_payload ->> 'status')::public.post_status;
    v_seo_title := trim(coalesce(p_payload ->> 'seo_title', v_title));
    v_seo_description := trim(coalesce(p_payload ->> 'seo_description', v_excerpt));
  exception when others then
    raise exception 'invalid_post_payload' using errcode = '22023';
  end;

  if v_title is null or length(v_title) not between 1 and 160
     or v_slug is null or length(v_slug) not between 3 and 100
     or v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
     or v_excerpt is null or length(v_excerpt) not between 1 and 300
     or v_status is null or v_status = 'trashed'
     or length(v_seo_title) > 70
     or length(v_seo_description) > 160
     or v_content_json is null
     or jsonb_typeof(v_content_json) <> 'object'
     or (v_content_json ->> 'type') is distinct from 'markdown'
     or jsonb_typeof(v_content_json -> 'markdown') is distinct from 'string'
     or length(v_content_json ->> 'markdown') not between 1 and 100000
     or length(v_content_text) > 100000 then
    raise exception 'invalid_post_payload' using errcode = '22023';
  end if;

  if jsonb_typeof(v_tag_names) <> 'array'
     or exists (
       select 1 from jsonb_array_elements(v_tag_names) as tag(value)
        where jsonb_typeof(tag.value) <> 'string'
     ) then
    raise exception 'invalid_tag_names' using errcode = '22023';
  end if;
  select count(*), count(distinct lower(trim(tag_name)))
    into v_requested_count, v_distinct_count
    from jsonb_array_elements_text(v_tag_names) as requested(tag_name);
  if v_requested_count > 50
     or v_requested_count <> v_distinct_count
     or exists (
       select 1 from jsonb_array_elements_text(v_tag_names) as requested(tag_name)
        where length(trim(tag_name)) not between 1 and 80
     ) then
    raise exception 'invalid_tag_names' using errcode = '22023';
  end if;

  if v_inline_was_supplied then
    v_inline_media_ids := p_payload -> 'inline_media_ids';
    if jsonb_typeof(v_inline_media_ids) <> 'array'
       or exists (
         select 1 from jsonb_array_elements(v_inline_media_ids) as media(value)
          where jsonb_typeof(media.value) <> 'string'
       ) then
      raise exception 'invalid_inline_media_ids' using errcode = '22023';
    end if;
    begin
      select count(*), count(distinct media_id)
        into v_requested_count, v_distinct_count
        from jsonb_array_elements_text(v_inline_media_ids) as requested(media_id);
      if v_requested_count > 200 or v_requested_count <> v_distinct_count then
        raise exception 'invalid_inline_media_ids' using errcode = '22023';
      end if;
      select count(*) into v_matching_count
        from public.media
       where id in (
         select media_id::uuid
           from jsonb_array_elements_text(v_inline_media_ids) as requested(media_id)
       );
    exception when invalid_text_representation then
      raise exception 'invalid_inline_media_ids' using errcode = '22023';
    end;
    if v_matching_count <> v_requested_count then
      raise exception 'unknown_inline_media' using errcode = '23503';
    end if;
  end if;

  if v_category_id is not null
     and not exists (select 1 from public.categories where id = v_category_id) then
    raise exception 'unknown_category' using errcode = '23503';
  end if;
  if v_cover_media_id is not null
     and not exists (select 1 from public.media where id = v_cover_media_id) then
    raise exception 'unknown_cover_media' using errcode = '23503';
  end if;

  if v_id is null then
    if p_expected_updated_at is not null then
      raise exception 'unexpected_content_version' using errcode = '22023';
    end if;
    insert into public.posts (
      title, slug, excerpt, content_json, content_text,
      category_id, cover_media_id, status, status_before_trash,
      published_at, seo_title, seo_description, created_by
    ) values (
      v_title, v_slug, v_excerpt, v_content_json, v_content_text,
      v_category_id, v_cover_media_id, v_status, null,
      case when v_status = 'published' then now() else null end,
      v_seo_title, v_seo_description, auth.uid()
    ) returning * into v_saved;
    v_id := v_saved.id;
  else
    select * into v_previous
      from public.posts
     where id = v_id
     for update;
    if not found then
      raise exception 'post_not_found' using errcode = 'P0002';
    end if;
    if v_previous.status = 'trashed' then
      raise exception 'trashed_content_must_be_restored' using errcode = '22023';
    end if;
    if p_expected_updated_at is null then
      raise exception 'content_version_required' using errcode = '22023';
    end if;
    if v_previous.updated_at <> p_expected_updated_at then
      raise exception 'content_version_conflict' using errcode = '40001';
    end if;

    update public.posts
       set title = v_title,
           slug = v_slug,
           excerpt = v_excerpt,
           content_json = v_content_json,
           content_text = v_content_text,
           category_id = v_category_id,
           cover_media_id = v_cover_media_id,
           status = v_status,
           status_before_trash = null,
           published_at = case
             when v_status = 'published' then coalesce(public.posts.published_at, now())
             else public.posts.published_at
           end,
           seo_title = v_seo_title,
           seo_description = v_seo_description
     where id = v_id
       and updated_at = p_expected_updated_at
     returning * into v_saved;
    if not found then
      raise exception 'content_version_conflict' using errcode = '40001';
    end if;
  end if;

  insert into public.tags (name, slug)
  select requested.name, public.content_tag_slug(requested.name)
    from (
      select distinct trim(tag_name) as name
        from jsonb_array_elements_text(v_tag_names) as tags(tag_name)
    ) as requested
  on conflict do nothing;

  delete from public.post_tags where post_id = v_id;
  insert into public.post_tags (post_id, tag_id)
  select v_id, tag.id
    from (
      select distinct trim(tag_name) as name
        from jsonb_array_elements_text(v_tag_names) as tags(tag_name)
    ) as requested
    join public.tags as tag on lower(trim(tag.name)) = lower(requested.name);

  if v_inline_was_supplied then
    delete from public.post_media where post_id = v_id;
    insert into public.post_media (post_id, media_id, role, sort_order)
    select v_id, requested.media_id::uuid, 'inline', requested.position - 1
      from jsonb_array_elements_text(v_inline_media_ids)
        with ordinality as requested(media_id, position)
     where requested.media_id::uuid is distinct from v_cover_media_id;
  end if;

  insert into public.audit_logs (actor_id, action, target_type, target_id, metadata)
  values (
    auth.uid(),
    case when v_previous.id is null then 'create' else 'update' end,
    'post',
    v_id,
    jsonb_strip_nulls(jsonb_build_object(
      'title', v_saved.title,
      'slug', v_saved.slug,
      'previousStatus', v_previous.status,
      'status', v_saved.status
    ))
  );

  return jsonb_build_object(
    'id', v_saved.id,
    'slug', v_saved.slug,
    'status', v_saved.status,
    'updated_at', v_saved.updated_at
  );
end;
$$;

create or replace function public.transition_content_status_atomic(
  p_content_type text,
  p_content_id uuid,
  p_expected_status text,
  p_transition text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_portfolio public.portfolio_items%rowtype;
  v_post public.posts%rowtype;
  v_next_status text;
  v_slug text;
begin
  if not public.is_admin() then
    raise exception 'administrator_access_required' using errcode = '42501';
  end if;
  if p_content_type is null or p_content_type not in ('portfolio', 'post')
     or p_expected_status is null
     or p_transition is null or p_transition not in ('publish', 'unpublish', 'trash', 'restore') then
    raise exception 'invalid_content_transition' using errcode = '22023';
  end if;

  if p_content_type = 'portfolio' then
    select * into v_portfolio
      from public.portfolio_items
     where id = p_content_id
     for update;
    if not found then
      raise exception 'content_not_found' using errcode = 'P0002';
    end if;
    if v_portfolio.status::text <> p_expected_status then
      raise exception 'content_status_conflict' using errcode = '40001';
    end if;

    v_next_status := case p_transition
      when 'publish' then case when v_portfolio.status in ('draft', 'hidden') then 'published' end
      when 'unpublish' then case when v_portfolio.status = 'published' then 'draft' end
      when 'trash' then case when v_portfolio.status <> 'trashed' then 'trashed' end
      when 'restore' then case when v_portfolio.status = 'trashed'
        then coalesce(nullif(v_portfolio.status_before_trash::text, 'trashed'), 'draft') end
    end;
    if v_next_status is null then
      raise exception 'invalid_content_transition' using errcode = '22023';
    end if;

    update public.portfolio_items
       set status = v_next_status::public.portfolio_status,
           status_before_trash = case
             when p_transition = 'trash' then v_portfolio.status
             when p_transition = 'restore' then null
             else public.portfolio_items.status_before_trash
           end
     where id = p_content_id and status = v_portfolio.status
     returning * into v_portfolio;
    if not found then
      raise exception 'content_status_conflict' using errcode = '40001';
    end if;
    v_slug := v_portfolio.slug;
  else
    select * into v_post
      from public.posts
     where id = p_content_id
     for update;
    if not found then
      raise exception 'content_not_found' using errcode = 'P0002';
    end if;
    if v_post.status::text <> p_expected_status then
      raise exception 'content_status_conflict' using errcode = '40001';
    end if;

    v_next_status := case p_transition
      when 'publish' then case when v_post.status in ('draft', 'private') then 'published' end
      when 'unpublish' then case when v_post.status = 'published' then 'draft' end
      when 'trash' then case when v_post.status <> 'trashed' then 'trashed' end
      when 'restore' then case when v_post.status = 'trashed'
        then coalesce(nullif(v_post.status_before_trash::text, 'trashed'), 'draft') end
    end;
    if v_next_status is null then
      raise exception 'invalid_content_transition' using errcode = '22023';
    end if;

    update public.posts
       set status = v_next_status::public.post_status,
           status_before_trash = case
             when p_transition = 'trash' then v_post.status
             when p_transition = 'restore' then null
             else public.posts.status_before_trash
           end,
           published_at = case
             when v_next_status = 'published' then coalesce(public.posts.published_at, now())
             else public.posts.published_at
           end
     where id = p_content_id and status = v_post.status
     returning * into v_post;
    if not found then
      raise exception 'content_status_conflict' using errcode = '40001';
    end if;
    v_slug := v_post.slug;
  end if;

  insert into public.audit_logs (actor_id, action, target_type, target_id, metadata)
  values (
    auth.uid(),
    p_transition,
    case when p_content_type = 'portfolio' then 'portfolio_item' else 'post' end,
    p_content_id,
    jsonb_build_object(
      'slug', v_slug,
      'previousStatus', p_expected_status,
      'status', v_next_status
    )
  );

  return jsonb_build_object(
    'id', p_content_id,
    'slug', v_slug,
    'previous_status', p_expected_status,
    'status', v_next_status
  );
end;
$$;

create or replace function public.reorder_portfolio_items_atomic(
  p_ordered_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_expected_count integer;
  v_updated_count integer;
begin
  if not public.is_admin() then
    raise exception 'administrator_access_required' using errcode = '42501';
  end if;
  if p_ordered_ids is null or cardinality(p_ordered_ids) > 500
     or array_position(p_ordered_ids, null) is not null
     or (select count(distinct id) from unnest(p_ordered_ids) as requested(id))
        <> cardinality(p_ordered_ids) then
    raise exception 'invalid_portfolio_order' using errcode = '22023';
  end if;

  -- Prevent inserts and status changes from creating a phantom/missing item
  -- between set validation and the single set-based update below.
  lock table public.portfolio_items in share row exclusive mode;

  if exists (
    select 1
      from unnest(p_ordered_ids) as requested(id)
      left join public.portfolio_items as item on item.id = requested.id
     where item.id is null or item.status = 'trashed'
  ) then
    raise exception 'invalid_portfolio_order' using errcode = '22023';
  end if;

  select count(*) into v_expected_count
    from public.portfolio_items
   where status <> 'trashed';
  if v_expected_count <> cardinality(p_ordered_ids)
     or exists (
       select 1 from public.portfolio_items as item
        where item.status <> 'trashed'
          and not (item.id = any(p_ordered_ids))
     ) then
    raise exception 'portfolio_order_conflict' using errcode = '40001';
  end if;

  with requested as (
    select id, position - 1 as sort_order
      from unnest(p_ordered_ids) with ordinality as input(id, position)
  )
  update public.portfolio_items as item
     set sort_order = requested.sort_order
    from requested
   where item.id = requested.id;
  get diagnostics v_updated_count = row_count;

  if v_updated_count <> v_expected_count then
    raise exception 'portfolio_order_conflict' using errcode = '40001';
  end if;

  insert into public.audit_logs (actor_id, action, target_type, target_id, metadata)
  values (
    auth.uid(),
    'reorder',
    'portfolio_item',
    null,
    jsonb_build_object('orderedIds', to_jsonb(p_ordered_ids), 'count', v_updated_count)
  );

  return jsonb_build_object('updated_count', v_updated_count);
end;
$$;

revoke all on function public.save_portfolio_atomic(jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public.save_post_atomic(jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public.transition_content_status_atomic(text, uuid, text, text) from public, anon, authenticated;
revoke all on function public.reorder_portfolio_items_atomic(uuid[]) from public, anon, authenticated;

grant execute on function public.save_portfolio_atomic(jsonb, timestamptz) to authenticated;
grant execute on function public.save_post_atomic(jsonb, timestamptz) to authenticated;
grant execute on function public.transition_content_status_atomic(text, uuid, text, text) to authenticated;
grant execute on function public.reorder_portfolio_items_atomic(uuid[]) to authenticated;

comment on function public.save_portfolio_atomic(jsonb, timestamptz) is
  'Atomically saves a portfolio item, tags, cover/inline media, and audit entry.';
comment on function public.save_post_atomic(jsonb, timestamptz) is
  'Atomically saves a post, tags, cover/inline media, and audit entry.';
comment on function public.transition_content_status_atomic(text, uuid, text, text) is
  'Applies an allowed conditional content transition and audit entry atomically.';
comment on function public.reorder_portfolio_items_atomic(uuid[]) is
  'Validates the complete non-trashed portfolio set and reorders it atomically.';
