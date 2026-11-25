-- Tests for migration 20261125000700 (sponsor list, option counts, export rows). Everything is rolled back.
-- Each count from the functions is compared with an independent query written straight against the tables.
\set ON_ERROR_STOP on
begin;
create schema tests;
create table tests.results (name text, ok boolean);
create function tests.check(p_name text, p_ok boolean) returns void language plpgsql as $$
begin insert into tests.results values (p_name, coalesce(p_ok, false)); raise notice '% %', case when coalesce(p_ok,false) then 'PASS' else 'FAIL' end, p_name; end $$;
create function tests.run_as(p_role text, p_uid uuid, p_sql text, out ok boolean, out n bigint, out err text)
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', case when p_uid is null then json_build_object('role', p_role)::text
                                                else json_build_object('sub', p_uid, 'role', p_role)::text end, true);
  execute format('set local role %I', p_role);
  begin execute p_sql; get diagnostics n = row_count; ok := true;
  exception when others then ok := false; n := -1; err := sqlerrm; end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
end $$;
create function tests.json_as(p_role text, p_uid uuid, p_sql text) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', p_role)::text, true);
  execute format('set local role %I', p_role);
  begin execute p_sql into v; exception when others then v := jsonb_build_object('error', sqlerrm); end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  return v;
end $$;
create temp table ids as select (select id from public.profiles where email = 'owner@example.test') as o,
                                (select id from public.profiles where email = 'worker@example.test') as w;
grant select on ids to public;
delete from auth.mfa_factors;   -- live data may hold real enrolments; start clean (rolled back)

-- ================================================================== counts equal independent counts (as a worker)
create function tests.cnt(p jsonb) returns bigint language sql as
$$ select (tests.json_as('authenticated', (select w from ids), format('select to_jsonb(public.sponsors_count(%L::jsonb))', p::text)))::text::bigint $$;
grant execute on function tests.cnt(jsonb) to public;
grant usage on schema tests to public;

select tests.check('count: no filter = all sponsors', tests.cnt('{}') = (select count(*) from public.brands));
select tests.check('count: search by name, industry or website',
  tests.cnt('{"q":"kit"}') = (select count(*) from public.brands b where b.name::text ilike '%kit%' or b.industry ilike '%kit%' or b.website ilike '%kit%'));
select tests.check('count: search treats % and _ as plain characters', tests.cnt('{"q":"%"}') = 0 and tests.cnt('{"q":"_"}') = 0);
select tests.check('count: industry (two values)',
  tests.cnt('{"industry":["Software","Education"]}') = (select count(*) from public.brands where industry in ('Software','Education')));
select tests.check('count: niche (any of two)',
  tests.cnt('{"niches":["tech","gaming"]}') = (select count(*) from public.brands where target_niches && array['tech','gaming']));
select tests.check('count: target size overlaps 10k to 50k',
  tests.cnt('{"target_min":10000,"target_max":50000}') = (select count(*) from public.brands
    where (target_min_subs is not null or target_max_subs is not null)
      and coalesce(target_max_subs, 2147483647) >= 10000 and coalesce(target_min_subs, 0) <= 50000));
select tests.check('count: target size 100k and above',
  tests.cnt('{"target_min":100000}') = (select count(*) from public.brands where coalesce(target_max_subs, 2147483647) >= 100000
    and (target_min_subs is not null or target_max_subs is not null)));
select tests.check('count: budget overlaps $250 to $1,000 (dollars in, cents stored)',
  tests.cnt('{"budget_min":250,"budget_max":1000}') = (select count(*) from public.brands
    where (budget_min_cents is not null or budget_max_cents is not null)
      and coalesce(budget_max_cents, 9223372036854775807) >= 25000 and coalesce(budget_min_cents, 0) <= 100000));
select tests.check('count: active yes (confirmed, last 90 days)',
  tests.cnt('{"active":"yes"}') = (select count(*) from public.brands b where exists
    (select 1 from public.sponsorships s where s.brand_id = b.id and s.source_label = 'confirmed' and not s.rejected and s.sponsored_on >= current_date - 90)));
