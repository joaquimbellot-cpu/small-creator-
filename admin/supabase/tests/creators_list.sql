-- Tests for migration 20261125000500 (Creators list: creators_match_ids, creators_list, creators_facets, creators_export,
-- creators_add_to_list, creators_add_tag). Counts are compared with plain queries written here. Everything is rolled back.
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

-- Fixed points taken from the seed: two sponsors with records, one tag, one list.
create temp table fx as select
  (select array_agg(brand_id) from (select distinct brand_id from public.sponsorships where brand_id is not null and not rejected order by brand_id limit 2) x) as bs,
  (select id from public.tags where scope = 'creator' order by name limit 1) as t1,
  (select id from public.lists where kind = 'creators' order by name limit 1) as l1;
grant select on fx to public;

-- Run the same dynamic SQL as a role, return one bigint.
create function tests.count_as(p_uid uuid, p_sql text) returns bigint language plpgsql as $$
declare v bigint;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  execute p_sql into v;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  return v;
end $$;

-- One filter combination: the four ways of counting (match ids, list total, facet total, owner and worker) must equal the plain count.
create function tests.combo(p_label text, p_args text, p_plain text) returns void language plpgsql as $$
declare want bigint; a bigint[]; l bigint[]; f bigint[]; u uuid;
        sep text := case when p_args = '' then '' else ', ' end;
begin
  execute 'select count(*) from (' || p_plain || ') z' into want;
  foreach u in array array[(select o from ids), (select w from ids)] loop
    a := a || tests.count_as(u, format('select count(*) from public.creators_match_ids(%s)', p_args));
    l := l || tests.count_as(u, format('select coalesce(max(total), 0) from public.creators_list(%s%sp_limit => 100)', p_args, sep));
    f := f || tests.count_as(u, format($f$select n from public.creators_facets(%s) where facet = '_total'$f$, p_args));
  end loop;
  perform tests.check('combo ' || p_label || ' (' || want || ')',
    a = array[want, want] and l = array[want, want] and f = array[want, want]);
end $$;

-- ================================================================== counts against plain queries
select tests.combo('no filter', '', 'select 1 from public.creators');
select tests.combo('sponsored yes (confirmed only)', $$p_sponsored => 'yes'$$,
  $$select 1 from public.creators c where exists (select 1 from public.sponsorships s where s.creator_id = c.id and s.source_label = 'confirmed' and not s.rejected)$$);
select tests.combo('sponsored yes, detected counted', $$p_sponsored => 'yes', p_detected => true$$,
  $$select 1 from public.creators c where exists (select 1 from public.sponsorships s where s.creator_id = c.id and not s.rejected)$$);
select tests.combo('sponsored no (confirmed only)', $$p_sponsored => 'no'$$,
  $$select 1 from public.creators c where not exists (select 1 from public.sponsorships s where s.creator_id = c.id and s.source_label = 'confirmed' and not s.rejected)$$);
select tests.combo('sponsored no, detected counted', $$p_sponsored => 'no', p_detected => true$$,
  $$select 1 from public.creators c where not exists (select 1 from public.sponsorships s where s.creator_id = c.id and not s.rejected)$$);
select tests.combo('recent 90 (confirmed)', $$p_recent => 90$$,
  $$select 1 from public.creators c where exists (select 1 from public.sponsorships s where s.creator_id = c.id and s.source_label = 'confirmed' and not s.rejected and s.sponsored_on >= current_date - 90)$$);
select tests.combo('recent 30, detected counted', $$p_recent => 30, p_detected => true$$,
  $$select 1 from public.creators c where exists (select 1 from public.sponsorships s where s.creator_id = c.id and not s.rejected and s.sponsored_on >= current_date - 30)$$);
select tests.combo('recent 180 (confirmed)', $$p_recent => 180$$,
  $$select 1 from public.creators c where exists (select 1 from public.sponsorships s where s.creator_id = c.id and s.source_label = 'confirmed' and not s.rejected and s.sponsored_on >= current_date - 180)$$);
select tests.combo('by two sponsors (confirmed)', $$p_by => (select bs from fx)$$,
  $$select 1 from public.creators c where exists (select 1 from public.sponsorships s, fx where s.creator_id = c.id and s.brand_id = any (fx.bs) and s.source_label = 'confirmed' and not s.rejected)$$);
select tests.combo('by two sponsors, detected counted', $$p_by => (select bs from fx), p_detected => true$$,
  $$select 1 from public.creators c where exists (select 1 from public.sponsorships s, fx where s.creator_id = c.id and s.brand_id = any (fx.bs) and not s.rejected)$$);
