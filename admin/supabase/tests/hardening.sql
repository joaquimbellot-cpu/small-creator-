-- Security hardening tests: 2FA (aal2) enforced in the database, send functions service-only with p_actor,
-- log_audit allow-list, bootstrap_owner as postgres and as service_role. Rolled back.
\set ON_ERROR_STOP on
begin;
create schema tests;
create table tests.results (name text, ok boolean);
create function tests.check(p_name text, p_ok boolean) returns void language plpgsql as $$
begin insert into tests.results values (p_name, coalesce(p_ok, false)); raise notice '% %', case when coalesce(p_ok,false) then 'PASS' else 'FAIL' end, p_name; end $$;

-- Run p_sql as p_role with JWT claims (sub, aal). Returns ok/rows/err; err is null on success.
create function tests.run_as(p_role text, p_uid uuid, p_aal text, p_sql text, out ok boolean, out n bigint, out err text)
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_strip_nulls(jsonb_build_object('role', p_role, 'sub', p_uid, 'aal', p_aal))::text, true);
  execute format('set local role %I', p_role);
  begin execute p_sql; get diagnostics n = row_count; ok := true;
  exception when others then ok := false; n := -1; err := sqlerrm; end;
  reset role;
end $$;
create function tests.rows(p_role text, p_uid uuid, p_aal text, p_sql text) returns bigint language plpgsql as $$
declare v bigint;
begin
  perform set_config('request.jwt.claims', jsonb_strip_nulls(jsonb_build_object('role', p_role, 'sub', p_uid, 'aal', p_aal))::text, true);
  execute format('set local role %I', p_role);
  begin execute 'select count(*) from (' || p_sql || ') q' into v; exception when others then v := -1; end;
  reset role; return v;
end $$;
-- scalar jsonb result as role
create function tests.json_as(p_role text, p_uid uuid, p_aal text, p_sql text) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform set_config('request.jwt.claims', jsonb_strip_nulls(jsonb_build_object('role', p_role, 'sub', p_uid, 'aal', p_aal))::text, true);
  execute format('set local role %I', p_role);
  begin execute p_sql into v; exception when others then v := jsonb_build_object('error', sqlerrm); end;
  reset role; return v;
end $$;

create temp table ids as select (select id from public.profiles where email='owner@example.test') as o,
                                (select id from public.profiles where email='worker@example.test') as w,
                                gen_random_uuid() as nr;
grant select on ids to public;
delete from auth.mfa_factors;   -- live data may hold real enrolments; start clean (rolled back)
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, created_at, updated_at)
select nr, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'norole3@example.test', '{}', now(), now() from ids;

-- ================================================================== 1. MFA
select tests.check('no factor, aal1: owner reads creators and is_owner() is true',
  tests.rows('authenticated', (select o from ids), 'aal1', 'select * from public.creators') = 60
  and tests.json_as('authenticated', (select o from ids), 'aal1', 'select to_jsonb(public.is_owner())') = 'true');
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values (gen_random_uuid(), (select o from ids), 'phone', 'totp', 'verified', now(), now()),
       (gen_random_uuid(), (select w from ids), 'pending', 'totp', 'unverified', now(), now());
select tests.check('owner with a verified factor + aal1: no rows, denied, not staff/owner',
  tests.rows('authenticated', (select o from ids), 'aal1', 'select * from public.creators') <= 0
  and tests.rows('authenticated', (select o from ids), 'aal1', 'select * from public.audit_log') <= 0
  and tests.rows('authenticated', (select o from ids), 'aal1', 'select * from public.profiles') <= 0
  and not (tests.run_as('authenticated', (select o from ids), 'aal1', 'select public.stats_overview()')).ok
  and (tests.run_as('authenticated', (select o from ids), 'aal1', $q$update public.settings set daily_send_limit = 5$q$)).n <= 0
  and tests.json_as('authenticated', (select o from ids), 'aal1', 'select to_jsonb(public.is_staff())') = 'false'
  and tests.json_as('authenticated', (select o from ids), 'aal1', 'select to_jsonb(public.is_owner())') = 'false');
select tests.check('owner with a verified factor and no aal claim at all: denied',
  tests.rows('authenticated', (select o from ids), null, 'select * from public.creators') <= 0);
select tests.check('owner with a verified factor + aal2: works',
  tests.rows('authenticated', (select o from ids), 'aal2', 'select * from public.creators') = 60
  and tests.rows('authenticated', (select o from ids), 'aal2', 'select * from public.audit_log') > 0
  and (tests.run_as('authenticated', (select o from ids), 'aal2', 'select public.stats_overview()')).ok
  and tests.json_as('authenticated', (select o from ids), 'aal2', 'select to_jsonb(public.is_owner())') = 'true');
select tests.check('worker without a verified factor (only an unverified one) + aal1: works',
  tests.rows('authenticated', (select w from ids), 'aal1', 'select * from public.creators') = 60
  and (tests.run_as('authenticated', (select w from ids), 'aal1', 'select public.stats_overview()')).ok);
