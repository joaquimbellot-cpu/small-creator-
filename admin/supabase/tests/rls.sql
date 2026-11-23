-- RLS, grants, guard functions and audit tests. Run against the seeded local stack:
--   admin/supabase/tests/run.sh       (psql -v ON_ERROR_STOP=1 -f rls.sql)
-- Everything happens inside one transaction that is rolled back, so the database is unchanged.
-- Roles are switched with SET LOCAL ROLE plus request.jwt.claims, exactly what PostgREST does.
\set ON_ERROR_STOP on
begin;

create schema tests;
create table tests.results (name text, ok boolean);

create function tests.check(p_name text, p_ok boolean) returns void language plpgsql as $$
begin
  insert into tests.results values (p_name, coalesce(p_ok, false));
  raise notice '% %', case when coalesce(p_ok, false) then 'PASS' else 'FAIL' end, p_name;
end $$;

-- Run one statement as <role> (with JWT sub = uid). Returns ok, rows touched (-1 on error), error text.
create function tests.run_as(p_role text, p_uid uuid, p_sql text, out ok boolean, out n bigint, out err text)
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    case when p_uid is null then json_build_object('role', p_role)::text
         else json_build_object('sub', p_uid, 'role', p_role)::text end, true);
  execute format('set local role %I', p_role);
  begin
    execute p_sql;
    get diagnostics n = row_count;
    ok := true;
  exception when others then
    ok := false; n := -1; err := sqlerrm;
  end;
  reset role;
end $$;

-- Rows the role can see (-1 = permission denied).
create function tests.rows_as(p_role text, p_uid uuid, p_sql text) returns bigint language sql as
$$ select (tests.run_as(p_role, p_uid, p_sql)).n $$;

-- Run a statement returning one jsonb value as <role>.
create function tests.json_as(p_role text, p_uid uuid, p_sql text) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', p_role)::text, true);
  execute format('set local role %I', p_role);
  begin
    execute p_sql into v;
  exception when others then
    v := jsonb_build_object('error', sqlerrm);
  end;
  reset role;
  return v;
end $$;

-- ------------------------------------------------------------------ fixtures
create temp table ids as
select (select id from public.profiles where email = 'owner@example.test')  as owner_id,
       (select id from public.profiles where email = 'worker@example.test') as worker_id,
       gen_random_uuid() as norole_id;
grant select on ids to public;
delete from auth.mfa_factors;   -- live data may hold real enrolments; start clean (rolled back)
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select norole_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'norole@example.test', '{}', '{}', now(), now() from ids;

-- ================================================================== profiles trigger
select tests.check('profile created from auth.users with no role -> role null',
  (select role is null from public.profiles where email = 'norole@example.test'));
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bad-role@example.test', '{"role":"god"}', now(), now()),
       ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'w2@example.test', '{"role":"worker"}', now(), now());
select tests.check('invalid app_metadata role -> role null, no error',
  (select role is null from public.profiles where email = 'bad-role@example.test'));
select tests.check('app_metadata role worker -> profile worker',
  (select role = 'worker' from public.profiles where email = 'w2@example.test'));
update auth.users set raw_app_meta_data = '{"role":"owner"}' where email = 'bad-role@example.test';
select tests.check('invite flow: role set later is applied while profile has none',
  (select role = 'owner' from public.profiles where email = 'bad-role@example.test'));
update auth.users set raw_app_meta_data = '{"role":"worker"}' where email = 'bad-role@example.test';
select tests.check('invite flow: a later app_metadata change does not override an existing role',
  (select role = 'owner' from public.profiles where email = 'bad-role@example.test'));
delete from auth.users where email in ('bad-role@example.test', 'w2@example.test');

-- ================================================================== anon: nothing at all
select tests.check('anon: every public table/view is denied (' || count(*) || ' relations)',
  count(*) > 0 and bool_and(not (tests.run_as('anon', null, 'select * from public.' || quote_ident(c.relname))).ok))
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'v', 'p', 'm');

select tests.check('anon: no privilege of any kind on any public table, view or sequence',
  not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace,
              lateral aclexplode(coalesce(c.relacl, acldefault((case when c.relkind = 'S' then 's' else 'r' end)::"char", c.relowner))) a
              where n.nspname = 'public' and c.relkind in ('r', 'v', 'p', 'm', 'S')
                and a.grantee in (0, (select oid from pg_roles where rolname = 'anon'))));

select tests.check('anon: cannot execute any public function; PUBLIC has no execute either',
  not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace,
              lateral aclexplode(coalesce(p.proacl, acldefault('f'::"char", p.proowner))) a
              where n.nspname = 'public' and p.prokind in ('f', 'p')
                and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
                and a.privilege_type = 'EXECUTE'
                and a.grantee in (0, (select oid from pg_roles where rolname = 'anon'))));

