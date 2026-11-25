-- Tests for migration 20261125001100 (security review and QA fixes): SR-01, 02, 03, 05, 06, 07, 09, 12, 15, 16 and B-1.
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

-- fixtures. Ids use hex only (prefix f).
insert into public.creators (id, full_name, email, status, subscribers) values
  ('00000000-0000-0000-0000-0000000f0a01', 'ZZ RF creator one', 'zz-rf-c1@example.test', 'new', 5000),
  ('00000000-0000-0000-0000-0000000f0a02', 'ZZ RF creator two', 'zz-rf-c2@example.test', 'new', 6000);
insert into public.brands (id, name, relationship) values
  ('00000000-0000-0000-0000-0000000f0b01', 'ZZ RF sponsor one', 'prospect'),
  ('00000000-0000-0000-0000-0000000f0b02', 'ZZ RF sponsor dnc', 'do_not_contact');
insert into public.brand_contacts (id, brand_id, full_name, email) values
  ('00000000-0000-0000-0000-0000000f0c01', '00000000-0000-0000-0000-0000000f0b01', 'ZZ RF contact one', 'zz-rf-k1-old@example.test'),
  ('00000000-0000-0000-0000-0000000f0c02', '00000000-0000-0000-0000-0000000f0b01', 'ZZ RF contact two', 'zz-rf-k2@example.test'),
  ('00000000-0000-0000-0000-0000000f0c03', '00000000-0000-0000-0000-0000000f0b01', 'ZZ RF contact three', 'zz-rf-k3@example.test'),
  ('00000000-0000-0000-0000-0000000f0c04', '00000000-0000-0000-0000-0000000f0b01', 'ZZ RF contact four', 'zz-rf-k4@example.test');

-- ================================================================== SR-01 sponsor Do not contact
select tests.act('s1_worker_lift', 'authenticated', (select w from ids), $q$update public.brands set relationship = 'prospect' where id = '00000000-0000-0000-0000-0000000f0b02'$q$);
select tests.check('SR-01: a worker cannot take a sponsor off Do not contact (clear message)',
  not tests.ok('s1_worker_lift') and tests.err('s1_worker_lift') = 'Only the owner can take a sponsor off do not contact.'
  and (select relationship = 'do_not_contact' from public.brands where id = '00000000-0000-0000-0000-0000000f0b02'));
select tests.act('s1_worker_edit', 'authenticated', (select w from ids), $q$update public.brands set notes = 'edited' where id = '00000000-0000-0000-0000-0000000f0b02'$q$);
select tests.check('SR-01: a worker can still edit other fields of a Do not contact sponsor', tests.ok('s1_worker_edit'));
select tests.act('s1_worker_set', 'authenticated', (select w from ids), $q$update public.brands set relationship = 'do_not_contact' where id = '00000000-0000-0000-0000-0000000f0b01'$q$);
select tests.check('SR-01: a worker can still PUT a sponsor on Do not contact', tests.ok('s1_worker_set'));
select tests.act('s1_worker_lift2', 'authenticated', (select w from ids), $q$update public.brands set relationship = 'talks' where id = '00000000-0000-0000-0000-0000000f0b01'$q$);
select tests.check('SR-01: ... and cannot lift it again', not tests.ok('s1_worker_lift2'));
select tests.act('s1_owner_lift', 'authenticated', (select o from ids), $q$update public.brands set relationship = 'prospect' where id = '00000000-0000-0000-0000-0000000f0b01'$q$);
select tests.check('SR-01: the owner can take a sponsor off Do not contact', tests.ok('s1_owner_lift')
  and (select relationship = 'prospect' from public.brands where id = '00000000-0000-0000-0000-0000000f0b01'));

-- ================================================================== SR-06 counters
select tests.act('s6_w_brand', 'authenticated', (select w from ids), $q$update public.brands set sponsorship_count = 999, last_sponsorship_at = current_date, detected_sponsorship_count = 5, last_detected_sponsorship_at = current_date, notes = 'n6' where id = '00000000-0000-0000-0000-0000000f0b01'$q$);
select tests.check('SR-06: a worker cannot write the counters of a sponsor (other fields in the same update still go through)',
  tests.ok('s6_w_brand') and (select sponsorship_count = 0 and last_sponsorship_at is null and detected_sponsorship_count = 0 and last_detected_sponsorship_at is null and notes = 'n6'
     from public.brands where id = '00000000-0000-0000-0000-0000000f0b01'));