select tests.check('owner at aal1 cannot write an audit line; at aal2 can',
  not (tests.run_as('authenticated', (select o from ids), 'aal1', $q$select public.log_audit('auth.login')$q$)).ok
  and (tests.run_as('authenticated', (select o from ids), 'aal2', $q$select public.log_audit('auth.login')$q$)).ok);
delete from auth.mfa_factors where user_id in (select o from ids union select w from ids);

-- ================================================================== 2. send functions
select tests.check('authenticated (worker, owner) cannot execute reserve_send / mark_sent / mark_failed',
  not exists (select 1 from unnest(array['reserve_send(uuid,uuid)','mark_sent(uuid,text,uuid)','mark_failed(uuid,text,uuid)']) f,
                          unnest(array['authenticated','anon','public']) r
              where has_function_privilege(case when r = 'public' then 'anon' else r end, 'public.' || f, 'execute'))
  and not (tests.run_as('authenticated', (select w from ids), 'aal1', format('select public.reserve_send(%L, %L)', gen_random_uuid(), (select w from ids)))).ok
  and not (tests.run_as('authenticated', (select o from ids), 'aal2', format('select public.mark_sent(%L, %L, %L)', gen_random_uuid(), 'x', (select o from ids)))).ok);
select tests.check('service_role can execute them', has_function_privilege('service_role', 'public.reserve_send(uuid,uuid)', 'execute')
  and has_function_privilege('service_role', 'public.mark_sent(uuid,text,uuid)', 'execute')
  and has_function_privilege('service_role', 'public.mark_failed(uuid,text,uuid)', 'execute'));

insert into public.creators (id, full_name, email) values (md5('h1')::uuid, 'Hardening One', 'h1@example.test');
update public.settings set daily_send_limit = 100, min_seconds_between_sends = 0;
insert into public.emails (id, creator_id, to_email, subject, body, status) values (md5('he1')::uuid, md5('h1')::uuid, 'h1@example.test', 's', 'b', 'approved');
select tests.json_as('service_role', null, null, format('select public.reserve_send(%L, %L)', md5('he1')::uuid, (select nr from ids))) as r \gset
select tests.check('reserve_send refuses an actor with no role', :'r'::jsonb ->> 'reason' = 'forbidden'
  and (select status = 'approved' from public.emails where id = md5('he1')::uuid));