select tests.check('anon: stats_overview denied', not (tests.run_as('anon', null, 'select public.stats_overview()')).ok);
select tests.check('anon: reserve_send denied', not (tests.run_as('anon', null, 'select public.reserve_send(gen_random_uuid(), gen_random_uuid())')).ok);
select tests.check('anon: insert into creators denied', not (tests.run_as('anon', null, $q$insert into public.creators (full_name, email) values ('x','x@example.test')$q$)).ok);
select tests.check('anon: opt_out / login_allowed / bootstrap_owner denied',
  not (tests.run_as('anon', null, $q$select public.opt_out('a@example.test')$q$)).ok
  and not (tests.run_as('anon', null, $q$select public.login_allowed('a@example.test','1.1.1.1')$q$)).ok
  and not (tests.run_as('anon', null, $q$select public.bootstrap_owner('a@example.test')$q$)).ok);

-- ================================================================== signed in, but no role
select tests.check('no-role user: reads zero rows from every table and view',
  bool_and(tests.rows_as('authenticated', (select norole_id from ids), 'select * from public.' || quote_ident(c.relname)) <= 0))
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'v', 'p');
select tests.check('no-role user: cannot insert a creator',
  tests.rows_as('authenticated', (select norole_id from ids), $q$insert into public.creators (full_name, email) values ('x','nr@example.test')$q$) <= 0);
select tests.check('no-role user: stats_overview, log_audit denied',
  not (tests.run_as('authenticated', (select norole_id from ids), 'select public.stats_overview()')).ok
  and not (tests.run_as('authenticated', (select norole_id from ids), $q$select public.log_audit('x')$q$)).ok);
select tests.check('no-role user: cannot call reserve_send at all',
  not (tests.run_as('authenticated', (select norole_id from ids), 'select public.reserve_send(gen_random_uuid(), gen_random_uuid())')).ok);
select tests.check('no-role user: is_staff() false',
  tests.json_as('authenticated', (select norole_id from ids), 'select to_jsonb(public.is_staff())') = 'false');
select tests.check('authenticated cannot call service-only functions',
  not (tests.run_as('authenticated', (select worker_id from ids), $q$select public.opt_out('a@example.test')$q$)).ok
  and not (tests.run_as('authenticated', (select owner_id from ids), $q$select public.bootstrap_owner('a@example.test')$q$)).ok
  and not (tests.run_as('authenticated', (select owner_id from ids), $q$select public.login_allowed('a@example.test','1.1.1.1')$q$)).ok
  and not (tests.run_as('authenticated', (select owner_id from ids), $q$select public.record_login_attempt('a@example.test','1.1.1.1',false)$q$)).ok);
select tests.check('authenticated cannot read login_attempts (even the owner)',
  tests.rows_as('authenticated', (select owner_id from ids), 'select * from public.login_attempts') <= 0);

-- ================================================================== worker
select tests.check('worker: reads all 60 creators',  tests.rows_as('authenticated', (select worker_id from ids), 'select * from public.creators') = 60);
select tests.check('worker: reads creator_summaries (60)', tests.rows_as('authenticated', (select worker_id from ids), 'select * from public.creator_summaries') = 60);
select tests.check('worker: reads brands, deals, templates, emails, suppression, settings',
  tests.rows_as('authenticated', (select worker_id from ids), 'select * from public.brands') = 10
  and tests.rows_as('authenticated', (select worker_id from ids), 'select * from public.deals') = 15
  and tests.rows_as('authenticated', (select worker_id from ids), 'select * from public.email_templates') = 3
  and tests.rows_as('authenticated', (select worker_id from ids), 'select * from public.emails') = 40
  and tests.rows_as('authenticated', (select worker_id from ids), 'select * from public.suppression_list') = 2
  and tests.rows_as('authenticated', (select worker_id from ids), 'select * from public.settings') = 1);
select tests.check('worker: can edit a creator',
  tests.rows_as('authenticated', (select worker_id from ids), $q$update public.creators set notes = 'edited by worker' where full_name like 'Maya%'$q$) >= 1);
