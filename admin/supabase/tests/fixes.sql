-- Tests for migrations 20261123*: stale 'sending', do_not_contact rules, creator delete, format checks,
-- audit rules, login / form / reset limits, activity feed, summaries, indexes, default privileges,
-- Claude conversation delete, audit_actions. Everything is rolled back.
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

-- fixtures: ZZ AUDIT creators and emails (a real, sendable creator has no do_not_contact and no suppression)
insert into public.creators (id, full_name, email, status) values
  ('00000000-0000-0000-0000-00000000fa01', 'ZZ AUDIT one',   'zz-fa1@example.test', 'contacted'),
  ('00000000-0000-0000-0000-00000000fa02', 'ZZ AUDIT two',   'zz-fa2@example.test', 'contacted'),
  ('00000000-0000-0000-0000-00000000fa03', 'ZZ AUDIT three', 'zz-fa3@example.test', 'contacted');

-- ================================================================== H07 release_stale_sending
insert into public.emails (id, creator_id, to_email, subject, body) values
  ('00000000-0000-0000-0000-0000000fa101', '00000000-0000-0000-0000-00000000fa01', 'zz-fa1@example.test', 'old', 'x'),
  ('00000000-0000-0000-0000-0000000fa102', '00000000-0000-0000-0000-00000000fa01', 'zz-fa1@example.test', 'new', 'x');
update public.emails set status = 'sending' where id in ('00000000-0000-0000-0000-0000000fa101', '00000000-0000-0000-0000-0000000fa102');
select tests.age_email('00000000-0000-0000-0000-0000000fa101', interval '20 minutes');
select tests.text_as('service_role', null, 'select public.release_stale_sending(15)::text') as r \gset
select tests.check('release_stale_sending: returns the number released (at least ours)', :'r'::int >= 1);
select tests.check('release_stale_sending: old row failed with the plain message, fresh row untouched',
  (select status = 'failed' and error = 'Interrupted while sending. Check the mail log before retrying.' from public.emails where id = '00000000-0000-0000-0000-0000000fa101')
  and (select status = 'sending' from public.emails where id = '00000000-0000-0000-0000-0000000fa102'));
