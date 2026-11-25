-- Tests for migration 20261125000800 (match score, match_for_creator / match_for_brand, the "Best match" sort of the two lists).
-- Hand-built creators and sponsors with scores worked out on paper. Everything is rolled back.
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
grant usage on schema tests to public;
delete from auth.mfa_factors;

-- ---------------------------------------------------------------- fixtures (ids end in 77xx so they never meet the seed)
insert into public.brands (id, name, target_niches, target_min_subs, target_max_subs, relationship) values
  ('00000000-0000-0000-0000-000000007701', 'ZZ Alpha', '{tech,gaming}', 5000, 50000, 'prospect'),
  ('00000000-0000-0000-0000-000000007702', 'ZZ Beta', '{tech}', 1000, 100000, 'prospect'),
  ('00000000-0000-0000-0000-000000007703', 'ZZ Gamma', '{}', null, null, 'prospect'),
  ('00000000-0000-0000-0000-000000007704', 'ZZ Delta', '{tech}', 1000, 100000, 'do_not_contact'),
  ('00000000-0000-0000-0000-000000007705', 'ZZ Epsilon', '{tech}', 1000, 100000, 'prospect');
insert into public.creators (id, full_name, email, niche_slug, subscribers, status) values
  ('00000000-0000-0000-0000-000000007711', 'ZZ One', 'zz-m1@example.test', 'tech', 12500, 'new'),
  ('00000000-0000-0000-0000-000000007712', 'ZZ Two', 'zz-m2@example.test', 'tech', 20000, 'new'),
  ('00000000-0000-0000-0000-000000007713', 'ZZ Three', 'zz-m3@example.test', 'tech', 30000, 'new'),
  ('00000000-0000-0000-0000-000000007714', 'ZZ Four', 'zz-m4@example.test', 'gaming', 3000, 'new'),
  ('00000000-0000-0000-0000-000000007715', 'ZZ Five', 'zz-m5@example.test', null, null, 'new'),
  ('00000000-0000-0000-0000-000000007716', 'ZZ Six', 'zz-m6@example.test', 'tech', 12000, 'do_not_contact'),
  ('00000000-0000-0000-0000-000000007717', 'ZZ Seven', 'zz-m7@example.test', 'tech', 12000, 'new'),
  ('00000000-0000-0000-0000-000000007718', 'ZZ Eight', 'zz-m8@example.test', 'tech', 90000, 'new');
insert into public.suppression_list (email, reason) values ('zz-m7@example.test', 'test');
-- Alpha backed two other tech creators (Two 40 days ago, Three 100 days ago); Beta has a detected record for Two only.
insert into public.sponsorships (creator_id, brand_id, sponsored_on, source_label, origin, confirmed_by, confirmed_at, evidence_note) values
  ('00000000-0000-0000-0000-000000007712', '00000000-0000-0000-0000-000000007701', current_date - 40, 'confirmed', 'manual', (select o from ids), now(), 'x'),
  ('00000000-0000-0000-0000-000000007713', '00000000-0000-0000-0000-000000007701', current_date - 100, 'confirmed', 'manual', (select o from ids), now(), 'x'),
  ('00000000-0000-0000-0000-000000007718', '00000000-0000-0000-0000-000000007705', current_date - 30, 'confirmed', 'manual', (select o from ids), now(), 'x');
insert into public.sponsorships (creator_id, brand_id, sponsored_on, source_label, origin, detection_signal, detection_confidence) values
  ('00000000-0000-0000-0000-000000007712', '00000000-0000-0000-0000-000000007702', current_date - 20, 'detected', 'detected', 'hashtag_ad', 'medium');
-- One creator linked to Beta already (open deal)
insert into public.deals (creator_id, brand_id, stage, amount_cents) values
  ('00000000-0000-0000-0000-000000007711', '00000000-0000-0000-0000-000000007702', 'contacted', null);


