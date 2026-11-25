-- Tests for migration 20261125000900 (outreach / pitch drafts): the new email columns, the guard, reserve_send and mark_sent for
-- an email about a sponsor and an email to a sponsor's contact person, and that the old creator behaviour is unchanged.
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
create function tests.json_as(p_role text, p_uid uuid, p_sql text) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform set_config('request.jwt.claims', jsonb_strip_nulls(jsonb_build_object('role', p_role, 'sub', p_uid))::text, true);
  execute format('set local role %I', p_role);
  begin execute p_sql into v; exception when others then v := jsonb_build_object('error', sqlerrm); end;
  reset role; return v;
end $$;
create table tests.acts (label text primary key, ok boolean, n bigint, err text);
create function tests.act(p_label text, p_role text, p_uid uuid, p_sql text) returns void language plpgsql as $$
begin insert into tests.acts select p_label, r.ok, r.n, r.err from tests.run_as(p_role, p_uid, p_sql) r; end $$;
create function tests.ok(p_label text) returns boolean language sql as $$ select ok from tests.acts where label = p_label $$;
create function tests.err(p_label text) returns text language sql as $$ select err from tests.acts where label = p_label $$;

create temp table ids as select (select id from public.profiles where email = 'owner@example.test') as o,
                                (select id from public.profiles where email = 'worker@example.test') as w;
grant select on ids to public;
delete from auth.mfa_factors;
update public.settings set daily_send_limit = 100, min_seconds_between_sends = 0;

-- fixtures: creators (one fine, one do_not_contact), sponsors (one fine, one do_not_contact), contacts
insert into public.creators (id, full_name, email, status) values
  ('00000000-0000-0000-0000-0000000000a1', 'ZZ OUT creator ok',  'zz-out-c1@example.test', 'new'),
  ('00000000-0000-0000-0000-0000000000a2', 'ZZ OUT creator dnc', 'zz-out-c2@example.test', 'do_not_contact');
insert into public.brands (id, name, relationship) values
  ('00000000-0000-0000-0000-0000000000b1', 'ZZ OUT sponsor ok',  'prospect'),
  ('00000000-0000-0000-0000-0000000000b2', 'ZZ OUT sponsor dnc', 'do_not_contact'),
  ('00000000-0000-0000-0000-0000000000b3', 'ZZ OUT sponsor two', 'prospect');
insert into public.brand_contacts (id, brand_id, full_name, email) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', 'ZZ Contact One', 'zz-out-k1@example.test'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000b2', 'ZZ Contact Dnc', 'zz-out-k2@example.test'),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000b3', 'ZZ Contact Other', 'zz-out-k3@example.test');

-- ================================================================== columns and the old behaviour
select tests.check('emails has brand_id, recipient_kind (default creator), brand_contact_id and pitch_facts',
  (select count(*) = 4 from information_schema.columns where table_schema = 'public' and table_name = 'emails'
     and column_name in ('brand_id', 'recipient_kind', 'brand_contact_id', 'pitch_facts'))
  and (select column_default like '%creator%' from information_schema.columns where table_name = 'emails' and column_name = 'recipient_kind'));

select tests.act('old_ok', 'authenticated', (select w from ids),
  $q$insert into public.emails (id, creator_id, to_email, subject, body) values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1', 'zz-out-c1@example.test', 'Hi', 'Body')$q$);
select tests.check('unchanged: a worker can still draft an email to a creator (no sponsor, kind creator)',
  tests.ok('old_ok') and (select recipient_kind = 'creator' and brand_id is null from public.emails where id = '00000000-0000-0000-0000-0000000000e1'));
select tests.act('old_wrong', 'authenticated', (select w from ids),
  $q$insert into public.emails (creator_id, to_email, subject, body) values ('00000000-0000-0000-0000-0000000000a1', 'someone-else@example.test', 'Hi', 'Body')$q$);
select tests.check('unchanged: to_email must still be the creator''s current address', not tests.ok('old_wrong') and tests.err('old_wrong') like '%current address%');
select tests.act('old_dnc', 'authenticated', (select w from ids),
  $q$insert into public.emails (creator_id, to_email, subject, body) values ('00000000-0000-0000-0000-0000000000a2', 'zz-out-c2@example.test', 'Hi', 'Body')$q$);
select tests.check('unchanged: a draft to a do_not_contact creator is refused', not tests.ok('old_dnc') and tests.err('old_dnc') like '%do_not_contact%');

-- ================================================================== pitch to the creator, about a sponsor
select tests.act('p_creator', 'authenticated', (select w from ids),
  $q$insert into public.emails (id, creator_id, to_email, subject, body, brand_id, pitch_facts)
     values ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000a1', 'zz-out-c1@example.test', 'Pitch', 'Body',
             '00000000-0000-0000-0000-0000000000b1', '{"used": ["Niche: Tech"], "left_out": ["Prices"]}')$q$);