select tests.check('release_stale_sending: leaves an audit line like other status changes',
  exists (select 1 from public.audit_log where action = 'email.status_changed' and entity_id = '00000000-0000-0000-0000-0000000fa101'
          and details #>> '{changes,status,to}' = 'failed'));
select tests.check('release_stale_sending: a second call releases nothing of ours (idempotent)',
  tests.text_as('service_role', null, 'select public.release_stale_sending(15)::text')::int = 0);
select tests.check('release_stale_sending: only service_role may execute',
  not (tests.run_as('authenticated', (select o from ids), 'select public.release_stale_sending(15)')).ok
  and not (tests.run_as('anon', null, 'select public.release_stale_sending(15)')).ok
  and (tests.run_as('service_role', null, 'select public.release_stale_sending(15)')).ok);

-- ================================================================== M01 do_not_contact
select tests.act('m01a', 'authenticated', (select w from ids), $q$update public.creators set status = 'do_not_contact' where id = '00000000-0000-0000-0000-00000000fa02'$q$);
select tests.check('M01: a worker can set do_not_contact; the address gets a manual suppression row',
  tests.n('m01a') = 1
  and exists (select 1 from public.suppression_list where email = 'zz-fa2@example.test' and reason = 'manual'));
select tests.act('m01b', 'authenticated', (select w from ids), $q$update public.creators set status = 'contacted' where id = '00000000-0000-0000-0000-00000000fa02'$q$);
select tests.check('M01: a worker cannot lift do_not_contact',
  not tests.ok('m01b')
  and (select status = 'do_not_contact' from public.creators where id = '00000000-0000-0000-0000-00000000fa02'));
select tests.act('m01c', 'authenticated', (select o from ids), $q$update public.creators set status = 'contacted' where id = '00000000-0000-0000-0000-00000000fa02'$q$);
select tests.check('M01: the owner can lift it, and only the manual suppression row goes',
  tests.n('m01c') = 1
  and not exists (select 1 from public.suppression_list where email = 'zz-fa2@example.test'));
-- a real opt-out through opt_out keeps its own reason, and survives the owner lifting do_not_contact
select tests.run_as('service_role', null, $q$select public.opt_out('zz-fa3@example.test', 'unsubscribe link')$q$);
select tests.check('M01: opt_out is recorded with its own reason (not manual) and flips the creator',
  (select reason = 'unsubscribe link' from public.suppression_list where email = 'zz-fa3@example.test')
  and (select status = 'do_not_contact' from public.creators where id = '00000000-0000-0000-0000-00000000fa03'));
select tests.run_as('authenticated', (select o from ids), $q$update public.creators set status = 'contacted' where id = '00000000-0000-0000-0000-00000000fa03'$q$);
select tests.check('M01: lifting by the owner does not remove a real opt-out',
  exists (select 1 from public.suppression_list where email = 'zz-fa3@example.test' and reason = 'unsubscribe link'));
insert into public.creators (full_name, email, status) values ('ZZ AUDIT dnc insert', 'zz-fa4@example.test', 'do_not_contact');
select tests.check('M01: a creator created as do_not_contact is suppressed too',
  exists (select 1 from public.suppression_list where email = 'zz-fa4@example.test' and reason = 'manual'));

-- ================================================================== L13 suppressed address -> do_not_contact on insert
insert into public.suppression_list (email, reason) values ('zz-fa5@example.test', 'unsubscribe link');
insert into public.creators (full_name, email) values ('ZZ AUDIT suppressed', 'zz-fa5@example.test');
select tests.check('L13: a creator inserted with a suppressed address starts as do_not_contact',
  (select status = 'do_not_contact' from public.creators where email = 'zz-fa5@example.test'));

-- ================================================================== M02 deleting a creator
insert into public.creators (id, full_name, email, status) values
  ('00000000-0000-0000-0000-00000000fa11', 'ZZ AUDIT del dnc',  'zz-fa11@example.test', 'contacted'),
  ('00000000-0000-0000-0000-00000000fa12', 'ZZ AUDIT del sent', 'zz-fa12@example.test', 'contacted');
insert into public.emails (id, creator_id, to_email, subject, body) values
  ('00000000-0000-0000-0000-0000000fa111', '00000000-0000-0000-0000-00000000fa11', 'zz-fa11@example.test', 'd', 'x'),
  ('00000000-0000-0000-0000-0000000fa112', '00000000-0000-0000-0000-00000000fa11', 'zz-fa11@example.test', 'a', 'x'),
  ('00000000-0000-0000-0000-0000000fa121', '00000000-0000-0000-0000-00000000fa12', 'zz-fa12@example.test', 'd', 'x'),
  ('00000000-0000-0000-0000-0000000fa122', '00000000-0000-0000-0000-00000000fa12', 'zz-fa12@example.test', 's', 'x');
update public.emails set status = 'approved' where id = '00000000-0000-0000-0000-0000000fa112';
update public.emails set status = 'sending' where id = '00000000-0000-0000-0000-0000000fa122';
update public.emails set status = 'sent', sent_at = now() where id = '00000000-0000-0000-0000-0000000fa122';
update public.creators set status = 'do_not_contact' where id = '00000000-0000-0000-0000-00000000fa11';
select tests.act('m02a', 'authenticated', (select o from ids), $q$delete from public.creators where id = '00000000-0000-0000-0000-00000000fa12'$q$);
select tests.check('M02: a creator with a sent email cannot be deleted (restrict); the draft stays too',
  not tests.ok('m02a')
  and exists (select 1 from public.emails where id = '00000000-0000-0000-0000-0000000fa121')
  and exists (select 1 from public.emails where id = '00000000-0000-0000-0000-0000000fa122'));
select tests.act('m02b', 'authenticated', (select o from ids), $q$delete from public.creators where id = '00000000-0000-0000-0000-00000000fa11'$q$);
select tests.check('M02: a creator with only draft and approved emails is deleted with them',
  tests.n('m02b') = 1
  and not exists (select 1 from public.emails where creator_id = '00000000-0000-0000-0000-00000000fa11'));
select tests.check('M02: a deleted do_not_contact creator stays suppressed',
  exists (select 1 from public.suppression_list where email = 'zz-fa11@example.test'));
select tests.check('M02: emails.creator_id is ON DELETE RESTRICT',
  (select confdeltype = 'r' from pg_constraint where conname = 'emails_creator_id_fkey'));

-- ================================================================== M03 / L05 format and length checks
select tests.check('M03: creators.email refuses spaces, commas, semicolons, angle brackets, two addresses',
  bool_and(not (tests.run_as('authenticated', (select o from ids),
    format('insert into public.creators (full_name, email) values (%L, %L)', 'ZZ AUDIT bad', v))).ok)
  and (tests.run_as('authenticated', (select o from ids),
    $q$insert into public.creators (full_name, email) values ('ZZ AUDIT good', 'zz-good@example.test')$q$)).ok)
from unnest(array['a b@example.test', 'a@example.test,b@example.test', 'a@example.test;b@example.test',
                  '<a@example.test>', 'a@example.test b@example.test', 'no-at-sign', 'a@@example.test']) v;
select tests.check('M03: emails.to_email refuses the same',
  bool_and(not (tests.run_as('postgres', null,
    format($f$insert into public.emails (creator_id, to_email) values ('00000000-0000-0000-0000-00000000fa01', %L)$f$, v))).ok)
  and (tests.run_as('postgres', null,
    $q$insert into public.emails (creator_id, to_email) values ('00000000-0000-0000-0000-00000000fa01', 'zz-fa1@example.test')$q$)).ok)
from unnest(array['a b@example.test', 'a@example.test,b@example.test', 'a@example.test;b@example.test', '<a@example.test>']) v;
select tests.check('M03: contact_messages.email refuses the same',
  bool_and(not (tests.run_as('service_role', null,
    format($f$insert into public.contact_messages (name, email, message) values ('n', %L, 'm')$f$, v))).ok)
  and (tests.run_as('service_role', null,
    $q$insert into public.contact_messages (name, email, message) values ('ZZ AUDIT', 'zz-c@example.test', 'm')$q$)).ok)
from unnest(array['a b@example.test', 'a@example.test,b@example.test', 'a@example.test;b@example.test', '<a@example.test>']) v;
select tests.check('L05: channel_url must start with https://',
  not (tests.run_as('authenticated', (select o from ids), $q$update public.creators set channel_url = 'javascript:alert(1)' where id = '00000000-0000-0000-0000-00000000fa01'$q$)).ok
  and not (tests.run_as('authenticated', (select o from ids), $q$update public.creators set channel_url = 'http://example.test/c' where id = '00000000-0000-0000-0000-00000000fa01'$q$)).ok
  and (tests.run_as('authenticated', (select o from ids), $q$update public.creators set channel_url = 'https://example.test/c' where id = '00000000-0000-0000-0000-00000000fa01'$q$)).ok
  and (tests.run_as('authenticated', (select o from ids), $q$update public.creators set channel_url = null where id = '00000000-0000-0000-0000-00000000fa01'$q$)).ok);
select tests.check('L05: contact_messages name 300, message 5000, topic 2000 characters',
  not (tests.run_as('service_role', null, $q$insert into public.contact_messages (name, email, message) values (repeat('n', 301), 'zz-l@example.test', 'm')$q$)).ok
  and not (tests.run_as('service_role', null, $q$insert into public.contact_messages (name, email, message) values ('n', 'zz-l@example.test', repeat('m', 5001))$q$)).ok
  and not (tests.run_as('service_role', null, $q$insert into public.contact_messages (name, email, message, topic) values ('n', 'zz-l@example.test', 'm', repeat('t', 2001))$q$)).ok
  and (tests.run_as('service_role', null, $q$insert into public.contact_messages (name, email, message, topic) values (repeat('n', 300), 'zz-l@example.test', repeat('m', 5000), repeat('t', 2000))$q$)).ok);
select tests.check('M03/L05: the new checks are NOT VALID (existing rows were not scanned)',
  (select count(*) = 7 and bool_and(not convalidated) from pg_constraint where conname in
    ('creators_email_format', 'creators_channel_url_https', 'emails_to_email_format', 'contact_messages_email_format',
     'contact_messages_name_len', 'contact_messages_message_len', 'contact_messages_topic_len')));

-- ================================================================== L14 bookkeeping columns
select tests.act('l14a', 'authenticated', (select w from ids), format($q$update public.creators set user_id = %L, created_by = %L, niche = 'ZZ' where id = '00000000-0000-0000-0000-00000000fa01'$q$, (select o from ids), (select o from ids)));
select tests.check('L14: a worker cannot change creators.user_id or created_by (other columns still save)',
  tests.n('l14a') = 1
  and (select user_id is null and created_by is distinct from (select o from ids) and niche = 'ZZ' from public.creators where id = '00000000-0000-0000-0000-00000000fa01'));
select tests.act('l14b', 'authenticated', (select o from ids), format($q$update public.creators set user_id = %L where id = '00000000-0000-0000-0000-00000000fa01'$q$, (select o from ids)));
select tests.check('L14: the owner still can',
  tests.n('l14b') = 1 and (select user_id = (select o from ids) from public.creators where id = '00000000-0000-0000-0000-00000000fa01'));
update public.creators set user_id = null where id = '00000000-0000-0000-0000-00000000fa01';
select tests.run_as('service_role', null, $q$insert into public.contact_messages (id, name, email, message) values ('00000000-0000-0000-0000-0000000fa201', 'ZZ AUDIT', 'zz-h@example.test', 'm')$q$);
select tests.run_as('authenticated', (select w from ids), format($q$update public.contact_messages set handled_at = now(), handled_by = %L where id = '00000000-0000-0000-0000-0000000fa201'$q$, (select o from ids)));
select tests.check('L14: contact_messages.handled_by is the caller, not what the client sent',
  (select handled_by = (select w from ids) from public.contact_messages where id = '00000000-0000-0000-0000-0000000fa201'));
select tests.run_as('authenticated', (select w from ids), $q$update public.contact_messages set handled_at = null where id = '00000000-0000-0000-0000-0000000fa201'$q$);
select tests.check('L14: marking a message open again clears handled_by',
  (select handled_by is null from public.contact_messages where id = '00000000-0000-0000-0000-0000000fa201'));

-- ================================================================== L33 emails.source
select tests.check('L33: emails.source defaults to staff and allows only staff, claude, template',
  (select source = 'staff' from public.emails where id = '00000000-0000-0000-0000-0000000fa101')
  and not (tests.run_as('authenticated', (select o from ids), $q$update public.emails set source = 'robot' where id = '00000000-0000-0000-0000-0000000fa102'$q$)).ok
  and (tests.run_as('authenticated', (select o from ids), $q$insert into public.emails (creator_id, to_email, source) values ('00000000-0000-0000-0000-00000000fa01', 'zz-fa1@example.test', 'claude')$q$)).ok
  and (tests.run_as('authenticated', (select o from ids), $q$insert into public.emails (creator_id, to_email, source) values ('00000000-0000-0000-0000-00000000fa01', 'zz-fa1@example.test', 'template')$q$)).ok);

-- ================================================================== M06 log_audit
select tests.check('M06: a worker cannot write owner-type lines (user.*, assistant.*)',
  not (tests.run_as('authenticated', (select w from ids), $q$select public.log_audit('user.invited')$q$)).ok
  and not (tests.run_as('authenticated', (select w from ids), $q$select public.log_audit('user.removed')$q$)).ok
  and not (tests.run_as('authenticated', (select w from ids), $q$select public.log_audit('user.restored')$q$)).ok
  and not (tests.run_as('authenticated', (select w from ids), $q$select public.log_audit('assistant.message')$q$)).ok
  and not (tests.run_as('authenticated', (select w from ids), $q$select public.log_audit('assistant.proposal_approved')$q$)).ok
  and not (tests.run_as('authenticated', (select w from ids), $q$select public.log_audit('assistant.proposal_rejected')$q$)).ok);
select tests.check('M06: the owner can write them; a worker can still write creator.viewed',
  (tests.run_as('authenticated', (select o from ids), $q$select public.log_audit('user.invited')$q$)).ok
  and (tests.run_as('authenticated', (select o from ids), $q$select public.log_audit('assistant.message')$q$)).ok
  and (tests.run_as('authenticated', (select w from ids), $q$select public.log_audit('creator.viewed')$q$)).ok);
select tests.check('M06: 2FA lines: staff may write them only for their own profile',
  (tests.run_as('authenticated', (select w from ids), format($q$select public.log_audit('auth.2fa_enabled', 'profile', %L)$q$, (select w from ids)))).ok
  and (tests.run_as('authenticated', (select w from ids), format($q$select public.log_audit('auth.2fa_removed', 'profile', %L)$q$, (select w from ids)))).ok
  and not (tests.run_as('authenticated', (select w from ids), format($q$select public.log_audit('auth.2fa_enabled', 'profile', %L)$q$, (select o from ids)))).ok
  and not (tests.run_as('authenticated', (select w from ids), $q$select public.log_audit('auth.2fa_enabled')$q$)).ok
  and (tests.run_as('authenticated', (select o from ids), format($q$select public.log_audit('auth.2fa_enabled', 'profile', %L)$q$, (select o from ids)))).ok
  and not (tests.run_as('authenticated', (select o from ids), format($q$select public.log_audit('auth.2fa_removed', 'profile', %L)$q$, (select w from ids)))).ok);

-- ================================================================== M33 no personal values in audit lines
update public.creators set email = 'zz-fa1-new@example.test', phone = '555-0100', notes = 'private note', niche = 'cooking'
 where id = '00000000-0000-0000-0000-00000000fa01';
select tests.check('M33: creator.updated stores {"changed": true} for email, phone and notes, but names the niche change',
  (select details #> '{changes,email}' = '{"changed": true}'::jsonb and details #> '{changes,phone}' = '{"changed": true}'::jsonb
          and details #> '{changes,notes}' = '{"changed": true}'::jsonb and details #>> '{changes,niche,to}' = 'cooking'
     from public.audit_log where action = 'creator.updated' and entity_id = '00000000-0000-0000-0000-00000000fa01'
     order by id desc limit 1)
  and not exists (select 1 from public.audit_log where entity_id = '00000000-0000-0000-0000-00000000fa01'
                  and details::text ~ '(zz-fa1-new|555-0100|private note)'));
select tests.check('M33: email lines carry no address',
  (select not (details ? 'to_email') and details ? 'creator_id' from public.audit_log
    where action = 'email.created' and entity_id = '00000000-0000-0000-0000-0000000fa101' limit 1));

-- ================================================================== M08 login limit
select public.record_login_attempt('zz-l1@example.test', '10.88.1.1', false) from generate_series(1, 5);
select tests.check('M08: 5 failures for one (email, IP) pair refuse that pair',
  not public.login_allowed('ZZ-L1@example.test', '10.88.1.1'));
select tests.check('M08: the same email from another IP is not locked out by it',
  public.login_allowed('zz-l1@example.test', '10.88.1.2'));
select tests.check('M08: 5 failures from the same IP refuse every email from that IP',
  not public.login_allowed('zz-other@example.test', '10.88.1.1') and public.login_allowed('zz-other@example.test', '10.88.1.3'));
select public.record_login_attempt('zz-l2@example.test', '10.88.2.' || g, false) from generate_series(1, 19) g;
select tests.check('M08: 19 failures for one email from 19 IPs are still allowed',
  public.login_allowed('zz-l2@example.test', '10.88.3.1'));
select public.record_login_attempt('zz-l2@example.test', '10.88.2.20', false);
select tests.check('M08: 20 failures for one email across IPs refuse it from anywhere',
  not public.login_allowed('zz-l2@example.test', '10.88.3.1') and not public.login_allowed('zz-l2@example.test', null));
select public.record_login_attempt('zz-l4@example.test', null, false) from generate_series(1, 5);
select tests.check('M08: with no IP known, 5 failures for the email still refuse it', not public.login_allowed('zz-l4@example.test', null));

-- ================================================================== M31 stats_overview
select tests.text_as('authenticated', (select o from ids), $q$select (public.stats_overview() ->> 'emails_failed_7d')$q$) as n0 \gset
insert into public.emails (id, creator_id, to_email, status, is_test) values
  ('00000000-0000-0000-0000-0000000fa301', '00000000-0000-0000-0000-00000000fa01', 'zz-fa1@example.test', 'draft', false),
  ('00000000-0000-0000-0000-0000000fa302', '00000000-0000-0000-0000-00000000fa01', 'zz-fa1@example.test', 'draft', true),
  ('00000000-0000-0000-0000-0000000fa303', '00000000-0000-0000-0000-00000000fa01', 'zz-fa1@example.test', 'draft', false);
update public.emails set status = 'sending' where id in ('00000000-0000-0000-0000-0000000fa301', '00000000-0000-0000-0000-0000000fa302', '00000000-0000-0000-0000-0000000fa303');
update public.emails set status = 'failed', error = 'x' where id in ('00000000-0000-0000-0000-0000000fa301', '00000000-0000-0000-0000-0000000fa302', '00000000-0000-0000-0000-0000000fa303');
select tests.age_email('00000000-0000-0000-0000-0000000fa303', interval '8 days');
select tests.check('M31: stats_overview has emails_failed_7d: real failed sends of the last 7 days only',
  :'n0' is not null
  and tests.text_as('authenticated', (select o from ids), $q$select (public.stats_overview() ->> 'emails_failed_7d')$q$)::int = :'n0'::int + 1);

-- ================================================================== M32 recent_activity
insert into public.audit_log (actor_id, action, entity_type, entity_id, details) values
  ((select w from ids), 'creator.subscribers_refreshed', 'creator', 'FA-refresh', '{"count": 7}'),
  (gen_random_uuid(), 'creator.created', 'creator', 'FA-former', '{"label": "ZZ AUDIT former"}'),
  (null, 'creator.created', 'creator', 'FA-system', '{"label": "ZZ AUDIT system"}'),
  ((select o from ids), 'creator.created', 'creator', '00000000-0000-0000-0000-00000000fa01', '{"label": "stale label"}'),
  ((select o from ids), 'deal.created', 'deal', 'not-a-uuid', '{"creator_id": "also not", "brand_id": "nope"}');
select tests.check('M32: the refresh line shows up (singular name) and reads well',
  tests.text_as('authenticated', (select w from ids), $q$select summary from public.recent_activity(50) where entity_id = 'FA-refresh'$q$) = 'refreshed subscriber counts for 7 creators');
select tests.check('M32: actor is the staff name, "A former user" or "Smallfold"',
  tests.text_as('authenticated', (select w from ids), $q$select actor_name from public.recent_activity(50) where entity_id = 'FA-refresh'$q$)
    = (select full_name from public.profiles where id = (select w from ids))
  and tests.text_as('authenticated', (select w from ids), $q$select actor_name from public.recent_activity(50) where entity_id = 'FA-former'$q$) = 'A former user'
  and tests.text_as('authenticated', (select w from ids), $q$select actor_name from public.recent_activity(50) where entity_id = 'FA-system'$q$) = 'Smallfold');
select tests.check('M32: names come from the creator row (typed lookup) and odd ids do not break the feed',
  tests.text_as('authenticated', (select w from ids), $q$select entity_label from public.recent_activity(50) where entity_id = '00000000-0000-0000-0000-00000000fa01' and action = 'creator.created'$q$) = 'ZZ AUDIT one'
  and tests.rows_as('authenticated', (select w from ids), $q$select * from public.recent_activity(50) where entity_id = 'not-a-uuid'$q$) = 1);
select tests.check('M32: no "Someone" anywhere in the feed',
  tests.rows_as('authenticated', (select w from ids), $q$select * from public.recent_activity(50) where actor_name = 'Someone'$q$) = 0);

-- ================================================================== L02 global cap, L04 reset limit
delete from public.form_rate_limits;
insert into public.form_rate_limits (form, ip_hash) select 'apply', 'fa-' || g from generate_series(1, 199) g;
select tests.check('L02: 199 submissions in the last hour: the next one is allowed',
  public.form_rate_ok('contact', 'fa-visitor-1'));
select tests.check('L02: at 200 in the last hour every submission is refused, even from a new visitor',
  not public.form_rate_ok('contact', 'fa-visitor-2') and not public.form_rate_ok('apply', 'fa-visitor-3'));
update public.form_rate_limits set created_at = now() - interval '2 hours' where created_at > now() - interval '1 minute';
select tests.check('L02: allowed again once the hour has passed', public.form_rate_ok('contact', 'fa-visitor-4'));

select tests.check('L04: reset_allowed is true with no history',
  tests.text_as('service_role', null, $q$select public.reset_allowed('zz-r1@example.test', '10.88.5.1')::text$q$) = 'true');
select public.record_reset_request('zz-r1@example.test', '10.88.5.' || g) from generate_series(1, 3) g;
select tests.check('L04: 3 requests in an hour for one email: refused; another email is fine',
  tests.text_as('service_role', null, $q$select public.reset_allowed('ZZ-R1@example.test', '10.88.5.9')::text$q$) = 'false'
  and tests.text_as('service_role', null, $q$select public.reset_allowed('zz-r2@example.test', '10.88.5.9')::text$q$) = 'true');
select public.record_reset_request('zz-r3-' || g || '@example.test', '10.88.6.1') from generate_series(1, 3) g;
select tests.check('L04: 3 requests in an hour from one IP: refused for any email; no IP is fine',
  tests.text_as('service_role', null, $q$select public.reset_allowed('zz-r4@example.test', '10.88.6.1')::text$q$) = 'false'
  and tests.text_as('service_role', null, $q$select public.reset_allowed('zz-r4@example.test')::text$q$) = 'true');
select tests.check('L04: functions are service_role only; the table has RLS on and no client grants',
  not (tests.run_as('authenticated', (select o from ids), $q$select public.reset_allowed('a@example.test', '1.1.1.1')$q$)).ok
  and not (tests.run_as('anon', null, $q$select public.record_reset_request('a@example.test', '1.1.1.1')$q$)).ok
  and (select relrowsecurity from pg_class where oid = 'public.reset_requests'::regclass)
  and tests.rows_as('authenticated', (select o from ids), 'select * from public.reset_requests') = -1
  and tests.rows_as('anon', null, 'select * from public.reset_requests') = -1
  and tests.rows_as('service_role', null, 'select * from public.reset_requests') = -1);

-- ================================================================== L07 summaries, L09 indexes
select tests.check('L07: creator_summaries keeps its columns and security_invoker',
  (select array_agg(attname::text order by attnum) = array['id','full_name','email','phone','channel_url','youtube_channel_id','channel_name','niche',
     'subscribers','subscribers_hidden','subscribers_checked_at','status','notes','user_id','created_by','created_at','updated_at',
     'deal_count','total_earned_cents','last_contacted_at']
     from pg_attribute where attrelid = 'public.creator_summaries'::regclass and attnum > 0 and not attisdropped)
  and (select 'security_invoker=true' = any (reloptions) from pg_class where oid = 'public.creator_summaries'::regclass)
  and tests.rows_as('anon', null, 'select * from public.creator_summaries') = -1);
select tests.check('L07: deal count, earnings and last contact equal the plain calculation for every creator',
  not exists (select 1 from public.creator_summaries s join public.creators c on c.id = s.id
    where s.deal_count <> (select count(*) from public.deals d where d.creator_id = c.id)
       or s.total_earned_cents <> coalesce((select sum(d.amount_cents - d.commission_cents) from public.deals d where d.creator_id = c.id and d.stage = 'paid'), 0)
       or s.last_contacted_at is distinct from greatest(c.last_contacted_at,
            (select max(e.sent_at) from public.emails e where e.creator_id = c.id and e.status in ('sent','replied') and not e.is_test))));
select tests.check('L09: the new indexes exist and no earlier index was dropped',
  (select count(*) = 10 from pg_indexes where schemaname = 'public' and indexname in
    ('audit_log_action_idx','audit_log_actor_idx','deals_stage_changed_idx','emails_template_idx','emails_drafted_by_idx',
     'emails_approved_by_idx','emails_sent_by_idx','deals_created_by_idx','creators_created_by_idx','contact_messages_handled_by_idx'))
  and (select count(*) = 17 from pg_indexes where schemaname = 'public' and indexname in
    ('creators_full_name_trgm','creators_email_trgm','creators_channel_name_trgm','creators_status_idx','creators_created_at_idx',
     'deals_creator_idx','deals_brand_idx','deals_stage_idx','deals_created_idx','emails_creator_idx','emails_status_idx',
     'emails_created_at_idx','emails_sent_at_idx','audit_log_created_idx','audit_log_entity_idx','login_attempts_email_idx','login_attempts_ip_idx')));

-- ================================================================== L11 default privileges
select tests.check('L11: no public function is executable by PUBLIC or anon',
  not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace,
              lateral aclexplode(coalesce(p.proacl, acldefault('f'::"char", p.proowner))) a
              where n.nspname = 'public' and p.prokind in ('f', 'p')
                and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
                and a.privilege_type = 'EXECUTE'
                and a.grantee in (0, (select oid from pg_roles where rolname = 'anon')))
  and not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.prokind in ('f', 'p')
                    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
                    and has_function_privilege('anon', p.oid, 'execute')));
