-- Tests for migration 20261125001000 (global_search, the search box in the top bar). Everything is rolled back.
\set ON_ERROR_STOP on
begin;
create schema tests;
create table tests.results (name text, ok boolean);
create function tests.check(p_name text, p_ok boolean) returns void language plpgsql as $$
begin insert into tests.results values (p_name, coalesce(p_ok, false)); raise notice '% %', case when coalesce(p_ok,false) then 'PASS' else 'FAIL' end, p_name; end $$;
-- rows (or -1 when the call fails) of a query run as a role
create function tests.rows_as(p_role text, p_uid uuid, p_sql text) returns bigint language plpgsql as $$
declare n bigint;
begin
  perform set_config('request.jwt.claims', case when p_uid is null then json_build_object('role', p_role)::text
                                                else json_build_object('sub', p_uid, 'role', p_role)::text end, true);
  execute format('set local role %I', p_role);
  begin execute format('select count(*) from (%s) q', p_sql) into n; exception when others then n := -1; end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  return n;
end $$;
create temp table ids as select (select id from public.profiles where email = 'worker@example.test') as w, gen_random_uuid() as norole;
grant select on ids to public;
grant usage on schema tests to public;
delete from auth.mfa_factors;
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, created_at, updated_at)
select norole, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'norole-search@example.test', '{}', now(), now() from ids;

-- fixtures with odd characters
insert into public.creators (id, full_name, email, channel_name, subscribers) values
  ('00000000-0000-0000-0000-0000000005e1', 'Zed 100% Quokka', 'zed-search@example.test', 'Quokka Corner', 4200),
  ('00000000-0000-0000-0000-0000000005e2', 'Zed 100x Quokka', 'zed2-search@example.test', 'Plain Channel', 10),
  ('00000000-0000-0000-0000-0000000005e3', 'Under_score Person', 'us-search@example.test', 'Snake Case Show', 99);
insert into public.brands (id, name, industry) values
  ('00000000-0000-0000-0000-0000000005b1', 'Wombat Widgets', 'Marsupial supplies');
insert into public.deals (id, creator_id, brand_id, stage, amount_cents) values
  ('00000000-0000-0000-0000-0000000005d1', '00000000-0000-0000-0000-0000000005e1', '00000000-0000-0000-0000-0000000005b1', 'negotiating', 100000);

-- the result of a search as one json array, run as the worker
create function tests.found(p_q text) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select w from ids), 'role', 'authenticated')::text, true);
  set local role authenticated;
  select coalesce(jsonb_agg(to_jsonb(g)), '[]') into v from public.global_search(p_q) g;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  return v;
end $$;
grant execute on function tests.found(text) to public;

select tests.check('finds a creator by name', tests.found('quokka') @> '[{"kind":"creator","id":"00000000-0000-0000-0000-0000000005e1"}]');
select tests.check('finds a creator by channel name', tests.found('corner') @> '[{"kind":"creator","id":"00000000-0000-0000-0000-0000000005e1"}]');
select tests.check('is not case sensitive', tests.found('QuOkKa') @> '[{"id":"00000000-0000-0000-0000-0000000005e1"}]');
select tests.check('finds a sponsor by name', tests.found('wombat') @> '[{"kind":"sponsor","id":"00000000-0000-0000-0000-0000000005b1"}]');
select tests.check('finds a sponsor by industry', tests.found('marsupial') @> '[{"kind":"sponsor","id":"00000000-0000-0000-0000-0000000005b1"}]');
select tests.check('finds a deal by the creator name', tests.found('quokka') @> '[{"kind":"deal","id":"00000000-0000-0000-0000-0000000005d1","stage":"negotiating"}]');
select tests.check('finds a deal by the sponsor name', tests.found('widgets') @> '[{"kind":"deal","id":"00000000-0000-0000-0000-0000000005d1","other_name":"Wombat Widgets"}]');
select tests.check('% is a plain character', tests.found('100%') @> '[{"id":"00000000-0000-0000-0000-0000000005e1"}]'
  and not (tests.found('100%') @> '[{"id":"00000000-0000-0000-0000-0000000005e2"}]'));
select tests.check('_ is a plain character', tests.found('under_s') @> '[{"id":"00000000-0000-0000-0000-0000000005e3"}]' and tests.found('under_x') = '[]'
  and not (tests.found('under s') @> '[{"id":"00000000-0000-0000-0000-0000000005e3"}]'));
select tests.check('a lone % matches only text with a %, a lone backslash nothing',
  not exists (select 1 from jsonb_array_elements(tests.found('%')) e where e ->> 'name' not like '%\%%' and coalesce(e ->> 'other_name', '') not like '%\%%')
  and tests.found('\') = '[]');
select tests.check('an empty or blank search returns nothing', tests.found('') = '[]' and tests.found('   ') = '[]' and tests.found(null) = '[]');
select tests.check('at most 6 of each kind', (select max(n) from (select count(*) n from jsonb_array_elements(tests.found('a')) e group by e ->> 'kind') x) <= 6);
select tests.check('the result has no email, phone, note or contact column',
  not exists (select 1 from information_schema.parameters where specific_schema = 'public' and specific_name like 'global_search%' and parameter_mode = 'OUT'
              and parameter_name ~* 'mail|phone|note|contact')
  and not (tests.found('quokka')::text ~* 'example\.test'));
select tests.check('a quote in the search is harmless', tests.found('''; drop table creators; --') = '[]');
select tests.check('anon cannot call it', tests.rows_as('anon', null, $$select * from public.global_search('quokka')$$) = -1);
select tests.check('a login without a staff role gets nothing', tests.rows_as('authenticated', (select norole from ids), $$select * from public.global_search('a')$$) = 0);
select tests.check('the worker gets rows', tests.rows_as('authenticated', (select w from ids), $$select * from public.global_search('a')$$) > 0);

select tests.check('all tests of this file ran', (select count(*) from tests.results) >= 16);
do $$ begin
  if exists (select 1 from tests.results where not ok) then
    raise exception 'FAILED: %', (select string_agg(name, '; ') from tests.results where not ok);
  end if;
  raise notice 'search.sql: % checks passed', (select count(*) from tests.results);
end $$;
rollback;
