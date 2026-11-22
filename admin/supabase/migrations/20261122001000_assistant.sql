-- The owner's "Claude" assistant: chat threads, messages, and proposals the owner approves with a click.
-- 1. Tables: assistant_threads, assistant_messages (append-only), assistant_proposals.
-- 2. Row level security: only the owner, only their own rows. Rows are written by the owner's own session;
--    the service role and anon get nothing.
-- 3. log_audit allow-list: copy of section 3 of 20261121000800_security_hardening.sql with four more actions.
set search_path = public, extensions;

-- ---------------------------------------------------------------- 1. tables
create table public.assistant_threads (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title      text not null default '' check (length(title) <= 200),
  locked_at  timestamptz,                         -- set while a chat request runs, so two requests cannot interleave
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index assistant_threads_owner_idx on public.assistant_threads (owner_id, updated_at desc);

-- content = the exact API content blocks (assistant: response.content as returned, user: text or tool_result blocks).
-- Replayed unchanged to the API, so a row is never edited.
create table public.assistant_messages (
  id         bigint generated always as identity primary key,
  thread_id  uuid not null references public.assistant_threads (id) on delete cascade,
  owner_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  role       text not null check (role in ('user', 'assistant')),
  content    jsonb not null check (jsonb_typeof(content) = 'array'),
  created_at timestamptz not null default now()
);
create index assistant_messages_thread_idx on public.assistant_messages (thread_id, id);
create index assistant_messages_owner_day_idx on public.assistant_messages (owner_id, created_at) where role = 'user';

create table public.assistant_proposals (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid not null references public.assistant_threads (id) on delete cascade,
  owner_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind       text not null check (kind in ('creator.create', 'creator.update', 'deal.stage')),
  payload    jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 8192),
  summary    text not null check (length(summary) between 1 and 500),
  status     text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'failed')),
  result     jsonb check (result is null or octet_length(result::text) <= 4096),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles (id) on delete set null
);
create index assistant_proposals_thread_idx on public.assistant_proposals (thread_id, created_at);

-- Messages are append-only, for everyone (including the postgres role).
create function public.assistant_messages_append_only() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception 'assistant_messages is append-only' using errcode = 'insufficient_privilege';
end $$;
create trigger assistant_messages_no_update before update on public.assistant_messages
  for each row execute function public.assistant_messages_append_only();

-- Proposal life cycle: pending -> approved | rejected | failed, and approved -> failed (the action did not work out).
-- An approved row may also get its result written. Everything else is final.
create function public.assistant_proposals_guard() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.id <> old.id or new.thread_id <> old.thread_id or new.owner_id <> old.owner_id or new.kind <> old.kind
     or new.payload is distinct from old.payload or new.summary <> old.summary or new.created_at <> old.created_at then
    raise exception 'proposal content cannot be changed' using errcode = 'check_violation';
  end if;
  if old.status = 'pending' and new.status in ('approved', 'rejected', 'failed') then return new; end if;
  if old.status = 'approved' and new.status in ('approved', 'failed') then return new; end if;
  raise exception 'proposal is already %', old.status using errcode = 'check_violation';
end $$;
create trigger assistant_proposals_guard before update on public.assistant_proposals
  for each row execute function public.assistant_proposals_guard();

-- Trigger functions need no EXECUTE privilege for anyone (triggers run them regardless).
revoke all on function public.assistant_messages_append_only(), public.assistant_proposals_guard()
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------- 2. row level security and grants
alter table public.assistant_threads   enable row level security;
alter table public.assistant_messages  enable row level security;
alter table public.assistant_proposals enable row level security;

create policy owner_select_assistant_threads on public.assistant_threads for select to authenticated
  using (owner_id = (select auth.uid()) and (select public.is_owner()));
create policy owner_insert_assistant_threads on public.assistant_threads for insert to authenticated
  with check (owner_id = (select auth.uid()) and (select public.is_owner()));
create policy owner_update_assistant_threads on public.assistant_threads for update to authenticated
  using (owner_id = (select auth.uid()) and (select public.is_owner()))
  with check (owner_id = (select auth.uid()) and (select public.is_owner()));

create policy owner_select_assistant_messages on public.assistant_messages for select to authenticated
  using (owner_id = (select auth.uid()) and (select public.is_owner()));
create policy owner_insert_assistant_messages on public.assistant_messages for insert to authenticated
  with check (owner_id = (select auth.uid()) and (select public.is_owner())
    and exists (select 1 from public.assistant_threads t where t.id = thread_id and t.owner_id = (select auth.uid())));

create policy owner_select_assistant_proposals on public.assistant_proposals for select to authenticated
  using (owner_id = (select auth.uid()) and (select public.is_owner()));
create policy owner_insert_assistant_proposals on public.assistant_proposals for insert to authenticated
  with check (owner_id = (select auth.uid()) and (select public.is_owner()) and status = 'pending'
    and result is null and decided_at is null and decided_by is null
    and exists (select 1 from public.assistant_threads t where t.id = thread_id and t.owner_id = (select auth.uid())));
create policy owner_update_assistant_proposals on public.assistant_proposals for update to authenticated
  using (owner_id = (select auth.uid()) and (select public.is_owner()) and status in ('pending', 'approved'))
  with check (owner_id = (select auth.uid()) and (select public.is_owner()));

-- New tables get default grants for every API role on this stack; take them all away, then grant exactly what is needed.
revoke all on public.assistant_threads, public.assistant_messages, public.assistant_proposals from anon, authenticated, service_role, public;
revoke all on sequence public.assistant_messages_id_seq from anon, authenticated, service_role, public;

grant select, insert on public.assistant_threads to authenticated;
grant update (title, locked_at, updated_at) on public.assistant_threads to authenticated;
grant select, insert on public.assistant_messages to authenticated;                 -- no update, no delete
grant usage on sequence public.assistant_messages_id_seq to authenticated;
grant select, insert on public.assistant_proposals to authenticated;
grant update (status, result, decided_at, decided_by) on public.assistant_proposals to authenticated;

-- ---------------------------------------------------------------- 3. log_audit allow-list
create or replace function public.log_audit(
  action text, entity_type text default null, entity_id text default null,
  details jsonb default '{}'::jsonb, p_actor uuid default null
) returns bigint
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
#variable_conflict use_variable
declare
  v_id bigint;
  v_ok text[] := array['creator.viewed', 'creators.exported', 'creators.imported', 'creator.subscribers_refreshed',
    'email.drafted', 'auth.login', 'auth.logout', 'auth.password_changed', 'auth.2fa_enabled', 'auth.2fa_removed',
    'user.invited', 'user.removed', 'user.restored',
    'contact.viewed', 'assistant.message', 'assistant.proposal_approved', 'assistant.proposal_rejected'];
begin
  if auth.uid() is not null and not public.is_staff() then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  if not (action = any (v_ok) or (auth.uid() is null and action = 'email.unsubscribed')) then
    raise exception 'audit action not allowed: %', left(coalesce(action, ''), 60) using errcode = 'check_violation';
  end if;
  if octet_length(coalesce(details, '{}'::jsonb)::text) > 8192 then
    raise exception 'audit details too large' using errcode = 'check_violation';
  end if;
  insert into public.audit_log (actor_id, action, entity_type, entity_id, details)
  values (coalesce(auth.uid(), p_actor), action, left(entity_type, 100), left(entity_id, 100),
          coalesce(details, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end $$;

notify pgrst, 'reload schema';
