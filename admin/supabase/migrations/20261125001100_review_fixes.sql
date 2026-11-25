-- Back-office upgrade, security review and QA fixes (Fix agent A, database). One file, one transaction.
--   * SR-01  brands_guard(): only the owner may take a sponsor off do_not_contact (same rule as creators_guard).
--   * SR-06  the four cached counters on creators and brands cannot be written by a client; the rollup (security definer)
--            still writes them. creators_guard() is copied from 20261123000100 plus the counter rule.
--   * SR-02  creators_export() and sponsors_export() refuse anyone who is not the owner and write the audit line
--            (creators.exported / brands.exported: row count and the filter values, no personal data) inside the same call.
--            The first page (offset 0) writes the line; later pages need that line from the same person in the last 30 minutes.
--   * SR-03  a change or removal of a contact person's address puts every unsent email to that contact back to draft (with the
--            new address); reserve_send() (copy of 20261125000900) re-checks the address at the moment of sending.
--   * SR-05  sponsorships_guard() (copy of 20261125000200): confirming needs a NEW note; a Confirmed row cannot be created with
--            origin detected or import, for any caller.
--   * SR-07  deals_make_sponsorship() (copy of 20261125000200): a deal that leaves Completed and Paid takes its own,
--            untouched deal record with it (a record someone added a video to stays).
--   * B-1    sponsorships_deal_origin no longer needs deal_id: deleting a deal clears the link and the record stays, still
--            marked origin 'deal'.
--   * SR-09  video_url must be https on youtube.com, www.youtube.com, m.youtube.com or youtu.be (added NOT VALID, validated
--            only when no existing row fails; failing rows are listed in a notice, never deleted).
--   * SR-12  pg_temp added to the search_path of global_search, like_pattern, sponsor_* and sponsors_* functions.
--   * SR-15  log_audit() (copy of 20261125000400): brand.viewed must name an existing sponsor. The rest of SR-15 is not done
--            (see docs/ui-upgrade/build/review-fixes-db.md).
--   * SR-16  niches can be written by the owner only.
--
-- SAFE ON THE LIVE DATABASE: no table, column or row is dropped, renamed or deleted. Functions are create or replace with
-- the same signatures and grants; triggers are dropped and re-created; two constraints are replaced by a weaker one
-- (sponsorships_deal_origin) and an added one (video host). Every statement can run twice.
-- ROLL BACK (manual): drop trigger brands_guard on brands; drop trigger trg_contact_email_sync / trg_contact_delete_sync on
--   brand_contacts; restore creators_guard from 20261123000100, sponsorships_guard and deals_make_sponsorship from
--   20261125000200, reserve_send from 20261125000900, creators_export from 20261125000500, sponsors_export from
--   20261125000700, log_audit from 20261125000400; drop constraint sponsorships_video_host and re-add sponsorships_deal_origin
--   with "deal_id is not null"; recreate the niches write policies as in 20261125000100.
set search_path = public, extensions;

-- ---------------------------------------------------------------- SR-01 + SR-06: brands
-- "Direct" = a client such as PostgREST as authenticated; the service role, superuser and SECURITY DEFINER functions
-- (the sponsorship rollup) are not direct.
create or replace function public.brands_guard() returns trigger
language plpgsql set search_path = public, extensions, pg_temp as $$
declare
  v_direct boolean := not exists (
    select 1 from pg_roles r where r.rolname = current_user and (r.rolsuper or r.rolbypassrls));
begin
  if v_direct then
    if old.relationship = 'do_not_contact' and new.relationship is distinct from 'do_not_contact' and not public.is_owner() then
      raise exception 'Only the owner can take a sponsor off do not contact.' using errcode = 'check_violation';
    end if;
    -- cached counters belong to the rollup trigger
    new.sponsorship_count := old.sponsorship_count;
    new.last_sponsorship_at := old.last_sponsorship_at;
    new.detected_sponsorship_count := old.detected_sponsorship_count;
    new.last_detected_sponsorship_at := old.last_detected_sponsorship_at;
  end if;
  return new;
