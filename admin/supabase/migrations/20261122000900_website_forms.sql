-- Website forms: the public Apply and Contact forms write into the back office.
--  * creators.source says where a creator came from.
--  * contact_messages holds messages from the Contact form (staff read and mark handled, owner deletes).
--  * form_rate_limits + submit_application / submit_contact: 5 sends per hour per visitor (IP hash) per form.
--    Only the service role may call the functions; the website routes do that after their own checks.
--  * log_audit allow-list gets the new actions (the same full list is used by the assistant migration).
set search_path = public, extensions;

-- ---------------------------------------------------------------- 1. creators.source
alter table public.creators
  add column source text not null default 'manual' check (source in ('manual', 'import', 'website'));

-- ---------------------------------------------------------------- 2. contact_messages
create table public.contact_messages (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  email       extensions.citext not null,
  topic       text,
  message     text not null,
  created_at  timestamptz not null default now(),
  handled_at  timestamptz,
  handled_by  uuid references public.profiles (id) on delete set null,
  company     text check (length(company) <= 200),   -- brand inquiries only
  budget      text check (length(budget) <= 100),
  phone       text check (length(phone) <= 50)
);
create index contact_messages_created_idx on public.contact_messages (created_at desc);
alter table public.contact_messages enable row level security;

create policy staff_select_contact_messages on public.contact_messages for select to authenticated
  using ((select public.is_staff()));
create policy staff_update_contact_messages on public.contact_messages for update to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));
create policy owner_delete_contact_messages on public.contact_messages for delete to authenticated
  using ((select public.is_owner()));

revoke all on public.contact_messages from anon, authenticated, service_role;
grant select, delete on public.contact_messages to authenticated;
grant update (handled_at, handled_by) on public.contact_messages to authenticated;
grant select, insert on public.contact_messages to service_role;

-- ---------------------------------------------------------------- 3. rate-limit store (service role only, via the functions)
create table public.form_rate_limits (
  id         bigserial primary key,
  form       text not null check (form in ('apply', 'contact')),
  ip_hash    text not null check (length(ip_hash) <= 128),
  created_at timestamptz not null default now()
);
create index form_rate_limits_lookup_idx on public.form_rate_limits (form, ip_hash, created_at desc);
alter table public.form_rate_limits enable row level security;   -- no policies
revoke all on public.form_rate_limits from anon, authenticated, service_role;
revoke all on sequence public.form_rate_limits_id_seq from anon, authenticated, service_role;

-- Counts this send against the visitor's hour. Returns true when it may go on.
create or replace function public.form_rate_ok(p_form text, p_ip_hash text) returns boolean
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare n integer;
begin
  perform pg_advisory_xact_lock(hashtext('smallfold.form_rate:' || p_form || ':' || p_ip_hash));
  delete from public.form_rate_limits where created_at < now() - interval '1 day';
  select count(*) into n from public.form_rate_limits
   where form = p_form and ip_hash = p_ip_hash and created_at > now() - interval '1 hour';
  if n >= 5 then return false; end if;
  insert into public.form_rate_limits (form, ip_hash) values (p_form, p_ip_hash);
  return true;
end $$;

-- ---------------------------------------------------------------- 4. the two submit functions
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

-- ---------------------------------------------------------------- 5. log_audit allow-list (new actions added)
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
