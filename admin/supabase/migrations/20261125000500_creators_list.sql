-- Back-office upgrade, Creators list (Creators list agent): the rows and the facet counts of the list, in the database.
--   * creator_contacted_at(): the last contact of a creator (the same value creator_summaries shows).
--   * like_pattern(), contacted_matches(): small helpers for the search box and the "last contacted" filter.
--   * creators_match_ids(filters): ids of the creators that match every filter (used by the list and the CSV export).
--   * creators_list(filters, sort, page): one page of rows plus the total. It never returns the email address.
--   * creators_facets(filters): how many creators each option would give "with the other filters as they are".
--   * creators_export(filters): the rows of the CSV export (owner only, checked by the API route; RLS still applies).
--   * creators_add_to_list(list, ids), creators_add_tag(tag, ids): bulk actions on up to 200 creators.
-- The four big functions set jit = off: the planner overestimates their cost (many OR-ed conditions) and would spend
-- 200 ms compiling code for a 5 ms query.
-- All functions are SECURITY INVOKER with a fixed search_path, so row level security applies to every table they read.
-- They take typed arguments, never text that is run as SQL. Granted to authenticated only; anon has no access.
--
-- SAFE ON THE LIVE DATABASE: only new functions. No table, column or row changes. Every statement can run twice.
-- ROLL BACK (manual): drop function public.creators_match_ids, creators_list, creators_facets, creators_export,
--   creators_add_to_list, creators_add_tag, creator_contacted_at, like_pattern, contacted_matches (with their argument lists).
set search_path = public, extensions;