select tests.check('a pitch draft to a creator, with the sponsor attached and its facts, is saved as a draft',
  tests.ok('p_creator') and (select status = 'draft' and brand_id is not null and recipient_kind = 'creator' and pitch_facts -> 'used' ->> 0 = 'Niche: Tech'
                               from public.emails where id = '00000000-0000-0000-0000-0000000000e2'));
select tests.act('p_creator_dnc_brand', 'authenticated', (select w from ids),
  $q$insert into public.emails (creator_id, to_email, subject, body, brand_id) values ('00000000-0000-0000-0000-0000000000a1', 'zz-out-c1@example.test', 'Pitch', 'Body', '00000000-0000-0000-0000-0000000000b2')$q$);
select tests.check('a draft about a do_not_contact sponsor is refused (even to the creator)', not tests.ok('p_creator_dnc_brand') and tests.err('p_creator_dnc_brand') like '%sponsor is do_not_contact%');
select tests.act('p_bad_facts', 'authenticated', (select w from ids),
  $q$insert into public.emails (creator_id, to_email, subject, body, brand_id, pitch_facts) values ('00000000-0000-0000-0000-0000000000a1', 'zz-out-c1@example.test', 'P', 'B', '00000000-0000-0000-0000-0000000000b1', '[1]')$q$);
select tests.check('pitch_facts must be an object', not tests.ok('p_bad_facts'));

-- ================================================================== to a sponsor's contact, about a creator
select tests.act('k_ok', 'authenticated', (select w from ids),
  $q$insert into public.emails (id, creator_id, to_email, subject, body, brand_id, recipient_kind, brand_contact_id)
     values ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000a1', 'zz-out-k1@example.test', 'Pitch', 'Body',
             '00000000-0000-0000-0000-0000000000b1', 'brand_contact', '00000000-0000-0000-0000-0000000000c1')$q$);
select tests.check('a draft to a contact person (with the creator it is about) is saved as a draft', tests.ok('k_ok')
  and (select status = 'draft' and recipient_kind = 'brand_contact' and creator_id is not null from public.emails where id = '00000000-0000-0000-0000-0000000000e3'));
select tests.act('k_wrong_addr', 'authenticated', (select w from ids),
  $q$insert into public.emails (creator_id, to_email, subject, body, brand_id, recipient_kind, brand_contact_id)
     values ('00000000-0000-0000-0000-0000000000a1', 'zz-out-c1@example.test', 'P', 'B', '00000000-0000-0000-0000-0000000000b1', 'brand_contact', '00000000-0000-0000-0000-0000000000c1')$q$);
select tests.check('a contact email must be written to the contact''s current address (not the creator''s)', not tests.ok('k_wrong_addr') and tests.err('k_wrong_addr') like '%contact person%');
select tests.act('k_no_contact', 'authenticated', (select w from ids),
  $q$insert into public.emails (creator_id, to_email, subject, body, brand_id, recipient_kind)
     values ('00000000-0000-0000-0000-0000000000a1', 'zz-out-k1@example.test', 'P', 'B', '00000000-0000-0000-0000-0000000000b1', 'brand_contact')$q$);
select tests.check('a contact email needs the contact person', not tests.ok('k_no_contact'));
select tests.act('k_other_brand', 'authenticated', (select w from ids),
  $q$insert into public.emails (creator_id, to_email, subject, body, brand_id, recipient_kind, brand_contact_id)
     values ('00000000-0000-0000-0000-0000000000a1', 'zz-out-k3@example.test', 'P', 'B', '00000000-0000-0000-0000-0000000000b1', 'brand_contact', '00000000-0000-0000-0000-0000000000c3')$q$);
