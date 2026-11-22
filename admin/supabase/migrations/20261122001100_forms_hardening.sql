-- Website forms hardening:
--  * form_rate_ok also caps each form at 60 sends per hour across ALL visitors (besides 5 per visitor per hour),
--    so a visitor who can change IP cannot flood the back office.
--  * rate-limit rows older than a day are removed on every call (and the lookup index serves the global count).
--  * submit_application / submit_contact are redefined with the same behaviour.
set search_path = public, extensions;

create index if not exists form_rate_limits_form_time_idx on public.form_rate_limits (form, created_at desc);

-- ---------------------------------------------------------------- 1. rate check
create or replace function public.form_rate_ok(p_form text, p_ip_hash text) returns boolean
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare n integer;
begin
  -- Same lock order every time (form, then visitor), so two sends cannot deadlock.
  perform pg_advisory_xact_lock(hashtext('smallfold.form_rate_all:' || p_form));
  perform pg_advisory_xact_lock(hashtext('smallfold.form_rate:' || p_form || ':' || p_ip_hash));
  delete from public.form_rate_limits where created_at < now() - interval '1 day';
  select count(*) into n from public.form_rate_limits
   where form = p_form and ip_hash = p_ip_hash and created_at > now() - interval '1 hour';
  if n >= 5 then return false; end if;
  select count(*) into n from public.form_rate_limits
   where form = p_form and created_at > now() - interval '1 hour';
  if n >= 60 then return false; end if;
  insert into public.form_rate_limits (form, ip_hash) values (p_form, p_ip_hash);
  return true;
end $$;

-- ---------------------------------------------------------------- 2. the two submit functions (same behaviour as before)
create or replace function public.submit_application(
  p_ip_hash text, p_name text, p_email text, p_phone text, p_channel_url text, p_subscribers integer, p_niche text, p_notes text default null
) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_id uuid;
begin
  if coalesce(p_ip_hash, '') = '' then raise exception 'ip hash required' using errcode = 'invalid_parameter_value'; end if;
  if not public.form_rate_ok('apply', p_ip_hash) then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;
  insert into public.creators (full_name, email, phone, channel_url, subscribers, niche, notes, status, source, created_by)
  values (btrim(p_name), btrim(p_email), nullif(btrim(coalesce(p_phone, '')), ''), nullif(btrim(coalesce(p_channel_url, '')), ''),
          p_subscribers, nullif(left(btrim(coalesce(p_niche, '')), 200), ''), nullif(btrim(coalesce(p_notes, '')), ''), 'new', 'website', null)
  on conflict (email) do nothing
  returning id into v_id;
  insert into public.audit_log (actor_id, action, entity_type, entity_id, details)
  values (null, 'application.received', 'creator', v_id::text, jsonb_build_object('duplicate', v_id is null));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.submit_contact(
  p_ip_hash text, p_name text, p_email text, p_topic text, p_message text,
  p_company text default null, p_budget text default null, p_phone text default null
) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_id uuid;
begin
  if coalesce(p_ip_hash, '') = '' then raise exception 'ip hash required' using errcode = 'invalid_parameter_value'; end if;
  if not public.form_rate_ok('contact', p_ip_hash) then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;
  insert into public.contact_messages (name, email, topic, message, company, budget, phone)
  values (btrim(p_name), btrim(p_email), nullif(btrim(coalesce(p_topic, '')), ''), btrim(p_message),
          nullif(btrim(coalesce(p_company, '')), ''), nullif(btrim(coalesce(p_budget, '')), ''), nullif(btrim(coalesce(p_phone, '')), ''))
  returning id into v_id;
  insert into public.audit_log (actor_id, action, entity_type, entity_id, details)
  values (null, 'contact.received', 'contact_message', v_id::text, '{}'::jsonb);
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.form_rate_ok(text, text), public.submit_application(text, text, text, text, text, integer, text, text),
  public.submit_contact(text, text, text, text, text, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.submit_application(text, text, text, text, text, integer, text, text),
  public.submit_contact(text, text, text, text, text, text, text, text) to service_role;

notify pgrst, 'reload schema';