-- ================================================================== scores worked out on paper
-- One + Alpha: niche 40 + size 25 (12,500 is inside 5k to 50k) + similar 14 (two other tech creators, confirmed) + recency 15 (40 days) = 94
select tests.check('score: One with Alpha is 94 (40 + 25 + 14 + 15), Strong',
  (select total = 94 and band = 'Strong' from public.match_pairs('00000000-0000-0000-0000-000000007711', '00000000-0000-0000-0000-000000007701')));
select tests.check('score: reasons come in order niche, size, similar, recency, with points that add up',
  (select jsonb_array_length(reasons) = 4 and (reasons -> 0 ->> 'points')::int = 40 and (reasons -> 1 ->> 'points')::int = 25
      and (reasons -> 2 ->> 'points')::int = 14 and (reasons -> 3 ->> 'points')::int = 15
      and (select sum((r ->> 'points')::int) from jsonb_array_elements(reasons) r) = total
   from public.match_pairs('00000000-0000-0000-0000-000000007711', '00000000-0000-0000-0000-000000007701')));
select tests.check('score: the sentences are built from the real values',
  (select reasons -> 0 ->> 'text' = 'Tech and gadgets is a niche ZZ Alpha targets.'
      and reasons -> 1 ->> 'text' = '12,500 subscribers is inside the sponsor''s target of 5k to 50k.'
      and reasons -> 2 ->> 'text' = 'ZZ Alpha has sponsored 2 other tech and gadgets channels (confirmed).'
      and reasons -> 3 ->> 'text' = 'ZZ Alpha last sponsored a creator 40 days ago (confirmed).'
   from public.match_pairs('00000000-0000-0000-0000-000000007711', '00000000-0000-0000-0000-000000007701')));
-- Four + Alpha: gaming is targeted (40), 3,000 is within 50% below 5k (12), no other gaming creator backed (0), 40 days (15) = 67, Possible
select tests.check('score: Four with Alpha is 67, Possible (just outside the size target gives 12)',
  (select total = 67 and band = 'Possible' and reasons -> 1 ->> 'text' like '3,000 subscribers is just outside%'
   from public.match_pairs('00000000-0000-0000-0000-000000007714', '00000000-0000-0000-0000-000000007701')));
-- Eight + Alpha: 90,000 is far from 5k to 50k (more than 50% over) => size 0; niche 40; similar 14; recency 15 = 69
select tests.check('score: far outside the size target gives 0 points for size',
  (select total = 69 and (reasons -> 1 ->> 'points')::int = 0 and reasons -> 1 ->> 'text' like '%far from%'
   from public.match_pairs('00000000-0000-0000-0000-000000007718', '00000000-0000-0000-0000-000000007701')));
-- Missing data: Five has no niche and no subscribers; Alpha has a target
select tests.check('missing data: no niche and no subscribers give 0 with a sentence that says so',
  (select (reasons -> 0 ->> 'points')::int = 0 and reasons -> 0 ->> 'text' like '%no niche set%'
      and (reasons -> 1 ->> 'points')::int = 0 and reasons -> 1 ->> 'text' like '%subscriber count is hidden or missing%'
      and (reasons -> 2 ->> 'points')::int = 0 and reasons -> 2 ->> 'text' like '%no niche set%'
      and total = 15
   from public.match_pairs('00000000-0000-0000-0000-000000007715', '00000000-0000-0000-0000-000000007701')));
-- Gamma has no target at all
select tests.check('missing data: a sponsor with no target niches or size gets 0 with a sentence that says so',
  (select total = 0 and reasons -> 0 ->> 'text' like 'ZZ Gamma has no target niches set%' and reasons -> 1 ->> 'text' like 'ZZ Gamma has no target subscriber range set%'
   from public.match_pairs('00000000-0000-0000-0000-000000007711', '00000000-0000-0000-0000-000000007703')));
