-- Follow-ups from the re-audit (fix agent FR): SEC2-01, SEC2-02, SEC2-05, SEC2-06, SEC2-08.
--   * creators.channel_url: only https YouTube links (case-insensitive host), replaces the https-only check.
--   * login_allowed: the 20-per-email block is skipped for an IP that logged in with that email in the last 30 days.
--     login_attempts rows were deleted after 7 days (record_login_attempt), so they are now kept 35 days.
--   * reset_allowed: 3/hour per (email, IP), 3/hour per IP, 10/hour per email from all IPs together.
--   * log_audit: 'creators.exported' is owner-only (export is owner-only); 'creators.imported' stays open to staff.
--   * emails_guard: a direct client (authenticated) must write the creator's current address in to_email.
--   * creators_suppress_manual: lifting do_not_contact removes the 'manual' rows of the old and the new address.
--
-- SAFE ON THE LIVE DATABASE: no existing row is rewritten. The new CHECK is NOT VALID (enforced for new and
-- changed rows only; an old row that breaks it must be fixed before it is edited). Rows in login_attempts are
-- only deleted later than before (35 days instead of 7).
--
-- BEFORE RUNNING VALIDATE (by hand, after reading the result; not run by this file):
--   select id, channel_url from public.creators
--    where channel_url is not null and channel_url !~* '^https://((www|m)\.)?youtube\.com/';
-- If it returns no rows (an old http:// row must first be edited to https://):
--   alter table public.creators validate constraint creators_channel_url_youtube;
--
-- ROLL BACK (manual): re-create login_allowed, reset_allowed, record_login_attempt, log_audit, emails_guard and
--   creators_suppress_manual from 20261123000200, 20261121000300 and 20261123000100; drop emails_check_address;
--   drop constraint creators_channel_url_youtube and re-add creators_channel_url_https (channel_url ~ '^https://').
set search_path = public, extensions;

-- ---------------------------------------------------------------- SEC2-06 channel link
alter table public.creators drop constraint if exists creators_channel_url_https;
alter table public.creators add constraint creators_channel_url_youtube
  check (channel_url is null or channel_url ~* '^https://((www|m)\.)?youtube\.com/') not valid;

-- ---------------------------------------------------------------- SEC2-01 login / reset limits
create or replace function public.record_login_attempt(email text, ip text, success boolean) returns void
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
#variable_conflict use_variable
begin
  insert into public.login_attempts (email, ip, success)
  values (left(btrim(email), 320), left(nullif(btrim(ip), ''), 100), success);
  -- kept 35 days: login_allowed looks back 30 days for a known place
  delete from public.login_attempts a where a.created_at < now() - interval '35 days';
end $$;

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

  -- A place that logged in with this email in the last 30 days is not held back by strangers' failures.
  if v_ip is not null and exists (
       select 1 from public.login_attempts a
        where a.email = v_email and a.ip = v_ip and a.success and a.created_at > now() - interval '30 days') then
    return true;
  end if;

  select max(a.created_at) into v_ok from public.login_attempts a where a.email = v_email and a.success;
  select count(*) into v_n from public.login_attempts a
   where a.email = v_email and not a.success and a.created_at > v_since
     and a.created_at > coalesce(v_ok, '-infinity');
  if v_n >= 20 then return false; end if;
  return true;
end $$;

create or replace function public.reset_allowed(email text, ip text default null) returns boolean
language plpgsql stable security definer set search_path = public, extensions, pg_temp as $$
#variable_conflict use_variable
declare
  v_since timestamptz := now() - interval '1 hour';
  v_ip    text := left(nullif(btrim(ip), ''), 100);
  v_mail  citext := left(btrim(email), 320)::citext;
  v_n     integer;
begin
  -- 3 an hour for this address from this place
  select count(*) into v_n from public.reset_requests r
   where r.email = v_mail and r.ip is not distinct from v_ip and r.created_at > v_since;
  if v_n >= 3 then return false; end if;
  -- 3 an hour from this place for any address
  if v_ip is not null then
    select count(*) into v_n from public.reset_requests r where r.ip = v_ip and r.created_at > v_since;
    if v_n >= 3 then return false; end if;
  end if;
  -- 10 an hour for this address from all places together (so a stranger cannot use up the owner's recovery mail)
  select count(*) into v_n from public.reset_requests r where r.email = v_mail and r.created_at > v_since;
  if v_n >= 10 then return false; end if;
  return true;
end $$;

-- ---------------------------------------------------------------- SEC2-02 log_audit
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
     and (action in ('user.invited', 'user.removed', 'user.restored', 'creators.exported') or action like 'assistant.%') then
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

-- ---------------------------------------------------------------- SEC2-05 to_email must be the creator's address
create or replace function public.emails_check_address(p_creator uuid, p_to citext) returns void
language plpgsql stable set search_path = public, extensions, pg_temp as $$
begin
  if current_user = 'authenticated'
     and p_to is distinct from (select c.email from public.creators c where c.id = p_creator) then
    raise exception 'to_email must be the creator''s current address' using errcode = 'check_violation';
  end if;
end $$;
revoke all on function public.emails_check_address(uuid, citext) from public, anon, authenticated, service_role;
grant execute on function public.emails_check_address(uuid, citext) to authenticated, service_role;

create or replace function public.emails_guard() returns trigger
language plpgsql set search_path = public, extensions, pg_temp as $$
declare
  v_direct boolean := not exists (
    select 1 from pg_roles r where r.rolname = current_user and (r.rolsuper or r.rolbypassrls));
  v_content_changed boolean;
begin
  if tg_op = 'INSERT' then
    if v_direct then
      if new.status <> 'draft' then
        raise exception 'new emails must start as draft' using errcode = 'check_violation';
      end if;
      perform public.emails_check_address(new.creator_id, new.to_email);
      new.drafted_by := auth.uid();
      new.approved_by := null; new.approved_at := null;
      new.sent_by := null; new.sent_at := null;
      new.error := null; new.message_id := null; new.replied_at := null;
    end if;
  else
    new.updated_at := now();
    v_content_changed := new.subject is distinct from old.subject
                      or new.body is distinct from old.body
                      or new.to_email is distinct from old.to_email
                      or new.creator_id is distinct from old.creator_id;
    if v_direct then
      if new.to_email is distinct from old.to_email or new.creator_id is distinct from old.creator_id then
        perform public.emails_check_address(new.creator_id, new.to_email);
      end if;
      if new.status is distinct from old.status
         and not (old.status, new.status) in (
           ('draft', 'approved'), ('approved', 'draft'), ('failed', 'draft')) then
        raise exception 'email status % -> % is not allowed here; use the send functions', old.status, new.status
          using errcode = 'check_violation';
      end if;
      if old.status not in ('draft', 'approved') and old.status = new.status and v_content_changed then
        raise exception 'a sent or sending email cannot be edited' using errcode = 'check_violation';
      end if;
      -- bookkeeping columns cannot be written by clients
      new.sent_by := old.sent_by; new.sent_at := old.sent_at; new.message_id := old.message_id;
      new.replied_at := old.replied_at; new.drafted_by := old.drafted_by; new.is_test := old.is_test;
      if new.status is distinct from old.status or v_content_changed then
        new.error := case when old.status = 'failed' then null else old.error end;
      else
        new.error := old.error;
      end if;
      if old.status = 'approved' and new.status = 'approved' and v_content_changed then
        new.status := 'draft';
      end if;
      if new.status = 'approved' and old.status is distinct from 'approved' then
        new.approved_by := auth.uid(); new.approved_at := now();
      elsif new.status = 'draft' then
        new.approved_by := null; new.approved_at := null;
      else
        new.approved_by := old.approved_by; new.approved_at := old.approved_at;
      end if;
    end if;
  end if;

  -- (1) applies to every caller whenever a real email enters a queue state
  if not new.is_test and new.status in ('draft', 'approved', 'sending')
     and (tg_op = 'INSERT' or new.status is distinct from old.status
          or new.to_email is distinct from old.to_email or new.creator_id is distinct from old.creator_id) then
    if exists (select 1 from public.creators c where c.id = new.creator_id and c.status = 'do_not_contact') then
      raise exception 'creator is do_not_contact' using errcode = 'check_violation';
    end if;
    if exists (select 1 from public.suppression_list s where s.email = new.to_email) then
      raise exception 'address is on the suppression list' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------- SEC2-08 lifting do_not_contact
create or replace function public.creators_suppress_manual() returns trigger
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  if new.status = 'do_not_contact' and (tg_op = 'INSERT' or old.status <> 'do_not_contact') then
    -- opt_out sets this flag: a real opt-out must be recorded with its own reason, not as 'manual'
    if coalesce(current_setting('smallfold.skip_manual', true), '') = 'on' then return null; end if;
    insert into public.suppression_list (email, reason) values (new.email, 'manual')
    on conflict (email) do nothing;
  elsif tg_op = 'UPDATE' and old.status = 'do_not_contact' and new.status <> 'do_not_contact' then
    -- the address may have been edited while do_not_contact: clear the manual row of both
    delete from public.suppression_list s where s.email in (old.email, new.email) and s.reason = 'manual';
  end if;
  return null;
end $$;