select tests.act('s6_o_brand', 'authenticated', (select o from ids), $q$update public.brands set sponsorship_count = 999 where id = '00000000-0000-0000-0000-0000000f0b01'$q$);
select tests.check('SR-06: the owner cannot write them either', (select sponsorship_count = 0 from public.brands where id = '00000000-0000-0000-0000-0000000f0b01'));
select tests.act('s6_w_cr', 'authenticated', (select w from ids), $q$update public.creators set sponsorship_count = 999, detected_sponsorship_count = 7, last_sponsorship_at = current_date, last_detected_sponsorship_at = current_date, niche = 'n6' where id = '00000000-0000-0000-0000-0000000f0a01'$q$);
select tests.act('s6_o_cr', 'authenticated', (select o from ids), $q$update public.creators set sponsorship_count = 999 where id = '00000000-0000-0000-0000-0000000f0a02'$q$);
select tests.check('SR-06: counters on creators cannot be written by a worker or the owner',
  tests.ok('s6_w_cr') and (select sponsorship_count = 0 and detected_sponsorship_count = 0 and last_sponsorship_at is null and last_detected_sponsorship_at is null and niche = 'n6'
     from public.creators where id = '00000000-0000-0000-0000-0000000f0a01')
  and (select sponsorship_count = 0 from public.creators where id = '00000000-0000-0000-0000-0000000f0a02'));
select tests.act('s6_creator_dnc', 'authenticated', (select w from ids), $q$update public.creators set status = 'do_not_contact' where id = '00000000-0000-0000-0000-0000000f0a02'$q$);
select tests.act('s6_creator_lift', 'authenticated', (select w from ids), $q$update public.creators set status = 'new' where id = '00000000-0000-0000-0000-0000000f0a02'$q$);
select tests.check('unchanged: a worker still cannot take a creator off Do not contact', tests.ok('s6_creator_dnc') and not tests.ok('s6_creator_lift')
  and tests.err('s6_creator_lift') like 'Only the owner can take a creator off do not contact.%');
update public.creators set status = 'new' where id = '00000000-0000-0000-0000-0000000f0a02';
-- the rollup (security definer) still keeps them
insert into public.sponsorships (creator_id, brand_id, sponsored_on, source_label, origin, confirmed_by, confirmed_at, video_url)
values ('00000000-0000-0000-0000-0000000f0a01', '00000000-0000-0000-0000-0000000f0b01', current_date - 3, 'confirmed', 'manual', (select o from ids), now(), 'https://youtu.be/rf-counter');
select tests.check('SR-06: the rollup still writes the counters',
  (select sponsorship_count = 1 and last_sponsorship_at = current_date - 3 from public.creators where id = '00000000-0000-0000-0000-0000000f0a01')
  and (select sponsorship_count = 1 and last_sponsorship_at = current_date - 3 from public.brands where id = '00000000-0000-0000-0000-0000000f0b01'));

-- ================================================================== SR-02 exports
create temp table mark as select coalesce(max(id), 0) as m from public.audit_log;
grant select on mark to public;
select tests.act('x_c_w', 'authenticated', (select w from ids), $q$select * from public.creators_export()$q$);
select tests.act('x_s_w', 'authenticated', (select w from ids), $q$select * from public.sponsors_export('{}'::jsonb)$q$);
select tests.act('x_c_svc', 'service_role', null, $q$select * from public.creators_export()$q$);
select tests.act('x_s_svc', 'service_role', null, $q$select * from public.sponsors_export('{}'::jsonb)$q$);
select tests.act('x_c_anon', 'anon', null, $q$select * from public.creators_export()$q$);
select tests.act('x_s_anon', 'anon', null, $q$select * from public.sponsors_export('{}'::jsonb)$q$);
select tests.check('SR-02: a worker calling creators_export or sponsors_export directly is refused, with no rows and no audit line',
  not tests.ok('x_c_w') and tests.err('x_c_w') like 'Only the owner%' and not tests.ok('x_s_w') and tests.err('x_s_w') like 'Only the owner%'
  and not exists (select 1 from public.audit_log where id > (select m from mark) and action in ('creators.exported', 'brands.exported')));
select tests.check('SR-02: the service role and anon cannot call them either',
  not tests.ok('x_c_svc') and not tests.ok('x_s_svc') and not tests.ok('x_c_anon') and not tests.ok('x_s_anon'));
-- The browser tests export as the owner and leave real audit lines from the last half hour; the "later page needs a recent first page"
-- rule would then find one. Push them back a day inside this rolled-back transaction (the audit log is append-only otherwise).
set local session_replication_role = replica;
update public.audit_log set created_at = created_at - interval '1 day' where action in ('creators.exported', 'brands.exported') and created_at > now() - interval '31 minutes';
set local session_replication_role = origin;
select tests.act('x_c_page2_first', 'authenticated', (select o from ids), $q$select * from public.creators_export(p_offset => 1000)$q$);
select tests.check('SR-02: a later page without a first page (no audit line yet) is refused', not tests.ok('x_c_page2_first'));
select tests.act('x_c_o', 'authenticated', (select o from ids), $q$select * from public.creators_export()$q$);
select tests.act('x_c_o2', 'authenticated', (select o from ids), $q$select * from public.creators_export(p_offset => 1000)$q$);
select tests.check('SR-02: the owner gets the rows, and exactly one creators.exported line with the count and no personal data (later pages add none)',
  tests.ok('x_c_o') and tests.n('x_c_o') >= 2 and tests.ok('x_c_o2')
  and (select count(*) = 1 from public.audit_log where id > (select m from mark) and action = 'creators.exported')
  and (select (details ->> 'count')::bigint = (select count(*) from public.creators) and details::text not like '%@%' and actor_id = (select o from ids)
        from public.audit_log where id > (select m from mark) and action = 'creators.exported'));
