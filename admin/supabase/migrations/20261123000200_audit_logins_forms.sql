-- Audit, login limits, public-form cap, password-reset limit, Claude conversations
-- (fix agent FA, audit items M06, M08, M33, L02, L04, L38, L48).
--   * log_audit: owner-type actions only for the owner; 2FA lines only for the caller's own profile.
--   * audit_row: personal values (creator email, phone, notes, email to_email) are stored as {"changed": true}.
--   * login_allowed: per (email, IP) pair, per IP, and per email across all IPs.
--   * form_rate_ok: one global cap on public submissions (200 per hour, both forms together).
--   * reset_allowed / record_reset_request + reset_requests table (3 per hour per email and per IP).
--   * the owner can delete their own Claude conversation (messages and proposals go with it).
--   * audit_actions(): the distinct actions in audit_log, owner only.
--
-- SAFE ON THE LIVE DATABASE: only functions are replaced, one empty table, one index and one policy are added.
-- No row is changed or deleted. Old audit lines stay as they are (the log is append-only).
-- ROLL BACK (manual): re-create the earlier versions of log_audit, audit_row, login_allowed, form_rate_ok from
--   20261122001000, 20261121000800, 20261121000400 and 20261122001100; drop reset_allowed, record_reset_request,
--   reset_requests, audit_actions, the policy owner_delete_assistant_threads and revoke delete on assistant_threads.
set search_path = public, extensions;

-- ---------------------------------------------------------------- M06 log_audit
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
    'contact.viewed', 'assistant.message', 'assistant.proposal_approved', 'assistant.proposal_rejected', 'assistant.thread_deleted'];
begin
  if auth.uid() is not null and not public.is_staff() then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  if not (action = any (v_ok) or (auth.uid() is null and action = 'email.unsubscribed')) then
    raise exception 'audit action not allowed: %', left(coalesce(action, ''), 60) using errcode = 'check_violation';
  end if;
  -- owner-type events: a worker cannot write them
  if auth.uid() is not null and not public.is_owner()
     and (action in ('user.invited', 'user.removed', 'user.restored') or action like 'assistant.%') then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  -- two-step login lines: any staff member, but only about their own profile
  if auth.uid() is not null and action in ('auth.2fa_enabled', 'auth.2fa_removed')
     and (entity_type is distinct from 'profile' or entity_id is distinct from auth.uid()::text) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
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

-- ---------------------------------------------------------------- M33 audit_row without personal values
-- Same as 20261121000800, except: creators.email / phone / notes and emails.to_email changes are stored as
-- {"changed": true}, and the email lines no longer carry to_email (the creator id is enough).
create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_entity  text := tg_argv[0];
  v_old     jsonb;
  v_new     jsonb;
  v_rec     jsonb;
  v_action  text;
  v_details jsonb;
  v_changes jsonb := '{}'::jsonb;
  k         text;
