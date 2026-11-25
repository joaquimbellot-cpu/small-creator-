-- Back-office upgrade, Outreach (pitch drafts): an email may now be about a sponsor and may go to a sponsor's contact person.
--   * emails: new optional columns brand_id (the sponsor the pitch is about), recipient_kind ('creator' by default, or
--     'brand_contact'), brand_contact_id (the contact person) and pitch_facts (jsonb: the "Facts used" and "Left out"
--     sentences shown in Review; plain sentences only, no addresses, no phone numbers).
--   * emails_check_recipient(): new helper. A direct client (authenticated) must write the creator's current address for an
--     email to a creator (as before) and the contact person's current address for an email to a contact.
--   * emails_guard: copy of 20261123000400 plus (a) the recipient check above, (b) a draft or approval is refused when the
--     sponsor's relationship is do_not_contact, (c) for an email to a contact, the contact's current address is checked
--     against the suppression list too (to_email already was), (d) a change of sponsor, contact or kind counts as a change of
--     content (an approved email goes back to draft). The creator rules are untouched: an email to a contact still names the
--     creator it is about, and is refused when that creator is do_not_contact.
--   * reserve_send: copy of 20261121000800 plus: refused with 'sponsor_do_not_contact' when the sponsor is do_not_contact,
--     with 'no_contact' when an email to a contact has lost its contact person, and the suppression list is checked against
--     the address the mail is really sent to (to_email and the contact's current address). Test mode, the daily limit and the
--     gap between sends are as before.
--   * mark_sent: copy of 20261121000800 plus: an email to a contact does NOT mark the creator as contacted (the creator was
--     not written to); it stamps the sponsor's last_contacted_at instead (real sends only).
--   * audit_row: copy of 20261125000400 plus brand_id and recipient_kind in the details of an email line (ids only).
--
-- SAFE ON THE LIVE DATABASE: four nullable or defaulted columns are added (no table rewrite, no row changes); every existing
-- email keeps recipient_kind 'creator'. The functions keep their signatures and grants. Nothing is dropped or renamed.
-- ROLL BACK (manual): recreate emails_guard from 20261123000400, reserve_send and mark_sent from 20261121000800, audit_row from
--   20261125000400; drop function emails_check_recipient; then, only if no pitch draft exists, drop the four columns
--   (alter table emails drop column pitch_facts, brand_contact_id, recipient_kind, brand_id) and the two constraints.
set search_path = public, extensions;

-- ---------------------------------------------------------------- columns
alter table public.emails add column if not exists brand_id uuid references public.brands(id) on delete set null;
alter table public.emails add column if not exists recipient_kind text not null default 'creator';
alter table public.emails add column if not exists brand_contact_id uuid references public.brand_contacts(id) on delete set null;
alter table public.emails add column if not exists pitch_facts jsonb;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'emails_recipient_kind_check' and conrelid = 'public.emails'::regclass) then
    alter table public.emails add constraint emails_recipient_kind_check
      check (recipient_kind in ('creator', 'brand_contact') and (recipient_kind = 'creator' or brand_id is not null));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'emails_pitch_shape_check' and conrelid = 'public.emails'::regclass) then
    alter table public.emails add constraint emails_pitch_shape_check
      check ((brand_contact_id is null or recipient_kind = 'brand_contact')
             and (pitch_facts is null or (jsonb_typeof(pitch_facts) = 'object' and length(pitch_facts::text) <= 8000)));
  end if;
end $$;
create index if not exists emails_brand_idx on public.emails (brand_id) where brand_id is not null;
create index if not exists emails_brand_contact_idx on public.emails (brand_contact_id) where brand_contact_id is not null;