select tests.act('x_s_o', 'authenticated', (select o from ids), $q$select * from public.sponsors_export('{}'::jsonb)$q$);
select tests.act('x_s_o2', 'authenticated', (select o from ids), $q$select * from public.sponsors_export('{}'::jsonb, 'name', null, 1000, 1000)$q$);
select tests.check('SR-02: sponsors_export for the owner: rows, exactly one brands.exported line with the count, no personal data',
  tests.ok('x_s_o') and tests.n('x_s_o') >= 2 and tests.ok('x_s_o2')
  and (select count(*) = 1 from public.audit_log where id > (select m from mark) and action = 'brands.exported')
  and (select (details ->> 'count')::bigint = (select count(*) from public.brands) and details::text not like '%@%'
        from public.audit_log where id > (select m from mark) and action = 'brands.exported'));
select tests.check('SR-02: a worker still cannot write the export audit lines through log_audit',
  not (tests.run_as('authenticated', (select w from ids), $q$select public.log_audit('creators.exported')$q$)).ok
  and not (tests.run_as('authenticated', (select w from ids), $q$select public.log_audit('brands.exported')$q$)).ok);

-- ================================================================== SR-03 contact address and unsent emails
-- three contact emails: e1 approved (k1), e2 draft (k2), e3 approved (k3); a creator email e4 approved (unchanged by contact edits)
insert into public.emails (id, creator_id, to_email, subject, body, brand_id, recipient_kind, brand_contact_id) values
  ('00000000-0000-0000-0000-0000000f0e01', '00000000-0000-0000-0000-0000000f0a01', 'zz-rf-k1-old@example.test', 'P1', 'B', '00000000-0000-0000-0000-0000000f0b01', 'brand_contact', '00000000-0000-0000-0000-0000000f0c01'),
  ('00000000-0000-0000-0000-0000000f0e02', '00000000-0000-0000-0000-0000000f0a01', 'zz-rf-k2@example.test', 'P2', 'B', '00000000-0000-0000-0000-0000000f0b01', 'brand_contact', '00000000-0000-0000-0000-0000000f0c02'),
  ('00000000-0000-0000-0000-0000000f0e03', '00000000-0000-0000-0000-0000000f0a01', 'zz-rf-k3@example.test', 'P3', 'B', '00000000-0000-0000-0000-0000000f0b01', 'brand_contact', '00000000-0000-0000-0000-0000000f0c03'),
  ('00000000-0000-0000-0000-0000000f0e04', '00000000-0000-0000-0000-0000000f0a01', 'zz-rf-c1@example.test', 'P4', 'B', null, 'creator', null),
  ('00000000-0000-0000-0000-0000000f0e05', '00000000-0000-0000-0000-0000000f0a01', 'zz-rf-k4@example.test', 'P5', 'B', '00000000-0000-0000-0000-0000000f0b01', 'brand_contact', '00000000-0000-0000-0000-0000000f0c04');
update public.emails set status = 'approved', approved_at = now(), approved_by = (select w from ids) where id in
  ('00000000-0000-0000-0000-0000000f0e01', '00000000-0000-0000-0000-0000000f0e03', '00000000-0000-0000-0000-0000000f0e04', '00000000-0000-0000-0000-0000000f0e05');
-- the address changes (a worker edits the contact)
select tests.act('s3_edit', 'authenticated', (select w from ids), $q$update public.brand_contacts set email = 'zz-rf-k1-new@example.test' where id = '00000000-0000-0000-0000-0000000f0c01'$q$);
select tests.check('SR-03: when a contact''s address changes, its approved email goes back to draft with the NEW address',
  tests.ok('s3_edit') and (select status = 'draft' and to_email = 'zz-rf-k1-new@example.test' and approved_by is null and approved_at is null
     from public.emails where id = '00000000-0000-0000-0000-0000000f0e01'));
update public.emails set status = 'approved' where id = '00000000-0000-0000-0000-0000000f0e01';
select tests.json_as('service_role', null, format('select public.reserve_send(%L, %L)', '00000000-0000-0000-0000-0000000f0e01', (select w from ids))) as r \gset
select tests.check('SR-03: after re-approval the email goes to the new address (test mode: to the test address, never the old one)',
  :'r'::jsonb ->> 'ok' = 'true' and :'r'::jsonb ->> 'to_email' = 'owner@example.test'
  and (select to_email = 'zz-rf-k1-new@example.test' from public.emails where id = '00000000-0000-0000-0000-0000000f0e01'));
