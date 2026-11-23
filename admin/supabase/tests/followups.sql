-- Tests for migration 20261123000400 (follow-ups): channel link rule, login / reset limits, log_audit export,
-- email address match, manual suppression lift. Everything is rolled back.
\set ON_ERROR_STOP on
begin;
create schema tests;
create table tests.results (name text, ok boolean);
create function tests.check(p_name text, p_ok boolean) returns void language plpgsql as $$
begin insert into tests.results values (p_name, coalesce(p_ok, false)); raise notice '% %', case when coalesce(p_ok,false) then 'PASS' else 'FAIL' end, p_name; end $$;
-- Run p_sql as p_role (JWT sub = p_uid): ok, rows touched (-1 on error), error text.
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
-- one text value as p_role (null on error)
create function tests.text_as(p_role text, p_uid uuid, p_sql text) returns text language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claims', case when p_uid is null then json_build_object('role', p_role)::text
                                                else json_build_object('sub', p_uid, 'role', p_role)::text end, true);
  execute format('set local role %I', p_role);
  begin execute p_sql into v; exception when others then v := null; end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  return v;
end $$;
-- Run an action in its OWN statement and remember the result: a check that runs an update and reads the
-- table in one statement would not see the update. tests.n('x') / tests.ok('x') read it back.
create table tests.acts (label text primary key, ok boolean, n bigint, err text);
create function tests.act(p_label text, p_role text, p_uid uuid, p_sql text) returns void language plpgsql as $$
begin insert into tests.acts select p_label, r.ok, r.n, r.err from tests.run_as(p_role, p_uid, p_sql) r; end $$;
create function tests.n(p_label text) returns bigint language sql as $$ select n from tests.acts where label = p_label $$;
create function tests.ok(p_label text) returns boolean language sql as $$ select ok from tests.acts where label = p_label $$;
-- time-travel helper: runs as postgres with the email guard switched off for one statement
create function tests.age_email(p_id uuid, p_interval interval) returns void language plpgsql as $$
begin
  alter table public.emails disable trigger trg_guard;
  update public.emails set updated_at = now() - p_interval where id = p_id;
  alter table public.emails enable trigger trg_guard;
end $$;

create temp table ids as select (select id from public.profiles where email = 'owner@example.test') as o,
                                (select id from public.profiles where email = 'worker@example.test') as w;
grant select on ids to public;
delete from auth.mfa_factors;   -- live data may hold real enrolments; start clean (rolled back)

-- fixtures
insert into public.creators (id, full_name, email, status) values
  ('00000000-0000-0000-0000-00000000fb01', 'ZZ AUDIT fr one', 'zz-fr1@example.test', 'contacted'),
  ('00000000-0000-0000-0000-00000000fb02', 'ZZ AUDIT fr two', 'zz-fr2@example.test', 'contacted');

-- ================================================================== SEC2-06 channel link
select tests.check('SEC2-06: https YouTube links in any case pass; http, other hosts and javascript: are refused',
  (tests.run_as('authenticated', (select w from ids), $q$update public.creators set channel_url = 'https://www.youtube.com/@x' where id = '00000000-0000-0000-0000-00000000fb01'$q$)).ok
  and (tests.run_as('authenticated', (select w from ids), $q$update public.creators set channel_url = 'HTTPS://M.YouTube.com/@x' where id = '00000000-0000-0000-0000-00000000fb01'$q$)).ok
  and (tests.run_as('authenticated', (select w from ids), $q$update public.creators set channel_url = null where id = '00000000-0000-0000-0000-00000000fb01'$q$)).ok
  and not (tests.run_as('authenticated', (select w from ids), $q$update public.creators set channel_url = 'http://youtube.com/@x' where id = '00000000-0000-0000-0000-00000000fb01'$q$)).ok
  and not (tests.run_as('authenticated', (select w from ids), $q$update public.creators set channel_url = 'https://evil.example/youtube.com/' where id = '00000000-0000-0000-0000-00000000fb01'$q$)).ok
  and not (tests.run_as('authenticated', (select w from ids), $q$update public.creators set channel_url = 'https://youtube.com.evil.example/' where id = '00000000-0000-0000-0000-00000000fb01'$q$)).ok
  and not (tests.run_as('authenticated', (select w from ids), $q$update public.creators set channel_url = 'javascript:alert(1)' where id = '00000000-0000-0000-0000-00000000fb01'$q$)).ok);

