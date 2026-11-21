-- Security hardening.
-- 1. 2FA enforced in the database: a user with a verified MFA factor counts as staff/owner only on an aal2 session.
-- 2. reserve_send / mark_sent / mark_failed are service-role only and take the acting user as p_actor.
-- 3. log_audit accepts only known actions (and at most 8 KB of details).
-- (bootstrap_owner is unchanged: it never looked at the caller, so it works as postgres in the SQL editor too.)
set search_path = public, extensions;

-- ---------------------------------------------------------------- 1. MFA at the database
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select exists (
           select 1 from public.profiles p
            where p.id = auth.uid() and p.is_active and p.role in ('owner', 'worker'))
         and (coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
              or not exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified'));
$$;

create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select exists (
           select 1 from public.profiles p
            where p.id = auth.uid() and p.is_active and p.role = 'owner')
         and (coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
              or not exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified'));
$$;

-- ---------------------------------------------------------------- 2. send functions: service role only
-- The audit trigger names the actor from auth.uid(), or from smallfold.actor set by the functions below.
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
    v_details := v_details || jsonb_build_object('creator_id', v_rec -> 'creator_id', 'to_email', v_rec -> 'to_email',
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
          case when length(coalesce(v_new ->> k, '')) <= 120 and length(coalesce(v_old ->> k, '')) <= 120
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


drop function public.reserve_send(uuid);
drop function public.mark_sent(uuid, text);
drop function public.mark_failed(uuid, text);

-- reserve_send: the single gate before an email may be handed to SMTP.
-- Serialised by a global advisory lock + the email row lock, so two clicks cannot both pass.
-- Daily limit decision: a day is the calendar day in settings.timezone. Test sends and real sends are
-- counted separately (a test send counts against the limit only while test_mode is on), so
-- trying things out never uses up the real daily quota, and the limit still holds in test mode.
-- Rows in 'sending' count as sent. The spacing rule looks at the latest send of either kind.
create or replace function public.reserve_send(email_id uuid, p_actor uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
#variable_conflict use_variable
declare
  e          public.emails;
  c          public.creators;
  s          public.settings;
  v_test     boolean;
  v_start    timestamptz;
  v_count    integer;
  v_last     timestamptz;
  v_wait     numeric;
begin
  if p_actor is null or not exists (select 1 from public.profiles pr
       where pr.id = p_actor and pr.is_active and pr.role in ('owner', 'worker')) then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;
  perform set_config('smallfold.actor', p_actor::text, true);   -- lets the audit trigger name the actor
  perform pg_advisory_xact_lock(hashtext('smallfold.reserve_send'));

  select * into e from public.emails x where x.id = email_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if e.status <> 'approved' then
    return jsonb_build_object('ok', false, 'reason', 'not_approved', 'status', e.status);
  end if;
  select * into c from public.creators x where x.id = e.creator_id;
  select * into s from public.settings x where x.id = 1;

  if c.status = 'do_not_contact' then
    return jsonb_build_object('ok', false, 'reason', 'do_not_contact');
  end if;
  if exists (select 1 from public.suppression_list sl where sl.email in (e.to_email, c.email)) then
    return jsonb_build_object('ok', false, 'reason', 'suppressed');
  end if;

  v_test := s.test_mode;
  if v_test and nullif(btrim(coalesce(s.test_email, '')), '') is null then
    return jsonb_build_object('ok', false, 'reason', 'test_email_missing');
  end if;
  if not v_test and nullif(btrim(coalesce(s.sender_postal_address, '')), '') is null then
    return jsonb_build_object('ok', false, 'reason', 'postal_address_missing');
  end if;

  v_start := date_trunc('day', now() at time zone s.timezone) at time zone s.timezone;
  select count(*) into v_count from public.emails x
   where x.status in ('sending', 'sent', 'replied') and x.is_test = v_test
     and coalesce(x.sent_at, x.updated_at) >= v_start;
  if v_count >= s.daily_send_limit then
    return jsonb_build_object('ok', false, 'reason', 'daily_limit',
                              'limit', s.daily_send_limit, 'sent_today', v_count);
  end if;

  select max(coalesce(x.sent_at, x.updated_at)) into v_last from public.emails x
   where x.status in ('sending', 'sent', 'replied');
  if v_last is not null then
    v_wait := s.min_seconds_between_sends - extract(epoch from (clock_timestamp() - v_last));
    if v_wait > 0 then
      return jsonb_build_object('ok', false, 'reason', 'too_soon', 'retry_after_seconds', ceil(v_wait)::int);
    end if;
  end if;

  update public.emails x set status = 'sending', is_test = v_test where x.id = email_id;
  return jsonb_build_object(
    'ok', true,
    'email_id', email_id,
    'to_email', case when v_test then s.test_email else e.to_email::text end,
    'is_test', v_test,
    'subject_prefix', case when v_test then '[TEST] ' else '' end);
end $$;

-- mark_sent: after SMTP accepted the message. Real sends also stamp the creator
-- (last_contacted_at, new -> contacted). Test sends never touch the creator.
create or replace function public.mark_sent(email_id uuid, message_id text, p_actor uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
#variable_conflict use_variable
declare
  e public.emails;
begin
  if p_actor is null or not exists (select 1 from public.profiles pr
       where pr.id = p_actor and pr.is_active and pr.role in ('owner', 'worker')) then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;
  perform set_config('smallfold.actor', p_actor::text, true);   -- lets the audit trigger name the actor
  select * into e from public.emails x where x.id = email_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if e.status <> 'sending' then
    return jsonb_build_object('ok', false, 'reason', 'not_sending', 'status', e.status);
  end if;
  update public.emails x
     set status = 'sent', sent_by = p_actor, sent_at = now(), message_id = left(message_id, 500), error = null
   where x.id = email_id;
  if not e.is_test then
    update public.creators c
       set last_contacted_at = now(),
           status = case when c.status = 'new' then 'contacted'::public.creator_status else c.status end
     where c.id = e.creator_id;
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.mark_failed(email_id uuid, error text, p_actor uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
#variable_conflict use_variable
declare
  e public.emails;
begin
  if p_actor is null or not exists (select 1 from public.profiles pr
       where pr.id = p_actor and pr.is_active and pr.role in ('owner', 'worker')) then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;
  perform set_config('smallfold.actor', p_actor::text, true);   -- lets the audit trigger name the actor
  select * into e from public.emails x where x.id = email_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if e.status <> 'sending' then
    return jsonb_build_object('ok', false, 'reason', 'not_sending', 'status', e.status);
  end if;
  update public.emails x set status = 'failed', error = left(coalesce(error, 'unknown error'), 2000)
   where x.id = email_id;
  return jsonb_build_object('ok', true);
end $$;


revoke all on function public.reserve_send(uuid, uuid), public.mark_sent(uuid, text, uuid),
  public.mark_failed(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.reserve_send(uuid, uuid), public.mark_sent(uuid, text, uuid),
  public.mark_failed(uuid, text, uuid) to service_role;

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
    'user.invited', 'user.removed', 'user.restored'];
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
