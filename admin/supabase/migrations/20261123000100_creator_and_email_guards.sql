-- Creator and email guards (fix agent FA, audit items H07, M01, M02, M03, L05, L11, L13, L14, L33).
--   * release_stale_sending(): moves emails stuck in 'sending' to 'failed' (service role only).
--   * creators guard: only the owner lifts do_not_contact; workers cannot change user_id / created_by.
--   * do_not_contact by hand adds a 'manual' suppression row; the owner lifting it removes only that row.
--   * creator insert with a suppressed address starts as do_not_contact.
--   * deleting a creator keeps a do_not_contact address suppressed, drops draft/approved emails, and is
--     refused while any other email exists (emails.creator_id becomes ON DELETE RESTRICT).
--   * format checks (NOT VALID) for creators.email, emails.to_email, contact_messages.email,
--     creators.channel_url and contact_messages name/message/topic lengths.
--   * emails.source ('staff', 'claude', 'template'), contact_messages.handled_by set from the caller.
--   * default privileges for new functions no longer reach PUBLIC / anon / authenticated.
--
-- SAFE ON THE LIVE DATABASE: no existing row is rewritten or deleted. New CHECK constraints are NOT VALID, so
-- they are enforced for new and changed rows only. Existing rows are not scanned. (Postgres still checks
-- the constraint when an old row is updated, so a legacy row that breaks a rule must be fixed first.)
-- The emails.creator_id foreign key is dropped and re-added in one statement (it scans emails once; nothing
-- is deleted because every email still has its creator).
--
-- BEFORE RUNNING VALIDATE (do this by hand, after reading the result; not run by this file):
--   select 'creators.email', id::text, email::text from public.creators where email::text !~ '^[^@\s,;<>]+@[^@\s,;<>]+$'
--   union all select 'emails.to_email', id::text, to_email::text from public.emails where to_email::text !~ '^[^@\s,;<>]+@[^@\s,;<>]+$'
--   union all select 'contact_messages.email', id::text, email::text from public.contact_messages where email::text !~ '^[^@\s,;<>]+@[^@\s,;<>]+$'
--   union all select 'creators.channel_url', id::text, channel_url from public.creators where channel_url is not null and channel_url !~ '^https://'
--   union all select 'contact_messages.length', id::text, '' from public.contact_messages
--      where length(name) > 300 or length(message) > 5000 or length(coalesce(topic, '')) > 2000;
-- If it returns no rows, then:
--   alter table public.creators validate constraint creators_email_format;
--   alter table public.creators validate constraint creators_channel_url_https;
--   alter table public.emails validate constraint emails_to_email_format;
--   alter table public.contact_messages validate constraint contact_messages_email_format;
--   alter table public.contact_messages validate constraint contact_messages_name_len;
--   alter table public.contact_messages validate constraint contact_messages_message_len;
--   alter table public.contact_messages validate constraint contact_messages_topic_len;
--
-- ROLL BACK (manual): drop the triggers creators_guard / creators_before_insert / creators_suppress_manual /
--   creators_before_delete and contact_messages_handled_by, the functions named here, the constraints named
--   here, the column emails.source, and re-add emails_creator_id_fkey with ON DELETE CASCADE.
set search_path = public, extensions;

-- ---------------------------------------------------------------- L11 default privileges
-- Supabase grants new functions to PUBLIC (global default) and to anon / authenticated / service_role
-- (schema default). Take away PUBLIC, anon and authenticated; every migration grants what it needs by name.
alter default privileges for role postgres revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;

-- ---------------------------------------------------------------- H07 stale 'sending'
-- Emails left in 'sending' (server stopped between reserve_send and mark_sent) go to 'failed' so the person
-- can look at the mail log and retry. Goes through the normal triggers: emails_guard and the audit line.
create or replace function public.release_stale_sending(p_minutes integer default 15) returns integer
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_n integer;
begin
  update public.emails x
     set status = 'failed',
         error = 'Interrupted while sending. Check the mail log before retrying.'
   where x.status = 'sending'
     and x.updated_at < now() - make_interval(mins => greatest(coalesce(p_minutes, 15), 0));
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.release_stale_sending(integer) from public, anon, authenticated, service_role;
grant execute on function public.release_stale_sending(integer) to service_role;

-- ---------------------------------------------------------------- M01 / L14 creators guard
-- "Direct" = a client such as PostgREST as authenticated. The service role and SECURITY DEFINER functions
-- (opt_out, the suppression trigger) are not direct.
create or replace function public.creators_guard() returns trigger
language plpgsql set search_path = public, extensions, pg_temp as $$
declare
  v_direct boolean := not exists (
    select 1 from pg_roles r where r.rolname = current_user and (r.rolsuper or r.rolbypassrls));
begin
  if v_direct and not public.is_owner() then
    if old.status = 'do_not_contact' and new.status <> 'do_not_contact' then
      raise exception 'Only the owner can take a creator off do not contact.' using errcode = 'check_violation';
    end if;
    new.user_id := old.user_id;
    new.created_by := old.created_by;
  end if;
  return new;