select tests.check('a contact of another sponsor is refused', not tests.ok('k_other_brand'));
select tests.act('k_no_brand', 'authenticated', (select w from ids),
  $q$insert into public.emails (creator_id, to_email, subject, body, recipient_kind, brand_contact_id)
     values ('00000000-0000-0000-0000-0000000000a1', 'zz-out-k1@example.test', 'P', 'B', 'brand_contact', '00000000-0000-0000-0000-0000000000c1')$q$);
select tests.check('a contact email with no sponsor is refused', not tests.ok('k_no_brand'));
select tests.act('k_dnc_brand', 'authenticated', (select w from ids),
  $q$insert into public.emails (creator_id, to_email, subject, body, brand_id, recipient_kind, brand_contact_id)
     values ('00000000-0000-0000-0000-0000000000a1', 'zz-out-k2@example.test', 'P', 'B', '00000000-0000-0000-0000-0000000000b2', 'brand_contact', '00000000-0000-0000-0000-0000000000c2')$q$);
select tests.check('a draft to a do_not_contact sponsor''s contact is refused', not tests.ok('k_dnc_brand') and tests.err('k_dnc_brand') like '%sponsor is do_not_contact%');
select tests.act('k_dnc_creator', 'authenticated', (select w from ids),
  $q$insert into public.emails (creator_id, to_email, subject, body, brand_id, recipient_kind, brand_contact_id)
     values ('00000000-0000-0000-0000-0000000000a2', 'zz-out-k1@example.test', 'P', 'B', '00000000-0000-0000-0000-0000000000b1', 'brand_contact', '00000000-0000-0000-0000-0000000000c1')$q$);
select tests.check('a draft to a contact about a do_not_contact creator is refused', not tests.ok('k_dnc_creator') and tests.err('k_dnc_creator') like '%creator is do_not_contact%');
insert into public.suppression_list (email, reason) values ('zz-out-k1@example.test', 'test');
select tests.act('k_suppressed', 'authenticated', (select w from ids),
  $q$insert into public.emails (creator_id, to_email, subject, body, brand_id, recipient_kind, brand_contact_id)
     values ('00000000-0000-0000-0000-0000000000a1', 'zz-out-k1@example.test', 'P', 'B', '00000000-0000-0000-0000-0000000000b1', 'brand_contact', '00000000-0000-0000-0000-0000000000c1')$q$);
select tests.check('a draft to a contact whose address is on the suppression list is refused', not tests.ok('k_suppressed') and tests.err('k_suppressed') like '%suppression list%');
delete from public.suppression_list where email = 'zz-out-k1@example.test';

-- a worker cannot turn a creator email into a contact email (or the reverse) to get round the address check
select tests.act('k_flip', 'authenticated', (select w from ids),
  $q$update public.emails set recipient_kind = 'brand_contact', brand_id = '00000000-0000-0000-0000-0000000000b1' where id = '00000000-0000-0000-0000-0000000000e1'$q$);
select tests.check('changing a creator email into a contact email without the contact is refused', not tests.ok('k_flip'));

-- ================================================================== approving and sending
select tests.act('k_approve', 'authenticated', (select w from ids), $q$update public.emails set status = 'approved' where id = '00000000-0000-0000-0000-0000000000e3'$q$);
select tests.check('the contact draft can be approved (by a click), and then it is approved by the worker', tests.ok('k_approve')
  and (select status = 'approved' and approved_by = (select w from ids) from public.emails where id = '00000000-0000-0000-0000-0000000000e3'));
select tests.act('k_edit_contact', 'authenticated', (select w from ids), $q$update public.emails set subject = 'Changed' where id = '00000000-0000-0000-0000-0000000000e3'$q$);
select tests.check('editing an approved contact email puts it back to draft', (select status from public.emails where id = '00000000-0000-0000-0000-0000000000e3') = 'draft');
update public.emails set status = 'approved' where id = '00000000-0000-0000-0000-0000000000e3';   -- postgres (guard is bypassed for the bookkeeping, not for the checks)

-- test mode: the mail goes to the test address, never the contact's address; the creator is untouched
select tests.json_as('service_role', null, format('select public.reserve_send(%L, %L)', '00000000-0000-0000-0000-0000000000e3', (select w from ids))) as r \gset
select tests.check('reserve_send (test mode) for a contact email: goes to the TEST address with [TEST], not to the contact',
  :'r'::jsonb ->> 'ok' = 'true' and :'r'::jsonb ->> 'to_email' = 'owner@example.test' and :'r'::jsonb ->> 'to_email' <> 'zz-out-k1@example.test'
  and :'r'::jsonb ->> 'subject_prefix' = '[TEST] ');