-- a draft email follows the address too; the creator email is untouched
select tests.act('s3_edit2', 'authenticated', (select w from ids), $q$update public.brand_contacts set email = 'zz-rf-k2-new@example.test' where id = '00000000-0000-0000-0000-0000000f0c02'$q$);
select tests.check('SR-03: a draft email to the contact follows the new address; a creator email is not touched',
  (select status = 'draft' and to_email = 'zz-rf-k2-new@example.test' from public.emails where id = '00000000-0000-0000-0000-0000000f0e02')
  and (select status = 'approved' and to_email = 'zz-rf-c1@example.test' from public.emails where id = '00000000-0000-0000-0000-0000000f0e04'));
-- the contact edit changes something else only: nothing happens to the email
select tests.act('s3_edit3', 'authenticated', (select w from ids), $q$update public.brand_contacts set role_title = 'Head of partnerships' where id = '00000000-0000-0000-0000-0000000f0c03'$q$);
select tests.check('SR-03: editing other fields of the contact leaves an approved email approved', (select status = 'approved' from public.emails where id = '00000000-0000-0000-0000-0000000f0e03'));
-- the address is removed
select tests.act('s3_clear', 'authenticated', (select w from ids), $q$update public.brand_contacts set email = null where id = '00000000-0000-0000-0000-0000000f0c03'$q$);
select tests.check('SR-03: when the contact loses its address, the approved email drops to draft and is refused at send time',
  tests.ok('s3_clear') and (select status = 'draft' from public.emails where id = '00000000-0000-0000-0000-0000000f0e03'));
-- a person may still press Approve on the draft (the guard checks the address only when it changes); the send is what refuses
update public.emails set status = 'approved' where id = '00000000-0000-0000-0000-0000000f0e03';
select tests.json_as('service_role', null, format('select public.reserve_send(%L, %L)', '00000000-0000-0000-0000-0000000f0e03', (select w from ids))) as r \gset
select tests.check('SR-03: reserve_send refuses it at the moment of sending, with a clear reason (contact_no_address)', :'r'::jsonb ->> 'reason' = 'contact_no_address');
-- the contact is removed
delete from public.brand_contacts where id = '00000000-0000-0000-0000-0000000f0c04';
select tests.check('SR-03: when the contact is removed, the approved email drops to draft',
  (select status = 'draft' and brand_contact_id is null from public.emails where id = '00000000-0000-0000-0000-0000000f0e05'));
update public.emails set status = 'approved' where id = '00000000-0000-0000-0000-0000000f0e05';
select tests.json_as('service_role', null, format('select public.reserve_send(%L, %L)', '00000000-0000-0000-0000-0000000f0e05', (select w from ids))) as r \gset
select tests.check('SR-03: ... and reserve_send still refuses it (no_contact)', :'r'::jsonb ->> 'reason' = 'no_contact');
-- stale address that got past the trigger (trigger off for the test only): reserve_send catches it
insert into public.brand_contacts (id, brand_id, full_name, email) values
  ('00000000-0000-0000-0000-0000000f0c05', '00000000-0000-0000-0000-0000000f0b01', 'ZZ RF contact five', 'zz-rf-k5-old@example.test');
insert into public.emails (id, creator_id, to_email, subject, body, brand_id, recipient_kind, brand_contact_id)
  values ('00000000-0000-0000-0000-0000000f0e06', '00000000-0000-0000-0000-0000000f0a01', 'zz-rf-k5-old@example.test', 'P6', 'B', '00000000-0000-0000-0000-0000000f0b01', 'brand_contact', '00000000-0000-0000-0000-0000000f0c05');
update public.emails set status = 'approved' where id = '00000000-0000-0000-0000-0000000f0e06';
alter table public.brand_contacts disable trigger trg_contact_email_sync;
update public.brand_contacts set email = 'zz-rf-k5-new@example.test' where id = '00000000-0000-0000-0000-0000000f0c05';
alter table public.brand_contacts enable trigger trg_contact_email_sync;
select tests.json_as('service_role', null, format('select public.reserve_send(%L, %L)', '00000000-0000-0000-0000-0000000f0e06', (select w from ids))) as r \gset
select tests.check('SR-03: reserve_send refuses an approved email whose address is stale (contact_changed)', :'r'::jsonb ->> 'reason' = 'contact_changed'
  and (select status = 'approved' from public.emails where id = '00000000-0000-0000-0000-0000000f0e06'));
-- a new address that is on the suppression list: the contact edit works, the email is marked failed with a reason
insert into public.brand_contacts (id, brand_id, full_name, email) values
  ('00000000-0000-0000-0000-0000000f0c06', '00000000-0000-0000-0000-0000000f0b01', 'ZZ RF contact six', 'zz-rf-k6@example.test');