-- ---------------------------------------------------------------- who an email may be addressed to
create or replace function public.emails_check_recipient(p_kind text, p_creator uuid, p_brand uuid, p_contact uuid, p_to citext) returns void
language plpgsql stable set search_path = public, extensions, pg_temp as $$
begin
  if p_kind = 'brand_contact' then
    if current_user = 'authenticated' then
      if p_contact is null or p_brand is null then
        raise exception 'an email to a contact needs the sponsor and the contact person' using errcode = 'check_violation';
      end if;
      if p_to is distinct from (select k.email from public.brand_contacts k where k.id = p_contact and k.brand_id = p_brand) then
        raise exception 'to_email must be the contact person''s current address' using errcode = 'check_violation';
      end if;
    end if;
  else
    perform public.emails_check_address(p_creator, p_to);
  end if;
end $$;
revoke all on function public.emails_check_recipient(text, uuid, uuid, uuid, citext) from public, anon, authenticated, service_role;
grant execute on function public.emails_check_recipient(text, uuid, uuid, uuid, citext) to authenticated, service_role;

-- ---------------------------------------------------------------- emails_guard
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
      perform public.emails_check_recipient(new.recipient_kind, new.creator_id, new.brand_id, new.brand_contact_id, new.to_email);
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
                      or new.creator_id is distinct from old.creator_id
                      or new.brand_id is distinct from old.brand_id
                      or new.brand_contact_id is distinct from old.brand_contact_id
                      or new.recipient_kind is distinct from old.recipient_kind;
    if v_direct then
      if new.to_email is distinct from old.to_email or new.creator_id is distinct from old.creator_id
         or new.brand_id is distinct from old.brand_id or new.brand_contact_id is distinct from old.brand_contact_id
         or new.recipient_kind is distinct from old.recipient_kind then
        perform public.emails_check_recipient(new.recipient_kind, new.creator_id, new.brand_id, new.brand_contact_id, new.to_email);
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
          or new.to_email is distinct from old.to_email or new.creator_id is distinct from old.creator_id
          or new.brand_id is distinct from old.brand_id or new.brand_contact_id is distinct from old.brand_contact_id) then
    if exists (select 1 from public.creators c where c.id = new.creator_id and c.status = 'do_not_contact') then
      raise exception 'creator is do_not_contact' using errcode = 'check_violation';
    end if;
    if exists (select 1 from public.suppression_list s where s.email = new.to_email) then
      raise exception 'address is on the suppression list' using errcode = 'check_violation';
    end if;
    if new.brand_id is not null
       and exists (select 1 from public.brands b where b.id = new.brand_id and b.relationship = 'do_not_contact') then
      raise exception 'sponsor is do_not_contact' using errcode = 'check_violation';
    end if;
    if new.recipient_kind = 'brand_contact'
       and exists (select 1 from public.brand_contacts k join public.suppression_list s on s.email = k.email
                    where k.id = new.brand_contact_id) then
      raise exception 'address is on the suppression list' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------- reserve_send
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
  v_rel      text;
  v_kfound   boolean := false;
  v_kemail   citext;
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
  if e.brand_id is not null then
    select b.relationship into v_rel from public.brands b where b.id = e.brand_id;
    if v_rel = 'do_not_contact' then
      return jsonb_build_object('ok', false, 'reason', 'sponsor_do_not_contact');
    end if;
  end if;
  if e.recipient_kind = 'brand_contact' then
    select true, k.email into v_kfound, v_kemail from public.brand_contacts k
     where k.id = e.brand_contact_id and k.brand_id = e.brand_id;
    if not coalesce(v_kfound, false) then
      return jsonb_build_object('ok', false, 'reason', 'no_contact');
    end if;
  end if;
  -- the address it is really sent to (to_email), the creator's address, and the contact person's current address
  if exists (select 1 from public.suppression_list sl where sl.email in (e.to_email, c.email)
                or (v_kemail is not null and sl.email = v_kemail)) then
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

-- ---------------------------------------------------------------- mark_sent
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
    if e.recipient_kind = 'brand_contact' then
      -- the creator was not written to; the sponsor was
      update public.brands b set last_contacted_at = now() where b.id = e.brand_id;
    else
      update public.creators c
         set last_contacted_at = now(),
             status = case when c.status = 'new' then 'contacted'::public.creator_status else c.status end
       where c.id = e.creator_id;
    end if;
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------- audit_row
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
  v_label   text;
  k         text;