select tests.check('count: active no (confirmed)',
  tests.cnt('{"active":"no"}') = (select count(*) from public.brands b where not exists
    (select 1 from public.sponsorships s where s.brand_id = b.id and s.source_label = 'confirmed' and not s.rejected and s.sponsored_on >= current_date - 90)));
select tests.check('count: active yes, detected records counted too',
  tests.cnt('{"active":"yes","detected":"true"}') = (select count(*) from public.brands b where exists
    (select 1 from public.sponsorships s where s.brand_id = b.id and not s.rejected and s.sponsored_on >= current_date - 90)));
select tests.check('count: active no, detected counted too',
  tests.cnt('{"active":"no","detected":"true"}') = (select count(*) from public.brands b where not exists
    (select 1 from public.sponsorships s where s.brand_id = b.id and not s.rejected and s.sponsored_on >= current_date - 90)));
select tests.check('count: 3 or more creators (confirmed)',
  tests.cnt('{"count":3}') = (select count(*) from public.brands b where
    (select count(distinct s.creator_id) from public.sponsorships s where s.brand_id = b.id and s.source_label = 'confirmed' and not s.rejected) >= 3));
select tests.check('count: 5 or more creators, detected counted too',
  tests.cnt('{"count":5,"detected":"true"}') = (select count(*) from public.brands b where
    (select count(distinct s.creator_id) from public.sponsorships s where s.brand_id = b.id and not s.rejected) >= 5));
select tests.check('count: last sponsorship in 30 days, both ways',
  tests.cnt('{"last":30}') = (select count(distinct s.brand_id) from public.sponsorships s where s.source_label = 'confirmed' and not s.rejected and s.sponsored_on >= current_date - 30)
  and tests.cnt('{"last":30,"detected":"true"}') = (select count(distinct s.brand_id) from public.sponsorships s where not s.rejected and s.sponsored_on >= current_date - 30));
select tests.check('count: contact status (two) and company size and country',
  tests.cnt('{"rel":["partner","talks"],"size":["51-200","11-50"],"country":["US","GB"]}') = (select count(*) from public.brands
    where relationship in ('partner','talks') and company_size in ('51-200','11-50') and country in ('US','GB')));
select tests.check('count: has a contact person',
  tests.cnt('{"contact":"true"}') = (select count(*) from public.brands b where exists (select 1 from public.brand_contacts c where c.brand_id = b.id))
  and tests.cnt('{"contact":"true"}') < (select count(*) from public.brands));
select tests.check('count: tag',
  tests.cnt(jsonb_build_object('tag', (select jsonb_agg(id) from public.tags where scope = 'brand' and name = 'Big budget'))) =
  (select count(distinct bt.brand_id) from public.brand_tags bt join public.tags t on t.id = bt.tag_id where t.name = 'Big budget' and t.scope = 'brand')
  and (select count(*) from public.tags where scope = 'brand' and name = 'Big budget') = 1);
select tests.check('count: many filters at once',
  tests.cnt('{"niches":["outdoors"],"rel":["partner","talks","contacted"],"count":2,"contact":"true","target_min":1000,"target_max":5000}') =
  (select count(*) from public.brands b where b.target_niches && array['outdoors'] and b.relationship in ('partner','talks','contacted')
     and (select count(distinct s.creator_id) from public.sponsorships s where s.brand_id = b.id and s.source_label = 'confirmed' and not s.rejected) >= 2
     and exists (select 1 from public.brand_contacts c where c.brand_id = b.id)
     and (b.target_min_subs is not null or b.target_max_subs is not null)
     and coalesce(b.target_max_subs, 2147483647) >= 1000 and coalesce(b.target_min_subs, 0) <= 5000));
select tests.check('count: odd arguments are ignored, never an error',
  tests.cnt('{"count":"x","last":"1; drop table brands","active":"maybe","target_min":"abc","tag":["not-a-uuid"],"niches":"tech","industry":[]}') = (select count(*) from public.brands));