create function public.fa_probe() returns int language sql as 'select 1';
select tests.check('L11: a new function created by a migration is not executable by PUBLIC, anon or authenticated',
  not has_function_privilege('anon', 'public.fa_probe()', 'execute')
  and not has_function_privilege('authenticated', 'public.fa_probe()', 'execute')
  and not exists (select 1 from pg_proc p, lateral aclexplode(coalesce(p.proacl, acldefault('f'::"char", p.proowner))) a
                  where p.oid = 'public.fa_probe()'::regprocedure and a.grantee = 0));

-- ================================================================== L38 Claude conversation delete
insert into public.assistant_threads (id, owner_id, title) values ('00000000-0000-0000-0000-0000000fa401', (select o from ids), 'ZZ AUDIT chat');
insert into public.assistant_messages (thread_id, owner_id, role, content)
values ('00000000-0000-0000-0000-0000000fa401', (select o from ids), 'user', '[{"type":"text","text":"hi"}]');
insert into public.assistant_proposals (thread_id, owner_id, kind, payload, summary)
values ('00000000-0000-0000-0000-0000000fa401', (select o from ids), 'creator.create', '{}', 'ZZ AUDIT proposal');
select tests.check('L38: a worker cannot delete a conversation; nobody can delete a message alone or edit one',
  tests.rows_as('authenticated', (select w from ids), $q$delete from public.assistant_threads where id = '00000000-0000-0000-0000-0000000fa401'$q$) <= 0
  and tests.rows_as('authenticated', (select o from ids), $q$delete from public.assistant_messages where thread_id = '00000000-0000-0000-0000-0000000fa401'$q$) = -1
  and tests.rows_as('service_role', null, $q$delete from public.assistant_threads where id = '00000000-0000-0000-0000-0000000fa401'$q$) = -1
  and not (tests.run_as('authenticated', (select o from ids), $q$update public.assistant_messages set role = 'assistant' where thread_id = '00000000-0000-0000-0000-0000000fa401'$q$)).ok
  and exists (select 1 from public.assistant_threads where id = '00000000-0000-0000-0000-0000000fa401'));