end $$;
revoke all on function public.brands_guard() from public, anon, authenticated, service_role;
drop trigger if exists brands_guard on public.brands;
create trigger brands_guard before update on public.brands
  for each row execute function public.brands_guard();

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
  if v_direct then
    -- SR-06: cached counters belong to the rollup trigger, for the owner as well
    new.sponsorship_count := old.sponsorship_count;
    new.last_sponsorship_at := old.last_sponsorship_at;
    new.detected_sponsorship_count := old.detected_sponsorship_count;
    new.last_detected_sponsorship_at := old.last_detected_sponsorship_at;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------- SR-02: exports
-- Owner only, and the audit line is part of the call. Nobody can read export rows without the line being written in the same
-- transaction (a failed audit write fails the whole call). creators_export keeps its signature and return type.
-- A person at the database console (superuser, no login) may still run an export, and it is audited the same way (actor empty).
-- The API roles (authenticated, anon, service_role) are never superusers, so a worker or a stolen key cannot use this.
create or replace function public.export_operator() returns boolean
language sql stable set search_path = pg_catalog, pg_temp as $$
  select auth.uid() is null and exists (select 1 from pg_roles r where r.rolname = current_user and r.rolsuper)
$$;
revoke all on function public.export_operator() from public, anon, authenticated, service_role;
grant execute on function public.export_operator() to authenticated;

create or replace function public.creators_export(
  p_q text default null, p_subs_min bigint default null, p_subs_max bigint default null,
  p_sponsored text default null, p_detected boolean default false, p_recent integer default null,
  p_by uuid[] default null, p_niche text[] default null, p_status text[] default null,
  p_contacted text default null, p_views integer default null, p_lang text[] default null,
  p_country text[] default null, p_email boolean default false, p_tag uuid[] default null, p_list uuid[] default null,
  p_limit integer default 1000, p_offset integer default 0
) returns table (
  full_name text, email text, phone text, channel_url text, niche text, niche_slug text, country text, language text,
  subscribers integer, avg_views integer, status text, notes text
)
language plpgsql volatile security invoker set search_path = public, extensions, pg_temp set jit = off as $$
#variable_conflict use_column
declare
  v_n bigint;
begin
  if not (public.is_owner() or public.export_operator()) then
    raise exception 'Only the owner can export creators.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(p_offset, 0) <= 0 then
    select count(*) into v_n from (select public.creators_match_ids(p_q, p_subs_min, p_subs_max, p_sponsored, p_detected, p_recent, p_by, p_niche, p_status, p_contacted, p_views, p_lang, p_country, p_email, p_tag, p_list)) m;
    perform public.log_audit('creators.exported', 'creator', null, jsonb_build_object('count', v_n,
      'filters', left(jsonb_strip_nulls(jsonb_build_object('q', p_q, 'subs_min', p_subs_min, 'subs_max', p_subs_max,
        'sponsored', p_sponsored, 'detected', p_detected, 'recent', p_recent, 'by', p_by, 'niche', p_niche, 'status', p_status,
        'contacted', p_contacted, 'views', p_views, 'lang', p_lang, 'country', p_country, 'email', p_email,
        'tag', p_tag, 'list', p_list))::text, 500)));
  elsif not exists (select 1 from public.audit_log a where a.actor_id is not distinct from auth.uid() and a.action = 'creators.exported'
                     and a.created_at > now() - interval '30 minutes') then
    raise exception 'Start the export from the first page.' using errcode = 'check_violation';
  end if;
  return query
  select c.full_name, c.email::text, c.phone, c.channel_url, c.niche, c.niche_slug, c.country, c.language,
         c.subscribers, c.avg_views, c.status::text, c.notes
    from public.creators c
   where c.id in (select public.creators_match_ids(p_q, p_subs_min, p_subs_max, p_sponsored, p_detected, p_recent, p_by, p_niche, p_status, p_contacted, p_views, p_lang, p_country, p_email, p_tag, p_list))
   order by c.full_name, c.id
   limit greatest(1, least(coalesce(p_limit, 1000), 1000)) offset greatest(0, coalesce(p_offset, 0));
end $$;