begin
  if tg_op = 'INSERT' then v_rec := to_jsonb(new);
  elsif tg_op = 'DELETE' then v_rec := to_jsonb(old);
  else v_old := to_jsonb(old); v_new := to_jsonb(new); v_rec := v_new;
  end if;

  v_details := jsonb_build_object('label',
    left(coalesce(v_rec ->> 'full_name', v_rec ->> 'name', v_rec ->> 'subject', v_rec ->> 'email', ''), 200));
  if v_entity = 'email' then
    v_details := v_details || jsonb_build_object('creator_id', v_rec -> 'creator_id',
                                                 'is_test', v_rec -> 'is_test', 'status', v_rec -> 'status');
  elsif v_entity = 'deal' then
    v_details := v_details || jsonb_build_object('creator_id', v_rec -> 'creator_id', 'brand_id', v_rec -> 'brand_id',
                                                 'stage', v_rec -> 'stage', 'amount_cents', v_rec -> 'amount_cents');
  elsif v_entity = 'profile' then
    v_details := v_details || jsonb_build_object('role', v_rec -> 'role');
  end if;

  if tg_op = 'INSERT' then
    v_action := 'created';
  elsif tg_op = 'DELETE' then
    v_action := 'deleted';
  else
    for k in select jsonb_object_keys(v_new) loop
      if k <> 'updated_at' and (v_old -> k) is distinct from (v_new -> k) then
        v_changes := v_changes || jsonb_build_object(k,
          case when (v_entity = 'creator' and k in ('email', 'phone', 'notes'))
                    or (v_entity = 'email' and k = 'to_email')
               then jsonb_build_object('changed', true)
               when length(coalesce(v_new ->> k, '')) <= 120 and length(coalesce(v_old ->> k, '')) <= 120
               then jsonb_build_object('from', v_old -> k, 'to', v_new -> k)
               else jsonb_build_object('changed', true) end);
      end if;
    end loop;
    if v_entity = 'email' then
      if not (v_changes ? 'status') then return null; end if;
      v_changes := jsonb_build_object('status', v_changes -> 'status');
      v_action := 'status_changed';
    elsif v_entity = 'profile' then
      v_changes := v_changes - 'full_name' - 'email';
      if v_changes = '{}'::jsonb then return null; end if;
      v_action := 'role_changed';
    else
      if v_changes = '{}'::jsonb then return null; end if;
      v_action := 'updated';
    end if;
    v_details := v_details || jsonb_build_object('changes', v_changes);
  end if;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, details)
  values (coalesce(auth.uid(), nullif(current_setting('smallfold.actor', true), '')::uuid), v_entity || '.' || v_action, v_entity, coalesce(v_rec ->> 'id', v_rec ->> 'email'), v_details);
  return null;
end $$;

