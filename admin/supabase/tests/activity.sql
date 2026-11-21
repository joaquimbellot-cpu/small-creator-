-- recent_activity(): staff feed, excluded actions never appear. Rolled back.
\set ON_ERROR_STOP on
begin;
create schema tests;
create table tests.results (name text, ok boolean);
create function tests.check(p_name text, p_ok boolean) returns void language plpgsql as $$
begin insert into tests.results values (p_name, coalesce(p_ok, false)); raise notice '% %', case when coalesce(p_ok,false) then 'PASS' else 'FAIL' end, p_name; end $$;
create function tests.rows_as(p_role text, p_uid uuid, p_sql text) returns bigint language plpgsql as $$
declare n bigint;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', p_role)::text, true);
  execute format('set local role %I', p_role);
  begin execute 'select count(*) from (' || p_sql || ') q' into n; exception when others then n := -1; end;
  reset role; return n;
end $$;
create temp table ids as select (select id from public.profiles where email='worker@example.test') as worker_id, gen_random_uuid() as norole_id;
grant select on ids to public;
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, created_at, updated_at)
select norole_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'norole2@example.test', '{}', now(), now() from ids;

-- excluded actions (newest rows, so a leak would show first) + one visible control row
insert into public.audit_log (action, entity_type, entity_id, details)
select a, 'x', 'EXCL-' || a, '{"label":"Secret"}' from unnest(array['creator.viewed','creators.exported','auth.login','auth.logout',
  'auth.password_changed','user.invited','user.removed','settings.updated','smallfold.reserve_send']) a;
insert into public.audit_log (action, entity_type, entity_id, details)
values ('email.status_changed','email','EXCL-test-email','{"label":"Hidden Tester","is_test":true,"status":"sent","changes":{"status":{"from":"sending","to":"sent"}}}'),
       ('email.status_changed','email','EXCL-sending','{"label":"Hidden","is_test":false,"changes":{"status":{"from":"approved","to":"sending"}}}'),
       ('creators.imported','creator',null,'{"count":12}');

select tests.check('worker gets rows', tests.rows_as('authenticated',(select worker_id from ids),'select * from public.recent_activity()') = 20);
select tests.check('limit is capped at 50', tests.rows_as('authenticated',(select worker_id from ids),'select * from public.recent_activity(500)') = 50);
select tests.check('limit 3 returns 3', tests.rows_as('authenticated',(select worker_id from ids),'select * from public.recent_activity(3)') = 3);
select tests.check('excluded actions and test emails never appear',
  tests.rows_as('authenticated',(select worker_id from ids),$q$select * from public.recent_activity(50) where entity_id like 'EXCL-%' or action in ('creator.viewed','creators.exported','auth.login','auth.logout','auth.password_changed','smallfold.reserve_send') or action like 'user.%' or action like 'settings.%'$q$) = 0);
select tests.check('newest first and the import line reads well',
  tests.rows_as('authenticated',(select worker_id from ids),$q$select * from public.recent_activity(1) where summary = 'imported 12 creators'$q$) = 1);
select tests.check('summaries are filled and plain',
  tests.rows_as('authenticated',(select worker_id from ids),$q$select * from public.recent_activity(50) where summary is null or summary = ''$q$) = 0
  and tests.rows_as('authenticated',(select worker_id from ids),$q$select * from public.recent_activity(50) where summary like 'sent an email to %'$q$) > 0);
select tests.check('role-less user gets nothing', tests.rows_as('authenticated',(select norole_id from ids),'select * from public.recent_activity()') = 0);
select tests.check('anon is denied', tests.rows_as('anon',null,'select * from public.recent_activity()') = -1);
select tests.check('service_role has no execute', tests.rows_as('service_role',null,'select * from public.recent_activity()') = -1);

do $$ declare f int; begin select count(*) filter (where not ok) into f from tests.results;
  if f > 0 then raise exception 'activity tests failed: %', (select string_agg(name,'; ') from tests.results where not ok); end if; end $$;
rollback;
