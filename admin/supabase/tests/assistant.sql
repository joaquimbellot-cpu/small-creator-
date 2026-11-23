-- Assistant tables: only the owner, only their own rows; worker, anon and service role get nothing;
-- messages are append-only; proposals follow their life cycle; log_audit knows the new actions. Rolled back.
\set ON_ERROR_STOP on
begin;
create schema tests;
create table tests.results (name text, ok boolean);
create function tests.check(p_name text, p_ok boolean) returns void language plpgsql as $$
begin insert into tests.results values (p_name, coalesce(p_ok, false)); raise notice '% %', case when coalesce(p_ok,false) then 'PASS' else 'FAIL' end, p_name;
  if not coalesce(p_ok, false) then raise exception 'FAILED: %', p_name; end if; end $$;

-- Run p_sql as p_role with JWT claims. Returns ok / row count / error text (err is null on success).
create function tests.run_as(p_role text, p_uid uuid, p_sql text, out ok boolean, out n bigint, out err text)
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_strip_nulls(jsonb_build_object('role', p_role, 'sub', p_uid))::text, true);
  execute format('set local role %I', p_role);
  begin execute p_sql; get diagnostics n = row_count; ok := true;
  exception when others then ok := false; n := -1; err := sqlerrm; end;
  reset role;
end $$;
create function tests.rows(p_role text, p_uid uuid, p_sql text) returns bigint language plpgsql as $$
declare v bigint;
begin
  perform set_config('request.jwt.claims', jsonb_strip_nulls(jsonb_build_object('role', p_role, 'sub', p_uid))::text, true);
  execute format('set local role %I', p_role);
  begin execute 'select count(*) from (' || p_sql || ') q' into v; exception when others then v := -1; end;
  reset role; return v;
end $$;

create temp table ids as select (select id from public.profiles where email = 'owner@example.test') as o,
                                (select id from public.profiles where email = 'worker@example.test') as w,
                                gen_random_uuid() as thread, gen_random_uuid() as other_thread;