select tests.check('worker: can add a creator, brand, template, deal',
  tests.rows_as('authenticated', (select worker_id from ids), $q$insert into public.creators (full_name, email) values ('Test Worker Add','worker-add@example.test')$q$) = 1
  and tests.rows_as('authenticated', (select worker_id from ids), $q$insert into public.brands (name) values ('Worker Brand')$q$) = 1
  and tests.rows_as('authenticated', (select worker_id from ids), $q$insert into public.email_templates (name, subject, body) values ('t','s','b')$q$) = 1
  and tests.rows_as('authenticated', (select worker_id from ids), $q$insert into public.deals (creator_id, brand_id, amount_cents) select c.id, b.id, 100000 from public.creators c, public.brands b where c.email = 'worker-add@example.test' and b.name = 'Worker Brand'$q$) = 1);
select tests.check('worker: created_by defaults to the worker',
  (select created_by = (select worker_id from ids) from public.creators where email = 'worker-add@example.test'));
select tests.check('worker: cannot delete creators, brands, deals, templates',
  tests.rows_as('authenticated', (select worker_id from ids), $q$delete from public.creators where email = 'worker-add@example.test'$q$) <= 0
  and tests.rows_as('authenticated', (select worker_id from ids), $q$delete from public.brands where name = 'Worker Brand'$q$) <= 0
  and tests.rows_as('authenticated', (select worker_id from ids), $q$delete from public.deals$q$) <= 0
  and tests.rows_as('authenticated', (select worker_id from ids), $q$delete from public.email_templates$q$) <= 0);
select tests.check('worker: nothing was deleted', (select count(*) from public.creators) = 61 and (select count(*) from public.deals) = 16);
select tests.check('worker: cannot update settings',
  tests.rows_as('authenticated', (select worker_id from ids), $q$update public.settings set daily_send_limit = 999$q$) <= 0
  and (select daily_send_limit from public.settings) = 30);
select tests.check('worker: cannot read audit_log', tests.rows_as('authenticated', (select worker_id from ids), 'select * from public.audit_log') <= 0);
select tests.check('worker: cannot insert into audit_log directly',
  tests.rows_as('authenticated', (select worker_id from ids), $q$insert into public.audit_log (action) values ('forged')$q$) <= 0);
select tests.check('worker: cannot change roles or reactivate (own or others)',
  tests.rows_as('authenticated', (select worker_id from ids), $q$update public.profiles set role = 'owner'$q$) <= 0
  and tests.rows_as('authenticated', (select worker_id from ids), $q$update public.profiles set is_active = false$q$) <= 0
  and (select role from public.profiles where email = 'worker@example.test') = 'worker');
select tests.check('worker: cannot delete suppression entries',
  tests.rows_as('authenticated', (select worker_id from ids), 'delete from public.suppression_list') <= 0);
select tests.rows_as('authenticated', (select worker_id from ids), $q$insert into public.suppression_list (email, reason) values ('worker-add@example.test', 'test')$q$) as m \gset
select tests.check('worker: can add a suppression entry (and the creator flips to do_not_contact)',
  :m = 1 and (select status = 'do_not_contact' from public.creators where email = 'worker-add@example.test'));
select tests.check('worker: can read stats_overview', tests.json_as('authenticated', (select worker_id from ids), 'select public.stats_overview()') ? 'total_creators');
select tests.json_as('authenticated', (select worker_id from ids), $q$select to_jsonb(public.log_audit('creator.viewed','creator','abc','{"label":"x"}'))$q$) as m \gset
select tests.check('worker: can write an audit line through log_audit',
  :'m' <> 'null' and :'m' not like '%error%'
  and exists (select 1 from public.audit_log where action = 'creator.viewed' and actor_id = (select worker_id from ids)));

-- ================================================================== owner
select tests.check('owner: reads audit_log', tests.rows_as('authenticated', (select owner_id from ids), 'select * from public.audit_log') > 0);
select tests.check('owner: reads all profiles', tests.rows_as('authenticated', (select owner_id from ids), 'select * from public.profiles') >= 2);
select tests.check('owner: delete of a creator that has deals is refused by the database',
  not (tests.run_as('authenticated', (select owner_id from ids), $q$delete from public.creators where email = 'worker-add@example.test'$q$)).ok);
select tests.check('owner: deletes deal, brand, template, then the creator',
  tests.rows_as('authenticated', (select owner_id from ids), $q$delete from public.deals where created_by = (select id from public.profiles where email = 'worker@example.test')$q$) >= 1
  and tests.rows_as('authenticated', (select owner_id from ids), $q$delete from public.brands where name = 'Worker Brand'$q$) = 1
  and tests.rows_as('authenticated', (select owner_id from ids), $q$delete from public.email_templates where name = 't'$q$) = 1
  and tests.rows_as('authenticated', (select owner_id from ids), $q$delete from public.creators where email = 'worker-add@example.test'$q$) = 1);