-- ================================================================== option counts equal independent counts
create function tests.facet(p jsonb, p_facet text, p_value text) returns bigint language sql as
$$ select (tests.json_as('authenticated', (select w from ids),
   format('select to_jsonb(n) from public.sponsor_facets(%L::jsonb) where facet = %L and value = %L', p::text, p_facet, p_value)))::text::bigint $$;
grant execute on function tests.facet(jsonb, text, text) to public;

select tests.check('facet: niche count ignores the niche filter itself but obeys the others',
  tests.facet('{"niches":["outdoors"],"rel":["partner","talks"]}', 'niches', 'tech') =
  (select count(*) from public.brands where target_niches && array['tech'] and relationship in ('partner','talks')));
select tests.check('facet: contact status count obeys the niche filter',
  tests.facet('{"niches":["outdoors"],"rel":["partner","talks"]}', 'rel', 'prospect') =
  (select count(*) from public.brands where target_niches && array['outdoors'] and relationship = 'prospect'));
select tests.check('facet: an option ticked now still shows its own count (same as the result)',
  tests.facet('{"niches":["travel"]}', 'niches', 'travel') = tests.cnt('{"niches":["travel"]}'));
select tests.check('facet: every industry option equals the result of ticking it',
  (select bool_and(tests.facet('{"rel":["partner","talks","contacted"]}', 'industry', i) =
                   tests.cnt(jsonb_build_object('rel', jsonb_build_array('partner','talks','contacted'), 'industry', jsonb_build_array(i))))
     from (select distinct industry i from public.brands where industry is not null) x));
select tests.check('facet: every target band equals the result of choosing it',
  tests.facet('{"niches":["tech"]}', 'target', '1000-10000') = tests.cnt('{"niches":["tech"],"target_min":1000,"target_max":10000}')
  and tests.facet('{"niches":["tech"]}', 'target', '10000-50000') = tests.cnt('{"niches":["tech"],"target_min":10000,"target_max":50000}')
  and tests.facet('{"niches":["tech"]}', 'target', '50000-100000') = tests.cnt('{"niches":["tech"],"target_min":50000,"target_max":100000}')
  and tests.facet('{"niches":["tech"]}', 'target', '100000-') = tests.cnt('{"niches":["tech"],"target_min":100000}'));
select tests.check('facet: every budget band equals the result of choosing it',
  tests.facet('{"rel":["partner"]}', 'budget', '0-250') = tests.cnt('{"rel":["partner"],"budget_min":0,"budget_max":250}')
  and tests.facet('{"rel":["partner"]}', 'budget', '250-1000') = tests.cnt('{"rel":["partner"],"budget_min":250,"budget_max":1000}')
  and tests.facet('{"rel":["partner"]}', 'budget', '1000-5000') = tests.cnt('{"rel":["partner"],"budget_min":1000,"budget_max":5000}')
  and tests.facet('{"rel":["partner"]}', 'budget', '5000-') = tests.cnt('{"rel":["partner"],"budget_min":5000}'));
select tests.check('facet: active, count and last obey "count detected too" (on and off)',
  tests.facet('{"niches":["cooking"]}', 'active', 'yes') = tests.cnt('{"niches":["cooking"],"active":"yes"}')
  and tests.facet('{"niches":["cooking"],"detected":"true"}', 'active', 'no') = tests.cnt('{"niches":["cooking"],"active":"no","detected":"true"}')
  and tests.facet('{"niches":["cooking"]}', 'count', '3') = tests.cnt('{"niches":["cooking"],"count":3}')
  and tests.facet('{"niches":["cooking"],"detected":"true"}', 'count', '5') = tests.cnt('{"niches":["cooking"],"count":5,"detected":"true"}')
  and tests.facet('{"niches":["cooking"]}', 'last', '90') = tests.cnt('{"niches":["cooking"],"last":90}')
  and tests.facet('{"niches":["cooking"],"detected":"true"}', 'last', '180') = tests.cnt('{"niches":["cooking"],"last":180,"detected":"true"}'));