grant select on ids to public;
delete from public.assistant_threads;   -- live conversations (e2e runs, real use) must not change the counts; rolled back
-- A thread that belongs to someone else (the worker's profile id stands in for a second user).
insert into public.assistant_threads (id, owner_id, title) select other_thread, w, 'not yours' from ids;
insert into public.assistant_messages (thread_id, owner_id, role, content)
  select other_thread, w, 'user', '[{"type":"text","text":"hidden"}]'::jsonb from ids;

-- ================================================================== owner
select tests.check('owner can create a thread',
  (tests.run_as('authenticated', (select o from ids), format($q$insert into public.assistant_threads (id, title) values (%L, 'hello')$q$, (select thread from ids)))).ok);
select tests.check('owner sees only their own thread',
  tests.rows('authenticated', (select o from ids), 'select * from public.assistant_threads') = 1);
select tests.check('owner can append user and assistant messages (exact blocks)',
  (tests.run_as('authenticated', (select o from ids), format($q$insert into public.assistant_messages (thread_id, role, content) values
     (%1$L, 'user', '[{"type":"text","text":"hi"}]'), (%1$L, 'assistant', '[{"type":"thinking","thinking":"x","signature":"s"},{"type":"text","text":"hello"}]')$q$, (select thread from ids)))).n = 2);
select tests.check('stored blocks come back exactly as written',
  (select content -> 0 ->> 'signature' from public.assistant_messages where role = 'assistant' and thread_id = (select thread from ids)) = 's');
select tests.check('owner sees only their own messages (not the other thread)',
  tests.rows('authenticated', (select o from ids), 'select * from public.assistant_messages') = 2);
select tests.check('owner cannot write a message into someone else''s thread',
  not (tests.run_as('authenticated', (select o from ids), format($q$insert into public.assistant_messages (thread_id, role, content) values (%L, 'user', '[]')$q$, (select other_thread from ids)))).ok);
select tests.check('owner cannot write a message as another user',
  not (tests.run_as('authenticated', (select o from ids), format($q$insert into public.assistant_messages (thread_id, owner_id, role, content) values (%L, %L, 'user', '[]')$q$, (select thread from ids), (select w from ids)))).ok);
select tests.check('message role must be user or assistant, content must be an array',
  not (tests.run_as('authenticated', (select o from ids), format($q$insert into public.assistant_messages (thread_id, role, content) values (%L, 'system', '[]')$q$, (select thread from ids)))).ok
  and not (tests.run_as('authenticated', (select o from ids), format($q$insert into public.assistant_messages (thread_id, role, content) values (%L, 'user', '{}')$q$, (select thread from ids)))).ok);
select tests.check('messages are append-only: owner cannot update or delete',
  not (tests.run_as('authenticated', (select o from ids), $q$update public.assistant_messages set content = '[]'$q$)).ok
  and not (tests.run_as('authenticated', (select o from ids), 'delete from public.assistant_messages')).ok);
do $$
begin
  begin update public.assistant_messages set content = '[]'; raise exception 'update went through'; exception when insufficient_privilege then perform tests.check('messages are append-only: not even the postgres role can update', true); end;
end $$;
select tests.check('owner can lock and release their thread (title, locked_at, updated_at only)',
  (tests.run_as('authenticated', (select o from ids), format($q$update public.assistant_threads set locked_at = now(), updated_at = now() where id = %L$q$, (select thread from ids)))).n = 1
  and not (tests.run_as('authenticated', (select o from ids), format($q$update public.assistant_threads set owner_id = %L where id = %L$q$, (select w from ids), (select thread from ids)))).ok);

-- proposals
select tests.check('owner can create a pending proposal',
  (tests.run_as('authenticated', (select o from ids), format($q$insert into public.assistant_proposals (id, thread_id, kind, payload, summary)
     values ('00000000-0000-0000-0000-0000000000a1', %L, 'deal.stage', '{"deal_id":"x"}', 'Move a deal'),
            ('00000000-0000-0000-0000-0000000000a2', %L, 'creator.update', '{}', 'Edit a creator')$q$, (select thread from ids), (select thread from ids)))).n = 2);
select tests.check('a proposal cannot be created already approved, nor with an unknown kind',
  not (tests.run_as('authenticated', (select o from ids), format($q$insert into public.assistant_proposals (thread_id, kind, payload, summary, status) values (%L, 'deal.stage', '{}', 's', 'approved')$q$, (select thread from ids)))).ok
  and not (tests.run_as('authenticated', (select o from ids), format($q$insert into public.assistant_proposals (thread_id, kind, payload, summary) values (%L, 'creator.delete', '{}', 's')$q$, (select thread from ids)))).ok);
select tests.check('proposal content (payload, summary, kind) cannot be changed',
  not (tests.run_as('authenticated', (select o from ids), $q$update public.assistant_proposals set payload = '{"a":1}' where id = '00000000-0000-0000-0000-0000000000a1'$q$)).ok
  and not (tests.run_as('authenticated', (select o from ids), $q$update public.assistant_proposals set summary = 'x' where id = '00000000-0000-0000-0000-0000000000a1'$q$)).ok);
select tests.check('pending -> approved works, and records who decided',
  (tests.run_as('authenticated', (select o from ids), format($q$update public.assistant_proposals set status = 'approved', decided_at = now(), decided_by = %L where id = '00000000-0000-0000-0000-0000000000a1' and status = 'pending'$q$, (select o from ids)))).n = 1);
select tests.check('an approved proposal can only get a result or fail, never go back to pending or be rejected',
  (tests.run_as('authenticated', (select o from ids), $q$update public.assistant_proposals set result = '{"ok":true}' where id = '00000000-0000-0000-0000-0000000000a1'$q$)).n = 1
  and not (tests.run_as('authenticated', (select o from ids), $q$update public.assistant_proposals set status = 'pending' where id = '00000000-0000-0000-0000-0000000000a1'$q$)).ok
  and not (tests.run_as('authenticated', (select o from ids), $q$update public.assistant_proposals set status = 'rejected' where id = '00000000-0000-0000-0000-0000000000a1'$q$)).ok);
select tests.check('pending -> rejected works; a rejected proposal is final',
  (tests.run_as('authenticated', (select o from ids), $q$update public.assistant_proposals set status = 'rejected', decided_at = now() where id = '00000000-0000-0000-0000-0000000000a2' and status = 'pending'$q$)).n = 1
  and (tests.run_as('authenticated', (select o from ids), $q$update public.assistant_proposals set status = 'approved' where id = '00000000-0000-0000-0000-0000000000a2'$q$)).n = 0);
-- Changed on purpose (audit L38): the owner may delete their own conversation (not someone else's, not a proposal alone).
select tests.check('owner cannot delete proposals alone, and deletes only their own threads',
  not (tests.run_as('authenticated', (select o from ids), 'delete from public.assistant_proposals')).ok
  and (tests.run_as('authenticated', (select o from ids), 'delete from public.assistant_threads')).n = 1
  and exists (select 1 from public.assistant_threads where id = (select other_thread from ids)));

-- ================================================================== audit actions
select tests.check('log_audit accepts the new assistant and contact actions for the owner',
  (tests.run_as('authenticated', (select o from ids), $q$select public.log_audit('assistant.message', 'assistant_thread', 'x', '{"tools":["search_creators"]}')$q$)).ok
  and (tests.run_as('authenticated', (select o from ids), $q$select public.log_audit('assistant.proposal_approved', 'assistant_proposal', 'x', '{}')$q$)).ok
  and (tests.run_as('authenticated', (select o from ids), $q$select public.log_audit('assistant.proposal_rejected', 'assistant_proposal', 'x', '{}')$q$)).ok
  and (tests.run_as('authenticated', (select o from ids), $q$select public.log_audit('contact.viewed', 'contact_message', 'x', '{}')$q$)).ok
  and (tests.run_as('authenticated', (select o from ids), $q$select public.log_audit('creator.viewed', 'creator', 'x', '{}')$q$)).ok);
select tests.check('log_audit still refuses unknown actions',
  not (tests.run_as('authenticated', (select o from ids), $q$select public.log_audit('assistant.anything', 'x', 'x', '{}')$q$)).ok);

-- ================================================================== worker, anon, service role
select tests.check('worker sees nothing',
  tests.rows('authenticated', (select w from ids), 'select * from public.assistant_threads') = 0
  and tests.rows('authenticated', (select w from ids), 'select * from public.assistant_messages') = 0
  and tests.rows('authenticated', (select w from ids), 'select * from public.assistant_proposals') = 0);
select tests.check('worker cannot insert, update or delete (even in their own thread)',
  not (tests.run_as('authenticated', (select w from ids), format($q$insert into public.assistant_threads (id, title) values (gen_random_uuid(), 'x')$q$))).ok
  and not (tests.run_as('authenticated', (select w from ids), format($q$insert into public.assistant_messages (thread_id, role, content) values (%L, 'user', '[]')$q$, (select other_thread from ids)))).ok
  and not (tests.run_as('authenticated', (select w from ids), format($q$insert into public.assistant_proposals (thread_id, kind, payload, summary) values (%L, 'deal.stage', '{}', 's')$q$, (select other_thread from ids)))).ok
  and (tests.run_as('authenticated', (select w from ids), $q$update public.assistant_threads set title = 'mine'$q$)).n <= 0
  and (tests.run_as('authenticated', (select w from ids), $q$delete from public.assistant_messages$q$)).n <= 0);
select tests.check('anon gets nothing: no select, no insert',
  tests.rows('anon', null, 'select * from public.assistant_threads') = -1
  and tests.rows('anon', null, 'select * from public.assistant_messages') = -1
  and tests.rows('anon', null, 'select * from public.assistant_proposals') = -1
  and not (tests.run_as('anon', null, $q$insert into public.assistant_threads (title) values ('x')$q$)).ok
  and not (tests.run_as('anon', null, $q$insert into public.assistant_messages (thread_id, role, content) values (gen_random_uuid(), 'user', '[]')$q$)).ok);
select tests.check('service role gets nothing either (rows are written by the owner''s own session)',
  tests.rows('service_role', null, 'select * from public.assistant_threads') = -1
  and tests.rows('service_role', null, 'select * from public.assistant_messages') = -1
  and tests.rows('service_role', null, 'select * from public.assistant_proposals') = -1
  and not (tests.run_as('service_role', (select o from ids), format($q$insert into public.assistant_messages (thread_id, owner_id, role, content) values (%L, %L, 'user', '[]')$q$, (select thread from ids), (select o from ids)))).ok);

rollback;