create or replace function public.sponsors_export(p jsonb, p_sort text default 'name', p_dir text default null,
                                                  p_limit integer default 1000, p_offset integer default 0)
returns table (name text, website text, industry text, country text, company_size text, niches text,
               target_min_subs integer, target_max_subs integer, budget_min numeric, budget_max numeric,
               relationship text, notes text, contact_name text, contact_role text, contact_email text,
               contact_phone text, contact_linkedin text)
language plpgsql volatile security invoker set search_path = public, extensions, pg_temp as $$
#variable_conflict use_column
begin
  if not (public.is_owner() or public.export_operator()) then
    raise exception 'Only the owner can export sponsors.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(p_offset, 0) <= 0 then
    perform public.log_audit('brands.exported', 'brand', null,
      jsonb_build_object('count', public.sponsors_count(p), 'filters', left(coalesce(p, '{}'::jsonb)::text, 500)));
  elsif not exists (select 1 from public.audit_log a where a.actor_id is not distinct from auth.uid() and a.action = 'brands.exported'
                     and a.created_at > now() - interval '30 minutes') then
    raise exception 'Start the export from the first page.' using errcode = 'check_violation';
  end if;
  return query
  select l.name, l.website, l.industry, l.country, l.company_size, array_to_string(l.target_niches, ';'),
         l.target_min_subs, l.target_max_subs, l.budget_min_cents / 100.0, l.budget_max_cents / 100.0,
         l.relationship, b.notes, c.full_name, c.role_title, c.email::text, c.phone, c.linkedin_url
    from public.sponsors_list(p, p_sort, p_dir, null, p_limit, p_offset) l
    join public.brands b on b.id = l.id
    left join lateral (select x.* from public.brand_contacts x where x.brand_id = l.id
                        order by x.is_primary desc, x.created_at, x.id limit 1) c on true;
end $$;

-- ---------------------------------------------------------------- SR-03: contact address kept in step with unsent emails
-- Not yet sent (draft or approved) emails to a contact: the address follows the contact and the email drops back to draft
-- (a person approves it again). If the contact has no address any more, the stored address stays, the email drops to draft
-- and cannot be approved or sent (the recipient check and reserve_send refuse it). If the new address is blocked (suppression
-- list), the email is marked failed with a plain reason instead of failing the contact edit.
create or replace function public.brand_contacts_email_sync() returns trigger
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  r record;
begin
  if tg_op = 'UPDATE' and new.email is not distinct from old.email then
    return new;
  end if;
  for r in select e.id from public.emails e
            where e.brand_contact_id = old.id and e.recipient_kind = 'brand_contact' and e.status in ('draft', 'approved')
            for update loop
    begin
      if tg_op = 'UPDATE' and new.email is not null then
        update public.emails x set to_email = new.email, status = 'draft', approved_by = null, approved_at = null
         where x.id = r.id;
      else
        update public.emails x set status = 'draft', approved_by = null, approved_at = null where x.id = r.id;
      end if;
    exception when others then
      update public.emails x set status = 'failed', approved_by = null, approved_at = null,
             error = 'The contact person''s address changed and the new address cannot be used. Write a new draft.'
       where x.id = r.id;
    end;
  end loop;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
revoke all on function public.brand_contacts_email_sync() from public, anon, authenticated, service_role;
drop trigger if exists trg_contact_email_sync on public.brand_contacts;
create trigger trg_contact_email_sync after update of email on public.brand_contacts
  for each row execute function public.brand_contacts_email_sync();
drop trigger if exists trg_contact_delete_sync on public.brand_contacts;
create trigger trg_contact_delete_sync before delete on public.brand_contacts
  for each row execute function public.brand_contacts_email_sync();

-- reserve_send: copy of 20261125000900 plus the address re-check for an email to a contact.
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
    -- SR-03: the address on the email must still be the contact person's address right now
    if v_kemail is null then
      return jsonb_build_object('ok', false, 'reason', 'contact_no_address');
    end if;
    if e.to_email is distinct from v_kemail then
      return jsonb_build_object('ok', false, 'reason', 'contact_changed');
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