insert into public.emails (id, creator_id, to_email, subject, body, brand_id, recipient_kind, brand_contact_id)
  values ('00000000-0000-0000-0000-0000000f0e07', '00000000-0000-0000-0000-0000000f0a01', 'zz-rf-k6@example.test', 'P7', 'B', '00000000-0000-0000-0000-0000000f0b01', 'brand_contact', '00000000-0000-0000-0000-0000000f0c06');
insert into public.suppression_list (email, reason) values ('zz-rf-k6-blocked@example.test', 'manual');
select tests.act('s3_supp', 'authenticated', (select w from ids), $q$update public.brand_contacts set email = 'zz-rf-k6-blocked@example.test' where id = '00000000-0000-0000-0000-0000000f0c06'$q$);
select tests.check('SR-03: a blocked new address does not break the contact edit; the email is marked failed with a plain reason',
  tests.ok('s3_supp') and (select status = 'failed' and error like 'The contact person%' from public.emails where id = '00000000-0000-0000-0000-0000000f0e07'));

-- ================================================================== SR-05 label rules
insert into public.sponsorships (id, creator_id, brand_id, sponsored_on, source_label, origin, detection_signal, detection_confidence, evidence_note) values
  ('00000000-0000-0000-0000-0000000f5001', '00000000-0000-0000-0000-0000000f0a02', '00000000-0000-0000-0000-0000000f0b01', current_date - 9, 'detected', 'detected', 'sponsored_by', 'high', 'scanner note'),
  ('00000000-0000-0000-0000-0000000f5002', '00000000-0000-0000-0000-0000000f0a02', '00000000-0000-0000-0000-0000000f0b02', current_date - 8, 'detected', 'import', 'imported_unverified', 'low', 'import note');
select tests.act('s5_reuse', 'authenticated', (select w from ids), $q$update public.sponsorships set source_label = 'confirmed' where id = '00000000-0000-0000-0000-0000000f5001'$q$);
select tests.act('s5_same', 'authenticated', (select w from ids), $q$update public.sponsorships set source_label = 'confirmed', evidence_note = 'scanner note' where id = '00000000-0000-0000-0000-0000000f5001'$q$);
select tests.check('SR-05a: confirming with the old note (scanner or import) is refused',
  not tests.ok('s5_reuse') and not tests.ok('s5_same') and (select source_label = 'detected' from public.sponsorships where id = '00000000-0000-0000-0000-0000000f5001'));
select tests.act('s5_fresh', 'authenticated', (select w from ids), $q$update public.sponsorships set source_label = 'confirmed', evidence_note = 'I watched the video and saw the disclosure' where id = '00000000-0000-0000-0000-0000000f5001'$q$);
select tests.check('SR-05a: confirming with a fresh note works and takes the person from the login',
  tests.ok('s5_fresh') and (select source_label = 'confirmed' and confirmed_by = (select w from ids) from public.sponsorships where id = '00000000-0000-0000-0000-0000000f5001'));
select tests.act('s5_ins_import', 'authenticated', (select w from ids), $q$insert into public.sponsorships (creator_id, brand_id, source_label, origin) values ('00000000-0000-0000-0000-0000000f0a02', '00000000-0000-0000-0000-0000000f0b01', 'confirmed', 'import')$q$);
select tests.act('s5_ins_det', 'authenticated', (select w from ids), $q$insert into public.sponsorships (creator_id, brand_id, source_label, origin) values ('00000000-0000-0000-0000-0000000f0a02', '00000000-0000-0000-0000-0000000f0b01', 'confirmed', 'detected')$q$);
select tests.act('s5_ins_svc', 'service_role', null, $q$insert into public.sponsorships (creator_id, brand_id, source_label, origin, confirmed_by, confirmed_at) values ('00000000-0000-0000-0000-0000000f0a02', '00000000-0000-0000-0000-0000000f0b01', 'confirmed', 'import', '00000000-0000-0000-0000-000000000001', now())$q$);
select tests.act('s5_ins_pg', 'postgres', null, $q$insert into public.sponsorships (creator_id, brand_id, source_label, origin, confirmed_by, confirmed_at) values ('00000000-0000-0000-0000-0000000f0a02', '00000000-0000-0000-0000-0000000f0b01', 'confirmed', 'detected', (select id from public.profiles limit 1), now())$q$);
select tests.check('SR-05b: a Confirmed record cannot be created with origin import or detected, by a worker, the service role or the database owner',
  not tests.ok('s5_ins_import') and not tests.ok('s5_ins_det') and not tests.ok('s5_ins_svc') and not tests.ok('s5_ins_pg'));