-- ================================================================== SEC2-01 login / reset limits
insert into public.login_attempts (email, ip, success, created_at) values ('zz-fr-owner@example.test', '10.88.9.1', true, now() - interval '20 days');
insert into public.login_attempts (email, ip, success)
  select 'zz-fr-owner@example.test', '10.88.9.' || (10 + g), false from generate_series(1, 22) g;
select tests.check('SEC2-01: 22 failures from other IPs block a stranger but not the place that logged in within 30 days',
  tests.text_as('service_role', null, $q$select public.login_allowed('zz-fr-owner@example.test', '10.88.9.99')::text$q$) = 'false'
  and tests.text_as('service_role', null, $q$select public.login_allowed('zz-fr-owner@example.test', '10.88.9.1')::text$q$) = 'true');
insert into public.login_attempts (email, ip, success, created_at) values ('zz-fr-old@example.test', '10.88.9.2', true, now() - interval '40 days');
insert into public.login_attempts (email, ip, success)
  select 'zz-fr-old@example.test', '10.88.9.' || (50 + g), false from generate_series(1, 20) g;
select tests.check('SEC2-01: a success older than 30 days does not help',
  tests.text_as('service_role', null, $q$select public.login_allowed('zz-fr-old@example.test', '10.88.9.2')::text$q$) = 'false');
select tests.check('SEC2-01: login attempts are kept longer than 30 days',
  pg_get_functiondef('public.record_login_attempt(text,text,boolean)'::regprocedure) like '%35 days%');

insert into public.reset_requests (email, ip) values ('zz-fr-r1@example.test', '10.88.9.200'), ('zz-fr-r1@example.test', '10.88.9.200');
select tests.check('SEC2-01: reset 2 of 3 per (email, IP) still allowed',
  tests.text_as('service_role', null, $q$select public.reset_allowed('zz-fr-r1@example.test', '10.88.9.200')::text$q$) = 'true');
insert into public.reset_requests (email, ip) values ('zz-fr-r1@example.test', '10.88.9.200');
select tests.check('SEC2-01: the 4th reset from the same pair is refused, another IP still works',
  tests.text_as('service_role', null, $q$select public.reset_allowed('zz-fr-r1@example.test', '10.88.9.200')::text$q$) = 'false'
  and tests.text_as('service_role', null, $q$select public.reset_allowed('zz-fr-r1@example.test', '10.88.9.201')::text$q$) = 'true');
insert into public.reset_requests (email, ip) select 'zz-fr-r2@example.test', '10.88.9.' || (100 + g) from generate_series(1, 10) g;
select tests.check('SEC2-01: 10 resets an hour for one address from all places together are the cap',
  tests.text_as('service_role', null, $q$select public.reset_allowed('zz-fr-r2@example.test', '10.88.9.250')::text$q$) = 'false'
  and tests.text_as('service_role', null, $q$select public.reset_allowed('zz-fr-r3@example.test', '10.88.9.250')::text$q$) = 'true');
insert into public.reset_requests (email, ip) select 'zz-fr-r4@example.test' || g, '10.88.9.230' from generate_series(1, 3) g;
select tests.check('SEC2-01: 3 resets an hour from one IP for any address are still the IP cap',
  tests.text_as('service_role', null, $q$select public.reset_allowed('zz-fr-r5@example.test', '10.88.9.230')::text$q$) = 'false');