select tests.json_as('service_role', null, null, format('select public.reserve_send(%L, null)', md5('he1')::uuid)) as r \gset
select tests.check('reserve_send refuses a null actor', :'r'::jsonb ->> 'reason' = 'forbidden');
update public.profiles set is_active = false where id = (select w from ids);
select tests.json_as('service_role', null, null, format('select public.reserve_send(%L, %L)', md5('he1')::uuid, (select w from ids))) as r \gset
select tests.check('reserve_send refuses a deactivated worker', :'r'::jsonb ->> 'reason' = 'forbidden');
update public.profiles set is_active = true where id = (select w from ids);
select tests.json_as('service_role', null, null, format('select public.reserve_send(%L, %L)', md5('he1')::uuid, (select w from ids))) as r \gset
select tests.check('reserve_send with an active worker as p_actor works', :'r'::jsonb ->> 'ok' = 'true');
select tests.json_as('service_role', null, null, format('select public.mark_sent(%L, %L, %L)', md5('he1')::uuid, '<h@x>', (select nr from ids))) as r \gset
select tests.check('mark_sent refuses a role-less actor', :'r'::jsonb ->> 'reason' = 'forbidden' and (select status = 'sending' from public.emails where id = md5('he1')::uuid));
select tests.json_as('service_role', null, null, format('select public.mark_sent(%L, %L, %L)', md5('he1')::uuid, '<h@x>', (select o from ids))) as r \gset
select tests.check('mark_sent records sent_by = p_actor (the owner) and audit actor = p_actor',
  :'r'::jsonb ->> 'ok' = 'true'
  and (select sent_by = (select o from ids) from public.emails where id = md5('he1')::uuid)
  and exists (select 1 from public.audit_log where entity_id = md5('he1')::uuid::text and details #>> '{changes,status,to}' = 'sent' and actor_id = (select o from ids)));
insert into public.emails (id, creator_id, to_email, subject, body, status) values (md5('he2')::uuid, md5('h1')::uuid, 'h1@example.test', 's', 'b', 'sending');
select tests.json_as('service_role', null, null, format('select public.mark_failed(%L, %L, %L)', md5('he2')::uuid, 'boom', (select nr from ids))) as r \gset
select tests.check('mark_failed refuses a role-less actor', :'r'::jsonb ->> 'reason' = 'forbidden');
select tests.json_as('service_role', null, null, format('select public.mark_failed(%L, %L, %L)', md5('he2')::uuid, 'boom', (select w from ids))) as r \gset
select tests.check('mark_failed with a valid actor works', :'r'::jsonb ->> 'ok' = 'true');
select tests.check('a worker still cannot forge a send by direct update',
  (tests.run_as('authenticated', (select w from ids), 'aal1', format($q$update public.emails set status = 'sent', sent_by = %L where id = %L$q$, (select w from ids), md5('he2')::uuid))).err like '%not allowed%');

-- ================================================================== 3. log_audit allow-list
-- Changed on purpose (audit M06): user.* and 2FA lines are no longer open to every worker (see fixes.sql).
select tests.check('log_audit: every allowed action works for a worker',
  (select bool_and((tests.run_as('authenticated', (select w from ids), 'aal1', format('select public.log_audit(%L, %L, %L, %L)', a, 'creator', 'x', '{"label":"y"}'))).ok)
     from unnest(array['creator.viewed','creators.exported','creators.imported','creator.subscribers_refreshed','email.drafted','auth.login',
       'auth.logout','auth.password_changed']) a));
select tests.check('log_audit: other actions are rejected for a worker (forged business events, unsubscribed, unknown)',
  (select bool_and((tests.run_as('authenticated', (select w from ids), 'aal1', format('select public.log_audit(%L)', a))).err like '%not allowed%')
     from unnest(array['creator.deleted','email.status_changed','settings.updated','email.unsubscribed','deal.created','nonsense','']) a));
select tests.check('log_audit: service role may write email.unsubscribed, but not unknown actions',
  (tests.run_as('service_role', null, null, $q$select public.log_audit('email.unsubscribed','email','abc','{}')$q$)).ok
  and (tests.run_as('service_role', null, null, $q$select public.log_audit('made.up')$q$)).err like '%not allowed%');
select tests.check('log_audit: details above 8 KB are rejected, just under is fine',
  (tests.run_as('authenticated', (select w from ids), 'aal1', format('select public.log_audit(%L, null, null, %L)', 'creator.viewed', jsonb_build_object('x', repeat('a', 9000))))).err like '%too large%'
  and (tests.run_as('authenticated', (select w from ids), 'aal1', format('select public.log_audit(%L, null, null, %L)', 'creator.viewed', jsonb_build_object('x', repeat('a', 7000))))).ok);
select (tests.run_as('authenticated', (select w from ids), 'aal1', format($q$select public.log_audit('auth.login','profile','forge-1','{}', %L)$q$, (select o from ids)))).ok as m \gset
select tests.check('log_audit: authenticated actor is always auth.uid(), p_actor is ignored',
  :'m' = 't' and (select actor_id = (select w from ids) from public.audit_log where entity_id = 'forge-1'));
select (tests.run_as('service_role', null, null, format($q$select public.log_audit('auth.login','profile','svc-1','{}', %L)$q$, (select o from ids)))).ok as m \gset
select tests.check('log_audit: service role can name the actor',
  :'m' = 't' and (select actor_id = (select o from ids) from public.audit_log where entity_id = 'svc-1'));

-- ================================================================== 4. bootstrap_owner
alter table public.profiles disable trigger trg_guard;
update public.profiles set role = null where role = 'owner';
alter table public.profiles enable trigger trg_guard;
select tests.json_as('postgres', null, null, $q$select to_jsonb(public.bootstrap_owner('norole3@example.test'))$q$) as r \gset
select tests.check('bootstrap_owner as postgres (SQL editor, no JWT): works when no owner exists',
  :'r'::jsonb = 'true'::jsonb and (select role = 'owner' from public.profiles where email = 'norole3@example.test'));
select tests.json_as('postgres', null, null, $q$select to_jsonb(public.bootstrap_owner('worker@example.test'))$q$) as r \gset
select tests.check('bootstrap_owner as postgres: refused once an owner exists', :'r'::jsonb = 'false'::jsonb);
alter table public.profiles disable trigger trg_guard;
update public.profiles set role = null where email = 'norole3@example.test';
alter table public.profiles enable trigger trg_guard;
select tests.json_as('service_role', null, null, $q$select to_jsonb(public.bootstrap_owner('norole3@example.test'))$q$) as r \gset
select tests.check('bootstrap_owner with the service role: works when no owner exists',
  :'r'::jsonb = 'true'::jsonb and (select role = 'owner' from public.profiles where email = 'norole3@example.test'));
select tests.json_as('service_role', null, null, $q$select to_jsonb(public.bootstrap_owner('worker@example.test'))$q$) as r \gset
select tests.check('bootstrap_owner with the service role: refused once an owner exists', :'r'::jsonb = 'false'::jsonb);
select tests.check('bootstrap_owner: not callable by authenticated or anon',
  not (tests.run_as('authenticated', (select w from ids), 'aal1', $q$select public.bootstrap_owner('worker@example.test')$q$)).ok
  and not (tests.run_as('anon', null, null, $q$select public.bootstrap_owner('worker@example.test')$q$)).ok);

do $$ declare f int; begin select count(*) filter (where not ok) into f from tests.results;
  if f > 0 then raise exception 'hardening tests failed: %', (select string_agg(name,'; ') from tests.results where not ok); end if; end $$;
rollback;