select tests.act('l38', 'authenticated', (select o from ids), $q$delete from public.assistant_threads where id = '00000000-0000-0000-0000-0000000fa401'$q$);
select tests.check('L38: the owner deletes their own conversation; its messages and proposals go with it',
  tests.n('l38') = 1
  and not exists (select 1 from public.assistant_messages where thread_id = '00000000-0000-0000-0000-0000000fa401')
  and not exists (select 1 from public.assistant_proposals where thread_id = '00000000-0000-0000-0000-0000000fa401'));

-- ================================================================== L48 audit_actions
select tests.check('L48: audit_actions() lists each action once for the owner; a worker gets nothing; anon is denied',
  tests.rows_as('authenticated', (select o from ids), 'select * from public.audit_actions()') = (select count(distinct action) from public.audit_log)
  and tests.rows_as('authenticated', (select o from ids), 'select * from public.audit_actions() x where x = ''creator.created''') = 1
  and tests.rows_as('authenticated', (select w from ids), 'select * from public.audit_actions()') = 0
  and tests.rows_as('anon', null, 'select * from public.audit_actions()') = -1);

do $$ declare f int; begin select count(*) filter (where not ok) into f from tests.results;
  raise notice '% checks, % failed', (select count(*) from tests.results), f;
  if f > 0 then raise exception 'fixes tests failed: %', (select string_agg(name, '; ') from tests.results where not ok); end if; end $$;
rollback;
