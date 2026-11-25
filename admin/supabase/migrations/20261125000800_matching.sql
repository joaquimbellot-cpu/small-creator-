-- Matching (Matching and Link agent): the match score in SQL, and the "Best match" sort of the two lists.
--   * match_short(), match_num(): small text helpers for the reasons ("12.5k", "12,500").
--   * match_pairs(creator, sponsor, ids): the score (0 to 100) for every creator/sponsor pair asked for, with one plain-English
--     reason per input, a band, and the reasons a pair is not suggested. match_for_creator() and match_for_brand() are the two
--     ways in. Weights: niche fit 40, size fit 25, the sponsor backed similar creators 20, recency 15. Missing data gives 0 points
--     and a sentence that says what is missing. Detected-only records give half the points of the similar-creators input and
--     the reason starts with "Possibly" (unconfirmed). Never suggested: creator marked do_not_contact or on the suppression
--     list, sponsor marked do_not_contact, an open deal for the pair, a confirmed sponsorship for the pair in the last 180 days.
--   * creators_list() and sponsors_list(): create or replace, same signature and same return type, bodies copied from
--     20261125000500 / 20261125000700 with one change each: the ordering by score for "Best match".
--     creators_list has no "for" argument and its signature cannot change, so the sponsor is carried in p_sort as
--     'match:<sponsor uuid>'. A plain 'match' (no sponsor) still falls back to subscribers, as before.
-- All SECURITY INVOKER (the caller's RLS applies), fixed search_path, granted to authenticated only (never anon).
-- SAFE ON THE LIVE DATABASE: only functions; no table, column or row changes. Every statement can run twice.
-- ROLL BACK (manual): re-apply 20261125000500 and 20261125000700 (they restore the two list functions), then
--   drop function match_for_brand(uuid, uuid[]), match_for_creator(uuid, uuid[]), match_pairs(uuid, uuid, uuid[]), match_num(bigint), match_short(bigint).
set search_path = public, extensions;

create or replace function public.match_short(n bigint) returns text
language sql immutable security invoker set search_path = public, pg_temp as $$
  select case when n is null then null
              when n >= 1000000 then regexp_replace(round(n / 1000000.0, 1)::text, '\.0$', '') || 'M'
              when n >= 1000 then regexp_replace(round(n / 1000.0, 1)::text, '\.0$', '') || 'k'
              else n::text end
$$;

create or replace function public.match_num(n bigint) returns text
language sql immutable security invoker set search_path = public, pg_temp as $$
  select to_char(n, 'FM999,999,999,999')
$$;

-- ---------------------------------------------------------------- the score
create or replace function public.match_pairs(p_creator uuid default null, p_brand uuid default null, p_ids uuid[] default null)
returns table (creator_id uuid, brand_id uuid, total integer, band text, reasons jsonb, blocked text, open_stage text, recent_on date, suggestable boolean)
language sql stable security invoker set search_path = public, extensions, pg_temp as $$
  with pairs as (
    select c.id as cid, c.niche_slug, c.subscribers, c.subscribers_hidden, c.status::text as cstatus, c.email,
           b.id as bid, b.name as bname, b.target_niches, b.target_min_subs, b.target_max_subs, b.relationship,
           b.last_sponsorship_at, n.name as niche_name
      from public.creators c
      join public.brands b on true
      left join public.niches n on n.slug = c.niche_slug
     where (p_creator is not null or p_brand is not null)
       and (p_creator is null or c.id = p_creator)
       and (p_brand is null or b.id = p_brand)
       and (p_ids is null or (case when p_creator is null then c.id else b.id end) = any (p_ids))
  ),
  x as (
    select p.*,
           tn.names as target_names,
           sim.conf, sim.det,
           od.stage as open_stage,
           rc.on_day as recent_on,
           exists (select 1 from public.suppression_list sl where sl.email = p.email) as opted_out
      from pairs p
      left join lateral (select string_agg(lower(n2.name), ', ' order by n2.sort_order, n2.slug) as names
                           from public.niches n2 where n2.slug = any (p.target_niches)) tn on true
      left join lateral (select count(distinct s.creator_id) filter (where s.source_label = 'confirmed') as conf,
                                count(distinct s.creator_id) filter (where s.source_label = 'detected') as det
                           from public.sponsorships s join public.creators c2 on c2.id = s.creator_id
                          where s.brand_id = p.bid and not s.rejected and p.niche_slug is not null
                            and c2.niche_slug = p.niche_slug and s.creator_id <> p.cid) sim on true
      left join lateral (select d.stage::text as stage from public.deals d
                          where d.creator_id = p.cid and d.brand_id = p.bid and d.stage not in ('completed', 'paid')
                          order by d.stage_changed_at desc limit 1) od on true
      left join lateral (select max(s.sponsored_on) as on_day from public.sponsorships s
                          where s.creator_id = p.cid and s.brand_id = p.bid and s.source_label = 'confirmed' and not s.rejected
                            and s.sponsored_on >= current_date - 180) rc on true
  ),
  y as (
    select x.*,
           coalesce(x.conf, 0) as nc, coalesce(x.det, 0) as nd,
           (x.subscribers is not null and not x.subscribers_hidden) as has_subs,
           (x.target_min_subs is not null or x.target_max_subs is not null) as has_target,
           coalesce(x.target_min_subs, 0) as lo,
           case when x.niche_slug is not null and x.niche_slug = any (x.target_niches) then 40 else 0 end as p_niche,
           case when x.last_sponsorship_at is null then 0
                when current_date - x.last_sponsorship_at <= 90 then 15
                when current_date - x.last_sponsorship_at <= 180 then 10
                when current_date - x.last_sponsorship_at <= 365 then 5 else 0 end as p_rec,
           case when x.target_min_subs is not null and x.target_max_subs is not null then public.match_short(x.target_min_subs) || ' to ' || public.match_short(x.target_max_subs)
                when x.target_min_subs is not null then public.match_short(x.target_min_subs) || ' and above'
                else 'up to ' || public.match_short(x.target_max_subs) end as target_phrase
      from x
  ),
  z as (
    select y.*,
           case when not (y.has_subs and y.has_target) then 0
                when y.subscribers >= y.lo and (y.target_max_subs is null or y.subscribers <= y.target_max_subs) then 25
                when y.subscribers >= y.lo * 0.5 and (y.target_max_subs is null or y.subscribers <= y.target_max_subs * 1.5) then 12
                else 0 end as p_size,
           case when y.niche_slug is null then 0
                when y.nc > 0 then case when y.nc >= 3 then 20 when y.nc = 2 then 14 else 8 end
                when y.nd > 0 then case when y.nd >= 3 then 10 when y.nd = 2 then 7 else 4 end
                else 0 end as p_sim
      from y
  ),
  w as (
    select z.*,
           case when z.niche_slug is null then 'This channel has no niche set, so niche fit cannot be judged.'
                when coalesce(cardinality(z.target_niches), 0) = 0 then z.bname || ' has no target niches set, so niche fit cannot be judged.'
                when z.p_niche > 0 then coalesce(z.niche_name, z.niche_slug) || ' is a niche ' || z.bname || ' targets.'
                else z.bname || ' targets ' || coalesce(z.target_names, 'other niches') || '. This channel is ' || lower(coalesce(z.niche_name, z.niche_slug)) || '.' end as t_niche,
           case when not z.has_subs then 'This channel''s subscriber count is hidden or missing, so size fit cannot be judged.'
                when not z.has_target then z.bname || ' has no target subscriber range set, so size fit cannot be judged.'
                else public.match_num(z.subscribers) || ' subscribers is ' ||
                     case z.p_size when 25 then 'inside' when 12 then 'just outside' else 'far from' end ||
                     ' the sponsor''s target of ' || z.target_phrase || '.' end as t_size,
           case when z.niche_slug is null then 'This channel has no niche set, so similar creators cannot be counted.'
                when z.nc > 0 then z.bname || ' has sponsored ' || z.nc || ' other ' || lower(coalesce(z.niche_name, z.niche_slug)) ||
                     case when z.nc = 1 then ' channel' else ' channels' end || ' (confirmed).'
                when z.nd > 0 then 'Possibly sponsored ' || z.nd || ' similar ' || case when z.nd = 1 then 'channel' else 'channels' end || ' (detected, not confirmed yet).'
                else 'No record yet of ' || z.bname || ' sponsoring other ' || lower(coalesce(z.niche_name, z.niche_slug)) || ' channels.' end as t_sim,
           case when z.last_sponsorship_at is null then 'No confirmed sponsorship by ' || z.bname || ' on record.'
                else z.bname || ' last sponsored a creator ' ||
                     case when current_date - z.last_sponsorship_at <= 0 then 'today'
                          when current_date - z.last_sponsorship_at = 1 then 'yesterday'
                          when current_date - z.last_sponsorship_at < 60 then (current_date - z.last_sponsorship_at) || ' days ago'
                          else ((current_date - z.last_sponsorship_at) / 30) || ' months ago' end || ' (confirmed).' end as t_rec
      from z
  )
  select w.cid, w.bid,
         (w.p_niche + w.p_size + w.p_sim + w.p_rec)::integer,
         case when w.p_niche + w.p_size + w.p_sim + w.p_rec >= 70 then 'Strong'
              when w.p_niche + w.p_size + w.p_sim + w.p_rec >= 40 then 'Possible' else 'Weak' end,
         jsonb_build_array(
           jsonb_build_object('points', w.p_niche, 'text', w.t_niche, 'unconfirmed', false),
           jsonb_build_object('points', w.p_size, 'text', w.t_size, 'unconfirmed', false),
           jsonb_build_object('points', w.p_sim, 'text', w.t_sim, 'unconfirmed', w.nc = 0 and w.nd > 0 and w.niche_slug is not null),
           jsonb_build_object('points', w.p_rec, 'text', w.t_rec, 'unconfirmed', false)),
         case when w.cstatus = 'do_not_contact' then 'The creator is marked Do not contact.'
              when w.opted_out then 'The creator has opted out of email.'
              when w.relationship = 'do_not_contact' then 'The sponsor is marked Do not contact.' end,
         w.open_stage,
         w.recent_on,
         (w.cstatus <> 'do_not_contact' and not w.opted_out and w.relationship <> 'do_not_contact'
          and w.open_stage is null and w.recent_on is null)
    from w
$$;

-- For one creator: every sponsor. p_ids limits the answer to those sponsors.
create or replace function public.match_for_creator(p_creator uuid, p_ids uuid[] default null)
returns table (brand_id uuid, total integer, band text, reasons jsonb, blocked text, open_stage text, recent_on date, suggestable boolean)
language sql stable security invoker set search_path = public, extensions, pg_temp as $$
  select m.brand_id, m.total, m.band, m.reasons, m.blocked, m.open_stage, m.recent_on, m.suggestable
    from public.match_pairs(p_creator, null, p_ids) m
   where p_creator is not null
$$;

-- For one sponsor: every creator. p_ids limits the answer to those creators.
create or replace function public.match_for_brand(p_brand uuid, p_ids uuid[] default null)
returns table (creator_id uuid, total integer, band text, reasons jsonb, blocked text, open_stage text, recent_on date, suggestable boolean)
language sql stable security invoker set search_path = public, extensions, pg_temp as $$
  select m.creator_id, m.total, m.band, m.reasons, m.blocked, m.open_stage, m.recent_on, m.suggestable
    from public.match_pairs(null, p_brand, p_ids) m
   where p_brand is not null
$$;

-- ---------------------------------------------------------------- creators_list (copy of 20261125000500 + the match ordering)
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
  with f as (select case when p_sort ~ '^match:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then substr(p_sort, 7)::uuid end as for_id),
  m as (select x as id from public.creators_match_ids(p_q, p_subs_min, p_subs_max, p_sponsored, p_detected, p_recent, p_by, p_niche, p_status, p_contacted, p_views, p_lang, p_country, p_email, p_tag, p_list) x),
  r as (
    select c.id, c.full_name, c.channel_name, c.niche_slug, c.country, c.language, c.subscribers, c.subscribers_hidden,
           c.avg_views, c.status::text as status, c.last_contacted_at as stored_contact,
           case when p_sort = 'last_contacted' then public.creator_contacted_at(c.id, c.last_contacted_at) end as sort_contact,
           c.created_at, c.sponsorship_count, c.last_sponsorship_at, c.detected_sponsorship_count, c.last_detected_sponsorship_at,
           (c.email <> '') as has_email,
           mm.total as m_total, (mm.blocked is null) as m_ok,
           case when coalesce(p_detected, false) then greatest(c.last_sponsorship_at, c.last_detected_sponsorship_at)
                else c.last_sponsorship_at end as sp_at
      from public.creators c join m on m.id = c.id
      cross join f
      left join public.match_for_brand(f.for_id) mm on mm.creator_id = c.id
  ),
  pg as (
    select r.*, count(*) over () as total
      from r
     order by
     -- "Best match" for a sponsor (p_sort = 'match:<sponsor id>'): people we may contact first, then the highest score
     case when p_sort like 'match:%' then r.m_ok end desc nulls last,
     case when p_sort like 'match:%' then r.m_total end desc nulls last,
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
     -- "match" alone (no sponsor chosen) and "match:<id>" ties fall back to subscribers
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
     case when p_sort like 'match:%' then pg.m_ok end desc nulls last,
     case when p_sort like 'match:%' then pg.m_total end desc nulls last,
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
     -- "match" alone (no sponsor chosen) and "match:<id>" ties fall back to subscribers
     case when p_sort not in ('sponsored', 'last_contacted', 'added', 'name') and p_sort <> 'subscribers' then pg.subscribers end desc nulls last,
     pg.full_name asc, pg.id asc
$$;

-- ---------------------------------------------------------------- sponsors_list (copy of 20261125000700 + the match ordering)
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
    left join public.match_for_creator(p_for) mm on mm.brand_id = r.id
   order by
     -- "Best match" for a creator: sponsors we may contact first, then the highest score
     case when o.s = 'match' and p_for is not null then (mm.blocked is null) end desc nulls last,
     case when o.s = 'match' and p_for is not null then mm.total end desc nulls last,
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

-- ---------------------------------------------------------------- who may call them
do $$
declare f text;
begin
  foreach f in array array['match_short(bigint)', 'match_num(bigint)', 'match_pairs(uuid, uuid, uuid[])',
                           'match_for_creator(uuid, uuid[])', 'match_for_brand(uuid, uuid[])'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;

-- create or replace keeps the grants of the two list functions; say it again so a fresh database is right too.
revoke all on function public.creators_list(text, bigint, bigint, text, boolean, integer, uuid[], text[], text[], text, integer, text[], text[], boolean, uuid[], uuid[], text, text, integer, integer) from public, anon;
grant execute on function public.creators_list(text, bigint, bigint, text, boolean, integer, uuid[], text[], text[], text, integer, text[], text[], boolean, uuid[], uuid[], text, text, integer, integer) to authenticated;
revoke all on function public.sponsors_list(jsonb, text, text, uuid, integer, integer) from public, anon;
grant execute on function public.sponsors_list(jsonb, text, text, uuid, integer, integer) to authenticated, service_role;