select tests.combo('niche tech or gaming', $$p_niche => array['tech', 'gaming']$$,
  $$select 1 from public.creators where niche_slug in ('tech', 'gaming')$$);
select tests.combo('status new or contacted', $$p_status => array['new', 'contacted']$$,
  $$select 1 from public.creators where status in ('new', 'contacted')$$);
select tests.combo('subscribers 5000 to 30000', $$p_subs_min => 5000, p_subs_max => 30000$$,
  $$select 1 from public.creators where subscribers between 5000 and 30000$$);
select tests.combo('subscribers 20000 and above', $$p_subs_min => 20000$$,
  $$select 1 from public.creators where subscribers >= 20000$$);
select tests.combo('subscribers up to 4000', $$p_subs_max => 4000$$,
  $$select 1 from public.creators where subscribers <= 4000$$);
select tests.combo('never contacted', $$p_contacted => 'never'$$,
  $$select 1 from public.creators c where c.last_contacted_at is null and not exists (select 1 from public.emails m where m.creator_id = c.id and m.status in ('sent', 'replied') and not m.is_test)$$);
select tests.combo('contacted in the last 30 days', $$p_contacted => 'in30'$$,
  $$select 1 from public.creators c where greatest(c.last_contacted_at, (select max(m.sent_at) from public.emails m where m.creator_id = c.id and m.status in ('sent', 'replied') and not m.is_test)) >= now() - interval '30 days'$$);
select tests.combo('contacted over 30 days ago', $$p_contacted => 'over30'$$,
  $$select 1 from public.creators c where greatest(c.last_contacted_at, (select max(m.sent_at) from public.emails m where m.creator_id = c.id and m.status in ('sent', 'replied') and not m.is_test)) < now() - interval '30 days'$$);
select tests.combo('average views 1000 or more', $$p_views => 1000$$,
  $$select 1 from public.creators where avg_views >= 1000$$);
select tests.combo('language en, country GB or US', $$p_lang => array['en'], p_country => array['GB', 'US']$$,
  $$select 1 from public.creators where language = 'en' and country in ('GB', 'US')$$);
select tests.combo('has an email', $$p_email => true$$, $$select 1 from public.creators where email <> ''$$);
select tests.combo('tag', $$p_tag => array[(select t1 from fx)]$$,
  $$select 1 from public.creators c where exists (select 1 from public.creator_tags t, fx where t.creator_id = c.id and t.tag_id = fx.t1)$$);
select tests.combo('list', $$p_list => array[(select l1 from fx)]$$,
  $$select 1 from public.creators c where exists (select 1 from public.list_items i, fx where i.creator_id = c.id and i.list_id = fx.l1)$$);
select tests.combo('search by name part', $$p_q => 'an'$$,
  $$select 1 from public.creators where full_name ilike '%an%' or email::text ilike '%an%' or channel_name ilike '%an%'$$);
select tests.combo('search with wildcard characters is literal', $$p_q => '%_'$$,
  $$select 1 from public.creators where strpos(lower(full_name), '%_') > 0 or strpos(lower(email::text), '%_') > 0 or strpos(lower(coalesce(channel_name, '')), '%_') > 0$$);
select tests.combo('niche + sponsored + recent + detected', $$p_niche => array['tech', 'gaming', 'photo'], p_sponsored => 'yes', p_recent => 180, p_detected => true$$,
  $$select 1 from public.creators c where niche_slug in ('tech', 'gaming', 'photo') and exists (select 1 from public.sponsorships s where s.creator_id = c.id and not s.rejected)
      and exists (select 1 from public.sponsorships s where s.creator_id = c.id and not s.rejected and s.sponsored_on >= current_date - 180)$$);
select tests.combo('subscribers + status + language + no email filter', $$p_subs_min => 3000, p_subs_max => 40000, p_status => array['new', 'active', 'replied'], p_lang => array['en', 'es', 'de']$$,
  $$select 1 from public.creators where subscribers between 3000 and 40000 and status in ('new', 'active', 'replied') and language in ('en', 'es', 'de')$$);
select tests.combo('sponsored no + never contacted + country', $$p_sponsored => 'no', p_contacted => 'never', p_country => array['US', 'JP', 'BR', 'DE']$$,
  $$select 1 from public.creators c where country in ('US', 'JP', 'BR', 'DE')
      and not exists (select 1 from public.sponsorships s where s.creator_id = c.id and s.source_label = 'confirmed' and not s.rejected)
      and c.last_contacted_at is null and not exists (select 1 from public.emails m where m.creator_id = c.id and m.status in ('sent', 'replied') and not m.is_test)$$);
