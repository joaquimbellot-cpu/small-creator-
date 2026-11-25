-- Tests for migrations 20261125000100 to 20261125000400 (niches, sponsors, sponsorships, tags, lists, saved views,
-- the matched stage and an empty amount, summary views, audit). Everything is rolled back.
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
delete from auth.mfa_factors;   -- live data may hold real enrolments; start clean (rolled back)

-- fixtures: two creators (c1, c2), two sponsors (b1, b2). Ids use hex only.
insert into public.creators (id, full_name, email, status, subscribers) values
  ('00000000-0000-0000-0000-00000000c001', 'ZZ SP one', 'zz-sp1@example.test', 'new', 5000),
  ('00000000-0000-0000-0000-00000000c002', 'ZZ SP two', 'zz-sp2@example.test', 'new', 7000);
insert into public.brands (id, name) values
  ('00000000-0000-0000-0000-00000000b001', 'ZZ Sponsor One'),
  ('00000000-0000-0000-0000-00000000b002', 'ZZ Sponsor Two');

-- ================================================================== reference data and shape
select tests.check('niches: the 12 slugs exist', (select count(*) from public.niches) = 12
  and (select count(*) from public.niches where slug in ('tech','gaming','diy','cooking','fitness','finance','travel','education','beauty','music','photo','outdoors')) = 12);
select tests.check('deal_stage: matched comes before contacted',
  (select array_position(array_agg(e.enumlabel order by e.enumsortorder), 'matched') = 1
          and array_position(array_agg(e.enumlabel order by e.enumsortorder), 'contacted') = 2
     from pg_enum e where e.enumtypid = 'public.deal_stage'::regtype));
select tests.check('creator_summaries: old columns first, new ones appended',
  (select (array_agg(attname::text order by attnum))[21:] = array['niche_slug','language','country','avg_views','avg_views_checked_at',
     'last_video_at','uploads_per_month','engagement_rate','audience_countries','sponsorship_count','last_sponsorship_at',
     'detected_sponsorship_count','last_detected_sponsorship_at']
     from pg_attribute where attrelid = 'public.creator_summaries'::regclass and attnum > 0 and not attisdropped));
select tests.check('brand_summaries: security invoker, has contact_count, deal_count, open_deal_count',
  (select 'security_invoker=true' = any (reloptions) from pg_class where oid = 'public.brand_summaries'::regclass)
  and (select count(*) = 3 from pg_attribute where attrelid = 'public.brand_summaries'::regclass and attname in ('contact_count','deal_count','open_deal_count')));

-- ================================================================== RLS: anon sees nothing, a worker cannot delete
select tests.check('anon: every new table and view is denied',
  bool_and(not (tests.run_as('anon', null, 'select * from public.' || t)).ok)
  and bool_and(not (tests.run_as('anon', null, 'insert into public.' || t || ' default values')).ok))
from unnest(array['niches','brand_contacts','sponsorships','tags','creator_tags','brand_tags','lists','list_items','saved_views']) t;
select tests.check('anon: views denied',
  not (tests.run_as('anon', null, 'select * from public.brand_summaries')).ok
  and not (tests.run_as('anon', null, 'select * from public.creator_sponsorship_facts')).ok);

insert into public.brand_contacts (id, brand_id, full_name, role_title, email, phone, is_primary) values
  ('00000000-0000-0000-0000-00000000d001', '00000000-0000-0000-0000-00000000b001', 'Zed Contact', 'Partnerships', 'zz-contact1@example.test', '+1-555-0100', true);
insert into public.tags (id, name, scope) values ('00000000-0000-0000-0000-00000000e001', 'zz tag', 'creator'),
                                                  ('00000000-0000-0000-0000-00000000e002', 'zz brand tag', 'brand');
insert into public.lists (id, name, kind) values ('00000000-0000-0000-0000-00000000f001', 'zz list', 'creators');

select tests.check('worker: reads the new tables',
  tests.rows_as('authenticated', (select w from ids), 'select * from public.niches') = 12
  and tests.rows_as('authenticated', (select w from ids), 'select * from public.brand_contacts where id = ''00000000-0000-0000-0000-00000000d001''') = 1
  and tests.rows_as('authenticated', (select w from ids), 'select * from public.tags') >= 2
  and tests.rows_as('authenticated', (select w from ids), 'select * from public.brand_summaries') >= 2);
select tests.act('w_ins_contact', 'authenticated', (select w from ids), $q$insert into public.brand_contacts (brand_id, full_name, email) values ('00000000-0000-0000-0000-00000000b002', 'Worker Added', 'zz-contact2@example.test')$q$);
select tests.act('w_ins_tag', 'authenticated', (select w from ids), $q$insert into public.tags (name, scope) values ('zz worker tag', 'creator')$q$);
select tests.act('w_ins_list', 'authenticated', (select w from ids), $q$insert into public.lists (name, kind) values ('zz worker list', 'brands')$q$);
select tests.check('worker: can add contacts, tags and lists', tests.n('w_ins_contact') = 1 and tests.n('w_ins_tag') = 1 and tests.n('w_ins_list') = 1);
select tests.check('worker: cannot delete contacts, tags, lists, niches',
  tests.rows_as('authenticated', (select w from ids), 'delete from public.brand_contacts') <= 0
  and tests.rows_as('authenticated', (select w from ids), 'delete from public.tags') <= 0
  and tests.rows_as('authenticated', (select w from ids), 'delete from public.lists') <= 0
  and tests.rows_as('authenticated', (select w from ids), 'delete from public.niches') <= 0);
