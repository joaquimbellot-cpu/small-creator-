-- Sponsors list (Sponsors agent): the filtered, sorted list of sponsors (the brands table), the count beside every filter
-- option, and the export rows, all worked out in the database so the page never builds SQL from text.
--   * sponsor_args(jsonb): reads the filter object (already validated by the app) into typed values; anything
--     odd is ignored, never cast blindly.
--   * sponsor_rows(jsonb, skip): the sponsors that pass every filter (except the one named in skip).
--   * sponsors_list, sponsors_count, sponsor_facets (counts per option), sponsors_export.
--   All are SECURITY INVOKER (the caller's RLS applies), have a fixed search_path and are granted to
--   authenticated only (never anon).
-- "Currently active" = a sponsorship in the last 90 days. Counts use confirmed records only (the cached columns of
-- brands) unless the filter object says detected = true; then confirmed and detected records count, not rejected ones.
-- SAFE ON THE LIVE DATABASE: only new functions; no table, column or row changes. Every statement can run twice.
-- ROLL BACK (manual): drop function sponsors_export, sponsor_facets, sponsors_count, sponsors_list, sponsor_rows,
--   sponsor_args, sponsor_uuid_array, sponsor_text_array (all in schema public).
set search_path = public, extensions;

-- ---------------------------------------------------------------- argument helpers
create or replace function public.sponsor_text_array(j jsonb) returns text[]
language sql immutable security invoker set search_path = public, extensions as $$
  select nullif(case when jsonb_typeof(j) = 'array' and jsonb_array_length(j) between 1 and 100
              then array(select left(x, 200) from jsonb_array_elements_text(j) x where x <> '') end, '{}')
$$;

create or replace function public.sponsor_uuid_array(j jsonb) returns uuid[]
language sql immutable security invoker set search_path = public, extensions as $$
  select nullif(case when jsonb_typeof(j) = 'array' and jsonb_array_length(j) between 1 and 100
              then array(select x::uuid from jsonb_array_elements_text(j) x
                          where x ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') end, '{}')
$$;

create or replace function public.sponsor_args(p jsonb)
returns table (q text, industry text[], niches text[], t_lo bigint, t_hi bigint, b_lo bigint, b_hi bigint,
               active text, detected boolean, cnt integer, last_days integer,
               rel text[], size text[], country text[], contact boolean, tag uuid[])
language sql immutable security invoker set search_path = public, extensions as $$
  select nullif(btrim(left(p ->> 'q', 100)), ''),
         public.sponsor_text_array(p -> 'industry'),
         public.sponsor_text_array(p -> 'niches'),
         case when p ->> 'target_min' ~ '^[0-9]{1,10}$' then (p ->> 'target_min')::bigint end,
         case when p ->> 'target_max' ~ '^[0-9]{1,10}$' then (p ->> 'target_max')::bigint end,
         -- budgets arrive in dollars; the table stores cents
         case when p ->> 'budget_min' ~ '^[0-9]{1,10}$' then (p ->> 'budget_min')::bigint * 100 end,
         case when p ->> 'budget_max' ~ '^[0-9]{1,10}$' then (p ->> 'budget_max')::bigint * 100 end,
         case when p ->> 'active' in ('yes', 'no') then p ->> 'active' end,
         coalesce(p ->> 'detected' = 'true', false),
         case when p ->> 'count' ~ '^[0-9]{1,4}$' then (p ->> 'count')::integer end,
         case when p ->> 'last' ~ '^[0-9]{1,4}$' then (p ->> 'last')::integer end,
         public.sponsor_text_array(p -> 'rel'),
         public.sponsor_text_array(p -> 'size'),
         public.sponsor_text_array(p -> 'country'),
         coalesce(p ->> 'contact' = 'true', false),
         public.sponsor_uuid_array(p -> 'tag')
$$;

-- ---------------------------------------------------------------- the rows that pass the filters
create or replace function public.sponsor_rows(p jsonb, p_skip text default null)
returns table (
  id uuid, name text, website text, industry text, country text, company_size text, relationship text,
  target_niches text[], target_min_subs integer, target_max_subs integer, budget_min_cents bigint, budget_max_cents bigint,
  last_contacted_at timestamptz, sponsorship_count integer, detected_sponsorship_count integer,
  last_sponsorship_at date, last_detected_sponsorship_at date, contact_count integer, deal_count integer,
  tag_ids uuid[], tag_names text[], eff_count integer, eff_last date)
language sql stable security invoker set search_path = public, extensions as $$
  with a as (select s.*, coalesce(p_skip, '') as skip from public.sponsor_args(p) s)
  select b.id, b.name::text, b.website, b.industry, b.country, b.company_size, b.relationship,
         coalesce(b.target_niches, '{}'), b.target_min_subs, b.target_max_subs, b.budget_min_cents, b.budget_max_cents,
         b.last_contacted_at, b.sponsorship_count, b.detected_sponsorship_count,
         b.last_sponsorship_at, b.last_detected_sponsorship_at, b.contact_count, b.deal_count,
         coalesce(tg.ids, '{}'), coalesce(tg.names, '{}'), e.eff_count, e.eff_last
    from public.brand_summaries b
   cross join a
   cross join lateral (select array_agg(t.id order by t.name) as ids, array_agg(t.name::text order by t.name) as names
                         from public.brand_tags bt join public.tags t on t.id = bt.tag_id where bt.brand_id = b.id) tg
   cross join lateral (
     select case when a.detected then coalesce(x.n, 0)::integer else b.sponsorship_count end as eff_count,
            case when a.detected then x.last_on else b.last_sponsorship_at end as eff_last
       from (select count(distinct s.creator_id) as n, max(s.sponsored_on) as last_on
               from public.sponsorships s where a.detected and s.brand_id = b.id and not s.rejected) x) e
   where (a.skip = 'q' or a.q is null
          or b.name::text ilike '%' || replace(replace(replace(a.q, '\', '\\'), '%', '\%'), '_', '\_') || '%'
          or b.industry   ilike '%' || replace(replace(replace(a.q, '\', '\\'), '%', '\%'), '_', '\_') || '%'
          or b.website    ilike '%' || replace(replace(replace(a.q, '\', '\\'), '%', '\%'), '_', '\_') || '%')
     and (a.skip = 'industry' or a.industry is null or b.industry = any (a.industry))
     and (a.skip = 'niches' or a.niches is null or coalesce(b.target_niches, '{}') && a.niches)
     -- a range matches when it overlaps the wanted one; a missing end is open; a sponsor with no range never matches
     and (a.skip = 'target' or (a.t_lo is null and a.t_hi is null)
          or ((b.target_min_subs is not null or b.target_max_subs is not null)
              and coalesce(b.target_max_subs, 2147483647) >= coalesce(a.t_lo, 0)
              and coalesce(b.target_min_subs, 0) <= coalesce(a.t_hi, 9999999999)))
     and (a.skip = 'budget' or (a.b_lo is null and a.b_hi is null)
          or ((b.budget_min_cents is not null or b.budget_max_cents is not null)
              and coalesce(b.budget_max_cents, 9223372036854775807) >= coalesce(a.b_lo, 0)
              and coalesce(b.budget_min_cents, 0) <= coalesce(a.b_hi, 9223372036854775807)))
     and (a.skip = 'active' or a.active is null
          or ((e.eff_last >= current_date - 90) is true) = (a.active = 'yes'))
     and (a.skip = 'count' or a.cnt is null or e.eff_count >= a.cnt)
     and (a.skip = 'last' or a.last_days is null or e.eff_last >= current_date - a.last_days)
     and (a.skip = 'rel' or a.rel is null or b.relationship = any (a.rel))
     and (a.skip = 'size' or a.size is null or b.company_size = any (a.size))
     and (a.skip = 'country' or a.country is null or b.country = any (a.country))
     and (a.skip = 'contact' or not a.contact or b.contact_count > 0)
     and (a.skip = 'tag' or a.tag is null or coalesce(tg.ids, '{}') && a.tag)
$$;

create or replace function public.sponsors_count(p jsonb) returns bigint
language sql stable security invoker set search_path = public, extensions as $$
  select count(*) from public.sponsor_rows(p, null)
$$;

-- One page of sponsors. p_sort: name | count | last | budget | match. p_dir: asc | desc (default: name asc, others desc).
-- p_for is the creator for "Best match" (sort = match). The Matching agent replaces this function with a scoring
-- version of the same signature; until then match sorts by name.
create or replace function public.sponsors_list(p jsonb, p_sort text default 'name', p_dir text default null,
                                                p_for uuid default null, p_limit integer default 25, p_offset integer default 0)
returns table (
  id uuid, name text, website text, industry text, country text, company_size text, relationship text,
  target_niches text[], target_min_subs integer, target_max_subs integer, budget_min_cents bigint, budget_max_cents bigint,
  last_contacted_at timestamptz, sponsorship_count integer, detected_sponsorship_count integer,
  last_sponsorship_at date, last_detected_sponsorship_at date, contact_count integer, deal_count integer,
  tag_ids uuid[], tag_names text[], eff_count integer, eff_last date, total bigint)
language sql stable security invoker set search_path = public, extensions as $$
  with o as (
    select case when p_sort in ('name', 'count', 'last', 'budget', 'match') then p_sort else 'name' end as s,
           case when p_dir in ('asc', 'desc') then p_dir
                when p_sort in ('count', 'last', 'budget') then 'desc' else 'asc' end as d)
  select r.*, count(*) over () as total
    from public.sponsor_rows(p, null) r cross join o
   order by
     case when o.s = 'count'  and o.d = 'desc' then r.eff_count end desc nulls last,
     case when o.s = 'count'  and o.d = 'asc'  then r.eff_count end asc nulls last,
     case when o.s = 'last'   and o.d = 'desc' then r.eff_last end desc nulls last,
     case when o.s = 'last'   and o.d = 'asc'  then r.eff_last end asc nulls last,
     case when o.s = 'budget' and o.d = 'desc' then coalesce(r.budget_max_cents, r.budget_min_cents) end desc nulls last,
     case when o.s = 'budget' and o.d = 'asc'  then coalesce(r.budget_max_cents, r.budget_min_cents) end asc nulls last,
     case when o.s in ('name', 'match') and o.d = 'desc' then r.name end desc,
     r.name asc, r.id
   limit greatest(least(coalesce(p_limit, 25), 1000), 0)
  offset greatest(coalesce(p_offset, 0), 0)
$$;

-- ---------------------------------------------------------------- counts beside every option
-- One row per (facet, option value): how many sponsors the option would give with every OTHER filter as it is now.
-- Options that exist in the data but give 0 are returned too (the page dims them). Values: industry and country as
-- stored, niches / rel / size as the slug, tag as the tag id, target and budget as the band "min-max" (dollars for
-- budget), active yes|no, count 1|3|5, last 30|90|180, contact 1.
create or replace function public.sponsor_facets(p jsonb)
returns table (facet text, value text, n bigint)
language sql stable security invoker set search_path = public, extensions as $$
  select 'industry', u.v, count(r.id)
    from (select distinct x.industry as v from public.brands x where x.industry is not null) u
    left join public.sponsor_rows(p, 'industry') r on r.industry = u.v group by u.v
  union all
  select 'niches', nn.slug, count(r.id)
    from public.niches nn left join public.sponsor_rows(p, 'niches') r on nn.slug = any (r.target_niches) group by nn.slug
  union all
  select 'target', band.v, count(r.id)
    from (values ('1000-10000', 1000::bigint, 10000::bigint), ('10000-50000', 10000, 50000),
                 ('50000-100000', 50000, 100000), ('100000-', 100000, null)) band (v, lo, hi)
    left join public.sponsor_rows(p, 'target') r
      on (r.target_min_subs is not null or r.target_max_subs is not null)
     and coalesce(r.target_max_subs, 2147483647) >= band.lo
     and (band.hi is null or coalesce(r.target_min_subs, 0) <= band.hi)
   group by band.v
  union all
  select 'budget', band.v, count(r.id)
    from (values ('0-250', 0::bigint, 250::bigint), ('250-1000', 250, 1000), ('1000-5000', 1000, 5000), ('5000-', 5000, null)) band (v, lo, hi)
    left join public.sponsor_rows(p, 'budget') r
      on (r.budget_min_cents is not null or r.budget_max_cents is not null)
     and coalesce(r.budget_max_cents, 9223372036854775807) >= band.lo * 100
     and (band.hi is null or coalesce(r.budget_min_cents, 0) <= band.hi * 100)
   group by band.v
  union all
  select 'active', v.v, count(r.id)
    from (values ('yes'), ('no')) v (v)
    left join public.sponsor_rows(p, 'active') r on ((r.eff_last >= current_date - 90) is true) = (v.v = 'yes') group by v.v
  union all
  select 'count', v.v, count(r.id)
    from (values ('1'), ('3'), ('5')) v (v)
    left join public.sponsor_rows(p, 'count') r on r.eff_count >= v.v::integer group by v.v
  union all
  select 'last', v.v, count(r.id)
    from (values ('30'), ('90'), ('180')) v (v)
    left join public.sponsor_rows(p, 'last') r on r.eff_last >= current_date - v.v::integer group by v.v
  union all
  select 'rel', v.v, count(r.id)
    from (values ('prospect'), ('contacted'), ('talks'), ('partner'), ('past'), ('do_not_contact')) v (v)
    left join public.sponsor_rows(p, 'rel') r on r.relationship = v.v group by v.v
  union all
  select 'size', v.v, count(r.id)
    from (values ('1-10'), ('11-50'), ('51-200'), ('201-1000'), ('1000+')) v (v)
    left join public.sponsor_rows(p, 'size') r on r.company_size = v.v group by v.v
  union all
  select 'country', u.v, count(r.id)
    from (select distinct x.country as v from public.brands x where x.country is not null) u
    left join public.sponsor_rows(p, 'country') r on r.country = u.v group by u.v
  union all
  select 'contact', '1', count(*) from public.sponsor_rows(p, 'contact') r where r.contact_count > 0
  union all
  select 'tag', t.id::text, count(r.id)
    from public.tags t left join public.sponsor_rows(p, 'tag') r on t.id = any (r.tag_ids)
   where t.scope = 'brand' group by t.id
$$;

-- ---------------------------------------------------------------- export rows (same columns as the import file)
create or replace function public.sponsors_export(p jsonb, p_sort text default 'name', p_dir text default null,
                                                  p_limit integer default 1000, p_offset integer default 0)
returns table (name text, website text, industry text, country text, company_size text, niches text,
               target_min_subs integer, target_max_subs integer, budget_min numeric, budget_max numeric,
               relationship text, notes text, contact_name text, contact_role text, contact_email text,
               contact_phone text, contact_linkedin text)
language sql stable security invoker set search_path = public, extensions as $$
  select l.name, l.website, l.industry, l.country, l.company_size, array_to_string(l.target_niches, ';'),
         l.target_min_subs, l.target_max_subs, l.budget_min_cents / 100.0, l.budget_max_cents / 100.0,
         l.relationship, b.notes, c.full_name, c.role_title, c.email::text, c.phone, c.linkedin_url
    from public.sponsors_list(p, p_sort, p_dir, null, p_limit, p_offset) l
    join public.brands b on b.id = l.id
    left join lateral (select x.* from public.brand_contacts x where x.brand_id = l.id
                        order by x.is_primary desc, x.created_at, x.id limit 1) c on true
$$;

-- ---------------------------------------------------------------- who may call them
do $$
declare f text;
begin
  foreach f in array array[
    'sponsor_text_array(jsonb)', 'sponsor_uuid_array(jsonb)', 'sponsor_args(jsonb)', 'sponsor_rows(jsonb, text)',
    'sponsors_count(jsonb)', 'sponsors_list(jsonb, text, text, uuid, integer, integer)', 'sponsor_facets(jsonb)',
    'sponsors_export(jsonb, text, text, integer, integer)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;