select tests.combo('everything at once', $$p_q => 'a', p_subs_min => 1000, p_subs_max => 100000, p_sponsored => 'yes', p_detected => true, p_recent => 180,
  p_niche => array['tech', 'gaming', 'photo', 'music'], p_status => array['new', 'contacted', 'active', 'inactive'], p_views => 1000, p_email => true$$,
  $$select 1 from public.creators c where (full_name ilike '%a%' or email::text ilike '%a%' or channel_name ilike '%a%') and subscribers between 1000 and 100000
      and niche_slug in ('tech', 'gaming', 'photo', 'music') and status in ('new', 'contacted', 'active', 'inactive') and avg_views >= 1000 and email <> ''
      and exists (select 1 from public.sponsorships s where s.creator_id = c.id and not s.rejected and s.sponsored_on >= current_date - 180)$$);
select tests.combo('nothing matches', $$p_niche => array['tech'], p_status => array['do_not_contact'], p_subs_min => 999999$$, $$select 1 where false$$);
select tests.combo('empty lists and unknown words are ignored', $$p_niche => '{}', p_by => '{}', p_sponsored => 'maybe', p_contacted => 'someday'$$, 'select 1 from public.creators');

-- ================================================================== counts beside every option
-- For several filter states, each option's count equals the number of creators you get when that option replaces the
-- facet's own filter and every other filter stays (counted by the id function, which the checks above tie to plain counts).
create function tests.option_args(p_base jsonb, p_facet text, p_value text) returns text language plpgsql as $$
declare k text; v text; parts text[] := '{}';
begin
  for k, v in select * from jsonb_each_text(p_base) loop
    continue when k = p_facet;
    parts := parts || v;
  end loop;
  parts := parts || case p_facet
    when 'niche' then format('p_niche => array[%L]', p_value)
    when 'status' then format('p_status => array[%L]', p_value)
    when 'sponsored' then format('p_sponsored => %L', p_value)
    when 'recent' then format('p_recent => %s', p_value::int)
    when 'by' then format('p_by => array[%L::uuid]', p_value)
    when 'contacted' then format('p_contacted => %L', p_value)
    when 'views' then format('p_views => %s', p_value::int)
    when 'lang' then format('p_lang => array[%L]', p_value)
    when 'country' then format('p_country => array[%L]', p_value)
    when 'email' then 'p_email => true'
    when 'tag' then format('p_tag => array[%L::uuid]', p_value)
    when 'list' then format('p_list => array[%L::uuid]', p_value)
  end;
  return array_to_string(parts, ', ');
end $$;

create function tests.option_counts(p_label text, p_base jsonb) returns void language plpgsql as $$
declare base_args text := coalesce(nullif(array_to_string(array(select value from jsonb_each_text(p_base)), ', '), ''), '');
        bad int := 0; seen int := 0; r record; want bigint; u uuid;
begin
  foreach u in array array[(select o from ids), (select w from ids)] loop
    for r in execute format('select facet, value, n from public.creators_facets(%s)', base_args) loop
      continue when r.facet in ('_total', '_all');
      seen := seen + 1;
      want := tests.count_as(u, format('select count(*) from public.creators_match_ids(%s)', tests.option_args(p_base, r.facet, r.value)));
      if want is distinct from r.n then bad := bad + 1; raise notice 'option mismatch in %: % % gave %, expected %', p_label, r.facet, r.value, r.n, want; end if;
    end loop;
  end loop;
  perform tests.check('options ' || p_label || ' (' || seen || ' counts)', bad = 0 and seen > 100);
end $$;

select tests.option_counts('no filters', '{}'::jsonb);
select tests.option_counts('niche and status', jsonb_build_object('niche', $$p_niche => array['tech', 'gaming']$$, 'status', $$p_status => array['new', 'contacted', 'active']$$));
select tests.option_counts('sponsored, confirmed only', jsonb_build_object('sponsored', $$p_sponsored => 'yes'$$, 'recent', $$p_recent => 180$$, 'subs', $$p_subs_min => 2000, p_subs_max => 60000$$));
select tests.option_counts('sponsored, detected counted', jsonb_build_object('sponsored', $$p_sponsored => 'yes'$$, 'detected', 'p_detected => true', 'recent', $$p_recent => 90$$));
select tests.option_counts('sponsor, tag and country', jsonb_build_object('by', $$p_by => (select bs from fx)$$, 'tag', $$p_tag => array[(select t1 from fx)]$$, 'country', $$p_country => array['US', 'GB', 'DE']$$));
select tests.option_counts('contacted, views, language, email, search', jsonb_build_object('contacted', $$p_contacted => 'never'$$, 'views', 'p_views => 1000', 'lang', $$p_lang => array['en', 'pt']$$, 'email', 'p_email => true', 'q', $$p_q => 'a'$$));
select tests.option_counts('list and detected', jsonb_build_object('list', $$p_list => array[(select l1 from fx)]$$, 'detected', 'p_detected => true', 'sponsored', $$p_sponsored => 'no'$$));