select tests.json_as('service_role', null, format('select public.mark_sent(%L, %L, %L)', '00000000-0000-0000-0000-0000000000e3', '<k1@x>', (select w from ids))) as r \gset
select tests.check('mark_sent (test) for a contact email changes neither the creator nor the sponsor',
  :'r'::jsonb ->> 'ok' = 'true'
  and (select status = 'new' and last_contacted_at is null from public.creators where id = '00000000-0000-0000-0000-0000000000a1')
  and (select last_contacted_at is null from public.brands where id = '00000000-0000-0000-0000-0000000000b1'));

-- the sponsor becomes do_not_contact after the draft was approved
insert into public.emails (id, creator_id, to_email, subject, body, brand_id, recipient_kind, brand_contact_id, status)
  values ('00000000-0000-0000-0000-0000000000e4', '00000000-0000-0000-0000-0000000000a1', 'zz-out-k3@example.test', 'P', 'B',
          '00000000-0000-0000-0000-0000000000b3', 'brand_contact', '00000000-0000-0000-0000-0000000000c3', 'approved');
update public.brands set relationship = 'do_not_contact' where id = '00000000-0000-0000-0000-0000000000b3';
select tests.json_as('service_role', null, format('select public.reserve_send(%L, %L)', '00000000-0000-0000-0000-0000000000e4', (select w from ids))) as r \gset
select tests.check('reserve_send refuses an approved email when the sponsor has become do_not_contact',
  :'r'::jsonb ->> 'reason' = 'sponsor_do_not_contact' and (select status = 'approved' from public.emails where id = '00000000-0000-0000-0000-0000000000e4'));
update public.brands set relationship = 'prospect' where id = '00000000-0000-0000-0000-0000000000b3';

-- the creator becomes do_not_contact: a contact email about them is refused too
update public.creators set status = 'do_not_contact' where id = '00000000-0000-0000-0000-0000000000a1';
select tests.json_as('service_role', null, format('select public.reserve_send(%L, %L)', '00000000-0000-0000-0000-0000000000e4', (select w from ids))) as r \gset
select tests.check('reserve_send refuses a contact email about a creator who is do_not_contact', :'r'::jsonb ->> 'reason' = 'do_not_contact');
update public.creators set status = 'new' where id = '00000000-0000-0000-0000-0000000000a1';

-- the contact's CURRENT address is on the suppression list (the address was changed after the draft, or opted out)
update public.brand_contacts set email = 'zz-out-k3-new@example.test' where id = '00000000-0000-0000-0000-0000000000c3';
update public.emails set status = 'approved' where id = '00000000-0000-0000-0000-0000000000e4';  -- the contact change dropped it back to draft (review fix SR-03)
insert into public.suppression_list (email, reason) values ('zz-out-k3-new@example.test', 'test');
select tests.json_as('service_role', null, format('select public.reserve_send(%L, %L)', '00000000-0000-0000-0000-0000000000e4', (select w from ids))) as r \gset
select tests.check('reserve_send checks the suppression list against the contact''s current address too', :'r'::jsonb ->> 'reason' = 'suppressed');
delete from public.suppression_list where email = 'zz-out-k3-new@example.test';
-- since SR-03 the stored address follows the contact, so the address the mail is written to is the new one
insert into public.suppression_list (email, reason) values ('zz-out-k3-new@example.test', 'test');
select tests.json_as('service_role', null, format('select public.reserve_send(%L, %L)', '00000000-0000-0000-0000-0000000000e4', (select w from ids))) as r \gset
select tests.check('reserve_send checks the suppression list against the address the mail is written to (to_email)', :'r'::jsonb ->> 'reason' = 'suppressed');
delete from public.suppression_list where email = 'zz-out-k3-new@example.test';

-- the contact person was deleted after the draft
delete from public.brand_contacts where id = '00000000-0000-0000-0000-0000000000c3';
update public.emails set status = 'approved' where id = '00000000-0000-0000-0000-0000000000e4';  -- deleting the contact dropped it back to draft (review fix SR-03)
select tests.json_as('service_role', null, format('select public.reserve_send(%L, %L)', '00000000-0000-0000-0000-0000000000e4', (select w from ids))) as r \gset
select tests.check('reserve_send refuses a contact email whose contact person was deleted', :'r'::jsonb ->> 'reason' = 'no_contact'
  and (select brand_contact_id is null and status = 'approved' from public.emails where id = '00000000-0000-0000-0000-0000000000e4'));