-- ---------------------------------------------------------------- helpers
create or replace function public.like_pattern(p_text text) returns text
-- Pure text function that touches no table, so it needs no search_path (and can then be inlined by the planner).
language sql immutable as $$
  select case when nullif(btrim(p_text), '') is null then null
              else '%' || replace(replace(replace(left(btrim(p_text), 100), '\', '\\'), '%', '\%'), '_', '\_') || '%' end
$$;

-- Same rule as creator_summaries.last_contacted_at: the later of the stored date and the last real (not test) send.
create or replace function public.creator_contacted_at(p_id uuid, p_stored timestamptz) returns timestamptz
language sql stable security invoker set search_path = public, pg_temp as $$
  select greatest(p_stored, (select max(m.sent_at) from public.emails m
                              where m.creator_id = p_id and m.status in ('sent', 'replied') and not m.is_test))
$$;

create or replace function public.contacted_matches(p_bucket text, p_at timestamptz) returns boolean
language sql stable set search_path = public, pg_temp as $$
  select case p_bucket
           when 'never'  then p_at is null
           when 'in30'   then p_at >= now() - interval '30 days'
           when 'over30' then p_at < now() - interval '30 days'
           when 'over90' then p_at < now() - interval '90 days'
           else true end
$$;

-- ---------------------------------------------------------------- ids of the matching creators
-- Index use (with enough rows the planner picks these; with a few hundred it may prefer a plain scan, which is as fast):
--   q           creators_full_name_trgm, creators_email_trgm, creators_channel_name_trgm (trigram, ILIKE)
--   subs        creators_subscribers_idx            views     creators_avg_views_idx
--   sponsored   creators_has_spons_idx, creators_has_detected_idx (partial, count > 0)
--   recent      creators_last_spons_idx, creators_last_detected_idx
--   by          sponsorships_brand_idx (brand_id, sponsored_on) and sponsorships_creator_idx
--   niche       creators_niche_slug_idx     lang  creators_language_idx     country  creators_country_idx
--   status      creators_status_idx         contacted  emails_creator_idx (the last send) and creators_last_contacted_idx
--   tag         creator_tags primary key and creator_tags_tag_idx          list  list_items_creator_idx and list_items_creator_once
create or replace function public.creators_match_ids(
  p_q text default null, p_subs_min bigint default null, p_subs_max bigint default null,
  p_sponsored text default null, p_detected boolean default false, p_recent integer default null,
  p_by uuid[] default null, p_niche text[] default null, p_status text[] default null,
  p_contacted text default null, p_views integer default null, p_lang text[] default null,
  p_country text[] default null, p_email boolean default false, p_tag uuid[] default null, p_list uuid[] default null
) returns setof uuid
language sql stable security invoker set search_path = public, extensions, pg_temp set jit = off as $$
  -- a: values derived from the arguments, worked out once (not once per row)
  with a as (select public.like_pattern(p_q) as pat, p_status::public.creator_status[] as st)
  select c.id
    from public.creators c cross join a
   where
     (a.pat is null or c.full_name ilike a.pat or c.email::text ilike a.pat or c.channel_name ilike a.pat)
     and ((p_subs_min is null or c.subscribers >= p_subs_min) and (p_subs_max is null or c.subscribers <= p_subs_max))
     and (p_sponsored is null or p_sponsored not in ('yes', 'no') or ((c.sponsorship_count > 0 or (coalesce(p_detected, false) and c.detected_sponsorship_count > 0)) = (p_sponsored = 'yes')))
     and (p_recent is null or c.last_sponsorship_at >= current_date - p_recent or (coalesce(p_detected, false) and c.last_detected_sponsorship_at >= current_date - p_recent))
     and (coalesce(cardinality(p_by), 0) = 0 or exists (select 1 from public.sponsorships s where s.creator_id = c.id and s.brand_id = any (p_by) and not s.rejected and (s.source_label = 'confirmed' or coalesce(p_detected, false))))
     and (coalesce(cardinality(p_niche), 0) = 0 or c.niche_slug = any (p_niche))
     and (coalesce(cardinality(p_status), 0) = 0 or c.status = any (a.st))
     and (p_contacted is null or public.contacted_matches(p_contacted, public.creator_contacted_at(c.id, c.last_contacted_at)))
     and (p_views is null or c.avg_views >= p_views)
     and (coalesce(cardinality(p_lang), 0) = 0 or c.language = any (p_lang))
     and (coalesce(cardinality(p_country), 0) = 0 or c.country = any (p_country))
     and (not coalesce(p_email, false) or c.email <> '')
     and (coalesce(cardinality(p_tag), 0) = 0 or exists (select 1 from public.creator_tags t where t.creator_id = c.id and t.tag_id = any (p_tag)))
     and (coalesce(cardinality(p_list), 0) = 0 or exists (select 1 from public.list_items li where li.creator_id = c.id and li.list_id = any (p_list)))
$$;

-- ---------------------------------------------------------------- one page of rows
create or replace function public.creators_list(
  p_q text default null, p_subs_min bigint default null, p_subs_max bigint default null,
  p_sponsored text default null, p_detected boolean default false, p_recent integer default null,
  p_by uuid[] default null, p_niche text[] default null, p_status text[] default null,
  p_contacted text default null, p_views integer default null, p_lang text[] default null,
  p_country text[] default null, p_email boolean default false, p_tag uuid[] default null, p_list uuid[] default null,
  p_sort text default 'subscribers', p_dir text default 'desc', p_limit integer default 25, p_offset integer default 0
) returns table (
  id uuid, full_name text, channel_name text, niche_slug text, country text, language text, subscribers integer,
  subscribers_hidden boolean, avg_views integer, status text, last_contacted_at timestamptz, created_at timestamptz,
  sponsorship_count integer, last_sponsorship_at date, detected_sponsorship_count integer, last_detected_sponsorship_at date,
  has_email boolean, total bigint
)
language sql stable security invoker set search_path = public, extensions, pg_temp set jit = off as $$
  -- The last contact needs a look at the emails: it is worked out for the rows of the page only (for all rows only when sorting by it).
  with m as (select x as id from public.creators_match_ids(p_q, p_subs_min, p_subs_max, p_sponsored, p_detected, p_recent, p_by, p_niche, p_status, p_contacted, p_views, p_lang, p_country, p_email, p_tag, p_list) x),
  r as (
    select c.id, c.full_name, c.channel_name, c.niche_slug, c.country, c.language, c.subscribers, c.subscribers_hidden,
           c.avg_views, c.status::text as status, c.last_contacted_at as stored_contact,
           case when p_sort = 'last_contacted' then public.creator_contacted_at(c.id, c.last_contacted_at) end as sort_contact,
           c.created_at, c.sponsorship_count, c.last_sponsorship_at, c.detected_sponsorship_count, c.last_detected_sponsorship_at,
           (c.email <> '') as has_email,
           case when coalesce(p_detected, false) then greatest(c.last_sponsorship_at, c.last_detected_sponsorship_at)
                else c.last_sponsorship_at end as sp_at
      from public.creators c join m on m.id = c.id
  ),
  pg as (
    select r.*, count(*) over () as total
      from r
     order by
     case when p_sort = 'subscribers' and p_dir = 'asc'  then r.subscribers end asc  nulls last,
     case when p_sort = 'subscribers' and p_dir <> 'asc' then r.subscribers end desc nulls last,
     case when p_sort = 'sponsored' and p_dir = 'asc'  then r.sp_at end asc  nulls last,
     case when p_sort = 'sponsored' and p_dir <> 'asc' then r.sp_at end desc nulls last,
     case when p_sort = 'last_contacted' and p_dir = 'asc'  then r.sort_contact end asc  nulls last,
     case when p_sort = 'last_contacted' and p_dir <> 'asc' then r.sort_contact end desc nulls last,
     case when p_sort = 'added' and p_dir = 'asc'  then r.created_at end asc  nulls last,
     case when p_sort = 'added' and p_dir <> 'asc' then r.created_at end desc nulls last,
     case when p_sort = 'name' and p_dir <> 'desc' then r.full_name end asc,
     case when p_sort = 'name' and p_dir = 'desc' then r.full_name end desc,
     -- "match" (best match for a sponsor) is added by the Matching agent; until then it falls back to subscribers
     case when p_sort not in ('sponsored', 'last_contacted', 'added', 'name') and p_sort <> 'subscribers' then r.subscribers end desc nulls last,
     r.full_name asc, r.id asc
     limit greatest(1, least(coalesce(p_limit, 25), 100)) offset greatest(0, coalesce(p_offset, 0))
  )
  select pg.id, pg.full_name, pg.channel_name, pg.niche_slug, pg.country, pg.language, pg.subscribers, pg.subscribers_hidden,
         pg.avg_views, pg.status, public.creator_contacted_at(pg.id, pg.stored_contact) as last_contacted_at, pg.created_at,
         pg.sponsorship_count, pg.last_sponsorship_at, pg.detected_sponsorship_count, pg.last_detected_sponsorship_at,
         pg.has_email, pg.total
    from pg
   order by
     case when p_sort = 'subscribers' and p_dir = 'asc'  then pg.subscribers end asc  nulls last,
     case when p_sort = 'subscribers' and p_dir <> 'asc' then pg.subscribers end desc nulls last,
     case when p_sort = 'sponsored' and p_dir = 'asc'  then pg.sp_at end asc  nulls last,
     case when p_sort = 'sponsored' and p_dir <> 'asc' then pg.sp_at end desc nulls last,
     case when p_sort = 'last_contacted' and p_dir = 'asc'  then pg.sort_contact end asc  nulls last,
     case when p_sort = 'last_contacted' and p_dir <> 'asc' then pg.sort_contact end desc nulls last,
     case when p_sort = 'added' and p_dir = 'asc'  then pg.created_at end asc  nulls last,
     case when p_sort = 'added' and p_dir <> 'asc' then pg.created_at end desc nulls last,
     case when p_sort = 'name' and p_dir <> 'desc' then pg.full_name end asc,
     case when p_sort = 'name' and p_dir = 'desc' then pg.full_name end desc,
     -- "match" (best match for a sponsor) is added by the Matching agent; until then it falls back to subscribers
     case when p_sort not in ('sponsored', 'last_contacted', 'added', 'name') and p_sort <> 'subscribers' then pg.subscribers end desc nulls last,
     pg.full_name asc, pg.id asc
$$;

-- ---------------------------------------------------------------- facet counts
-- One pass over the creators. Each creator gets the list of filters it FAILS; an option of filter K counts the creators
-- that fail nothing, or fail only K. That is "the result with the other filters as they are".
-- Rows: facet '_total' (matches everything), '_all' (every creator), then one row per option: niche, status, sponsored
-- (yes, no), recent (30, 90, 180), by (sponsor id), contacted, views, lang, country, email (1), tag (tag id), list (list id).
-- Options that no creator has still come back with 0 (every niche, every status, every tag and list, every sponsor with a record).
create or replace function public.creators_facets(
  p_q text default null, p_subs_min bigint default null, p_subs_max bigint default null,
  p_sponsored text default null, p_detected boolean default false, p_recent integer default null,
  p_by uuid[] default null, p_niche text[] default null, p_status text[] default null,
  p_contacted text default null, p_views integer default null, p_lang text[] default null,
  p_country text[] default null, p_email boolean default false, p_tag uuid[] default null, p_list uuid[] default null
) returns table (facet text, value text, n bigint)
language sql stable security invoker set search_path = public, extensions, pg_temp set jit = off as $$
  with a as (select public.like_pattern(p_q) as pat, p_status::public.creator_status[] as st),
  b as (
    select c.id, c.niche_slug, c.status::text as status, c.language, c.country, c.avg_views, (c.email <> '') as has_email,
           c.sponsorship_count, c.detected_sponsorship_count, c.last_sponsorship_at, c.last_detected_sponsorship_at, x.lc,
           array_remove(array[
        case when not coalesce((a.pat is null or c.full_name ilike a.pat or c.email::text ilike a.pat or c.channel_name ilike a.pat), false) then 'q' end,
        case when not coalesce(((p_subs_min is null or c.subscribers >= p_subs_min) and (p_subs_max is null or c.subscribers <= p_subs_max)), false) then 'subs' end,
        case when not coalesce((p_sponsored is null or p_sponsored not in ('yes', 'no') or ((c.sponsorship_count > 0 or (coalesce(p_detected, false) and c.detected_sponsorship_count > 0)) = (p_sponsored = 'yes'))), false) then 'sponsored' end,
        case when not coalesce((p_recent is null or c.last_sponsorship_at >= current_date - p_recent or (coalesce(p_detected, false) and c.last_detected_sponsorship_at >= current_date - p_recent)), false) then 'recent' end,
        case when not coalesce((coalesce(cardinality(p_by), 0) = 0 or exists (select 1 from public.sponsorships s where s.creator_id = c.id and s.brand_id = any (p_by) and not s.rejected and (s.source_label = 'confirmed' or coalesce(p_detected, false)))), false) then 'by' end,
        case when not coalesce((coalesce(cardinality(p_niche), 0) = 0 or c.niche_slug = any (p_niche)), false) then 'niche' end,
        case when not coalesce((coalesce(cardinality(p_status), 0) = 0 or c.status = any (a.st)), false) then 'status' end,
        case when not coalesce((p_contacted is null or public.contacted_matches(p_contacted, lc)), false) then 'contacted' end,
        case when not coalesce((p_views is null or c.avg_views >= p_views), false) then 'views' end,
        case when not coalesce((coalesce(cardinality(p_lang), 0) = 0 or c.language = any (p_lang)), false) then 'lang' end,
        case when not coalesce((coalesce(cardinality(p_country), 0) = 0 or c.country = any (p_country)), false) then 'country' end,
        case when not coalesce((not coalesce(p_email, false) or c.email <> ''), false) then 'email' end,
        case when not coalesce((coalesce(cardinality(p_tag), 0) = 0 or exists (select 1 from public.creator_tags t where t.creator_id = c.id and t.tag_id = any (p_tag))), false) then 'tag' end,
        case when not coalesce((coalesce(cardinality(p_list), 0) = 0 or exists (select 1 from public.list_items li where li.creator_id = c.id and li.list_id = any (p_list))), false) then 'list' end
           ], null) as failed
      from public.creators c cross join a
      left join (select m.creator_id, max(m.sent_at) as last_sent from public.emails m
                  where m.status in ('sent', 'replied') and not m.is_test group by m.creator_id) e on e.creator_id = c.id
     cross join lateral (select greatest(c.last_contacted_at, e.last_sent) as lc) x
  )
  select '_total', 'all', count(*) filter (where b.failed = '{}') from b
  union all select '_all', 'all', count(*) from b
  union all
  select 'niche', n.slug, count(b.id)
    from public.niches n left join b on b.niche_slug = n.slug and b.failed <@ array['niche'] group by n.slug
  union all
  select 'status', s.v, count(b.id)
    from (select unnest(enum_range(null::public.creator_status))::text as v) s
    left join b on b.status = s.v and b.failed <@ array['status'] group by s.v
  union all
  select 'sponsored', o.v, count(b.id)
    from (values ('yes'), ('no')) o(v)
    left join b on b.failed <@ array['sponsored']
               and ((b.sponsorship_count > 0 or (coalesce(p_detected, false) and b.detected_sponsorship_count > 0)) = (o.v = 'yes'))
   group by o.v
  union all
  select 'recent', o.v::text, count(b.id)
    from (values (30), (90), (180)) o(v)
    left join b on b.failed <@ array['recent']
               and (b.last_sponsorship_at >= current_date - o.v or (coalesce(p_detected, false) and b.last_detected_sponsorship_at >= current_date - o.v))
   group by o.v
  union all
  select 'by', s.brand_id::text,
         count(distinct s.creator_id) filter (where b.failed <@ array['by'] and (s.source_label = 'confirmed' or coalesce(p_detected, false)))
    from public.sponsorships s join b on b.id = s.creator_id
   where s.brand_id is not null and not s.rejected
   group by s.brand_id
  union all
  select 'contacted', o.v, count(b.id)
    from (values ('never'), ('in30'), ('over30'), ('over90')) o(v)
    left join b on b.failed <@ array['contacted'] and public.contacted_matches(o.v, b.lc)
   group by o.v
  union all
  select 'views', o.v::text, count(b.id)
    from (values (1000), (5000), (10000), (25000)) o(v)
    left join b on b.failed <@ array['views'] and b.avg_views >= o.v
   group by o.v
  union all
  select 'lang', b.language, count(*) filter (where b.failed <@ array['lang']) from b where b.language is not null group by b.language
  union all
  select 'country', b.country, count(*) filter (where b.failed <@ array['country']) from b where b.country is not null group by b.country
  union all
  select 'email', '1', count(*) filter (where b.failed <@ array['email'] and b.has_email) from b
  union all
  select 'tag', t.id::text, count(b.id)
    from public.tags t
    left join public.creator_tags ct on ct.tag_id = t.id
    left join b on b.id = ct.creator_id and b.failed <@ array['tag']
   where t.scope = 'creator' group by t.id
  union all
  select 'list', l.id::text, count(b.id)
    from public.lists l
    left join public.list_items li on li.list_id = l.id and li.creator_id is not null
    left join b on b.id = li.creator_id and b.failed <@ array['list']
   where l.kind = 'creators' group by l.id
$$;

-- ---------------------------------------------------------------- rows of the CSV export
-- Contains the email address and phone: only the export route (owner only, audit line first) calls it.
create or replace function public.creators_export(
  p_q text default null, p_subs_min bigint default null, p_subs_max bigint default null,
  p_sponsored text default null, p_detected boolean default false, p_recent integer default null,
  p_by uuid[] default null, p_niche text[] default null, p_status text[] default null,
  p_contacted text default null, p_views integer default null, p_lang text[] default null,
  p_country text[] default null, p_email boolean default false, p_tag uuid[] default null, p_list uuid[] default null,
  p_limit integer default 1000, p_offset integer default 0
) returns table (
  full_name text, email text, phone text, channel_url text, niche text, niche_slug text, country text, language text,
  subscribers integer, avg_views integer, status text, notes text
)
language sql stable security invoker set search_path = public, extensions, pg_temp set jit = off as $$
  select c.full_name, c.email::text, c.phone, c.channel_url, c.niche, c.niche_slug, c.country, c.language,
         c.subscribers, c.avg_views, c.status::text, c.notes
    from public.creators c
   where c.id in (select public.creators_match_ids(p_q, p_subs_min, p_subs_max, p_sponsored, p_detected, p_recent, p_by, p_niche, p_status, p_contacted, p_views, p_lang, p_country, p_email, p_tag, p_list))
   order by c.full_name, c.id
   limit greatest(1, least(coalesce(p_limit, 1000), 1000)) offset greatest(0, coalesce(p_offset, 0))
$$;

-- ---------------------------------------------------------------- bulk actions (up to 200 creators)
create or replace function public.creators_add_to_list(p_list uuid, p_ids uuid[]) returns integer
language plpgsql security invoker set search_path = public, extensions, pg_temp as $$
declare v_n integer;
begin
  if coalesce(cardinality(p_ids), 0) = 0 or cardinality(p_ids) > 200 then
    raise exception 'between 1 and 200 creators' using errcode = 'invalid_parameter_value';
  end if;
  insert into public.list_items (list_id, creator_id)
    select p_list, c.id from public.creators c where c.id = any (p_ids)
    on conflict (list_id, creator_id) where creator_id is not null do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

create or replace function public.creators_add_tag(p_tag uuid, p_ids uuid[]) returns integer
language plpgsql security invoker set search_path = public, extensions, pg_temp as $$
declare v_n integer;
begin
  if coalesce(cardinality(p_ids), 0) = 0 or cardinality(p_ids) > 200 then
    raise exception 'between 1 and 200 creators' using errcode = 'invalid_parameter_value';
  end if;
  insert into public.creator_tags (creator_id, tag_id)
    select c.id, p_tag from public.creators c where c.id = any (p_ids)
    on conflict (creator_id, tag_id) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- ---------------------------------------------------------------- grants: authenticated only, never anon
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public'
              and p.proname in ('like_pattern', 'creator_contacted_at', 'contacted_matches', 'creators_match_ids', 'creators_list',
                                'creators_facets', 'creators_export', 'creators_add_to_list', 'creators_add_tag')
  loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
