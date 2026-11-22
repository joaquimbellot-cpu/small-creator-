-- Website forms: contact_messages, the rate-limit store and the submit functions. Rolled back.
\set ON_ERROR_STOP on
begin;
create schema tests;
create table tests.results (name text, ok boolean);
create function tests.check(p_name text, p_ok boolean) returns void language plpgsql as $$
begin insert into tests.results values (p_name, coalesce(p_ok, false)); raise notice '% %', case when coalesce(p_ok,false) then 'PASS' else 'FAIL' end, p_name; end $$;
-- Runs p_sql as p_role; returns the affected / counted rows, or -1 when it fails.
create function tests.n_as(p_role text, p_uid uuid, p_sql text) returns bigint language plpgsql as $$
declare n bigint;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', p_role)::text, true);
  execute format('set local role %I', p_role);
  begin
    if p_sql ~* '^\s*select' then execute 'select count(*) from (' || p_sql || ') q' into n;
    else execute p_sql; get diagnostics n = row_count; end if;
  exception when others then n := -1; end;
  reset role; return n;
end $$;
create function tests.json_as(p_role text, p_sql text) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('role', p_role)::text, true);
  execute format('set local role %I', p_role);
  begin execute p_sql into v; exception when others then v := jsonb_build_object('error', sqlerrm); end;
  reset role; return v;
end $$;
create temp table ids as select (select id from public.profiles where email='owner@example.test') as o,
                                (select id from public.profiles where email='worker@example.test') as w;
grant select on ids to public;
delete from auth.mfa_factors;

insert into public.contact_messages (id, name, email, topic, message)
values ('00000000-0000-4000-8000-0000000000a1', 'Test Sender', 'sender@example.test', 'Hello', 'A fake message.'),
       ('00000000-0000-4000-8000-0000000000a2', 'Other Sender', 'other@example.test', null, 'Another fake message.');

-- anon gets nothing
select tests.check('anon cannot read contact_messages', tests.n_as('anon', null, 'select * from public.contact_messages') = -1);
select tests.check('anon cannot insert contact_messages', tests.n_as('anon', null, $q$insert into public.contact_messages (name, email, message) values ('x','x@example.test','x')$q$) = -1);
select tests.check('anon cannot read the rate-limit store', tests.n_as('anon', null, 'select * from public.form_rate_limits') = -1);
select tests.check('anon cannot insert into the rate-limit store', tests.n_as('anon', null, $q$insert into public.form_rate_limits (form, ip_hash) values ('apply','h')$q$) = -1);
select tests.check('anon cannot call submit_contact', tests.n_as('anon', null, $q$select public.submit_contact('h','a','a@example.test','t','m')$q$) = -1);
select tests.check('anon cannot call submit_application', tests.n_as('anon', null, $q$select public.submit_application('h','a','a@example.test',null,null,null,null)$q$) = -1);

-- staff cannot insert, cannot reach the store or the functions
select tests.check('worker cannot insert contact_messages', tests.n_as('authenticated', (select w from ids), $q$insert into public.contact_messages (name, email, message) values ('x','x@example.test','x')$q$) = -1);
select tests.check('owner cannot insert contact_messages', tests.n_as('authenticated', (select o from ids), $q$insert into public.contact_messages (name, email, message) values ('x','x@example.test','x')$q$) = -1);
select tests.check('worker cannot read the rate-limit store', tests.n_as('authenticated', (select w from ids), 'select * from public.form_rate_limits') = -1);
select tests.check('worker cannot call submit_contact', tests.n_as('authenticated', (select w from ids), $q$select public.submit_contact('h','a','a@example.test','t','m')$q$) = -1);

-- worker: read, mark handled, nothing else
select tests.check('worker reads contact_messages', tests.n_as('authenticated', (select w from ids), 'select * from public.contact_messages') = 2);
select tests.check('worker marks a message handled',
  tests.n_as('authenticated', (select w from ids), format($q$update public.contact_messages set handled_at = now(), handled_by = %L where id = '00000000-0000-4000-8000-0000000000a1'$q$, (select w from ids))) = 1);
select tests.check('handled_by is stored', (select handled_by from public.contact_messages where id = '00000000-0000-4000-8000-0000000000a1') = (select w from ids));
select tests.check('worker can mark it not handled again',
  tests.n_as('authenticated', (select w from ids), $q$update public.contact_messages set handled_at = null, handled_by = null where id = '00000000-0000-4000-8000-0000000000a1'$q$) = 1);