select tests.check('facet: detected on gives at least as many as off for "count 1"',
  tests.facet('{"detected":"true"}', 'count', '1') >= tests.facet('{}', 'count', '1'));
select tests.check('facet: country, size, contact and tag counts',
  tests.facet('{"rel":["partner"]}', 'country', 'US') = tests.cnt('{"rel":["partner"],"country":["US"]}')
  and tests.facet('{"rel":["partner"]}', 'size', '51-200') = tests.cnt('{"rel":["partner"],"size":["51-200"]}')
  and tests.facet('{"rel":["partner"]}', 'contact', '1') = tests.cnt('{"rel":["partner"],"contact":"true"}')
  and tests.facet('{"rel":["partner"]}', 'tag', (select id::text from public.tags where scope = 'brand' and name = 'Pays fast'))
      = tests.cnt(jsonb_build_object('rel', jsonb_build_array('partner'), 'tag', (select jsonb_agg(id) from public.tags where scope = 'brand' and name = 'Pays fast'))));
select tests.check('facet: options with no sponsor are still listed (count 0), including all 12 niches',
  (select count(*) from public.sponsor_facets('{}') where facet = 'niches') = 12
  and (select count(*) from public.sponsor_facets('{}') where facet = 'rel') = 6);

-- ================================================================== the list: paging, sorting, total
select tests.check('list: total is the full count while the page is cut',
  (select count(*) from public.sponsors_list('{}', 'name', null, null, 10, 0)) = 10
  and (select min(total) from public.sponsors_list('{}', 'name', null, null, 10, 0)) = (select count(*) from public.brands)
  and (select max(total) from public.sponsors_list('{}', 'name', null, null, 10, 0)) = (select count(*) from public.brands));
select tests.check('list: page 2 follows page 1 with no overlap',
  (select count(*) from (select id from public.sponsors_list('{}', 'name', null, null, 10, 0)
                         intersect select id from public.sponsors_list('{}', 'name', null, null, 10, 10)) x) = 0);
select tests.check('list: sort by name A to Z',
  (select name from public.sponsors_list('{}', 'name', 'asc', null, 1, 0)) = (select min(name::text) from public.brands)
  or (select name from public.sponsors_list('{}', 'name', 'asc', null, 1, 0)) = (select name::text from public.brands order by name limit 1));
select tests.check('list: sort by most creators sponsored',
  (select eff_count from public.sponsors_list('{}', 'count', null, null, 1, 0)) = (select max(sponsorship_count) from public.brands));
select tests.check('list: sort by most recent sponsorship',
  (select eff_last from public.sponsors_list('{}', 'last', null, null, 1, 0)) = (select max(last_sponsorship_at) from public.brands));
select tests.check('list: sort by budget, high to low',
  (select budget_max_cents from public.sponsors_list('{}', 'budget', null, null, 1, 0)) = (select max(budget_max_cents) from public.brands));
select tests.check('list: sort match falls back to name until the Matching agent adds scoring',
  (select array_agg(id order by ord) from (select id, row_number() over () ord from public.sponsors_list('{}', 'match', null, null, 5, 0)) x)
  = (select array_agg(id order by ord) from (select id, row_number() over () ord from public.sponsors_list('{}', 'name', null, null, 5, 0)) y));
select tests.check('list: unknown sort and limit above 1000 do not fail',
  (select count(*) from public.sponsors_list('{}', 'x; drop table brands', 'sideways', null, 99999, -5)) = (select count(*) from public.brands));
select tests.check('export: one row per sponsor with the main contact',
  (select count(*) from public.sponsors_export('{}')) = (select count(*) from public.brands)
  and (select count(*) from public.sponsors_export('{}') where contact_email is not null) =
      (select count(*) from public.brands b where exists (select 1 from public.brand_contacts c where c.brand_id = b.id and c.email is not null)));