-- Detected only: One + Beta: niche 40, size 25, detected record by Two (tech) gives half of 8 = 4, no confirmed record at all => 0 recency = 69
select tests.check('detected only: half points, marked unconfirmed, the sentence starts with Possibly',
  (select (reasons -> 2 ->> 'points')::int = 4 and (reasons -> 2 ->> 'unconfirmed')::boolean and reasons -> 2 ->> 'text' like 'Possibly%'
      and (reasons -> 3 ->> 'points')::int = 0 and reasons -> 3 ->> 'text' like 'No confirmed sponsorship%' and total = 69
   from public.match_pairs('00000000-0000-0000-0000-000000007711', '00000000-0000-0000-0000-000000007702')));
select tests.check('bands: 70 and above Strong, 40 to 69 Possible, under 40 Weak',
  (select band from public.match_pairs('00000000-0000-0000-0000-000000007711', '00000000-0000-0000-0000-000000007701')) = 'Strong'
  and (select band from public.match_pairs('00000000-0000-0000-0000-000000007711', '00000000-0000-0000-0000-000000007702')) = 'Possible'
  and (select band from public.match_pairs('00000000-0000-0000-0000-000000007711', '00000000-0000-0000-0000-000000007703')) = 'Weak');

-- ================================================================== exclusions
select tests.check('excluded: a creator marked do_not_contact',
  (select blocked = 'The creator is marked Do not contact.' and not suggestable from public.match_pairs('00000000-0000-0000-0000-000000007716', '00000000-0000-0000-0000-000000007701')));
select tests.check('excluded: a creator whose email is on the suppression list',
  -- (the suppression trigger may also mark the creator do_not_contact, so either sentence is right)
  (select blocked is not null and not suggestable from public.match_pairs('00000000-0000-0000-0000-000000007717', '00000000-0000-0000-0000-000000007701')));
select tests.check('excluded: a sponsor marked do_not_contact',
  (select blocked = 'The sponsor is marked Do not contact.' and not suggestable from public.match_pairs('00000000-0000-0000-0000-000000007711', '00000000-0000-0000-0000-000000007704')));
select tests.check('excluded: a pair with an open deal (and the stage is returned)',
  (select open_stage = 'contacted' and not suggestable and blocked is null from public.match_pairs('00000000-0000-0000-0000-000000007711', '00000000-0000-0000-0000-000000007702')));
select tests.check('excluded: a pair with a confirmed sponsorship in the last 180 days',
  (select recent_on = current_date - 30 and not suggestable from public.match_pairs('00000000-0000-0000-0000-000000007718', '00000000-0000-0000-0000-000000007705')));
select tests.check('a clean pair is suggestable',
  (select suggestable and blocked is null and open_stage is null and recent_on is null from public.match_pairs('00000000-0000-0000-0000-000000007711', '00000000-0000-0000-0000-000000007701')));
update public.deals set stage = 'paid' where creator_id = '00000000-0000-0000-0000-000000007711' and brand_id = '00000000-0000-0000-0000-000000007702';
select tests.check('a completed or paid deal is no longer open',
  (select open_stage is null from public.match_pairs('00000000-0000-0000-0000-000000007711', '00000000-0000-0000-0000-000000007702')));

-- ================================================================== the two ways in, and who may call them
select tests.check('match_for_creator returns one row per sponsor; match_for_brand one per creator',
  (select count(*) from public.match_for_creator('00000000-0000-0000-0000-000000007711')) = (select count(*) from public.brands)
  and (select count(*) from public.match_for_brand('00000000-0000-0000-0000-000000007701')) = (select count(*) from public.creators));
select tests.check('p_ids limits the other side',
  (select count(*) from public.match_for_creator('00000000-0000-0000-0000-000000007711', array['00000000-0000-0000-0000-000000007701', '00000000-0000-0000-0000-000000007702']::uuid[])) = 2);
select tests.check('no creator and no sponsor gives nothing (never a full cross join)',
  (select count(*) from public.match_pairs(null, null)) = 0 and (select count(*) from public.match_for_creator(null)) = 0);
select tests.check('a worker can call the functions and sees scores',
  (tests.json_as('authenticated', (select w from ids), $$select to_jsonb(count(*)) from public.match_for_creator('00000000-0000-0000-0000-000000007711')$$))::text::int = (select count(*) from public.brands));