-- ================================================================== SEC2-02 export audit line
select tests.check('SEC2-02: a worker cannot write creators.exported; the owner can; a worker can write creators.imported',
  not (tests.run_as('authenticated', (select w from ids), $q$select public.log_audit('creators.exported')$q$)).ok
  and (tests.run_as('authenticated', (select o from ids), $q$select public.log_audit('creators.exported')$q$)).ok
  and (tests.run_as('authenticated', (select w from ids), $q$select public.log_audit('creators.imported')$q$)).ok);

-- ================================================================== SEC2-05 to_email must match the creator
select tests.check('SEC2-05: a worker draft to the creator address passes; to another address it is refused',
  (tests.run_as('authenticated', (select w from ids), $q$insert into public.emails (creator_id, to_email, subject, body) values ('00000000-0000-0000-0000-00000000fb01', 'ZZ-FR1@example.test', 's', 'b')$q$)).ok
  and not (tests.run_as('authenticated', (select w from ids), $q$insert into public.emails (creator_id, to_email, subject, body) values ('00000000-0000-0000-0000-00000000fb01', 'zz-elsewhere@example.test', 's', 'b')$q$)).ok);
select tests.check('SEC2-05: changing a draft to another address, or to another creator without the matching address, is refused',
  not (tests.run_as('authenticated', (select w from ids), $q$update public.emails set to_email = 'zz-elsewhere@example.test' where creator_id = '00000000-0000-0000-0000-00000000fb01'$q$)).ok
  and not (tests.run_as('authenticated', (select w from ids), $q$update public.emails set creator_id = '00000000-0000-0000-0000-00000000fb02' where creator_id = '00000000-0000-0000-0000-00000000fb01'$q$)).ok
  and (tests.run_as('authenticated', (select w from ids), $q$update public.emails set subject = 'new' where creator_id = '00000000-0000-0000-0000-00000000fb01'$q$)).ok);
select tests.check('SEC2-05: the service role is not held to the rule (drafting by the server, tests)',
  (tests.run_as('service_role', null, $q$insert into public.emails (creator_id, to_email, subject, body) values ('00000000-0000-0000-0000-00000000fb01', 'zz-fr1@example.test', 's', 'b')$q$)).ok);

-- ================================================================== SEC2-08 lifting do_not_contact
update public.creators set status = 'do_not_contact' where id = '00000000-0000-0000-0000-00000000fb02';
-- the owner changes the address and lifts the status in one save; the manual row of the NEW address may also exist
insert into public.suppression_list (email, reason) values ('zz-fr2b@example.test', 'manual') on conflict do nothing;
select tests.check('SEC2-08 setup: both addresses carry a manual row',
  (select count(*) from public.suppression_list where email in ('zz-fr2@example.test', 'zz-fr2b@example.test') and reason = 'manual') = 2);
select tests.act('fr_lift', 'authenticated', (select o from ids), $q$update public.creators set status = 'contacted', email = 'zz-fr2b@example.test' where id = '00000000-0000-0000-0000-00000000fb02'$q$);
select tests.check('SEC2-08: lifting do_not_contact removes the manual rows of the old and the new address',
  tests.ok('fr_lift') and not exists (select 1 from public.suppression_list where email in ('zz-fr2@example.test', 'zz-fr2b@example.test')));
insert into public.suppression_list (email, reason) values ('zz-fr2@example.test', 'link');
update public.creators set status = 'do_not_contact' where id = '00000000-0000-0000-0000-00000000fb02';
select tests.act('fr_lift2', 'authenticated', (select o from ids), $q$update public.creators set status = 'contacted' where id = '00000000-0000-0000-0000-00000000fb02'$q$);
select tests.check('SEC2-08: a real opt-out (reason link) is never removed',
  exists (select 1 from public.suppression_list where email = 'zz-fr2@example.test' and reason = 'link'));

do $$ declare f int; begin select count(*) filter (where not ok) into f from tests.results;
  raise notice '% checks, % failed', (select count(*) from tests.results), f;
  if f > 0 then raise exception 'followups tests failed: %', (select string_agg(name, '; ') from tests.results where not ok); end if; end $$;
rollback;
