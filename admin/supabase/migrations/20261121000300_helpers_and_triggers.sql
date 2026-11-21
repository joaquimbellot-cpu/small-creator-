-- Role helpers, profile sync from auth.users, guards and audit triggers.
set search_path = public, extensions;

-- ---------------------------------------------------------------- role checks
-- No role, or is_active = false, means no access. Looked up live, so removal is immediate.
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_active and p.role in ('owner', 'worker')
  );
$$;

create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_active and p.role = 'owner'
  );
$$;

-- ---------------------------------------------------------------- generic helpers
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = public, extensions, pg_temp as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger trg_touch before update on public.creators         for each row execute function public.touch_updated_at();
create trigger trg_touch before update on public.email_templates  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- profiles from auth.users
-- Role comes from app_metadata (only the service role can write it). Invalid or missing = no role.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_role public.app_role;
begin
  begin
    v_role := nullif(new.raw_app_meta_data ->> 'role', '')::public.app_role;
  exception when invalid_text_representation then
    v_role := null;
  end;
  insert into public.profiles (id, full_name, email, role, is_active)
  values (
    new.id,
    left(coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(coalesce(new.email, ''), '@', 1)), 200),
    coalesce(new.email, ''),
    v_role,
    true
  )
  on conflict (id) do nothing;
  return new;
end $$;

-- Invite flow: the app may invite first and set app_metadata.role afterwards. A role is
-- applied only while the profile still has none; later role changes go through profiles.
create or replace function public.handle_user_updated() returns trigger
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_role public.app_role;
begin
  begin
    v_role := nullif(new.raw_app_meta_data ->> 'role', '')::public.app_role;
  exception when invalid_text_representation then
    v_role := null;
  end;
  update public.profiles
     set email = coalesce(new.email, email),
         role  = coalesce(role, v_role)
   where id = new.id
     and (email is distinct from coalesce(new.email, email) or (role is null and v_role is not null));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
create trigger on_auth_user_updated after update of email, raw_app_meta_data on auth.users
  for each row execute function public.handle_user_updated();

-- The last active owner can never be demoted, deactivated or deleted.
create or replace function public.profiles_guard() returns trigger
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  if tg_op = 'UPDATE' and new.id is distinct from old.id then
    raise exception 'profile id cannot change';
  end if;
  if old.role = 'owner' and old.is_active
     and (tg_op = 'DELETE' or new.role is distinct from 'owner' or not new.is_active)
     and not exists (select 1 from public.profiles p where p.role = 'owner' and p.is_active and p.id <> old.id)
  then
    raise exception 'the last active owner cannot be demoted, deactivated or removed'
      using errcode = 'check_violation';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

create trigger trg_guard before update or delete on public.profiles
  for each row execute function public.profiles_guard();

-- ---------------------------------------------------------------- commission and deals
-- Tiers on the whole amount: < $500 -> 10%, $500-$1,999.99 -> 8%, >= $2,000 -> 5%. Rounded to the cent
-- (half away from zero). The same function is the single source for the dashboard and tests.
create or replace function public.commission_cents(p_amount bigint) returns bigint
language sql immutable strict set search_path = pg_catalog, pg_temp as $$
  select round(p_amount * case when p_amount < 50000  then 0.10
                               when p_amount < 200000 then 0.08
                               else 0.05 end)::bigint;
$$;

create or replace function public.deals_before() returns trigger
language plpgsql set search_path = public, extensions, pg_temp as $$
begin
  new.commission_cents := public.commission_cents(new.amount_cents);
  if tg_op = 'UPDATE' then
    new.updated_at := now();
    new.stage_changed_at := case when new.stage is distinct from old.stage then now() else old.stage_changed_at end;
  end if;
  return new;
end $$;

create trigger trg_before before insert or update on public.deals
  for each row execute function public.deals_before();

-- ---------------------------------------------------------------- emails guard
-- 1. Nobody can queue a real email to a do_not_contact creator or a suppressed address.
-- 2. Direct clients (PostgREST as authenticated) can only draft, edit, approve and un-approve.
--    sending / sent / failed / replied come only from reserve_send, mark_sent, mark_failed,
--    mark_replied (SECURITY DEFINER, so current_user is the function owner there).
-- 3. Editing an approved email puts it back to draft.
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

create trigger trg_guard before insert or update on public.emails
  for each row execute function public.emails_guard();

-- ---------------------------------------------------------------- settings guard
create or replace function public.settings_guard() returns trigger
language plpgsql set search_path = public, extensions, pg_temp as $$
begin
  if not exists (select 1 from pg_timezone_names z where z.name = new.timezone) then
    raise exception 'unknown time zone: %', new.timezone using errcode = 'check_violation';
  end if;
  if new.test_email is not null and new.test_email !~ '^[^@\s]+@[^@\s]+$' then
    raise exception 'test_email is not a valid address' using errcode = 'check_violation';
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

create trigger trg_guard before update on public.settings
  for each row execute function public.settings_guard();

-- ---------------------------------------------------------------- suppression
create or replace function public.suppression_before() returns trigger
language plpgsql set search_path = public, extensions, pg_temp as $$
begin
  new.email := lower(btrim(new.email));
  return new;
end $$;

-- A suppressed address always turns the matching creators into do_not_contact.
-- (Removing an address from the list does not undo that; the owner changes the status by hand.)
create or replace function public.suppression_after() returns trigger
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  update public.creators set status = 'do_not_contact'
   where email = new.email and status <> 'do_not_contact';
  return new;
end $$;

create trigger trg_before before insert on public.suppression_list
  for each row execute function public.suppression_before();
create trigger trg_after after insert on public.suppression_list
  for each row execute function public.suppression_after();

-- ---------------------------------------------------------------- audit log
-- Append-only: blocked by privileges AND by triggers, for every role.
create or replace function public.audit_log_immutable() returns trigger
language plpgsql set search_path = pg_catalog, pg_temp as $$
begin
  raise exception 'audit_log is append-only' using errcode = 'insufficient_privilege';
end $$;

create trigger trg_immutable_row before update or delete on public.audit_log
  for each row execute function public.audit_log_immutable();
create trigger trg_immutable_truncate before truncate on public.audit_log
  for each statement execute function public.audit_log_immutable();

-- Writes one line per insert / update / delete. Emails log status changes only; profiles log
-- role and is_active changes only. Updates that change nothing but updated_at are skipped.
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
  values (auth.uid(), v_entity || '.' || v_action, v_entity, coalesce(v_rec ->> 'id', v_rec ->> 'email'), v_details);
  return null;
end $$;

create trigger trg_audit after insert or update or delete on public.creators        for each row execute function public.audit_row('creator');
create trigger trg_audit after insert or update or delete on public.deals           for each row execute function public.audit_row('deal');
create trigger trg_audit after insert or update or delete on public.brands          for each row execute function public.audit_row('brand');
create trigger trg_audit after insert or update or delete on public.emails          for each row execute function public.audit_row('email');
create trigger trg_audit after insert or update or delete on public.email_templates for each row execute function public.audit_row('template');
create trigger trg_audit after insert or update or delete on public.settings        for each row execute function public.audit_row('settings');
create trigger trg_audit after insert or update or delete on public.suppression_list for each row execute function public.audit_row('suppression');
create trigger trg_audit after insert or update or delete on public.profiles        for each row execute function public.audit_row('profile');