select tests.act('s5_ins_manual', 'authenticated', (select w from ids), $q$insert into public.sponsorships (creator_id, brand_id, sponsored_on, source_label, origin) values ('00000000-0000-0000-0000-0000000f0a02', '00000000-0000-0000-0000-0000000f0b02', current_date - 30, 'confirmed', 'manual')$q$);
select tests.check('unchanged: a person can still add a Confirmed record by hand', tests.ok('s5_ins_manual'));
-- a rejected record
select tests.act('s5_rej', 'authenticated', (select w from ids), $q$update public.sponsorships set rejected = true where id = '00000000-0000-0000-0000-0000000f5002'$q$);
select tests.act('s5_rej_conf', 'authenticated', (select w from ids), $q$update public.sponsorships set source_label = 'confirmed', evidence_note = 'checked by me' where id = '00000000-0000-0000-0000-0000000f5002'$q$);
select tests.act('s5_rej_both', 'authenticated', (select w from ids), $q$update public.sponsorships set rejected = false, source_label = 'confirmed', evidence_note = 'checked by me too' where id = '00000000-0000-0000-0000-0000000f5002'$q$);
select tests.check('SR-05: a rejected record cannot be confirmed, not even in the same update that restores it',
  tests.ok('s5_rej') and not tests.ok('s5_rej_conf') and not tests.ok('s5_rej_both')
  and (select rejected and source_label = 'detected' from public.sponsorships where id = '00000000-0000-0000-0000-0000000f5002'));
select tests.act('s5_restore', 'authenticated', (select w from ids), $q$update public.sponsorships set rejected = false where id = '00000000-0000-0000-0000-0000000f5002'$q$);
select tests.act('s5_restore_conf', 'authenticated', (select w from ids), $q$update public.sponsorships set source_label = 'confirmed' where id = '00000000-0000-0000-0000-0000000f5002'$q$);
select tests.check('SR-05: after a restore, confirming still needs a fresh note',
  tests.ok('s5_restore') and not tests.ok('s5_restore_conf'));
select tests.act('s5_restore_conf2', 'authenticated', (select w from ids), $q$update public.sponsorships set source_label = 'confirmed', evidence_note = 'checked after restore' where id = '00000000-0000-0000-0000-0000000f5002'$q$);
select tests.check('SR-05: ... and works with one', tests.ok('s5_restore_conf2'));
select tests.check('SR-05: the facts view holds no detected or rejected rows',
  not exists (select 1 from public.creator_sponsorship_facts f join public.sponsorships s on s.id = f.id where s.source_label <> 'confirmed' or s.rejected));

-- ================================================================== SR-09 video link host
select tests.act('v_bad1', 'authenticated', (select w from ids), $q$insert into public.sponsorships (creator_id, brand_id, source_label, origin, video_url) values ('00000000-0000-0000-0000-0000000f0a02', '00000000-0000-0000-0000-0000000f0b01', 'confirmed', 'manual', 'https://evil.example/watch?v=1')$q$);
select tests.act('v_bad2', 'authenticated', (select w from ids), $q$insert into public.sponsorships (creator_id, brand_id, source_label, origin, video_url) values ('00000000-0000-0000-0000-0000000f0a02', '00000000-0000-0000-0000-0000000f0b01', 'confirmed', 'manual', 'https://youtube.com.evil.example/watch?v=2')$q$);
select tests.act('v_bad3', 'authenticated', (select w from ids), $q$insert into public.sponsorships (creator_id, brand_id, source_label, origin, video_url) values ('00000000-0000-0000-0000-0000000f0a02', '00000000-0000-0000-0000-0000000f0b01', 'confirmed', 'manual', 'https://youtube.com@evil.example/watch?v=3')$q$);
select tests.act('v_bad4', 'authenticated', (select w from ids), $q$insert into public.sponsorships (creator_id, brand_id, source_label, origin, video_url) values ('00000000-0000-0000-0000-0000000f0a02', '00000000-0000-0000-0000-0000000f0b01', 'confirmed', 'manual', 'http://www.youtube.com/watch?v=4')$q$);
select tests.act('v_bad5', 'authenticated', (select w from ids), $q$insert into public.sponsorships (creator_id, brand_id, source_label, origin, video_url) values ('00000000-0000-0000-0000-0000000f0a02', '00000000-0000-0000-0000-0000000f0b01', 'confirmed', 'manual', 'https://notyoutube.com/watch?v=5')$q$);
select tests.check('SR-09: links to other sites, look-alike hosts, user-info tricks and plain http are refused',
  not tests.ok('v_bad1') and not tests.ok('v_bad2') and not tests.ok('v_bad3') and not tests.ok('v_bad4') and not tests.ok('v_bad5'));