select tests.check('anon cannot call them',
  not (tests.run_as('anon', null, $$select * from public.match_for_creator('00000000-0000-0000-0000-000000007711')$$)).ok
  and not (tests.run_as('anon', null, $$select * from public.match_for_brand('00000000-0000-0000-0000-000000007701')$$)).ok
  and not (tests.run_as('anon', null, $$select * from public.match_pairs('00000000-0000-0000-0000-000000007711', '00000000-0000-0000-0000-000000007701')$$)).ok);
select tests.check('the functions are security invoker with a fixed search_path',
  not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.proname in ('match_pairs', 'match_for_creator', 'match_for_brand', 'match_short', 'match_num')
                 and (p.prosecdef or p.proconfig is null)));

-- ================================================================== the "Best match" sort
-- Sponsors for creator One: Alpha (94) comes before Beta (69, no open deal now) before Gamma (0); a blocked sponsor (Delta) is last of these.
select tests.check('sponsors_list: sort match with a creator orders by score, blocked last',
  (select array_agg(name order by ord) from (select name, row_number() over () as ord
     from public.sponsors_list(jsonb_build_object('q', 'ZZ '), 'match', null, '00000000-0000-0000-0000-000000007711', 10, 0)) x)
  = array['ZZ Alpha', 'ZZ Epsilon', 'ZZ Beta', 'ZZ Gamma', 'ZZ Delta']);
select tests.check('sponsors_list: sort match without a creator still sorts by name',
  (select array_agg(name order by ord) from (select name, row_number() over () as ord
     from public.sponsors_list(jsonb_build_object('q', 'ZZ '), 'match', null, null, 10, 0)) x)
  = array['ZZ Alpha', 'ZZ Beta', 'ZZ Delta', 'ZZ Epsilon', 'ZZ Gamma']);
-- Creators for Alpha: One 94, Two? (Two's own records for Alpha do not count as "other creators"), Eight 69; blocked (Six, Seven) after the rest.
select tests.check('creators_list: sort match:<sponsor> puts the best score first and blocked creators last',
  (select id from public.creators_list(p_q => 'ZZ ', p_sort => 'match:00000000-0000-0000-0000-000000007701', p_limit => 1))
     = (select creator_id from public.match_for_brand('00000000-0000-0000-0000-000000007701', (select array_agg(id) from public.creators where full_name like 'ZZ %'))
         where blocked is null order by total desc, creator_id limit 1)
  and (select array_agg(id order by ord) from (select id, row_number() over () as ord from public.creators_list(p_q => 'ZZ ', p_sort => 'match:00000000-0000-0000-0000-000000007701', p_limit => 8)) x) is not null
  and (select full_name from public.creators_list(p_q => 'ZZ ', p_sort => 'match:00000000-0000-0000-0000-000000007701', p_limit => 8) offset 7 limit 1) in ('ZZ Six', 'ZZ Seven')
  and (select full_name from public.creators_list(p_q => 'ZZ ', p_sort => 'match:00000000-0000-0000-0000-000000007701', p_limit => 8) offset 6 limit 1) in ('ZZ Six', 'ZZ Seven'));
select tests.check('creators_list: a plain match (no sponsor) still equals the subscribers order',
  (select id from public.creators_list(p_sort => 'match', p_limit => 1)) = (select id from public.creators_list(p_sort => 'subscribers', p_limit => 1)));
select tests.check('creators_list: a bad sponsor id after match: is ignored, not an error',
  (select count(*) from public.creators_list(p_sort => 'match:not-a-uuid', p_limit => 5)) = 5);

select tests.check('all tests of this file ran', (select count(*) from tests.results) >= 24);
do $$ begin
  if exists (select 1 from tests.results where not ok) then
    raise exception 'FAILED: %', (select string_agg(name, '; ') from tests.results where not ok);
  end if;
  raise notice 'matching.sql: % checks passed', (select count(*) from tests.results);
end $$;
rollback;
