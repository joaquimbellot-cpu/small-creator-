-- Send guards, opt-out, bootstrap, login rate limit, audit helper, stats and the summaries view.
-- Parameter names are part of the contract: the app calls these through supabase.rpc(name, {args}).
-- Inside plpgsql, parameters are referenced as <function>.<param> to avoid column-name clashes.
set search_path = public, extensions;

-- ---------------------------------------------------------------- audit helper
-- Staff (and the service role) can add lines such as auth.login or creator.viewed.
-- p_actor is honoured only for the service role (no JWT user), e.g. to log a login.
create or replace function public.log_audit(
  action text, entity_type text default null, entity_id text default null,
  details jsonb default '{}'::jsonb, p_actor uuid default null
) returns bigint
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
#variable_conflict use_variable
declare
  v_id bigint;
begin
  if auth.uid() is not null and not public.is_staff() then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  if action is null or length(btrim(action)) = 0 or length(action) > 100 then
    raise exception 'invalid action' using errcode = 'check_violation';
  end if;
  insert into public.audit_log (actor_id, action, entity_type, entity_id, details)
  values (coalesce(auth.uid(), p_actor), action, left(entity_type, 100), left(entity_id, 100),
          coalesce(details, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------- sending
-- reserve_send: the single gate before an email may be handed to SMTP.
-- Serialised by a global advisory lock + the email row lock, so two clicks cannot both pass.
-- Daily limit decision: a day is the calendar day in settings.timezone. Test sends and real sends are
-- counted separately (a test send counts against the limit only while test_mode is on), so
-- trying things out never uses up the real daily quota, and the limit still holds in test mode.
-- Rows in 'sending' count as sent. The spacing rule looks at the latest send of either kind.
create or replace function public.reserve_send(email_id uuid) returns jsonb
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
  if not public.is_staff() then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;
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
create or replace function public.mark_sent(email_id uuid, message_id text default null) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
#variable_conflict use_variable
declare
  e public.emails;
begin
  if not public.is_staff() then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;
  select * into e from public.emails x where x.id = email_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if e.status <> 'sending' then
    return jsonb_build_object('ok', false, 'reason', 'not_sending', 'status', e.status);
  end if;
  update public.emails x
     set status = 'sent', sent_by = auth.uid(), sent_at = now(), message_id = left(message_id, 500), error = null
   where x.id = email_id;
  if not e.is_test then
    update public.creators c
       set last_contacted_at = now(),
           status = case when c.status = 'new' then 'contacted'::public.creator_status else c.status end
     where c.id = e.creator_id;
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.mark_failed(email_id uuid, error text default null) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
#variable_conflict use_variable
declare
  e public.emails;
begin
  if not public.is_staff() then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;
  select * into e from public.emails x where x.id = email_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if e.status <> 'sending' then
    return jsonb_build_object('ok', false, 'reason', 'not_sending', 'status', e.status);
  end if;
  update public.emails x set status = 'failed', error = left(coalesce(error, 'unknown error'), 2000)
   where x.id = email_id;
  return jsonb_build_object('ok', true);
end $$;

-- mark_replied: a person marks a sent email as answered. Real mail moves the creator to replied
-- (only from new / contacted, so active and do_not_contact are never overwritten).
create or replace function public.mark_replied(email_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
#variable_conflict use_variable
declare
  e public.emails;
begin
  if not public.is_staff() then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;
  select * into e from public.emails x where x.id = email_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if e.status <> 'sent' then
    return jsonb_build_object('ok', false, 'reason', 'not_sent', 'status', e.status);
  end if;
  update public.emails x set status = 'replied', replied_at = now() where x.id = email_id;
  if not e.is_test then
    update public.creators c set status = 'replied'
     where c.id = e.creator_id and c.status in ('new', 'contacted');
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------- service-role only
-- Opt-out (unsubscribe page): suppress the address; a trigger flips matching creators to do_not_contact.
create or replace function public.opt_out(email text, reason text default null) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
#variable_conflict use_variable
declare
  v_email citext := lower(btrim(email));
  v_n     integer;
  v_new_n integer;
begin
  if v_email is null or v_email = '' or length(v_email) > 320 or v_email::text !~ '^[^@\s]+@[^@\s]+$' then
    raise exception 'invalid email' using errcode = 'check_violation';
  end if;
  update public.creators c set status = 'do_not_contact' where c.email = v_email and c.status <> 'do_not_contact';
  get diagnostics v_n = row_count;
  insert into public.suppression_list (email, reason)
  values (v_email, left(coalesce(reason, 'opted out'), 500))
  on conflict on constraint suppression_list_pkey do nothing;
  get diagnostics v_new_n = row_count;
  return jsonb_build_object('ok', true, 'newly_suppressed', v_new_n > 0, 'creators_updated', v_n);
end $$;

-- bootstrap_owner: makes an existing user the owner, but only while no active owner exists.
create or replace function public.bootstrap_owner(email text) returns boolean
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
#variable_conflict use_variable
declare
  v_n integer;
begin
  if exists (select 1 from public.profiles p where p.role = 'owner' and p.is_active) then
    return false;
  end if;
  update public.profiles p set role = 'owner', is_active = true where p.email = btrim(email);
  get diagnostics v_n = row_count;
  return v_n > 0;
end $$;

-- Login rate limit: false after 5 failures in 15 minutes for the email (counted since that
-- email's last success) or for the IP. Callers should not record attempts that were blocked.
create or replace function public.login_allowed(email text, ip text default null) returns boolean
language plpgsql stable security definer set search_path = public, extensions, pg_temp as $$
#variable_conflict use_variable
declare
  v_email citext := btrim(email);
  v_since timestamptz := now() - interval '15 minutes';
  v_ok    timestamptz;
  v_n     integer;
begin
  select max(a.created_at) into v_ok from public.login_attempts a where a.email = v_email and a.success;
  select count(*) into v_n from public.login_attempts a
   where a.email = v_email and not a.success and a.created_at > v_since
     and a.created_at > coalesce(v_ok, '-infinity');
  if v_n >= 5 then return false; end if;
  if ip is not null and btrim(ip) <> '' then
    select count(*) into v_n from public.login_attempts a
     where a.ip = btrim(ip) and not a.success and a.created_at > v_since;
    if v_n >= 5 then return false; end if;
  end if;
  return true;
end $$;

create or replace function public.record_login_attempt(email text, ip text, success boolean) returns void
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
#variable_conflict use_variable
begin
  insert into public.login_attempts (email, ip, success)
  values (left(btrim(email), 320), left(nullif(btrim(ip), ''), 100), success);
  delete from public.login_attempts a where a.created_at < now() - interval '7 days';
end $$;

-- ---------------------------------------------------------------- overview numbers
-- One function feeds the overview page and the tests. Weeks start on Monday in settings.timezone;
-- weekly lists the last 12 weeks, oldest first, replies counted in the week they were marked.
create or replace function public.stats_overview() returns jsonb
language plpgsql stable security definer set search_path = public, extensions, pg_temp as $$
declare
  v_tz       text;
  v_sent     bigint;
  v_replies  bigint;
  v_weekly   jsonb;
  v_stages   jsonb;
begin
  if not public.is_staff() then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  select timezone into v_tz from public.settings where id = 1;

  select count(*) into v_sent    from public.emails where status in ('sent', 'replied') and not is_test;
  select count(*) into v_replies from public.emails where status = 'replied' and not is_test;

  select jsonb_object_agg(st.s, coalesce(d.n, 0) order by st.o) into v_stages
    from (select s::text as s, o from unnest(enum_range(null::public.deal_stage)) with ordinality as t(s, o)) st
    left join (select stage::text as s, count(*) as n from public.deals group by stage) d on d.s = st.s;

  select jsonb_agg(jsonb_build_object('week_start', w.wk, 'sent', coalesce(a.n, 0), 'replies', coalesce(r.n, 0))
                   order by w.wk) into v_weekly
    from (select (date_trunc('week', now() at time zone v_tz)::date - 7 * g) as wk from generate_series(0, 11) g) w
    left join (select date_trunc('week', sent_at at time zone v_tz)::date as wk, count(*) as n
                 from public.emails where status in ('sent', 'replied') and not is_test and sent_at is not null
                group by 1) a on a.wk = w.wk
    left join (select date_trunc('week', coalesce(replied_at, sent_at) at time zone v_tz)::date as wk, count(*) as n
                 from public.emails where status = 'replied' and not is_test
                group by 1) r on r.wk = w.wk;

  return jsonb_build_object(
    'total_creators', (select count(*) from public.creators),
    'emails_sent_all', v_sent,
    'emails_sent_7d',  (select count(*) from public.emails where status in ('sent', 'replied') and not is_test
                         and sent_at >= now() - interval '7 days'),
    'emails_sent_30d', (select count(*) from public.emails where status in ('sent', 'replied') and not is_test
                         and sent_at >= now() - interval '30 days'),
    'replies', v_replies,
    'reply_rate', case when v_sent = 0 then 0 else round(v_replies * 100.0 / v_sent, 1) end,
    'deals_by_stage', v_stages,
    'active_deals', (select count(*) from public.deals where stage in ('negotiating', 'signed', 'completed')),
    'commission_earned_cents', (select coalesce(sum(commission_cents), 0) from public.deals where stage = 'paid'),
    'weekly', v_weekly);
end $$;

-- ---------------------------------------------------------------- creator summaries
-- last_contacted_at = the later of the stored value and the newest real sent email.
-- security_invoker: the caller's RLS applies, so only staff see rows.
create view public.creator_summaries with (security_invoker = true) as
select c.id, c.full_name, c.email, c.phone, c.channel_url, c.youtube_channel_id, c.channel_name, c.niche,
       c.subscribers, c.subscribers_hidden, c.subscribers_checked_at, c.status, c.notes,
       c.user_id, c.created_by, c.created_at, c.updated_at,
       coalesce(d.deal_count, 0)::integer          as deal_count,
       coalesce(d.earned, 0)::bigint               as total_earned_cents,
       greatest(c.last_contacted_at, e.last_sent)  as last_contacted_at
  from public.creators c
  left join (select creator_id,
                    count(*) as deal_count,
                    sum(amount_cents - commission_cents) filter (where stage = 'paid') as earned
               from public.deals group by creator_id) d on d.creator_id = c.id
  left join (select creator_id, max(sent_at) as last_sent
               from public.emails where status in ('sent', 'replied') and not is_test
              group by creator_id) e on e.creator_id = c.id;