begin
  if tg_op = 'INSERT' then v_rec := to_jsonb(new);
  elsif tg_op = 'DELETE' then v_rec := to_jsonb(old);
  else v_old := to_jsonb(old); v_new := to_jsonb(new); v_rec := v_new;
  end if;

  v_label := left(coalesce(v_rec ->> 'full_name', v_rec ->> 'name', v_rec ->> 'subject', v_rec ->> 'email', ''), 200);
  if v_entity = 'sponsorship' then
    -- a sponsorship has no name of its own: use the sponsor's
    v_label := left(coalesce((select b.name::text from public.brands b where b.id::text = v_rec ->> 'brand_id'),
                             v_rec ->> 'brand_name_raw', ''), 200);
  elsif v_entity = 'brand_contact' then
    v_label := left(coalesce(v_rec ->> 'full_name', ''), 200);     -- never the email
  end if;
  v_details := jsonb_build_object('label', v_label);
  if v_entity = 'email' then
    v_details := v_details || jsonb_build_object('creator_id', v_rec -> 'creator_id',
                                                 'is_test', v_rec -> 'is_test', 'status', v_rec -> 'status',
                                                 'brand_id', v_rec -> 'brand_id', 'recipient_kind', v_rec -> 'recipient_kind');
  elsif v_entity = 'deal' then
    v_details := v_details || jsonb_build_object('creator_id', v_rec -> 'creator_id', 'brand_id', v_rec -> 'brand_id',
                                                 'stage', v_rec -> 'stage', 'amount_cents', v_rec -> 'amount_cents');
  elsif v_entity = 'profile' then
    v_details := v_details || jsonb_build_object('role', v_rec -> 'role');
  elsif v_entity = 'sponsorship' then
    v_details := v_details || jsonb_build_object('creator_id', v_rec -> 'creator_id', 'brand_id', v_rec -> 'brand_id',
                                                 'source_label', v_rec -> 'source_label', 'origin', v_rec -> 'origin');
  elsif v_entity = 'brand_contact' then
    v_details := v_details || jsonb_build_object('brand_id', v_rec -> 'brand_id');
  elsif v_entity = 'list' then
    v_details := v_details || jsonb_build_object('kind', v_rec -> 'kind');
  end if;

  if tg_op = 'INSERT' then
    v_action := 'created';
  elsif tg_op = 'DELETE' then
    v_action := 'deleted';
  else
    for k in select jsonb_object_keys(v_new) loop
      -- cached counters are recalculated by a trigger on every sponsorship change: not an edit by a person
      if k = 'updated_at'
         or (v_entity in ('creator', 'brand')
             and k in ('sponsorship_count', 'last_sponsorship_at', 'detected_sponsorship_count', 'last_detected_sponsorship_at'))
      then continue; end if;
      if (v_old -> k) is distinct from (v_new -> k) then
        v_changes := v_changes || jsonb_build_object(k,
          case when (v_entity = 'creator' and k in ('email', 'phone', 'notes'))
                    or (v_entity = 'email' and k = 'to_email')
                    or (v_entity = 'brand_contact' and k in ('email', 'phone', 'linkedin_url', 'notes'))
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
      if v_entity = 'sponsorship' then
        if v_old ->> 'source_label' = 'detected' and v_new ->> 'source_label' = 'confirmed' then v_action := 'confirmed';
        elsif (v_old ->> 'rejected')::boolean is false and (v_new ->> 'rejected')::boolean then v_action := 'rejected';
        elsif (v_old ->> 'rejected')::boolean and (v_new ->> 'rejected')::boolean is false then v_action := 'restored';
        end if;
      end if;
    end if;
    v_details := v_details || jsonb_build_object('changes', v_changes);
  end if;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, details)
  values (coalesce(auth.uid(), nullif(current_setting('smallfold.actor', true), '')::uuid), v_entity || '.' || v_action, v_entity, coalesce(v_rec ->> 'id', v_rec ->> 'email'), v_details);
  return null;
end $$;

notify pgrst, 'reload schema';