-- ---------------------------------------------------------------- M08 login limit
-- false after: 5 failures in 15 minutes for the same (email, IP) pair (counted since that pair's last success);
-- 5 failures from the same IP for any email; 20 failures for the same email from all IPs together
-- (counted since that email's last success). So a stranger cannot lock the owner out from one place.
-- Callers should not record attempts that were blocked.
create or replace function public.login_allowed(email text, ip text default null) returns boolean
language plpgsql stable security definer set search_path = public, extensions, pg_temp as $$
#variable_conflict use_variable
declare
  v_email citext := btrim(email);
  v_ip    text := left(nullif(btrim(ip), ''), 100);
  v_since timestamptz := now() - interval '15 minutes';
  v_ok    timestamptz;
  v_n     integer;
begin
  select max(a.created_at) into v_ok from public.login_attempts a
   where a.email = v_email and a.success and a.ip is not distinct from v_ip;
  select count(*) into v_n from public.login_attempts a
   where a.email = v_email and a.ip is not distinct from v_ip and not a.success
     and a.created_at > v_since and a.created_at > coalesce(v_ok, '-infinity');
  if v_n >= 5 then return false; end if;

  if v_ip is not null then
    select count(*) into v_n from public.login_attempts a
     where a.ip = v_ip and not a.success and a.created_at > v_since;
    if v_n >= 5 then return false; end if;
  end if;

  select max(a.created_at) into v_ok from public.login_attempts a where a.email = v_email and a.success;
  select count(*) into v_n from public.login_attempts a
   where a.email = v_email and not a.success and a.created_at > v_since
     and a.created_at > coalesce(v_ok, '-infinity');
  if v_n >= 20 then return false; end if;
  return true;
end $$;

-- ---------------------------------------------------------------- L02 global cap for the public forms
create index if not exists form_rate_limits_time_idx on public.form_rate_limits (created_at desc);

create or replace function public.form_rate_ok(p_form text, p_ip_hash text) returns boolean
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare n integer;
begin
  -- Same lock order every time (everything, then form, then visitor), so two sends cannot deadlock.
  perform pg_advisory_xact_lock(hashtext('smallfold.form_rate_everything'));
  perform pg_advisory_xact_lock(hashtext('smallfold.form_rate_all:' || p_form));
  perform pg_advisory_xact_lock(hashtext('smallfold.form_rate:' || p_form || ':' || p_ip_hash));
  delete from public.form_rate_limits where created_at < now() - interval '1 day';
  select count(*) into n from public.form_rate_limits
   where form = p_form and ip_hash = p_ip_hash and created_at > now() - interval '1 hour';
  if n >= 5 then return false; end if;
  select count(*) into n from public.form_rate_limits
   where form = p_form and created_at > now() - interval '1 hour';
  if n >= 60 then return false; end if;
  -- one cap for every public submission, whatever the form or the visitor
  select count(*) into n from public.form_rate_limits where created_at > now() - interval '1 hour';
  if n >= 200 then return false; end if;
  insert into public.form_rate_limits (form, ip_hash) values (p_form, p_ip_hash);
  return true;
end $$;

-- ---------------------------------------------------------------- L04 password-reset limit
create table public.reset_requests (
  id         bigserial primary key,
  email      citext not null,
  ip         text,
  created_at timestamptz not null default now()
);
create index reset_requests_email_idx on public.reset_requests (email, created_at desc);
create index reset_requests_ip_idx    on public.reset_requests (ip, created_at desc);
alter table public.reset_requests enable row level security;   -- no policies: only the functions below
revoke all on public.reset_requests from public, anon, authenticated, service_role;
revoke all on sequence public.reset_requests_id_seq from public, anon, authenticated, service_role;

-- true while the email and the IP are each under 3 reset requests in the last hour
create or replace function public.reset_allowed(email text, ip text default null) returns boolean
language plpgsql stable security definer set search_path = public, extensions, pg_temp as $$
#variable_conflict use_variable
declare
  v_since timestamptz := now() - interval '1 hour';
  v_ip    text := left(nullif(btrim(ip), ''), 100);
  v_n     integer;
begin
  select count(*) into v_n from public.reset_requests r
   where r.email = left(btrim(email), 320)::citext and r.created_at > v_since;
  if v_n >= 3 then return false; end if;
  if v_ip is not null then
    select count(*) into v_n from public.reset_requests r where r.ip = v_ip and r.created_at > v_since;
    if v_n >= 3 then return false; end if;
  end if;
  return true;
end $$;

create or replace function public.record_reset_request(email text, ip text) returns void
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
#variable_conflict use_variable
begin
  insert into public.reset_requests (email, ip)
  values (left(btrim(email), 320), left(nullif(btrim(ip), ''), 100));
  delete from public.reset_requests r where r.created_at < now() - interval '1 day';
end $$;

revoke all on function public.reset_allowed(text, text), public.record_reset_request(text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.reset_allowed(text, text), public.record_reset_request(text, text) to service_role;

-- ---------------------------------------------------------------- L38 owner deletes own Claude conversation
-- Messages and proposals follow through their ON DELETE CASCADE keys. Nobody can delete a message by itself
-- (no grant), and messages still cannot be edited (trigger).
create policy owner_delete_assistant_threads on public.assistant_threads for delete to authenticated
  using (owner_id = (select auth.uid()) and (select public.is_owner()));
grant delete on public.assistant_threads to authenticated;

-- ---------------------------------------------------------------- L48 list of audit actions
-- Walks the (action, created_at) index one action at a time instead of reading the whole log.
create or replace function public.audit_actions() returns setof text
language plpgsql stable security definer set search_path = public, extensions, pg_temp as $$
begin
  if not public.is_owner() then
    return;
  end if;
  return query
  with recursive t as (
    select min(a.action) as v from public.audit_log a
    union all
    select (select min(a.action) from public.audit_log a where a.action > t.v) from t where t.v is not null
  )
  select t.v from t where t.v is not null order by t.v;
end $$;
revoke all on function public.audit_actions() from public, anon, authenticated, service_role;
grant execute on function public.audit_actions() to authenticated;

notify pgrst, 'reload schema';