-- facets list the options that nobody has (count 0), and the totals
select tests.check('facets: every niche, every status and every creator tag and list is listed',
  (select count(*) from public.creators_facets() where facet = 'niche') = 12
  and (select count(*) from public.creators_facets() where facet = 'status') = 6
  and (select count(*) from public.creators_facets() where facet = 'tag') = (select count(*) from public.tags where scope = 'creator')
  and (select count(*) from public.creators_facets() where facet = 'list') = (select count(*) from public.lists where kind = 'creators'));
select tests.check('facets: _all is every creator even when a filter is on, _total follows the filters',
  (select n from public.creators_facets(p_status => array['new']) where facet = '_all') = (select count(*) from public.creators)
  and (select n from public.creators_facets(p_status => array['new']) where facet = '_total') = (select count(*) from public.creators where status = 'new'));
select tests.check('facets: with detected on, a sponsor option can count a detected-only creator',
  (select coalesce(sum(n), 0) from public.creators_facets(p_detected => true) where facet = 'by')
    >= (select coalesce(sum(n), 0) from public.creators_facets(p_detected => false) where facet = 'by'));

-- ================================================================== pages, sort, and the same rows for the owner and a worker
select tests.check('list: 25 rows on page 1, the rest on page 2, no creator on both, the total is the same',
  (select count(*) from public.creators_list(p_limit => 25)) = 25
  and (select count(*) from public.creators_list(p_limit => 25, p_offset => 50)) = (select count(*) - 50 from public.creators)
  and not exists (select 1 from public.creators_list(p_limit => 25) a join public.creators_list(p_limit => 25, p_offset => 25) b using (id))
  and (select min(total) from public.creators_list(p_limit => 25, p_offset => 25)) = (select count(*) from public.creators));
select tests.check('list: sorted by subscribers high to low, low to high, name, added',
  (select id from public.creators_list(p_sort => 'subscribers', p_dir => 'desc', p_limit => 1)) = (select id from public.creators order by subscribers desc nulls last, full_name, id limit 1)
  and (select id from public.creators_list(p_sort => 'subscribers', p_dir => 'asc', p_limit => 1)) = (select id from public.creators where subscribers is not null order by subscribers, full_name, id limit 1)
  and (select id from public.creators_list(p_sort => 'name', p_dir => 'asc', p_limit => 1)) = (select id from public.creators order by full_name, id limit 1)
  and (select id from public.creators_list(p_sort => 'added', p_dir => 'desc', p_limit => 1)) = (select id from public.creators order by created_at desc, full_name, id limit 1)
  and (select id from public.creators_list(p_sort => 'sponsored', p_dir => 'desc', p_limit => 1)) = (select id from public.creators order by last_sponsorship_at desc nulls last, full_name, id limit 1));
select tests.check('list: an unknown sort (such as "match", added later) falls back to subscribers',
  (select id from public.creators_list(p_sort => 'match', p_limit => 1)) = (select id from public.creators_list(p_sort => 'subscribers', p_limit => 1)));
select tests.check('list: the limit is capped at 100 and an offset past the end gives no rows',
  (select count(*) from public.creators_list(p_limit => 5000)) <= 100
  and (select count(*) from public.creators_list(p_offset => 100000)) = 0);
select tests.check('list: no column holds an email address or phone',
  not exists (select 1 from information_schema.parameters where specific_name like 'creators_list%' and parameter_mode = 'OUT' and parameter_name in ('email', 'phone')));

create temp table pages (who text, ids uuid[]);
grant all on pages to public;
select tests.act('o_rows', 'authenticated', (select o from ids), $q$insert into pages select 'o', array_agg(id order by id) from public.creators_list(p_status => array['new','active'], p_sponsored => 'yes', p_limit => 100)$q$);
select tests.act('w_rows', 'authenticated', (select w from ids), $q$insert into pages select 'w', array_agg(id order by id) from public.creators_list(p_status => array['new','active'], p_sponsored => 'yes', p_limit => 100)$q$);
select tests.check('the owner and a worker get the same rows',
  (select ids from pages where who = 'o') = (select ids from pages where who = 'w') and (select cardinality(ids) from pages where who = 'o') > 0);