-- ---------------------------------------------------------------- SR-05 (guard), SR-07 and B-1 (deal record)
create or replace function public.sponsorships_guard() returns trigger
language plpgsql set search_path = public, extensions, pg_temp as $$
declare
  v_direct boolean := not exists (
    select 1 from pg_roles r where r.rolname = current_user and (r.rolsuper or r.rolbypassrls));
  v_uid uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    if v_direct then
      if new.origin = 'deal' or new.deal_id is not null then
        raise exception 'records from deals are made by the database only' using errcode = 'check_violation';
      end if;
      new.created_by := v_uid;
      new.rejected := false; new.rejected_by := null; new.rejected_at := null;
    end if;
    -- SR-05: a found or imported record starts as Detected, whoever writes it (the service role included)
    if new.source_label = 'confirmed' and new.origin in ('detected', 'import') then
      raise exception 'a record found automatically or imported starts as detected; a person confirms it later' using errcode = 'check_violation';
    end if;
    if new.source_label = 'confirmed' then
      -- entered or verified by a person: the person and the time come from the login, not from the client
      if v_direct or new.confirmed_at is null then new.confirmed_at := now(); end if;
      if v_direct or new.confirmed_by is null then new.confirmed_by := coalesce(v_uid, new.confirmed_by); end if;
    end if;
    if new.rejected and new.rejected_at is null then new.rejected_at := now(); new.rejected_by := coalesce(new.rejected_by, v_uid); end if;
    return new;
  end if;

  -- UPDATE
  new.created_at := old.created_at;
  new.created_by := old.created_by;
  if v_direct then
    new.origin := old.origin; new.deal_id := old.deal_id;
  end if;

  if old.source_label = 'confirmed' then
    if new.source_label <> 'confirmed' then
      raise exception 'a confirmed record cannot go back to detected' using errcode = 'check_violation';
    end if;
    if new.rejected then
      raise exception 'a confirmed record cannot be rejected; ask the owner to delete it' using errcode = 'check_violation';
    end if;
    new.confirmed_by := old.confirmed_by; new.confirmed_at := old.confirmed_at;   -- who confirmed is history
  elsif new.source_label = 'confirmed' then
    -- promotion: detected -> confirmed. One action, taken by a person, with a reason written down.
    if old.rejected then
      raise exception 'restore a rejected record before confirming it' using errcode = 'check_violation';
    end if;
    if v_uid is null then
      raise exception 'only a signed-in person can confirm a record' using errcode = 'insufficient_privilege';
    end if;
    if nullif(btrim(coalesce(new.evidence_note, '')), '') is null then
      raise exception 'confirming needs an evidence note (how it was checked)' using errcode = 'check_violation';
    end if;
    -- SR-05: the note must be written by the person confirming, not left over from the scanner or the import
    if new.evidence_note is not distinct from old.evidence_note then
      raise exception 'confirming needs a new evidence note written by you (how it was checked)' using errcode = 'check_violation';
    end if;
    new.confirmed_by := v_uid; new.confirmed_at := now();
    new.rejected := false; new.rejected_by := null; new.rejected_at := null;
  else
    -- stays detected: nobody sets confirm fields by hand
    new.confirmed_by := null; new.confirmed_at := null;
  end if;

  if new.rejected and not old.rejected then
    new.rejected_by := v_uid; new.rejected_at := now();
  elsif old.rejected and not new.rejected then
    -- restore: staff only, and never the automatic scanner. Written to the audit log as sponsorship.restored.
    if not public.is_staff() then
      raise exception 'only staff can restore a rejected record' using errcode = 'insufficient_privilege';
    end if;
    new.rejected_by := null; new.rejected_at := null;
  elsif old.rejected then
    new.rejected_by := old.rejected_by; new.rejected_at := old.rejected_at;
  end if;

  new.updated_at := now();
  return new;
end $$;

-- B-1: a record made by a deal is history. Deleting the deal clears deal_id (foreign key, on delete set null) and the
-- record stays, still marked origin 'deal' and Confirmed. The old rule demanded deal_id, which refused the delete.
alter table public.sponsorships drop constraint if exists sponsorships_deal_origin;
alter table public.sponsorships add constraint sponsorships_deal_origin check (origin <> 'deal' or source_label = 'confirmed');