select tests.act('v_ok1', 'authenticated', (select w from ids), $q$insert into public.sponsorships (creator_id, brand_id, source_label, origin, video_url) values ('00000000-0000-0000-0000-0000000f0a02', '00000000-0000-0000-0000-0000000f0b01', 'confirmed', 'manual', 'https://www.youtube.com/watch?v=ok1')$q$);
select tests.act('v_ok2', 'authenticated', (select w from ids), $q$insert into public.sponsorships (creator_id, brand_id, source_label, origin, video_url) values ('00000000-0000-0000-0000-0000000f0a02', '00000000-0000-0000-0000-0000000f0b01', 'confirmed', 'manual', 'https://youtu.be/ok2')$q$);
select tests.act('v_ok3', 'authenticated', (select w from ids), $q$insert into public.sponsorships (creator_id, brand_id, source_label, origin, video_url) values ('00000000-0000-0000-0000-0000000f0a02', '00000000-0000-0000-0000-0000000f0b01', 'confirmed', 'manual', 'https://m.youtube.com/watch?v=ok3')$q$);
select tests.act('v_ok4', 'authenticated', (select w from ids), $q$insert into public.sponsorships (creator_id, brand_id, source_label, origin, video_url) values ('00000000-0000-0000-0000-0000000f0a02', '00000000-0000-0000-0000-0000000f0b01', 'confirmed', 'manual', 'https://youtube.com/shorts/ok4')$q$);
select tests.act('v_ok5', 'authenticated', (select w from ids), $q$insert into public.sponsorships (creator_id, brand_id, source_label, origin) values ('00000000-0000-0000-0000-0000000f0a02', '00000000-0000-0000-0000-0000000f0b01', 'confirmed', 'manual')$q$);
select tests.check('SR-09: YouTube links (youtube.com, www, m, youtu.be) and no link at all are accepted',
  tests.ok('v_ok1') and tests.ok('v_ok2') and tests.ok('v_ok3') and tests.ok('v_ok4') and tests.ok('v_ok5'));
select tests.check('SR-09: the constraint is validated (every existing row passes)',
  (select convalidated from pg_constraint where conname = 'sponsorships_video_host' and conrelid = 'public.sponsorships'::regclass));

-- ================================================================== SR-07 and B-1 deals
insert into public.deals (id, creator_id, brand_id, stage, amount_cents) values
  ('00000000-0000-0000-0000-0000000f0d01', '00000000-0000-0000-0000-0000000f0a01', '00000000-0000-0000-0000-0000000f0b01', 'negotiating', 100000),
  ('00000000-0000-0000-0000-0000000f0d02', '00000000-0000-0000-0000-0000000f0a02', '00000000-0000-0000-0000-0000000f0b01', 'negotiating', 100000),
  ('00000000-0000-0000-0000-0000000f0d03', '00000000-0000-0000-0000-0000000f0a02', '00000000-0000-0000-0000-0000000f0b02', 'negotiating', 50000);
select tests.act('d1_complete', 'authenticated', (select w from ids), $q$update public.deals set stage = 'completed' where id = '00000000-0000-0000-0000-0000000f0d01'$q$);
select tests.check('deal record: completing a deal makes one record, origin deal, Confirmed',
  (select count(*) = 1 and bool_and(origin = 'deal' and source_label = 'confirmed') from public.sponsorships where deal_id = '00000000-0000-0000-0000-0000000f0d01'));
select tests.act('d1_back', 'authenticated', (select w from ids), $q$update public.deals set stage = 'negotiating' where id = '00000000-0000-0000-0000-0000000f0d01'$q$);
select tests.check('SR-07: moving the deal back takes back the record it made, and the counters follow',
  tests.ok('d1_back') and (select count(*) = 0 from public.sponsorships where deal_id = '00000000-0000-0000-0000-0000000f0d01')
  and (select sponsorship_count = 1 from public.creators where id = '00000000-0000-0000-0000-0000000f0a01'));
select tests.act('d1_again', 'authenticated', (select w from ids), $q$update public.deals set stage = 'paid' where id = '00000000-0000-0000-0000-0000000f0d01'$q$);
select tests.check('SR-07: completing it again makes one record again',
  (select count(*) = 1 from public.sponsorships where deal_id = '00000000-0000-0000-0000-0000000f0d01'));
-- a record someone has added a video to is kept when the deal moves back
select tests.act('d2_complete', 'authenticated', (select w from ids), $q$update public.deals set stage = 'completed' where id = '00000000-0000-0000-0000-0000000f0d02'$q$);
select tests.act('d2_video', 'authenticated', (select w from ids), $q$update public.sponsorships set video_url = 'https://youtu.be/rf-deal2', sponsored_on = current_date - 4 where deal_id = '00000000-0000-0000-0000-0000000f0d02'$q$);
select tests.act('d2_back', 'authenticated', (select w from ids), $q$update public.deals set stage = 'negotiating' where id = '00000000-0000-0000-0000-0000000f0d02'$q$);
select tests.check('SR-07: a deal record that a person completed with a video link stays when the deal moves back',
  tests.ok('d2_video') and tests.ok('d2_back') and (select count(*) = 1 from public.sponsorships where deal_id = '00000000-0000-0000-0000-0000000f0d02'));