select tests.check('export rows equal the list total and carry the email',
  (select count(*) from public.creators_export(p_niche => array['tech', 'gaming'])) = (select count(*) from public.creators where niche_slug in ('tech', 'gaming'))
  and (select bool_and(email like '%@%') from public.creators_export(p_limit => 10)));

-- ================================================================== anon, and the grants
select tests.check('anon cannot call any of the list functions',
  not (tests.run_as('anon', null, 'select * from public.creators_list()')).ok
  and not (tests.run_as('anon', null, 'select * from public.creators_facets()')).ok
  and not (tests.run_as('anon', null, 'select * from public.creators_match_ids()')).ok
  and not (tests.run_as('anon', null, 'select * from public.creators_export()')).ok
  and not (tests.run_as('anon', null, $q$select public.creators_add_to_list(gen_random_uuid(), array[gen_random_uuid()])$q$)).ok
  and not (tests.run_as('anon', null, $q$select public.creators_add_tag(gen_random_uuid(), array[gen_random_uuid()])$q$)).ok
  and not (tests.run_as('anon', null, $q$select public.creator_contacted_at(gen_random_uuid(), null)$q$)).ok);
select tests.check('the functions are security invoker with a fixed search_path, and anon has no execute right',
  (select bool_and(not p.prosecdef and p.proconfig is not null and not has_function_privilege('anon', p.oid, 'execute') and has_function_privilege('authenticated', p.oid, 'execute'))
     from pg_proc p where p.pronamespace = 'public'::regnamespace
      and p.proname in ('creator_contacted_at', 'contacted_matches', 'creators_match_ids', 'creators_list', 'creators_facets', 'creators_export', 'creators_add_to_list', 'creators_add_tag')));
select tests.check('a signed-out request with no staff profile sees no rows',
  (select tests.count_as('00000000-0000-0000-0000-0000000000ff', 'select count(*) from public.creators_match_ids()')) = 0);

-- ================================================================== bulk actions
insert into public.lists (id, name, kind) values ('00000000-0000-0000-0000-00000000a001', 'ZZ list test', 'creators');
insert into public.tags (id, name, scope) values ('00000000-0000-0000-0000-00000000a002', 'ZZ tag test', 'creator');
create temp table few as select array_agg(id) as a from (select id from public.creators order by id limit 3) x;
grant select on few to public;
select tests.act('w_list_add', 'authenticated', (select w from ids), $q$select public.creators_add_to_list('00000000-0000-0000-0000-00000000a001', (select a from few))$q$);
select tests.act('w_list_again', 'authenticated', (select w from ids), $q$select public.creators_add_to_list('00000000-0000-0000-0000-00000000a001', (select a from few))$q$);
select tests.act('o_tag_add', 'authenticated', (select o from ids), $q$select public.creators_add_tag('00000000-0000-0000-0000-00000000a002', (select a from few))$q$);
select tests.act('w_too_many', 'authenticated', (select w from ids), $q$select public.creators_add_to_list('00000000-0000-0000-0000-00000000a001', (select array_agg(gen_random_uuid()) from generate_series(1, 201)))$q$);
select tests.act('w_none', 'authenticated', (select w from ids), $q$select public.creators_add_tag('00000000-0000-0000-0000-00000000a002', '{}')$q$);
select tests.check('bulk: add to list adds 3, a second call adds none, add tag works, 0 or 201 ids are refused',
  tests.ok('w_list_add') and (select count(*) from public.list_items where list_id = '00000000-0000-0000-0000-00000000a001') = 3
  and tests.ok('w_list_again') and (select count(*) from public.list_items where list_id = '00000000-0000-0000-0000-00000000a001') = 3
  and tests.ok('o_tag_add') and (select count(*) from public.creator_tags where tag_id = '00000000-0000-0000-0000-00000000a002') = 3
  and not tests.ok('w_too_many') and not tests.ok('w_none'));

do $$ declare f int; begin select count(*) filter (where not ok) into f from tests.results;
  raise notice '% checks, % failed', (select count(*) from tests.results), f;
  if f > 0 then raise exception 'creators list tests failed: %', (select string_agg(name, '; ') from tests.results where not ok); end if; end $$;
rollback;