-- SR-07: a deal that leaves Completed and Paid takes back the record it made, unless a person has added a video to it.
create or replace function public.deals_make_sponsorship() returns trigger
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  if new.stage in ('completed', 'paid') then
    insert into public.sponsorships (creator_id, brand_id, sponsored_on, source_label, origin, deal_id,
                                     evidence_note, confirmed_by, confirmed_at, created_by)
    values (new.creator_id, new.brand_id, new.stage_changed_at::date, 'confirmed', 'deal', new.id,
            'Deal with this sponsor reached ' || new.stage::text || '.', auth.uid(), now(), auth.uid())
    on conflict (deal_id) where origin = 'deal' do nothing;
  elsif tg_op = 'UPDATE' and old.stage in ('completed', 'paid') then
    delete from public.sponsorships s
     where s.deal_id = new.id and s.origin = 'deal' and s.video_url is null and s.video_title is null;
  end if;
  return null;
end $$;

-- ---------------------------------------------------------------- SR-09: video link host
do $$
declare
  v_bad text;
begin
  if not exists (select 1 from pg_constraint where conname = 'sponsorships_video_host' and conrelid = 'public.sponsorships'::regclass) then
    alter table public.sponsorships add constraint sponsorships_video_host
      check (video_url is null or video_url ~* '^https://(youtube\.com|www\.youtube\.com|m\.youtube\.com|youtu\.be)([/?#]|$)') not valid;
  end if;
  if not (select convalidated from pg_constraint where conname = 'sponsorships_video_host' and conrelid = 'public.sponsorships'::regclass) then
    select string_agg(s.id::text, ', ') into v_bad from public.sponsorships s
     where s.video_url is not null and s.video_url !~* '^https://(youtube\.com|www\.youtube\.com|m\.youtube\.com|youtu\.be)([/?#]|$)';
    if v_bad is null then
      alter table public.sponsorships validate constraint sponsorships_video_host;
    else
      raise notice 'sponsorships_video_host left NOT VALID: these rows do not point to YouTube and need a person to fix them: %', v_bad;
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------- SR-12: pg_temp last in the search_path
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.prokind = 'f'
              and (p.proname in ('global_search', 'like_pattern') or p.proname like 'sponsor\_%' or p.proname like 'sponsors\_%')
  loop
    execute format('alter function %s set search_path = public, extensions, pg_temp', f.sig);
  end loop;
end $$;

-- ---------------------------------------------------------------- SR-15 (part): brand.viewed must name a sponsor
create or replace function public.log_audit(
  action text, entity_type text default null, entity_id text default null,
  details jsonb default '{}'::jsonb, p_actor uuid default null
) returns bigint
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
#variable_conflict use_variable
declare
  v_id bigint;
  v_ok text[] := array['creator.viewed', 'creators.exported', 'creators.imported', 'creator.subscribers_refreshed',
    'brand.viewed', 'brands.exported', 'brands.imported', 'sponsorships.imported',
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
     and (action in ('user.invited', 'user.removed', 'user.restored', 'creators.exported', 'brands.exported')
          or action like 'assistant.%') then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  -- two-step login lines: any staff member, but only about their own profile
  if auth.uid() is not null and action in ('auth.2fa_enabled', 'auth.2fa_removed')
     and (entity_type is distinct from 'profile' or entity_id is distinct from auth.uid()::text) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  -- SR-15: a "viewed a sponsor" line must be about a sponsor that exists
  if auth.uid() is not null and action = 'brand.viewed'
     and (entity_type is distinct from 'brand' or not exists (select 1 from public.brands b where b.id::text = entity_id)) then
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

-- ---------------------------------------------------------------- SR-16: the niche list is owner-write
drop policy if exists staff_insert_niches on public.niches;
drop policy if exists staff_update_niches on public.niches;
drop policy if exists owner_insert_niches on public.niches;
drop policy if exists owner_update_niches on public.niches;
create policy owner_insert_niches on public.niches for insert to authenticated with check ((select public.is_owner()));
create policy owner_update_niches on public.niches for update to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

notify pgrst, 'reload schema';