-- real mode: a sent contact email stamps the SPONSOR, not the creator
update public.settings set test_mode = false, sender_postal_address = '1 Test Street';
insert into public.emails (id, creator_id, to_email, subject, body, brand_id, recipient_kind, brand_contact_id, status)
  values ('00000000-0000-0000-0000-0000000000e5', '00000000-0000-0000-0000-0000000000a1', 'zz-out-k1@example.test', 'P', 'B',
          '00000000-0000-0000-0000-0000000000b1', 'brand_contact', '00000000-0000-0000-0000-0000000000c1', 'approved');
select tests.json_as('service_role', null, format('select public.reserve_send(%L, %L)', '00000000-0000-0000-0000-0000000000e5', (select w from ids))) as r \gset
select tests.check('reserve_send (real mode) for a contact email goes to the contact''s address', :'r'::jsonb ->> 'ok' = 'true' and :'r'::jsonb ->> 'to_email' = 'zz-out-k1@example.test' and :'r'::jsonb ->> 'is_test' = 'false');
select tests.json_as('service_role', null, format('select public.mark_sent(%L, %L, %L)', '00000000-0000-0000-0000-0000000000e5', '<k5@x>', (select w from ids))) as r \gset
select tests.check('mark_sent (real) for a contact email stamps the sponsor and leaves the creator as they were',
  :'r'::jsonb ->> 'ok' = 'true'
  and (select last_contacted_at is not null from public.brands where id = '00000000-0000-0000-0000-0000000000b1')
  and (select status = 'new' and last_contacted_at is null from public.creators where id = '00000000-0000-0000-0000-0000000000a1'));
-- a real creator email still marks the creator (old behaviour)
insert into public.emails (id, creator_id, to_email, subject, body, status)
  values ('00000000-0000-0000-0000-0000000000e6', '00000000-0000-0000-0000-0000000000a1', 'zz-out-c1@example.test', 'P', 'B', 'approved');
select tests.json_as('service_role', null, format('select public.reserve_send(%L, %L)', '00000000-0000-0000-0000-0000000000e6', (select w from ids))) as r \gset
select tests.json_as('service_role', null, format('select public.mark_sent(%L, %L, %L)', '00000000-0000-0000-0000-0000000000e6', '<c6@x>', (select w from ids))) as r2 \gset
select tests.check('unchanged: a real send to a creator marks the creator contacted',
  :'r'::jsonb ->> 'ok' = 'true' and :'r2'::jsonb ->> 'ok' = 'true'
  and (select status = 'contacted' and last_contacted_at is not null from public.creators where id = '00000000-0000-0000-0000-0000000000a1'));
update public.settings set test_mode = true, sender_postal_address = null;

-- ================================================================== audit
select tests.check('the audit line of a pitch email carries ids only (sponsor and kind)',
  exists (select 1 from public.audit_log where entity_type = 'email' and entity_id = '00000000-0000-0000-0000-0000000000e3' and action = 'email.created'
            and details ->> 'brand_id' = '00000000-0000-0000-0000-0000000000b1' and details ->> 'recipient_kind' = 'brand_contact')
  and not exists (select 1 from public.audit_log where entity_type = 'email' and entity_id = '00000000-0000-0000-0000-0000000000e3' and details::text like '%zz-out-k1%'));
select tests.check('log_audit still accepts email.drafted from staff and refuses unknown actions',
  (tests.run_as('authenticated', (select w from ids), $q$select public.log_audit('email.drafted', 'email', 'x', '{"pitch": true}')$q$)).ok
  and not (tests.run_as('authenticated', (select w from ids), $q$select public.log_audit('email.pitched')$q$)).ok);
select tests.check('anon and no-role users cannot read the new columns', (select count(*) from public.emails) > 0
  and coalesce((tests.run_as('anon', null, 'select pitch_facts from public.emails')).ok, false) is false);

do $$ declare f int; begin select count(*) filter (where not ok) into f from tests.results;
  raise notice '% checks, % failed', (select count(*) from tests.results), f;
  if f > 0 then raise exception 'outreach tests failed: %', (select string_agg(name, '; ') from tests.results where not ok); end if; end $$;
rollback;