-- ================================================================== who may call
select tests.check('anon cannot call any of the functions',
  not (tests.run_as('anon', null, $$select * from public.sponsors_list('{}')$$)).ok
  and not (tests.run_as('anon', null, $$select public.sponsors_count('{}')$$)).ok
  and not (tests.run_as('anon', null, $$select * from public.sponsor_facets('{}')$$)).ok
  and not (tests.run_as('anon', null, $$select * from public.sponsor_rows('{}')$$)).ok
  and not (tests.run_as('anon', null, $$select * from public.sponsors_export('{}')$$)).ok);
select tests.check('anon has no execute right (not even through public)',
  not has_function_privilege('anon', 'public.sponsors_list(jsonb, text, text, uuid, integer, integer)', 'execute')
  and not has_function_privilege('anon', 'public.sponsor_facets(jsonb)', 'execute')
  and has_function_privilege('authenticated', 'public.sponsor_facets(jsonb)', 'execute'));
select tests.check('the functions are security invoker with a fixed search_path',
  (select bool_and(not p.prosecdef and p.proconfig is not null and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'))
     from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('sponsor_rows', 'sponsors_list', 'sponsors_count', 'sponsor_facets', 'sponsors_export', 'sponsor_args')));

-- ================================================================== a worker cannot delete a sponsor or a contact
insert into public.brands (id, name) values ('00000000-0000-0000-0000-00000000b0a1', 'ZZ List Test Sponsor');
insert into public.brand_contacts (id, brand_id, full_name) values ('00000000-0000-0000-0000-00000000c0a1', '00000000-0000-0000-0000-00000000b0a1', 'ZZ Person');
create temp table acts (label text primary key, ok boolean, n bigint);
grant all on acts to public;
insert into acts select 'w-del-brand', r.ok, r.n from tests.run_as('authenticated', (select w from ids), $$delete from public.brands where id = '00000000-0000-0000-0000-00000000b0a1'$$) r;
insert into acts select 'w-del-contact', r.ok, r.n from tests.run_as('authenticated', (select w from ids), $$delete from public.brand_contacts where id = '00000000-0000-0000-0000-00000000c0a1'$$) r;
select tests.check('a worker cannot delete a sponsor or a contact person (nothing is deleted)',
  (select n from acts where label = 'w-del-brand') = 0 and (select n from acts where label = 'w-del-contact') = 0
  and exists (select 1 from public.brands where id = '00000000-0000-0000-0000-00000000b0a1')
  and exists (select 1 from public.brand_contacts where id = '00000000-0000-0000-0000-00000000c0a1'));
insert into acts select 'o-del-contact', r.ok, r.n from tests.run_as('authenticated', (select o from ids), $$delete from public.brand_contacts where id = '00000000-0000-0000-0000-00000000c0a1'$$) r;
insert into acts select 'o-del-brand', r.ok, r.n from tests.run_as('authenticated', (select o from ids), $$delete from public.brands where id = '00000000-0000-0000-0000-00000000b0a1'$$) r;
select tests.check('the owner can delete a sponsor and a contact person',
  (select n from acts where label = 'o-del-contact') = 1 and (select n from acts where label = 'o-del-brand') = 1);
select tests.check('a worker can add a tag to a sponsor (bulk tag) but not delete a tag',
  (tests.run_as('authenticated', (select w from ids), $$insert into public.brand_tags (brand_id, tag_id) select (select id from public.brands limit 1), (select id from public.tags where scope = 'brand' and name = 'Agency') on conflict do nothing$$)).ok
  and (tests.run_as('authenticated', (select w from ids), $$delete from public.tags where scope = 'brand'$$)).n = 0);

select tests.check('all tests of this file ran', (select count(*) from tests.results) >= 38);
do $$ begin
  if exists (select 1 from tests.results where not ok) then
    raise exception 'FAILED: %', (select string_agg(name, '; ') from tests.results where not ok);
  end if;
  raise notice 'sponsors_list.sql: % checks passed', (select count(*) from tests.results);
end $$;
rollback;