-- B-1: delete a deal that reached Paid (as the owner): the record stays, marked as from a deal, deal link cleared
select count(*) as before_sp from public.sponsorships \gset
select tests.act('b1_delete', 'authenticated', (select o from ids), $q$delete from public.deals where id = '00000000-0000-0000-0000-0000000f0d01'$q$);
select tests.check('B-1: the owner can delete a deal that reached Paid; the record stays, still origin deal and Confirmed, deal link cleared',
  tests.ok('b1_delete') and tests.n('b1_delete') = 1
  and not exists (select 1 from public.deals where id = '00000000-0000-0000-0000-0000000f0d01')
  and (select count(*) from public.sponsorships) = :before_sp
  and (select count(*) = 1 and bool_and(origin = 'deal' and source_label = 'confirmed' and deal_id is null and not rejected)
         from public.sponsorships where creator_id = '00000000-0000-0000-0000-0000000f0a01' and brand_id = '00000000-0000-0000-0000-0000000f0b01' and origin = 'deal'));
select tests.check('B-1: the counters still count the kept record',
  (select sponsorship_count = 2 from public.creators where id = '00000000-0000-0000-0000-0000000f0a01'));
-- deleting a deal that never completed works as before; a worker still cannot delete
select tests.act('b1_worker_delete', 'authenticated', (select w from ids), $q$delete from public.deals where id = '00000000-0000-0000-0000-0000000f0d03'$q$);
select tests.act('b1_open_delete', 'authenticated', (select o from ids), $q$delete from public.deals where id = '00000000-0000-0000-0000-0000000f0d03'$q$);
select tests.check('B-1: an open deal can still be deleted by the owner only', tests.n('b1_worker_delete') = 0 and tests.n('b1_open_delete') = 1);
-- the relaxed constraint still holds the rest of the rule
select tests.act('b1_label', 'postgres', null, $q$insert into public.sponsorships (creator_id, brand_id, source_label, origin, detection_signal, detection_confidence) values ('00000000-0000-0000-0000-0000000f0a02', '00000000-0000-0000-0000-0000000f0b01', 'detected', 'deal', 'x', 'low')$q$);
select tests.check('B-1: origin deal still requires a Confirmed record', not tests.ok('b1_label'));
select tests.act('w_clear_deal', 'authenticated', (select w from ids), $q$update public.sponsorships set deal_id = null, origin = 'manual' where deal_id = '00000000-0000-0000-0000-0000000f0d02'$q$);
select tests.check('B-1: a client still cannot change origin or deal_id by hand',
  (select count(*) = 1 from public.sponsorships where deal_id = '00000000-0000-0000-0000-0000000f0d02' and origin = 'deal'));

-- ================================================================== SR-12, SR-15, SR-16
select tests.check('SR-12: global_search, like_pattern, sponsor_* and sponsors_* all have pg_temp in their search_path',
  not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.prokind = 'f'
                 and (p.proname in ('global_search', 'like_pattern') or p.proname like 'sponsor\_%' or p.proname like 'sponsors\_%')
                 and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%pg_temp%'))
  and (select count(*) >= 10 from pg_proc p where p.proname like 'sponsor%' or p.proname = 'global_search'));
select tests.act('n_w_ins', 'authenticated', (select w from ids), $q$insert into public.niches (slug, name, sort_order) values ('zz-rf', 'ZZ', 99)$q$);
select tests.act('n_w_upd', 'authenticated', (select w from ids), $q$update public.niches set name = 'Hacked' where slug = 'tech'$q$);
select tests.act('n_w_del', 'authenticated', (select w from ids), $q$delete from public.niches where slug = 'music'$q$);
select tests.act('n_o_upd', 'authenticated', (select o from ids), $q$update public.niches set name = 'Tech and gadgets' where slug = 'tech'$q$);
select tests.check('SR-16: a worker cannot add, rename or delete niches; the owner can edit; workers can still read',
  not tests.ok('n_w_ins') and tests.n('n_w_upd') = 0 and tests.n('n_w_del') = 0 and tests.n('n_o_upd') = 1
  and tests.rows_as('authenticated', (select w from ids), 'select 1 from public.niches') = 12
  and (select name = 'Tech and gadgets' from public.niches where slug = 'tech'));
select tests.check('SR-15: brand.viewed must name a real sponsor; a real one still works; padding is refused',
  not (tests.run_as('authenticated', (select w from ids), $q$select public.log_audit('brand.viewed', 'brand', 'not-a-sponsor', '{}')$q$)).ok
  and not (tests.run_as('authenticated', (select w from ids), $q$select public.log_audit('brand.viewed', 'creator', '00000000-0000-0000-0000-0000000f0b01', '{}')$q$)).ok
  and (tests.run_as('authenticated', (select w from ids), $q$select public.log_audit('brand.viewed', 'brand', '00000000-0000-0000-0000-0000000f0b01', '{"mode":"page"}')$q$)).ok);

do $$ declare f int; begin select count(*) filter (where not ok) into f from tests.results;
  raise notice '% checks, % failed', (select count(*) from tests.results), f;
  if f > 0 then raise exception 'review_fixes tests failed: %', (select string_agg(name, '; ') from tests.results where not ok); end if; end $$;
rollback;