select tests.check('worker cannot edit the message text', tests.n_as('authenticated', (select w from ids), $q$update public.contact_messages set message = 'changed'$q$) = -1);
select tests.check('worker cannot delete', tests.n_as('authenticated', (select w from ids), 'delete from public.contact_messages') = 0);
select tests.check('the rows are still there', (select count(*) from public.contact_messages) = 2);

-- owner deletes
select tests.check('owner reads contact_messages', tests.n_as('authenticated', (select o from ids), 'select * from public.contact_messages') = 2);
select tests.check('owner deletes a message', tests.n_as('authenticated', (select o from ids), $q$delete from public.contact_messages where id = '00000000-0000-4000-8000-0000000000a2'$q$) = 1);

-- service role: the functions
select tests.check('service role contact ok', tests.json_as('service_role', $q$select public.submit_contact('testhash','Fake','fake@example.test','Topic','Hi')$q$) = '{"ok": true}');
select tests.check('contact row stored', (select count(*) from public.contact_messages where email = 'fake@example.test') = 1);
select tests.check('contact.received audit row has no actor',
  (select count(*) from public.audit_log where action = 'contact.received' and actor_id is null) = 1);
create temp table r1 as select tests.json_as('service_role', $q$select public.submit_application('testhash2','Fake Creator','fake.creator@example.test','+1 555 0100','@fakechannel',2500,'We make fake videos')$q$) as j;
select tests.check('application creates a website creator',
  (select j from r1) = '{"ok": true}'
  and (select count(*) from public.creators where email = 'fake.creator@example.test' and status = 'new' and source = 'website' and niche = 'We make fake videos' and subscribers = 2500) = 1);
create temp table r2 as select tests.json_as('service_role', $q$select public.submit_application('testhash2','Someone Else','fake.creator@example.test',null,null,null,'x')$q$) as j;
select tests.check('duplicate email: still ok, nothing created',
  (select j from r2) = '{"ok": true}'
  and (select count(*) from public.creators where email = 'fake.creator@example.test') = 1);
create temp table r3 as select tests.json_as('service_role', $q$select public.submit_application('testhash2','Someone Else','FAKE.Creator@example.test',null,null,null,null)$q$) as j;
select tests.check('duplicate email (other case) creates nothing',
  (select j from r3) = '{"ok": true}'
  and (select count(*) from public.creators where email = 'fake.creator@example.test') = 1);
select tests.check('application.received audit rows written, no actor',
  (select count(*) from public.audit_log where action = 'application.received' and actor_id is null) = 3);
select tests.check('three sends so far are counted', (select count(*) from public.form_rate_limits where ip_hash = 'testhash2' and form = 'apply') = 3);
select tests.check('the 4th and 5th send of the hour pass',
  tests.json_as('service_role', $q$select public.submit_application('testhash2','F','f2@example.test',null,null,null,null)$q$) = '{"ok": true}'
  and tests.json_as('service_role', $q$select public.submit_application('testhash2','F','f3@example.test',null,null,null,null)$q$) = '{"ok": true}');
select tests.check('the 6th is limited',
  tests.json_as('service_role', $q$select public.submit_application('testhash2','F','f4@example.test',null,null,null,null)$q$) = '{"ok": false, "reason": "rate_limited"}');
select tests.check('limited send creates nothing', (select count(*) from public.creators where email = 'f4@example.test') = 0);
select tests.check('limit is per form', tests.json_as('service_role', $q$select public.submit_contact('testhash2','F','f@example.test',null,'m')$q$) = '{"ok": true}');
select tests.check('limit is per visitor', tests.json_as('service_role', $q$select public.submit_application('otherhash','F','f5@example.test',null,null,null,null)$q$) = '{"ok": true}');
update public.form_rate_limits set created_at = now() - interval '2 hours' where ip_hash = 'testhash2';
select tests.check('old rate rows stop counting', tests.json_as('service_role', $q$select public.submit_application('testhash2','F','f6@example.test',null,null,null,null)$q$) = '{"ok": true}');

do $$ declare f int; begin select count(*) filter (where not ok) into f from tests.results;
  if f > 0 then raise exception 'forms tests failed: %', (select string_agg(name,'; ') from tests.results where not ok); end if; end $$;
rollback;
