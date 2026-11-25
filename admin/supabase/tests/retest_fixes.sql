-- Tests for migration 20261125001200 (re-test fixes): SR-05 (note compared trimmed and lower-cased), SR-18 (email characters),
-- the export audit line without the search text, and SR-15 (brands.imported only through record_brand_import).
-- Everything is rolled back.
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
create function tests.rows_as(p_role text, p_uid uuid, p_sql text) returns bigint language sql as
$$ select (tests.run_as(p_role, p_uid, p_sql)).n $$;
-- Run an action in its OWN statement and remember the result (a check that acts and reads in one statement would not see it).
create table tests.acts (label text primary key, ok boolean, n bigint, err text);
create function tests.act(p_label text, p_role text, p_uid uuid, p_sql text) returns void language plpgsql as $$
begin insert into tests.acts select p_label, r.ok, r.n, r.err from tests.run_as(p_role, p_uid, p_sql) r; end $$;
create function tests.n(p_label text) returns bigint language sql as $$ select n from tests.acts where label = p_label $$;
create function tests.ok(p_label text) returns boolean language sql as $$ select ok from tests.acts where label = p_label $$;
create function tests.err(p_label text) returns text language sql as $$ select err from tests.acts where label = p_label $$;

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
delete from auth.mfa_factors;
update public.settings set daily_send_limit = 100, min_seconds_between_sends = 0, test_mode = true, test_email = 'owner@example.test';


-- fixtures. Ids use hex only (prefix e).
insert into public.creators (id, full_name, email, status, subscribers) values
  ('00000000-0000-0000-0000-0000000e0a01', 'ZZ RT creator one', 'zz-rt-c1@example.test', 'new', 5000);
insert into public.brands (id, name, relationship) values
  ('00000000-0000-0000-0000-0000000e0b01', 'ZZ RT sponsor one', 'prospect');
insert into public.sponsorships (id, creator_id, brand_id, sponsored_on, source_label, origin, detection_signal, detection_confidence, evidence_note) values
  ('00000000-0000-0000-0000-0000000e5001', '00000000-0000-0000-0000-0000000e0a01', '00000000-0000-0000-0000-0000000e0b01', current_date - 9, 'detected', 'detected', 'sponsored_by', 'high', 'Scanner note here');

-- ================================================================== SR-05 the note must be new
select tests.act('n_space', 'authenticated', (select w from ids), $q$update public.sponsorships set source_label = 'confirmed', evidence_note = 'Scanner note here ' where id = '00000000-0000-0000-0000-0000000e5001'$q$);
select tests.act('n_case', 'authenticated', (select w from ids), $q$update public.sponsorships set source_label = 'confirmed', evidence_note = 'SCANNER NOTE HERE' where id = '00000000-0000-0000-0000-0000000e5001'$q$);
select tests.act('n_lead', 'authenticated', (select w from ids), $q$update public.sponsorships set source_label = 'confirmed', evidence_note = E'  \n scanner note here' where id = '00000000-0000-0000-0000-0000000e5001'$q$);
select tests.check('SR-05: the old note with an extra space, other letter case or leading spaces is refused',
  not tests.ok('n_space') and not tests.ok('n_case') and not tests.ok('n_lead')
  and (select source_label = 'detected' from public.sponsorships where id = '00000000-0000-0000-0000-0000000e5001'));
select tests.act('n_short', 'authenticated', (select w from ids), $q$update public.sponsorships set source_label = 'confirmed', evidence_note = ' a b ' where id = '00000000-0000-0000-0000-0000000e5001'$q$);
select tests.act('n_short4', 'authenticated', (select w from ids), $q$update public.sponsorships set source_label = 'confirmed', evidence_note = 'ok ok' where id = '00000000-0000-0000-0000-0000000e5001'$q$);
select tests.check('SR-05: a note with fewer than 5 characters that are not spaces is refused',
  not tests.ok('n_short') and not tests.ok('n_short4')
  and (select source_label = 'detected' from public.sponsorships where id = '00000000-0000-0000-0000-0000000e5001'));