select tests.rows_as('authenticated', (select owner_id from ids), $q$update public.settings set daily_send_limit = 31$q$) as m \gset
select tests.check('owner: updates settings (and it is logged)',
  :m = 1 and exists (select 1 from public.audit_log where action = 'settings.updated' and actor_id = (select owner_id from ids)
              and details #>> '{changes,daily_send_limit,to}' = '31'));
select tests.check('owner: bad time zone / test email rejected',
  not (tests.run_as('authenticated', (select owner_id from ids), $q$update public.settings set timezone = 'Mars/Base'$q$)).ok
  and not (tests.run_as('authenticated', (select owner_id from ids), $q$update public.settings set test_email = 'nope'$q$)).ok);
select tests.check('owner: the last active owner cannot demote or deactivate themselves',
  not (tests.run_as('authenticated', (select owner_id from ids), $q$update public.profiles set role = 'worker' where email = 'owner@example.test'$q$)).ok
  and not (tests.run_as('authenticated', (select owner_id from ids), $q$update public.profiles set is_active = false where email = 'owner@example.test'$q$)).ok
  and (select role = 'owner' and is_active from public.profiles where email = 'owner@example.test'));
select tests.check('last owner cannot be deleted (even by deleting the auth user)',
  not (tests.run_as('postgres', null, $q$delete from auth.users where email = 'owner@example.test'$q$)).ok);
select tests.rows_as('authenticated', (select owner_id from ids), $q$update public.profiles set role = 'owner' where email = 'norole@example.test'$q$) as m \gset
select tests.check('owner: can change a role and the change is logged',
  :m = 1 and exists (select 1 from public.audit_log where action = 'profile.role_changed' and entity_id = (select norole_id::text from ids)));
select tests.check('with a second owner, the first may step down',
  tests.rows_as('authenticated', (select owner_id from ids), $q$update public.profiles set role = 'worker' where email = 'owner@example.test'$q$) = 1);
update public.profiles set role = 'owner' where email = 'owner@example.test';   -- superuser put-back
select tests.check('owner can deactivate a worker; the worker then reads nothing',
  tests.rows_as('authenticated', (select owner_id from ids), $q$update public.profiles set is_active = false where email = 'worker@example.test'$q$) = 1
  and tests.rows_as('authenticated', (select worker_id from ids), 'select * from public.creators') <= 0
  and not (tests.run_as('authenticated', (select worker_id from ids), 'select public.stats_overview()')).ok);
update public.profiles set is_active = true where email = 'worker@example.test';
select tests.check('owner: removes a suppression entry',
  tests.rows_as('authenticated', (select owner_id from ids), $q$delete from public.suppression_list where email = 'removed.sample@example.test'$q$) = 1);

-- ================================================================== audit log is append-only
select tests.check('audit_log: owner cannot update or delete',
  tests.rows_as('authenticated', (select owner_id from ids), $q$update public.audit_log set action = 'x'$q$) <= 0
  and tests.rows_as('authenticated', (select owner_id from ids), 'delete from public.audit_log') <= 0);
select tests.check('audit_log: no UPDATE/DELETE/TRUNCATE privilege for anon, authenticated, service_role',
  not exists (select 1 from unnest(array['anon','authenticated','service_role']) r, unnest(array['UPDATE','DELETE','TRUNCATE']) p
              where has_table_privilege(r, 'public.audit_log', p)));
select tests.check('audit_log: even the superuser is stopped by the triggers',
  not (tests.run_as('postgres', null, $q$update public.audit_log set action = 'x'$q$)).ok
  and not (tests.run_as('postgres', null, 'delete from public.audit_log')).ok
  and not (tests.run_as('postgres', null, 'truncate public.audit_log')).ok);
select tests.check('audit_log: service_role cannot update or delete',
  not (tests.run_as('service_role', null, $q$update public.audit_log set action = 'x'$q$)).ok
  and not (tests.run_as('service_role', null, 'delete from public.audit_log')).ok);

-- ================================================================== deals: commission tiers
select tests.check('commission tiers and rounding',
  public.commission_cents(0) = 0 and public.commission_cents(49999) = 5000 and public.commission_cents(50000) = 4000
  and public.commission_cents(199999) = 16000 and public.commission_cents(200000) = 10000 and public.commission_cents(12345) = 1235
  and public.commission_cents(500000) = 25000);
select tests.rows_as('authenticated', (select worker_id from ids), $q$insert into public.deals (creator_id, brand_id, amount_cents, commission_cents)
     select c.id, b.id, 80000, 999999 from public.creators c, public.brands b limit 1$q$) as m \gset
select tests.check('deal commission is set by the database, whatever the client sends',
  :m = 1 and (select commission_cents = 6400 from public.deals order by created_at desc limit 1));
select id as deal_id, stage_changed_at as old_at from public.deals where stage = 'contacted' limit 1 \gset
update public.deals set stage = 'replied' where id = :'deal_id';
select tests.check('stage change updates stage_changed_at',
  (select stage_changed_at > :'old_at'::timestamptz from public.deals where id = :'deal_id'));
select tests.check('creator_summaries: earned = amount - commission over paid deals (creator 39: 73600)',
  (select total_earned_cents = 73600 and deal_count = 2 from public.creator_summaries where id = md5('creator-39')::uuid));

-- ================================================================== email guards and send functions
create temp table t as
select md5('t-' || n)::uuid as creator_id, 't' || n || '@example.test' as email, n from generate_series(1, 9) n;
insert into public.creators (id, full_name, email, status) select creator_id, 'Guard Test ' || n, email, 'new' from t;
grant select on t to public;

-- helper: approved email for creator n (inserted as superuser, so approved is allowed)
create function tests.mk_email(n int, p_to text default null) returns uuid language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  insert into public.emails (id, creator_id, to_email, subject, body, status)
  select v, creator_id, coalesce(p_to, email), 'Hello', 'Body', 'approved' from t where t.n = mk_email.n;
  return v;
end $$;

select tests.check('settings are at seed state (test mode on, test_email set, no postal address)',
  (select test_mode and test_email = 'owner@example.test' and sender_postal_address is null from public.settings));
update public.settings set daily_send_limit = 100, min_seconds_between_sends = 0;

-- Shorthands: act as the worker. (A check that changes data and reads it back in ONE statement would read
-- a stale snapshot, so every mutation below is its own statement, captured with \gset.)
create function tests.w(p_sql text) returns jsonb language sql as
$$ select tests.json_as('authenticated', (select worker_id from ids), p_sql) $$;
-- reserve_send / mark_sent / mark_failed are service-role only; the worker is passed as p_actor.
create function tests.svc(p_sql text) returns jsonb language sql as $$ select tests.json_as('service_role', null, p_sql) $$;
create function tests.rs(p_id uuid) returns jsonb language sql as $$ select tests.svc(format('select public.reserve_send(%L, %L)', p_id, (select worker_id from ids))) $$;
create function tests.ms(p_id uuid, p_mid text) returns jsonb language sql as $$ select tests.svc(format('select public.mark_sent(%L, %L, %L)', p_id, p_mid, (select worker_id from ids))) $$;
create function tests.mf(p_id uuid, p_err text) returns jsonb language sql as $$ select tests.svc(format('select public.mark_failed(%L, %L, %L)', p_id, p_err, (select worker_id from ids))) $$;
create function tests.mr(p_id uuid) returns jsonb language sql as $$ select tests.w(format('select public.mark_replied(%L)', p_id)) $$;

-- 1. test mode redirect
create temp table e1 as select tests.mk_email(1) as id;
select tests.rs((select id from e1)) as r \gset
select tests.check('reserve_send (test mode): ok, redirected to test_email, [TEST] prefix, is_test, status sending',
  :'r'::jsonb ->> 'ok' = 'true' and :'r'::jsonb ->> 'to_email' = 'owner@example.test' and :'r'::jsonb ->> 'is_test' = 'true'
  and :'r'::jsonb ->> 'subject_prefix' = '[TEST] '
  and (select status = 'sending' and is_test from public.emails where id = (select id from e1)));
select tests.rs((select id from e1)) as r \gset
select tests.check('reserve_send: a second call on the same email is refused (not_approved)', :'r'::jsonb ->> 'reason' = 'not_approved');
select tests.ms((select id from e1), '<m1@x>') as r \gset
select tests.check('mark_sent: sent, stamped, but a TEST send leaves the creator untouched',
  :'r'::jsonb ->> 'ok' = 'true'
  and (select status = 'sent' and sent_by = (select worker_id from ids) and sent_at is not null and message_id = '<m1@x>' from public.emails where id = (select id from e1))
  and (select status = 'new' and last_contacted_at is null from public.creators where id = (select creator_id from t where n = 1)));
select tests.ms((select id from e1), 'x') as r \gset
select tests.check('mark_sent on an email that is not sending is refused', :'r'::jsonb ->> 'reason' = 'not_sending');

-- 2. suppressed address (not the creator's own address, so the creator is not do_not_contact)
create temp table e2 as select tests.mk_email(2, 'supp-target@example.test') as id;
insert into public.suppression_list (email, reason) values ('SUPP-Target@example.test', 'test');   -- citext: case-insensitive
select tests.rs((select id from e2)) as r \gset
select tests.check('reserve_send blocks a suppressed address',
  :'r'::jsonb ->> 'reason' = 'suppressed' and (select status = 'approved' from public.emails where id = (select id from e2)));
select tests.check('guard: a worker cannot draft a real email to a suppressed address',
  (tests.run_as('authenticated', (select worker_id from ids),
    $q$insert into public.emails (creator_id, to_email, subject, body) select creator_id, 'supp-target@example.test', 's', 'b' from t where n = 2$q$)).err like '%suppression list%');

-- 3. do_not_contact
create temp table e3 as select tests.mk_email(3) as id;
update public.creators set status = 'do_not_contact' where id = (select creator_id from t where n = 3);
select tests.rs((select id from e3)) as r \gset
select tests.check('reserve_send blocks a do_not_contact creator', :'r'::jsonb ->> 'reason' = 'do_not_contact');
select tests.check('guard: nobody can draft a real email for a do_not_contact creator (worker, and the superuser path)',
  (tests.run_as('authenticated', (select worker_id from ids),
    $q$insert into public.emails (creator_id, to_email, subject, body) select creator_id, email, 's', 'b' from t where n = 3$q$)).err like '%do_not_contact%'
  and (tests.run_as('postgres', null,
    $q$insert into public.emails (creator_id, to_email, subject, body, status) select creator_id, email, 's', 'b', 'approved' from t where n = 3$q$)).err like '%do_not_contact%');
select tests.check('guard: a test email (is_test) to a do_not_contact creator is allowed',
  (tests.run_as('postgres', null, $q$insert into public.emails (creator_id, to_email, subject, body, is_test) select creator_id, email, 's', 'b', true from t where n = 3$q$)).ok);

-- 4. daily limit (test mode: tests are counted separately from real sends)
update public.settings set daily_send_limit = 2, min_seconds_between_sends = 0;   -- 1 test send already happened today
create temp table e4 as select tests.mk_email(4) as id;
create temp table e5 as select tests.mk_email(5) as id;
select tests.rs((select id from e4)) as r \gset
select tests.check('daily limit: first send passes', :'r'::jsonb ->> 'ok' = 'true');
select tests.rs((select id from e5)) as r \gset
select tests.check('daily limit: second send is refused (daily_limit), email stays approved',
  :'r'::jsonb ->> 'reason' = 'daily_limit' and (:'r'::jsonb ->> 'limit')::int = 2
  and (select status = 'approved' from public.emails where id = (select id from e5)));
select tests.mf((select id from e4), 'smtp down') as r \gset
select tests.check('mark_failed stores the error',
  :'r'::jsonb ->> 'ok' = 'true' and (select status = 'failed' and error = 'smtp down' from public.emails where id = (select id from e4)));
select tests.rs((select id from e5)) as r \gset
select tests.check('after a failed send the slot is free again', :'r'::jsonb ->> 'ok' = 'true');
select tests.check('direct update cannot move a failed email to sent',
  (tests.run_as('authenticated', (select worker_id from ids), format($q$update public.emails set status = 'sent' where id = %L$q$, (select id from e4)))).err like '%not allowed%');
select tests.check('direct update can move a failed email back to draft (retry)',
  (tests.run_as('authenticated', (select worker_id from ids), format($q$update public.emails set status = 'draft' where id = %L$q$, (select id from e4)))).ok);

-- 5. too soon
update public.settings set daily_send_limit = 100, min_seconds_between_sends = 3600;
create temp table e6 as select tests.mk_email(6) as id;
select tests.rs((select id from e6)) as r \gset
select tests.check('too_soon: refused right after another send, with retry_after_seconds',
  :'r'::jsonb ->> 'reason' = 'too_soon' and (:'r'::jsonb ->> 'retry_after_seconds')::int between 1 and 3600);
update public.settings set min_seconds_between_sends = 0;

-- 6. real mode needs a postal address; test mode needs a test address
update public.settings set test_mode = false;
select tests.rs((select id from e6)) as r \gset
select tests.check('real send is refused without a sender postal address', :'r'::jsonb ->> 'reason' = 'postal_address_missing');
update public.settings set sender_postal_address = 'PO Box 1, Example City';
select tests.rs((select id from e6)) as r \gset
select tests.check('real send: goes to the creator, no prefix, is_test false',
  :'r'::jsonb ->> 'ok' = 'true' and :'r'::jsonb ->> 'to_email' = 't6@example.test' and :'r'::jsonb ->> 'is_test' = 'false'
  and :'r'::jsonb ->> 'subject_prefix' = '');
select tests.ms((select id from e6), '<m6@x>') as r \gset
select tests.check('real mark_sent stamps the creator: last_contacted_at set, new -> contacted',
  :'r'::jsonb ->> 'ok' = 'true'
  and (select status = 'contacted' and last_contacted_at is not null from public.creators where id = (select creator_id from t where n = 6)));
select tests.json_as('authenticated', (select owner_id from ids), 'select public.stats_overview()') as r \gset
select tests.check('real sends count in the stats (28 seeded + 1); the test sends do not',
  (:'r'::jsonb ->> 'emails_sent_all')::int = 29);
select tests.mr((select id from e6)) as r \gset
select tests.check('mark_replied: replied_at set, creator -> replied',
  :'r'::jsonb ->> 'ok' = 'true'
  and (select status = 'replied' and replied_at is not null from public.emails where id = (select id from e6))
  and (select status = 'replied' from public.creators where id = (select creator_id from t where n = 6)));
select tests.mr((select id from e5)) as r \gset
select tests.check('mark_replied is refused for an email that was never sent', :'r'::jsonb ->> 'reason' = 'not_sent');
update public.settings set test_mode = true, test_email = null;
create temp table e7 as select tests.mk_email(7) as id;
select tests.rs((select id from e7)) as r \gset
select tests.check('test send is refused when test_email is empty', :'r'::jsonb ->> 'reason' = 'test_email_missing');
update public.settings set test_email = 'owner@example.test';
select tests.rs(gen_random_uuid()) as r \gset
select tests.check('reserve_send for a missing email -> not_found', :'r'::jsonb ->> 'reason' = 'not_found');
select tests.rs((select id from e1)) as r \gset
select tests.check('reserve_send for an already sent email -> not_approved', :'r'::jsonb ->> 'reason' = 'not_approved');

-- 7. status machine for direct clients
select tests.check('worker: a new email cannot start as sent',
  (tests.run_as('authenticated', (select worker_id from ids), $q$insert into public.emails (creator_id, to_email, status) select creator_id, email, 'sent' from t where n = 8$q$)).err like '%start as draft%');
select tests.run_as('authenticated', (select worker_id from ids), $q$insert into public.emails (creator_id, to_email, drafted_by, sent_by, sent_at, approved_by) select creator_id, email, (select owner_id from ids), (select owner_id from ids), now(), (select owner_id from ids) from t where n = 8$q$) as _ \gset
select tests.check('worker: drafted_by is forced to the caller, sent fields are ignored',
  (select status = 'draft' and drafted_by = (select worker_id from ids) and sent_by is null and sent_at is null and approved_by is null
     from public.emails where creator_id = (select creator_id from t where n = 8)));
select tests.run_as('authenticated', (select worker_id from ids), $q$update public.emails set status = 'approved' where creator_id = (select creator_id from t where n = 8)$q$) as _ \gset
select tests.check('worker: approving sets approved_by and approved_at',
  (select status = 'approved' and approved_by = (select worker_id from ids) and approved_at is not null from public.emails where creator_id = (select creator_id from t where n = 8)));
select tests.run_as('authenticated', (select worker_id from ids), $q$update public.emails set body = 'changed' where creator_id = (select creator_id from t where n = 8)$q$) as _ \gset
select tests.check('worker: editing an approved email puts it back to draft',
  (select status = 'draft' and approved_by is null from public.emails where creator_id = (select creator_id from t where n = 8)));
select tests.check('worker: cannot jump to sending/replied, cannot edit a sent email',
  (tests.run_as('authenticated', (select worker_id from ids), $q$update public.emails set status = 'sending' where creator_id = (select creator_id from t where n = 8)$q$)).err like '%not allowed%'
  and (tests.run_as('authenticated', (select worker_id from ids), $q$update public.emails set status = 'replied' where status = 'sent'$q$)).err like '%not allowed%'
  and (tests.run_as('authenticated', (select worker_id from ids), $q$update public.emails set body = 'rewrite history' where status = 'sent'$q$)).err like '%cannot be edited%');
select tests.check('worker: sent mail is untouched', (select count(*) from public.emails where body = 'rewrite history') = 0);
select tests.rows_as('authenticated', (select worker_id from ids), $q$delete from public.emails where status in ('sent','replied','failed')$q$) as nsent \gset
select tests.check('worker: cannot delete sent, replied or failed mail', :nsent <= 0);
select tests.rows_as('authenticated', (select worker_id from ids), $q$delete from public.emails where creator_id = (select creator_id from t where n = 8)$q$) as ndraft \gset
select tests.check('worker: can throw away a draft', :ndraft = 1);
select tests.check('email status changes are written to the audit log',
  exists (select 1 from public.audit_log where action = 'email.status_changed' and entity_id = (select id::text from e6)
          and details #>> '{changes,status,to}' = 'replied' and actor_id = (select worker_id from ids)));

-- ================================================================== opt_out, bootstrap_owner
select tests.json_as('service_role', null, $q$select public.opt_out('T9@example.test', 'unsubscribe link')$q$) as r \gset
select tests.check('opt_out (service role): suppresses and flips the creator',
  :'r'::jsonb ->> 'newly_suppressed' = 'true' and (:'r'::jsonb ->> 'creators_updated')::int = 1
  and (select status = 'do_not_contact' from public.creators where email = 't9@example.test')
  and exists (select 1 from public.suppression_list where email = 't9@example.test')
  and exists (select 1 from public.audit_log where action = 'suppression.created' and entity_id = 't9@example.test'));
select tests.json_as('service_role', null, $q$select public.opt_out('t9@example.test')$q$) as r \gset
select tests.check('opt_out is idempotent', :'r'::jsonb ->> 'newly_suppressed' = 'false');
select tests.check('opt_out rejects junk input',
  not (tests.run_as('service_role', null, $q$select public.opt_out('not-an-email')$q$)).ok);

alter table public.profiles disable trigger trg_guard;
update public.profiles set role = null where role = 'owner';
alter table public.profiles enable trigger trg_guard;
select tests.json_as('service_role', null, $q$select to_jsonb(public.bootstrap_owner('norole@example.test'))$q$) as r \gset
select tests.check('bootstrap_owner: works while there is no active owner',
  :'r'::jsonb = 'true'::jsonb and (select role = 'owner' from public.profiles where email = 'norole@example.test'));
select tests.json_as('service_role', null, $q$select to_jsonb(public.bootstrap_owner('worker@example.test'))$q$) as r \gset
select tests.check('bootstrap_owner: refuses once an active owner exists',
  :'r'::jsonb = 'false'::jsonb and (select role = 'worker' from public.profiles where email = 'worker@example.test'));

-- ================================================================== login rate limit (service role only)
select tests.check('login_allowed: true with no history',
  tests.json_as('service_role', null, $q$select to_jsonb(public.login_allowed('Victim@Example.test', '9.9.9.9'))$q$) = 'true');
select public.record_login_attempt('victim@example.test', '9.9.9.9', false) from generate_series(1, 4);
select tests.check('login_allowed: still true after 4 failures',
  tests.json_as('service_role', null, $q$select to_jsonb(public.login_allowed('victim@example.test', '9.9.9.9'))$q$) = 'true');
select public.record_login_attempt('victim@example.test', '9.9.9.9', false);
-- Changed on purpose (audit M08): 5 failures for one email from ONE address no longer lock that email for everybody.
select tests.check('login_allowed: false after 5 failures for the same email and IP (case-insensitive)',
  tests.json_as('service_role', null, $q$select to_jsonb(public.login_allowed('VICTIM@example.test', '9.9.9.9'))$q$) = 'false');
select tests.check('login_allowed: the same email from another IP is still allowed; another email on the blocked IP is not',
  tests.json_as('service_role', null, $q$select to_jsonb(public.login_allowed('victim@example.test', '1.2.3.4'))$q$) = 'true'
  and tests.json_as('service_role', null, $q$select to_jsonb(public.login_allowed('other@example.test', '1.2.3.4'))$q$) = 'true'
  and tests.json_as('service_role', null, $q$select to_jsonb(public.login_allowed('other@example.test', '9.9.9.9'))$q$) = 'false');
update public.login_attempts set created_at = now() - interval '16 minutes';
select tests.check('login_allowed: allowed again after 15 minutes',
  tests.json_as('service_role', null, $q$select to_jsonb(public.login_allowed('victim@example.test', '9.9.9.9'))$q$) = 'true');
select public.record_login_attempt('v2@example.test', null, false) from generate_series(1, 5);
select public.record_login_attempt('v2@example.test', null, true);
select tests.check('login_allowed: a successful login resets that email''s counter',
  tests.json_as('service_role', null, $q$select to_jsonb(public.login_allowed('v2@example.test', null))$q$) = 'true');

-- ================================================================== done
do $$
declare v_fail int; v_total int;
begin
  select count(*) filter (where not ok), count(*) into v_fail, v_total from tests.results;
  raise notice '% checks, % failed', v_total, v_fail;
  if v_fail > 0 then raise exception 'RLS/guard tests failed: %', (select string_agg(name, '; ') from tests.results where not ok); end if;
end $$;
rollback;