end $$;
create trigger creators_guard before update on public.creators
  for each row execute function public.creators_guard();

-- A creator whose address is already suppressed starts as do_not_contact (L13).
create or replace function public.creators_before_insert() returns trigger
language plpgsql set search_path = public, extensions, pg_temp as $$
begin
  if new.status <> 'do_not_contact'
     and exists (select 1 from public.suppression_list s where s.email = new.email) then
    new.status := 'do_not_contact';
  end if;
  return new;
end $$;
create trigger creators_before_insert before insert on public.creators
  for each row execute function public.creators_before_insert();

-- do_not_contact set by hand adds the address to suppression_list as 'manual'; the owner lifting it removes
-- only that 'manual' row (a real opt-out from the unsubscribe link has another reason and stays).
-- No loop: suppression_after only updates creators that are not do_not_contact yet, and here this one is.
create or replace function public.creators_suppress_manual() returns trigger
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  if new.status = 'do_not_contact' and (tg_op = 'INSERT' or old.status <> 'do_not_contact') then
    -- opt_out sets this flag: a real opt-out must be recorded with its own reason, not as 'manual'
    if coalesce(current_setting('smallfold.skip_manual', true), '') = 'on' then return null; end if;
    insert into public.suppression_list (email, reason) values (new.email, 'manual')
    on conflict (email) do nothing;
  elsif tg_op = 'UPDATE' and old.status = 'do_not_contact' and new.status <> 'do_not_contact' then
    delete from public.suppression_list s where s.email = old.email and s.reason = 'manual';
  end if;
  return null;
end $$;
create trigger creators_suppress_manual after insert or update of status on public.creators
  for each row execute function public.creators_suppress_manual();

-- opt_out: same as before, plus the flag above (the creator update runs before the suppression insert).
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
  perform set_config('smallfold.skip_manual', 'on', true);
  update public.creators c set status = 'do_not_contact' where c.email = v_email and c.status <> 'do_not_contact';
  get diagnostics v_n = row_count;
  insert into public.suppression_list (email, reason)
  values (v_email, left(coalesce(reason, 'opted out'), 500))
  on conflict on constraint suppression_list_pkey do nothing;
  get diagnostics v_new_n = row_count;
  perform set_config('smallfold.skip_manual', 'off', true);
  return jsonb_build_object('ok', true, 'newly_suppressed', v_new_n > 0, 'creators_updated', v_n);
end $$;

-- ---------------------------------------------------------------- M02 deleting a creator
create or replace function public.creators_before_delete() returns trigger
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  if old.status = 'do_not_contact' then
    insert into public.suppression_list (email, reason) values (old.email, 'do not contact (creator deleted)')
    on conflict (email) do nothing;
  end if;
  delete from public.emails e where e.creator_id = old.id and e.status in ('draft', 'approved');
  return old;   -- any other email (sent, failed, replied, sending) now stops the delete: ON DELETE RESTRICT
end $$;
create trigger creators_before_delete before delete on public.creators
  for each row execute function public.creators_before_delete();

alter table public.emails
  drop constraint emails_creator_id_fkey,
  add constraint emails_creator_id_fkey foreign key (creator_id) references public.creators (id) on delete restrict;

-- ---------------------------------------------------------------- M03 / L05 checks (NOT VALID)
alter table public.creators
  add constraint creators_email_format check (email::text ~ '^[^@\s,;<>]+@[^@\s,;<>]+$') not valid,
  add constraint creators_channel_url_https check (channel_url is null or channel_url ~ '^https://') not valid;
alter table public.emails
  add constraint emails_to_email_format check (to_email::text ~ '^[^@\s,;<>]+@[^@\s,;<>]+$') not valid;
alter table public.contact_messages
  add constraint contact_messages_email_format check (email::text ~ '^[^@\s,;<>]+@[^@\s,;<>]+$') not valid,
  add constraint contact_messages_name_len check (length(name) <= 300) not valid,
  add constraint contact_messages_message_len check (length(message) <= 5000) not valid,
  add constraint contact_messages_topic_len check (topic is null or length(topic) <= 2000) not valid;

-- ---------------------------------------------------------------- L33 where a draft came from
alter table public.emails
  add column source text not null default 'staff' check (source in ('staff', 'claude', 'template'));

-- ---------------------------------------------------------------- L14 handled_by comes from the caller
create or replace function public.contact_messages_handled_by() returns trigger
language plpgsql set search_path = public, extensions, pg_temp as $$
begin
  if auth.uid() is not null then
    new.handled_by := case when new.handled_at is null then null else auth.uid() end;
  end if;
  return new;
end $$;
create trigger contact_messages_handled_by before update on public.contact_messages
  for each row execute function public.contact_messages_handled_by();

-- Trigger functions need no EXECUTE for anyone.
revoke all on function public.creators_guard(), public.creators_before_insert(), public.creators_suppress_manual(),
  public.creators_before_delete(), public.contact_messages_handled_by()
  from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';