select tests.act('n_ok', 'authenticated', (select w from ids), $q$update public.sponsorships set source_label = 'confirmed', evidence_note = 'Saw it' where id = '00000000-0000-0000-0000-0000000e5001'$q$);
select tests.check('SR-05: a real new note of 5 or more characters works',
  tests.ok('n_ok') and (select source_label = 'confirmed' and confirmed_by = (select w from ids) from public.sponsorships where id = '00000000-0000-0000-0000-0000000e5001'));

-- ================================================================== SR-18 contact email characters
select tests.check('SR-18: the email check is on and validated', (select convalidated from pg_constraint where conname = 'brand_contacts_email_chars'));
select tests.act('e_q', 'authenticated', (select w from ids), $q$insert into public.brand_contacts (brand_id, full_name, email) values ('00000000-0000-0000-0000-0000000e0b01', 'ZZ RT q', 'zz?cc=x@example.test')$q$);
select tests.act('e_amp', 'authenticated', (select w from ids), $q$insert into public.brand_contacts (brand_id, full_name, email) values ('00000000-0000-0000-0000-0000000e0b01', 'ZZ RT amp', 'zz&x@example.test')$q$);
select tests.act('e_pct', 'authenticated', (select w from ids), $q$insert into public.brand_contacts (brand_id, full_name, email) values ('00000000-0000-0000-0000-0000000e0b01', 'ZZ RT pct', 'zz%40x@example.test')$q$);
select tests.act('e_sp', 'authenticated', (select w from ids), $q$insert into public.brand_contacts (brand_id, full_name, email) values ('00000000-0000-0000-0000-0000000e0b01', 'ZZ RT sp', 'zz x@example.test')$q$);
select tests.act('e_nl', 'authenticated', (select w from ids), $q$insert into public.brand_contacts (brand_id, full_name, email) values ('00000000-0000-0000-0000-0000000e0b01', 'ZZ RT nl', E'zz\nx@example.test')$q$);
select tests.act('e_ok', 'authenticated', (select w from ids), $q$insert into public.brand_contacts (brand_id, full_name, email) values ('00000000-0000-0000-0000-0000000e0b01', 'ZZ RT ok', 'zz.ok+tag@example.test')$q$);
select tests.act('e_null', 'authenticated', (select w from ids), $q$insert into public.brand_contacts (brand_id, full_name) values ('00000000-0000-0000-0000-0000000e0b01', 'ZZ RT none')$q$);
select tests.act('e_upd', 'authenticated', (select w from ids), $q$update public.brand_contacts set email = 'zz?x@example.test' where full_name = 'ZZ RT ok'$q$);
select tests.check('SR-18: ?, &, %, a space and a line break are refused in a contact address; a normal address and no address work',
  not tests.ok('e_q') and not tests.ok('e_amp') and not tests.ok('e_pct') and not tests.ok('e_sp') and not tests.ok('e_nl')
  and tests.ok('e_ok') and tests.ok('e_null') and not tests.ok('e_upd'));

-- ================================================================== Export audit lines: no search text
create temp table mark as select coalesce(max(id), 0) as m from public.audit_log;
grant select on mark to public;
select tests.act('x_c', 'authenticated', (select o from ids), $q$select * from public.creators_export(p_q => 'zz-secret-search@example.test', p_subs_min => 100)$q$);
select tests.act('x_s', 'authenticated', (select o from ids), $q$select * from public.sponsors_export('{"q": "zz secret sponsor search", "industry": ["Audio"]}'::jsonb)$q$);
select tests.act('x_c2', 'authenticated', (select o from ids), $q$select * from public.creators_export()$q$);
select tests.check('Export audit: the creators line says a search text was used ("q": true) and holds neither the text nor an address; other filters stay',
  tests.ok('x_c')
  and (select details #> '{filters}' is not null and (details ->> 'filters')::jsonb ->> 'q' = 'true' and (details ->> 'filters')::jsonb ->> 'subs_min' = '100'
              and details::text not like '%secret%' and details::text not like '%@%'
        from public.audit_log where id > (select m from mark) and action = 'creators.exported' order by id limit 1));