select tests.check('worker: nothing was deleted',
  (select count(*) from public.brand_contacts where id = '00000000-0000-0000-0000-00000000d001') = 1
  and (select count(*) from public.niches) = 12 and (select count(*) from public.lists where name = 'zz list') = 1);
select tests.act('w_ins_wrong_tag', 'authenticated', (select w from ids), $q$insert into public.creator_tags (creator_id, tag_id) values ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-00000000e002')$q$);
select tests.act('w_ins_right_tag', 'authenticated', (select w from ids), $q$insert into public.creator_tags (creator_id, tag_id) values ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-00000000e001')$q$);
select tests.check('tags: a brand tag cannot go on a creator; a creator tag can; staff can take a tag off',
  not tests.ok('w_ins_wrong_tag') and tests.n('w_ins_right_tag') = 1);
select tests.act('w_del_tagrow', 'authenticated', (select w from ids), $q$delete from public.creator_tags where tag_id = '00000000-0000-0000-0000-00000000e001'$q$);
select tests.check('tags: a worker can remove a tag link', tests.n('w_del_tagrow') = 1);
select tests.act('w_item_wrong', 'authenticated', (select w from ids), $q$insert into public.list_items (list_id, brand_id) values ('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-00000000b001')$q$);
select tests.act('w_item_right', 'authenticated', (select w from ids), $q$insert into public.list_items (list_id, creator_id) values ('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-00000000c001')$q$);
select tests.check('lists: a creators list takes creators only', not tests.ok('w_item_wrong') and tests.n('w_item_right') = 1);
select tests.act('o_del_contact', 'authenticated', (select o from ids), $q$delete from public.brand_contacts where full_name = 'Worker Added'$q$);
select tests.check('owner: can delete a contact', tests.n('o_del_contact') = 1);

-- contacts: one primary per sponsor
select tests.act('prim2', 'authenticated', (select w from ids), $q$insert into public.brand_contacts (brand_id, full_name, is_primary) values ('00000000-0000-0000-0000-00000000b001', 'Second Primary', true)$q$);
select tests.check('brand_contacts: a new primary quietly replaces the old one',
  tests.ok('prim2') and (select count(*) from public.brand_contacts where brand_id = '00000000-0000-0000-0000-00000000b001' and is_primary) = 1
  and (select is_primary from public.brand_contacts where full_name = 'Second Primary'));

-- ================================================================== saved views
insert into public.saved_views (id, owner_id, scope, name, query, is_shared) values
  ('00000000-0000-0000-0000-0000000a0001', (select o from ids), 'creators', 'zz owner private', 'status=active', false),
  ('00000000-0000-0000-0000-0000000a0002', (select o from ids), 'creators', 'zz owner shared',  'status=new', true),
  ('00000000-0000-0000-0000-0000000a0003', (select w from ids), 'sponsors', 'zz worker own',    'rel=partner', false);
select tests.check('saved views: a worker reads shared and own, not another person''s private view',
  tests.rows_as('authenticated', (select w from ids), $q$select * from public.saved_views where name like 'zz %'$q$) = 2
  and tests.rows_as('authenticated', (select w from ids), $q$select * from public.saved_views where name = 'zz owner private'$q$) = 0
  and tests.rows_as('authenticated', (select o from ids), $q$select * from public.saved_views where name like 'zz %'$q$) = 2);
select tests.act('w_upd_shared', 'authenticated', (select w from ids), $q$update public.saved_views set name = 'hijacked' where id = '00000000-0000-0000-0000-0000000a0002'$q$);
select tests.act('o_upd_workers', 'authenticated', (select o from ids), $q$update public.saved_views set name = 'hijacked' where id = '00000000-0000-0000-0000-0000000a0003'$q$);
select tests.act('w_del_shared', 'authenticated', (select w from ids), $q$delete from public.saved_views where id = '00000000-0000-0000-0000-0000000a0002'$q$);
select tests.act('w_upd_own', 'authenticated', (select w from ids), $q$update public.saved_views set query = 'rel=past' where id = '00000000-0000-0000-0000-0000000a0003'$q$);
select tests.act('w_ins_other', 'authenticated', (select w from ids), format($q$insert into public.saved_views (owner_id, scope, name, query) values (%L, 'creators', 'zz forged', '')$q$, (select o from ids)));
select tests.act('w_ins_own', 'authenticated', (select w from ids), $q$insert into public.saved_views (scope, name, query) values ('creators', 'zz mine', 'niche=tech')$q$);
select tests.check('saved views: nobody changes or deletes another person''s view (not even the owner role changing a worker''s)',
  tests.n('w_upd_shared') = 0 and tests.n('o_upd_workers') = 0 and tests.n('w_del_shared') = 0
  and (select name from public.saved_views where id = '00000000-0000-0000-0000-0000000a0002') = 'zz owner shared');
select tests.check('saved views: a person changes their own, cannot add one for someone else, owner is taken from the login',
  tests.n('w_upd_own') = 1 and not tests.ok('w_ins_other') and tests.n('w_ins_own') = 1
  and (select owner_id = (select w from ids) from public.saved_views where name = 'zz mine'));
select tests.act('w_bad_query', 'authenticated', (select w from ids), $q$insert into public.saved_views (scope, name, query) values ('creators', 'zz bad', 'https://evil.example/x')$q$);
select tests.check('saved views: a full address is refused as a query', not tests.ok('w_bad_query'));

-- ================================================================== sponsorship label rules
select tests.act('no_label', 'postgres', null, $q$insert into public.sponsorships (creator_id, brand_id, origin) values ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-00000000b001', 'manual')$q$);
select tests.check('sponsorships: source_label is required (no default)',
  (select ok is not true from tests.acts where label = 'no_label')
  or not exists (select 1 from information_schema.columns where table_name = 'sponsorships' and column_name = 'source_label' and column_default is not null));
select tests.check('sponsorships: source_label has no default and is not null',
  (select column_default is null and is_nullable = 'NO' from information_schema.columns
    where table_schema = 'public' and table_name = 'sponsorships' and column_name = 'source_label'));

-- a worker enters a confirmed record: person and time come from the login
select tests.act('w_conf', 'authenticated', (select w from ids), $q$insert into public.sponsorships (id, creator_id, brand_id, sponsored_on, source_label, origin, confirmed_by) values ('00000000-0000-0000-0000-0000000b0001', '00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-00000000b001', current_date - 10, 'confirmed', 'manual', '00000000-0000-0000-0000-000000000001')$q$);
select tests.check('sponsorships: a confirmed record takes confirmed_by and confirmed_at from the login, not the client',
  tests.n('w_conf') = 1 and (select confirmed_by = (select w from ids) and confirmed_at is not null and created_by = (select w from ids)
     from public.sponsorships where id = '00000000-0000-0000-0000-0000000b0001'));
-- confirmed without a person (no login) and not from a deal: refused
select tests.act('conf_noone', 'postgres', null, $q$insert into public.sponsorships (creator_id, brand_id, source_label, origin) values ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-00000000b001', 'confirmed', 'manual')$q$);
select tests.check('sponsorships: confirmed needs a person unless it comes from a deal', not tests.ok('conf_noone'));
-- detected rules
select tests.act('det_nosignal', 'authenticated', (select w from ids), $q$insert into public.sponsorships (creator_id, brand_id, source_label, origin) values ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-00000000b001', 'detected', 'import')$q$);
select tests.act('det_ok', 'authenticated', (select w from ids), $q$insert into public.sponsorships (id, creator_id, brand_id, sponsored_on, source_label, origin, detection_signal, detection_confidence) values ('00000000-0000-0000-0000-0000000b0002', '00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-00000000b002', current_date - 20, 'detected', 'import', 'imported_unverified', 'low')$q$);
select tests.act('det_withconfirm', 'authenticated', (select w from ids), $q$insert into public.sponsorships (creator_id, brand_id, source_label, origin, detection_signal, detection_confidence, confirmed_by, confirmed_at) values ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-00000000b001', 'detected', 'import', 'hashtag_ad', 'medium', '00000000-0000-0000-0000-000000000001', now())$q$);
select tests.check('sponsorships: detected needs a signal and a confidence, and carries no confirm fields',
  not tests.ok('det_nosignal') and tests.n('det_ok') = 1 and not tests.ok('det_withconfirm')
  and (select confirmed_by is null and confirmed_at is null from public.sponsorships where id = '00000000-0000-0000-0000-0000000b0002'));
select tests.act('bad_label', 'postgres', null, $q$insert into public.sponsorships (creator_id, source_label, origin) values ('00000000-0000-0000-0000-00000000c001', 'maybe', 'manual')$q$);
select tests.check('sponsorships: a label other than confirmed or detected is refused', not tests.ok('bad_label'));
select tests.act('w_deal_origin', 'authenticated', (select w from ids), $q$insert into public.sponsorships (creator_id, brand_id, source_label, origin) values ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-00000000b001', 'confirmed', 'deal')$q$);
select tests.check('sponsorships: a client cannot create a record with origin deal', not tests.ok('w_deal_origin'));

-- confirming: needs an evidence note; the person comes from the login
select tests.act('conf_noevid', 'authenticated', (select o from ids), $q$update public.sponsorships set source_label = 'confirmed' where id = '00000000-0000-0000-0000-0000000b0002'$q$);
select tests.check('sponsorships: confirming without an evidence note is refused',
  not tests.ok('conf_noevid') and (select source_label from public.sponsorships where id = '00000000-0000-0000-0000-0000000b0002') = 'detected');
select tests.act('conf_ok', 'authenticated', (select o from ids), $q$update public.sponsorships set source_label = 'confirmed', evidence_note = 'Saw the spoken ad at 0:45', confirmed_by = '00000000-0000-0000-0000-000000000001' where id = '00000000-0000-0000-0000-0000000b0002'$q$);
select tests.check('sponsorships: confirming sets confirmed_by from the login and confirmed_at to now',
  tests.n('conf_ok') = 1 and (select source_label = 'confirmed' and confirmed_by = (select o from ids) and confirmed_at > now() - interval '1 minute'
                               from public.sponsorships where id = '00000000-0000-0000-0000-0000000b0002'));
select tests.act('back_to_det', 'authenticated', (select o from ids), $q$update public.sponsorships set source_label = 'detected' where id = '00000000-0000-0000-0000-0000000b0002'$q$);
select tests.act('conf_reject', 'authenticated', (select o from ids), $q$update public.sponsorships set rejected = true where id = '00000000-0000-0000-0000-0000000b0002'$q$);
select tests.check('sponsorships: a confirmed record cannot go back to detected or be rejected',
  not tests.ok('back_to_det') and not tests.ok('conf_reject')
  and (select source_label = 'confirmed' and not rejected from public.sponsorships where id = '00000000-0000-0000-0000-0000000b0002'));
select tests.act('conf_who', 'authenticated', (select w from ids), $q$update public.sponsorships set confirmed_by = (select id from public.profiles where email = 'worker@example.test'), notes = 'edited' where id = '00000000-0000-0000-0000-0000000b0002'$q$);
select tests.check('sponsorships: who confirmed is history (an edit does not change it)',
  tests.ok('conf_who') and (select confirmed_by = (select o from ids) and notes = 'edited' from public.sponsorships where id = '00000000-0000-0000-0000-0000000b0002'));

-- rejecting keeps the row; restoring is a staff action
insert into public.sponsorships (id, creator_id, brand_id, sponsored_on, source_label, origin, detection_signal, detection_confidence)
values ('00000000-0000-0000-0000-0000000b0003', '00000000-0000-0000-0000-00000000c002', '00000000-0000-0000-0000-00000000b001', current_date - 5, 'detected', 'detected', 'sponsored_by', 'high'),
       ('00000000-0000-0000-0000-0000000b0004', '00000000-0000-0000-0000-00000000c002', null, null, 'detected', 'detected', 'paid_flag', 'medium');
select tests.act('w_reject', 'authenticated', (select w from ids), $q$update public.sponsorships set rejected = true where id = '00000000-0000-0000-0000-0000000b0003'$q$);
select tests.check('sponsorships: rejecting keeps the row, with who and when',
  tests.n('w_reject') = 1 and (select rejected and rejected_by = (select w from ids) and rejected_at is not null and source_label = 'detected'
     from public.sponsorships where id = '00000000-0000-0000-0000-0000000b0003'));
select tests.act('conf_rejected', 'authenticated', (select w from ids), $q$update public.sponsorships set source_label = 'confirmed', evidence_note = 'x' where id = '00000000-0000-0000-0000-0000000b0003'$q$);
select tests.check('sponsorships: a rejected record cannot be confirmed straight away', not tests.ok('conf_rejected'));
select tests.act('svc_restore', 'service_role', null, $q$update public.sponsorships set rejected = false where id = '00000000-0000-0000-0000-0000000b0003'$q$);
select tests.check('sponsorships: the service role (the scanner) cannot restore a rejected record',
  not tests.ok('svc_restore') and (select rejected from public.sponsorships where id = '00000000-0000-0000-0000-0000000b0003'));
select tests.act('w_restore', 'authenticated', (select w from ids), $q$update public.sponsorships set rejected = false where id = '00000000-0000-0000-0000-0000000b0003'$q$);
select tests.check('sponsorships: staff can restore, and the reject fields are cleared',
  tests.n('w_restore') = 1 and (select not rejected and rejected_by is null and rejected_at is null and source_label = 'detected'
     from public.sponsorships where id = '00000000-0000-0000-0000-0000000b0003'));
select tests.check('sponsorships: a worker cannot delete a record',
  tests.rows_as('authenticated', (select w from ids), 'delete from public.sponsorships') <= 0
  and (select count(*) from public.sponsorships where id = '00000000-0000-0000-0000-0000000b0001') = 1);

-- ================================================================== counters
-- c001: confirmed b0001 (b001, 10 days ago) and b0002 (b002, 20 days ago); detected none.
-- c002: detected b0003 (b001, 5 days ago) and b0004 (no sponsor, no date).
select tests.check('counters: creator c001 has 2 confirmed, last = 10 days ago, no detected',
  (select sponsorship_count = 2 and last_sponsorship_at = current_date - 10 and detected_sponsorship_count = 0 and last_detected_sponsorship_at is null
     from public.creators where id = '00000000-0000-0000-0000-00000000c001'));
select tests.check('counters: creator c002 has 0 confirmed and 2 detected, last detected = 5 days ago',
  (select sponsorship_count = 0 and last_sponsorship_at is null and detected_sponsorship_count = 2 and last_detected_sponsorship_at = current_date - 5
     from public.creators where id = '00000000-0000-0000-0000-00000000c002'));
select tests.check('counters: sponsor b001 has 1 confirmed creator and 1 detected creator; b002 has 1 confirmed',
  (select sponsorship_count = 1 and last_sponsorship_at = current_date - 10 and detected_sponsorship_count = 1 and last_detected_sponsorship_at = current_date - 5
     from public.brands where id = '00000000-0000-0000-0000-00000000b001')
  and (select sponsorship_count = 1 and last_sponsorship_at = current_date - 20 and detected_sponsorship_count = 0
     from public.brands where id = '00000000-0000-0000-0000-00000000b002'));
-- reject b0003: it no longer counts
update public.sponsorships set rejected = true where id = '00000000-0000-0000-0000-0000000b0003';
select tests.check('counters: a rejected record is not counted',
  (select detected_sponsorship_count = 1 and last_detected_sponsorship_at is null from public.creators where id = '00000000-0000-0000-0000-00000000c002')
  and (select detected_sponsorship_count = 0 and last_detected_sponsorship_at is null from public.brands where id = '00000000-0000-0000-0000-00000000b001'));
-- a second record of the same creator for the same sponsor: records go up, the sponsor's count (distinct creators) does not
insert into public.sponsorships (creator_id, brand_id, sponsored_on, source_label, origin, confirmed_by, confirmed_at, evidence_note)
values ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-00000000b001', current_date - 2, 'confirmed', 'manual', (select o from ids), now(), 'x');
select tests.check('counters: sponsor count is distinct creators, creator count is records',
  (select sponsorship_count = 3 and last_sponsorship_at = current_date - 2 from public.creators where id = '00000000-0000-0000-0000-00000000c001')
  and (select sponsorship_count = 1 and last_sponsorship_at = current_date - 2 from public.brands where id = '00000000-0000-0000-0000-00000000b001'));
-- moving a record to another sponsor, and deleting one
update public.sponsorships set brand_id = '00000000-0000-0000-0000-00000000b002' where id = '00000000-0000-0000-0000-0000000b0001';
select tests.check('counters: moving a record updates both sponsors',
  (select sponsorship_count = 1 and last_sponsorship_at = current_date - 2 from public.brands where id = '00000000-0000-0000-0000-00000000b001')
  and (select sponsorship_count = 1 from public.brands where id = '00000000-0000-0000-0000-00000000b002'));
delete from public.sponsorships where creator_id = '00000000-0000-0000-0000-00000000c001' and sponsored_on = current_date - 2;
select tests.check('counters: deleting a record updates them',
  (select sponsorship_count = 2 and last_sponsorship_at = current_date - 10 from public.creators where id = '00000000-0000-0000-0000-00000000c001'));
select tests.check('counters: the stored numbers equal a full recount for every creator and sponsor',
  not exists (select 1 from public.creators c where c.sponsorship_count <>
     (select count(*) from public.sponsorships s where s.creator_id = c.id and s.source_label = 'confirmed' and not s.rejected)
     or c.detected_sponsorship_count <>
     (select count(*) from public.sponsorships s where s.creator_id = c.id and s.source_label = 'detected' and not s.rejected))
  and not exists (select 1 from public.brands b where b.sponsorship_count <>
     (select count(distinct s.creator_id) from public.sponsorships s where s.brand_id = b.id and s.source_label = 'confirmed' and not s.rejected)));

-- ================================================================== facts view
select tests.check('creator_sponsorship_facts: confirmed and not rejected only',
  (select count(*) from public.creator_sponsorship_facts where creator_id = '00000000-0000-0000-0000-00000000c001') = 2
  and (select count(*) from public.creator_sponsorship_facts where creator_id = '00000000-0000-0000-0000-00000000c002') = 0
  and not exists (select 1 from public.creator_sponsorship_facts f join public.sponsorships s on s.id = f.id where s.source_label <> 'confirmed' or s.rejected));
select tests.check('creator_sponsorship_facts: a worker can read it, and it has no notes or evidence column',
  tests.rows_as('authenticated', (select w from ids), 'select * from public.creator_sponsorship_facts') >= 2
  and not exists (select 1 from information_schema.columns where table_name = 'creator_sponsorship_facts' and column_name in ('notes', 'evidence_note', 'detection_signal')));

-- ================================================================== deals: matched stage, empty amount, sponsorship from a deal
create temp table stats0 as select tests.json_as('authenticated', (select o from ids), 'select public.stats_overview()') as s;
grant select on stats0 to public;

select tests.act('w_matched', 'authenticated', (select w from ids), $q$insert into public.deals (id, creator_id, brand_id, stage) values ('00000000-0000-0000-0000-0000000d0001', '00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-00000000b001', 'matched')$q$);
select tests.check('deals: a worker can create a matched deal with no amount; amount stays empty and commission is 0',
  tests.n('w_matched') = 1 and (select amount_cents is null and commission_cents = 0 and stage = 'matched' from public.deals where id = '00000000-0000-0000-0000-0000000d0001'));
select tests.act('w_matched_amt', 'authenticated', (select w from ids), $q$update public.deals set amount_cents = 60000 where id = '00000000-0000-0000-0000-0000000d0001'$q$);
select tests.check('deals: setting an amount later works (commission 8% of 60000 = 4800); clearing it again gives 0',
  tests.n('w_matched_amt') = 1 and (select commission_cents = 4800 from public.deals where id = '00000000-0000-0000-0000-0000000d0001'));
select tests.act('w_matched_clear', 'authenticated', (select w from ids), $q$update public.deals set amount_cents = null where id = '00000000-0000-0000-0000-0000000d0001'$q$);
select tests.check('deals: an emptied amount gives commission 0', tests.n('w_matched_clear') = 1
  and (select commission_cents = 0 and amount_cents is null from public.deals where id = '00000000-0000-0000-0000-0000000d0001'));
select tests.check('deals: the amount check still refuses a negative number',
  not (tests.run_as('postgres', null, $q$update public.deals set amount_cents = -1 where id = '00000000-0000-0000-0000-0000000d0001'$q$)).ok);

create temp table stats1 as select tests.json_as('authenticated', (select o from ids), 'select public.stats_overview()') as s;
select tests.check('stats_overview: matched is in deals_by_stage and counts one more',
  (select (s -> 'deals_by_stage' ->> 'matched')::int from stats1) = (select (s -> 'deals_by_stage' ->> 'matched')::int + 1 from stats0)
  and (select s -> 'deals_by_stage' ? 'matched' from stats0));
select tests.check('stats_overview: a matched deal is not an active deal; commission is unchanged',
  (select (s ->> 'active_deals')::int from stats1) = (select (s ->> 'active_deals')::int from stats0)
  and (select (s ->> 'commission_earned_cents')::bigint from stats1) = (select (s ->> 'commission_earned_cents')::bigint from stats0));

-- completing / paying a deal makes one confirmed sponsorship, once
insert into public.deals (id, creator_id, brand_id, stage, amount_cents)
values ('00000000-0000-0000-0000-0000000d0002', '00000000-0000-0000-0000-00000000c002', '00000000-0000-0000-0000-00000000b002', 'negotiating', 100000);
select tests.check('deal trigger: an open deal makes no sponsorship',
  (select count(*) from public.sponsorships where deal_id = '00000000-0000-0000-0000-0000000d0002') = 0);
select tests.act('w_complete', 'authenticated', (select w from ids), $q$update public.deals set stage = 'completed' where id = '00000000-0000-0000-0000-0000000d0002'$q$);
select tests.check('deal trigger: completing a deal makes one confirmed, deal-origin record for that creator and sponsor, by the person who moved it',
  tests.n('w_complete') = 1
  and (select count(*) = 1 and bool_and(source_label = 'confirmed' and origin = 'deal' and creator_id = '00000000-0000-0000-0000-00000000c002'
        and brand_id = '00000000-0000-0000-0000-00000000b002' and confirmed_by = (select w from ids) and confirmed_at is not null and not rejected)
       from public.sponsorships where deal_id = '00000000-0000-0000-0000-0000000d0002'));
select tests.act('w_paid', 'authenticated', (select w from ids), $q$update public.deals set stage = 'paid' where id = '00000000-0000-0000-0000-0000000d0002'$q$);
select tests.check('deal trigger: moving on to paid does not make a second record',
  tests.n('w_paid') = 1 and (select count(*) from public.sponsorships where deal_id = '00000000-0000-0000-0000-0000000d0002') = 1);
select tests.check('deal trigger: the counters moved (creator c002 has 1 confirmed now)',
  (select sponsorship_count = 1 from public.creators where id = '00000000-0000-0000-0000-00000000c002'));
-- a paid deal with an empty amount: no error, earned is 0
insert into public.deals (id, creator_id, brand_id, stage, amount_cents)
values ('00000000-0000-0000-0000-0000000d0003', '00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-00000000b001', 'paid', null);
select tests.check('deals: a paid deal with no amount works (commission 0, earned 0, one sponsorship record)',
  (select commission_cents = 0 from public.deals where id = '00000000-0000-0000-0000-0000000d0003')
  and (select total_earned_cents = 0 from public.creator_summaries where id = '00000000-0000-0000-0000-00000000c001')
  and (select count(*) from public.sponsorships where deal_id = '00000000-0000-0000-0000-0000000d0003') = 1);
-- the backfill statement is safe to run again: it adds nothing
select count(*) as before_n from public.sponsorships \gset
insert into public.sponsorships (creator_id, brand_id, sponsored_on, source_label, origin, deal_id, evidence_note, confirmed_at)
select d.creator_id, d.brand_id, d.stage_changed_at::date, 'confirmed', 'deal', d.id, 'x', now()
  from public.deals d where d.stage in ('completed', 'paid')
   and not exists (select 1 from public.sponsorships s where s.deal_id = d.id and s.origin = 'deal');
select tests.check('backfill: running it again adds nothing', (select count(*) from public.sponsorships) = :before_n);
select tests.check('backfill: every completed or paid deal has exactly one deal record',
  not exists (select 1 from public.deals d where d.stage in ('completed', 'paid')
              and (select count(*) from public.sponsorships s where s.deal_id = d.id and s.origin = 'deal') <> 1));
select tests.act('dup_deal_row', 'postgres', null, $q$insert into public.sponsorships (creator_id, brand_id, source_label, origin, deal_id, confirmed_at) values ('00000000-0000-0000-0000-00000000c002', '00000000-0000-0000-0000-00000000b002', 'confirmed', 'deal', '00000000-0000-0000-0000-0000000d0002', now())$q$);
select tests.check('sponsorships: the same deal cannot make a second record (unique)', not tests.ok('dup_deal_row'));

-- sponsor summary
select tests.check('brand_summaries: contact_count, deal_count and open_deal_count (a matched deal is open; completed and paid are not)',
  (select contact_count = 2 and deal_count = 2 and open_deal_count = 1 from public.brand_summaries where id = '00000000-0000-0000-0000-00000000b001')
  and (select contact_count = 0 and deal_count = 1 and open_deal_count = 0 from public.brand_summaries where id = '00000000-0000-0000-0000-00000000b002'));
select tests.check('brand_summaries: one row per sponsor',
  (select count(*) from public.brand_summaries) = (select count(*) from public.brands));

-- ================================================================== audit
-- (the fixtures above ran with the audit triggers on; this block starts from a clean slate)
create temp table audit_mark as select coalesce(max(id), 0) as m from public.audit_log;
grant select on audit_mark to public;
-- time travel (inside one transaction now() does not move): park updated_at in 2020 with the touch trigger off
alter table public.creators disable trigger trg_touch;
update public.creators set updated_at = '2020-01-01' where id = '00000000-0000-0000-0000-00000000c002';
alter table public.creators enable trigger trg_touch;
insert into public.sponsorships (id, creator_id, brand_id, sponsored_on, source_label, origin, detection_signal, detection_confidence)
values ('00000000-0000-0000-0000-0000000b0010', '00000000-0000-0000-0000-00000000c002', '00000000-0000-0000-0000-00000000b001', current_date - 30, 'detected', 'detected', 'hashtag_ad', 'medium');
select tests.check('audit: a new sponsorship writes a sponsorship line and no creator or sponsor line (counters move silently)',
  exists (select 1 from public.audit_log where id > (select m from audit_mark) and action = 'sponsorship.created' and entity_id = '00000000-0000-0000-0000-0000000b0010')
  and not exists (select 1 from public.audit_log where id > (select m from audit_mark) and entity_type in ('creator', 'brand')));
select tests.check('counters: the creator edit time does not move when only counters change',
  (select updated_at = '2020-01-01' from public.creators where id = '00000000-0000-0000-0000-00000000c002')
  and (select detected_sponsorship_count = 2 from public.creators where id = '00000000-0000-0000-0000-00000000c002'));
-- a real edit still logs and still moves the time
select tests.act('w_edit_creator', 'authenticated', (select w from ids), $q$update public.creators set niche_slug = 'tech' where id = '00000000-0000-0000-0000-00000000c002'$q$);
select tests.check('audit: a real creator edit is still logged and moves updated_at; the new columns are logged by value',
  exists (select 1 from public.audit_log where id > (select m from audit_mark) and action = 'creator.updated' and entity_id = '00000000-0000-0000-0000-00000000c002'
          and details #>> '{changes,niche_slug,to}' = 'tech')
  and (select updated_at > '2020-01-01' from public.creators where id = '00000000-0000-0000-0000-00000000c002'));
select tests.act('w_confirm', 'authenticated', (select w from ids), $q$update public.sponsorships set source_label = 'confirmed', evidence_note = 'Creator told us by email' where id = '00000000-0000-0000-0000-0000000b0010'$q$);
select tests.act('w_reject2', 'authenticated', (select w from ids), $q$update public.sponsorships set rejected = true where id = '00000000-0000-0000-0000-0000000b0004'$q$);
select tests.act('w_restore2', 'authenticated', (select w from ids), $q$update public.sponsorships set rejected = false where id = '00000000-0000-0000-0000-0000000b0004'$q$);
select tests.check('audit: confirm, reject and restore are readable actions',
  tests.n('w_confirm') = 1 and tests.n('w_reject2') = 1 and tests.n('w_restore2') = 1
  and exists (select 1 from public.audit_log where id > (select m from audit_mark) and action = 'sponsorship.confirmed' and entity_id = '00000000-0000-0000-0000-0000000b0010' and actor_id = (select w from ids))
  and exists (select 1 from public.audit_log where id > (select m from audit_mark) and action = 'sponsorship.rejected' and entity_id = '00000000-0000-0000-0000-0000000b0004')
  and exists (select 1 from public.audit_log where id > (select m from audit_mark) and action = 'sponsorship.restored' and entity_id = '00000000-0000-0000-0000-0000000b0004'));
select tests.check('audit: the sponsorship line names the sponsor and the creator, not the evidence text',
  exists (select 1 from public.audit_log where action = 'sponsorship.confirmed' and entity_id = '00000000-0000-0000-0000-0000000b0010'
          and details ->> 'label' = 'ZZ Sponsor One' and details ->> 'creator_id' = '00000000-0000-0000-0000-00000000c002'));
-- contact people: personal fields are never logged as values
select tests.act('w_contact_edit', 'authenticated', (select w from ids), $q$update public.brand_contacts set email = 'zz-new-contact@example.test', phone = '+1-555-0199', linkedin_url = 'https://www.linkedin.com/in/zz-new', notes = 'secret note', role_title = 'Director' where id = '00000000-0000-0000-0000-00000000d001'$q$);
select tests.check('audit: a contact edit logs email, phone, linkedin and notes as {"changed": true}, and the role as a value',
  exists (select 1 from public.audit_log where id > (select m from audit_mark) and action = 'brand_contact.updated' and entity_id = '00000000-0000-0000-0000-00000000d001'
          and details #> '{changes,email}' = '{"changed": true}' and details #> '{changes,phone}' = '{"changed": true}'
          and details #> '{changes,linkedin_url}' = '{"changed": true}' and details #> '{changes,notes}' = '{"changed": true}'
          and details #>> '{changes,role_title,to}' = 'Director'));
insert into public.brand_contacts (id, brand_id, full_name, email, phone) values ('00000000-0000-0000-0000-00000000d009', '00000000-0000-0000-0000-00000000b002', 'Audit Probe', 'zz-probe@example.test', '+1-555-0155');
delete from public.brand_contacts where id = '00000000-0000-0000-0000-00000000d009';
select tests.check('audit: no contact email or phone appears anywhere in the new audit lines',
  exists (select 1 from public.audit_log where id > (select m from audit_mark) and action in ('brand_contact.created', 'brand_contact.deleted') and details ->> 'label' = 'Audit Probe')
  and not exists (select 1 from public.audit_log where id > (select m from audit_mark) and entity_type = 'brand_contact'
                  and (details::text ~* 'example\.test' or details::text ~ '555-01')));
insert into public.lists (id, name, kind) values ('00000000-0000-0000-0000-00000000f009', 'zz audit list', 'brands');
select tests.check('audit: lists are logged', exists (select 1 from public.audit_log where id > (select m from audit_mark) and action = 'list.created' and details ->> 'label' = 'zz audit list'));
-- a sponsor change that is not a counter is logged; a counter-only change on a brand is not
update public.brands set industry = 'Test industry' where id = '00000000-0000-0000-0000-00000000b001';
select tests.check('audit: a real sponsor edit is logged',
  exists (select 1 from public.audit_log where id > (select m from audit_mark) and action = 'brand.updated' and entity_id = '00000000-0000-0000-0000-00000000b001'
          and details #>> '{changes,industry,to}' = 'Test industry'));

-- new log_audit actions
select tests.act('w_brand_viewed', 'authenticated', (select w from ids), $q$select public.log_audit('brand.viewed', 'brand', '00000000-0000-0000-0000-00000000b001', '{}')$q$);
-- changed on purpose in 20261125001200 (SR-15): the import lines are no longer open to staff through log_audit; see retest_fixes.sql
select tests.act('w_brands_imported', 'authenticated', (select w from ids), $q$select public.log_audit('brands.imported', null, null, '{"count": 3}')$q$);
select tests.act('w_spons_imported', 'authenticated', (select w from ids), $q$select public.log_audit('sponsorships.imported', null, null, '{"count": 3}')$q$);
select tests.act('w_brands_exported', 'authenticated', (select w from ids), $q$select public.log_audit('brands.exported', null, null, '{"count": 3}')$q$);
select tests.act('o_brands_exported', 'authenticated', (select o from ids), $q$select public.log_audit('brands.exported', null, null, '{"count": 3}')$q$);
select tests.act('o_bogus', 'authenticated', (select o from ids), $q$select public.log_audit('brands.exploded')$q$);
select tests.check('log_audit: staff may log brand.viewed but not the two imports (brands.imported goes through record_brand_import); brands.exported is owner only; unknown actions are refused',
  tests.ok('w_brand_viewed') and not tests.ok('w_brands_imported') and not tests.ok('w_spons_imported')
  and not tests.ok('w_brands_exported') and tests.ok('o_brands_exported') and not tests.ok('o_bogus'));
select tests.check('log_audit: the old actions still work',
  (tests.run_as('authenticated', (select w from ids), $q$select public.log_audit('creator.viewed', 'creator', 'x')$q$)).ok
  and (tests.run_as('authenticated', (select w from ids), $q$select public.log_audit('creators.imported', null, null, '{}')$q$)).ok
  and not (tests.run_as('authenticated', (select w from ids), $q$select public.log_audit('creators.exported')$q$)).ok);

do $$ declare f int; begin select count(*) filter (where not ok) into f from tests.results;
  raise notice '% checks, % failed', (select count(*) from tests.results), f;
  if f > 0 then raise exception 'sponsors tests failed: %', (select string_agg(name, '; ') from tests.results where not ok); end if; end $$;
rollback;