select tests.check('Export audit: the sponsors line says a search text was used and keeps the other filter keys',
  tests.ok('x_s')
  and (select (details ->> 'filters')::jsonb ->> 'q' = 'true' and (details ->> 'filters')::jsonb ? 'industry' and details::text not like '%secret%'
        from public.audit_log where id > (select m from mark) and action = 'brands.exported' order by id limit 1));
select tests.check('Export audit: no search text means no "q" key',
  tests.ok('x_c2') and (select not ((details ->> 'filters')::jsonb ? 'q') from public.audit_log where id > (select m from mark) and action = 'creators.exported' order by id desc limit 1));

-- ================================================================== SR-15 brands.imported only through record_brand_import
select tests.act('i_direct', 'authenticated', (select w from ids), $q$select public.log_audit('brands.imported', null, null, '{"count": 999}')$q$);
select tests.act('i_direct_o', 'authenticated', (select o from ids), $q$select public.log_audit('brands.imported', null, null, '{"count": 999}')$q$);
select tests.act('i_spons', 'authenticated', (select w from ids), $q$select public.log_audit('sponsorships.imported', null, null, '{"count": 3}')$q$);
select tests.check('SR-15: staff cannot write brands.imported (owner included) or sponsorships.imported through log_audit',
  not tests.ok('i_direct') and not tests.ok('i_direct_o') and not tests.ok('i_spons'));
select tests.act('i_pad', 'authenticated', (select w from ids), $q$select public.record_brand_import(500)$q$);
select tests.act('i_neg', 'authenticated', (select w from ids), $q$select public.record_brand_import(-1)$q$);
select tests.act('i_anon', 'anon', null, $q$select public.record_brand_import(0)$q$);
select tests.act('i_svc', 'service_role', null, $q$select public.record_brand_import(0)$q$);
select tests.check('SR-15: record_brand_import refuses a count the new sponsors do not back up, a negative count, anon and the service role',
  not tests.ok('i_pad') and not tests.ok('i_neg') and not tests.ok('i_anon') and not tests.ok('i_svc')
  and not exists (select 1 from public.audit_log where id > (select m from mark) and action = 'brands.imported'));
insert into public.brands (name) select 'ZZ RT import ' || g from generate_series(1, 3) g;
select tests.act('i_ok', 'authenticated', (select w from ids), $q$select public.record_brand_import(3, 1, 2, 0, false)$q$);
select tests.act('i_over', 'authenticated', (select w from ids), $q$select public.record_brand_import(100)$q$);
select tests.check('SR-15: a real import (3 new sponsors just created) is recorded once, with the numbers and the person; a bigger count is still refused',
  tests.ok('i_ok') and not tests.ok('i_over')
  and (select count(*) = 1 from public.audit_log where id > (select m from mark) and action = 'brands.imported')
  and (select (details ->> 'count')::int = 3 and (details ->> 'contacts')::int = 1 and (details ->> 'duplicates')::int = 2 and actor_id = (select w from ids)
        from public.audit_log where id > (select m from mark) and action = 'brands.imported'));
select tests.act('i_zero', 'authenticated', (select w from ids), $q$select public.record_brand_import(0, 0, 5, 0, false)$q$);
select tests.check('SR-15: an import that added nothing (all duplicates) can still be recorded', tests.ok('i_zero'));

do $$ declare f int; begin select count(*) filter (where not ok) into f from tests.results;
  raise notice '% checks, % failed', (select count(*) from tests.results), f;
  if f > 0 then raise exception 'retest_fixes tests failed: %', (select string_agg(name, '; ') from tests.results where not ok); end if; end $$;
rollback;
