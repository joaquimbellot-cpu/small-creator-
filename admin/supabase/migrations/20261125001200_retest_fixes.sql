-- Back-office upgrade, re-test fixes (Final fix agent). One file, one transaction, safe to run twice.
--   * SR-05  sponsorships_guard() (copy of 20261125001100): a confirming note that differs from the old one only by spaces or
--            letter case is the same note (compared trimmed and lower-cased), and a note needs 5 characters that are not spaces.
--   * SR-18  brand_contacts.email may not hold ? & % or any space or line break (constraint added NOT VALID, existing rows
--            checked, validated only when none fails; failing ids are listed in a notice and never changed).
--   * Export audit  creators_export() and sponsors_export() (copies of 20261125001100) store only whether a search text was
--            used ("q": true), not the text itself, in the audit line. The other filter keys are unchanged.
--   * SR-15  record_brand_import(): the only way to write "brands.imported". Staff only; the count must not be more than the
--            sponsors created in the last 30 minutes. log_audit() (copy of 20261125001100) refuses brands.imported from a
--            signed-in caller and no longer lists sponsorships.imported (nothing writes it).
--
-- SAFE ON THE LIVE DATABASE: no table, column or row is dropped, renamed or changed. Functions are create or replace with the
-- same signatures and grants (one new function); one constraint is added. Every statement can run twice.
-- ROLL BACK (manual): drop constraint brand_contacts_email_chars; drop function record_brand_import; restore sponsorships_guard,
--   creators_export, sponsors_export and log_audit from 20261125001100.
-- ---------------------------------------------------------------- SR-18
do $$
declare v_bad text;
begin
  if not exists (select 1 from pg_constraint where conname = 'brand_contacts_email_chars' and conrelid = 'public.brand_contacts'::regclass) then
    alter table public.brand_contacts add constraint brand_contacts_email_chars
      check (email is null or email::text !~ '[?&%[:space:]]') not valid;
  end if;
  if not (select convalidated from pg_constraint where conname = 'brand_contacts_email_chars' and conrelid = 'public.brand_contacts'::regclass) then
    select string_agg(c.id::text, ', ') into v_bad from public.brand_contacts c where c.email is not null and c.email::text ~ '[?&%[:space:]]';
    if v_bad is null then
      alter table public.brand_contacts validate constraint brand_contacts_email_chars;
    else
      raise notice 'brand_contacts_email_chars left NOT VALID: these contact people have a ? & %% or space in the address and need a person to fix them: %', v_bad;
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------- SR-05
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
    -- SR-05: the note must be written by the person confirming, not left over from the scanner or the import. A note that
    -- differs from the old one only by spaces or letter case is the same note, and a note needs 5 characters that are not spaces.
    if lower(regexp_replace(new.evidence_note, '^\s+|\s+$', '', 'g')) = lower(regexp_replace(coalesce(old.evidence_note, ''), '^\s+|\s+$', '', 'g')) then
      raise exception 'confirming needs a new evidence note written by you (how it was checked)' using errcode = 'check_violation';
    end if;
    if length(regexp_replace(new.evidence_note, '\s', '', 'g')) < 5 then
      raise exception 'confirming needs a new evidence note written by you (how it was checked): at least 5 characters' using errcode = 'check_violation';
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

-- ---------------------------------------------------------------- export audit lines (no search text)
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
      'filters', left(jsonb_strip_nulls(jsonb_build_object('q', case when nullif(btrim(p_q), '') is not null then true end, 'subs_min', p_subs_min, 'subs_max', p_subs_max,
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
      jsonb_build_object('count', public.sponsors_count(p),
        'filters', left((coalesce(p, '{}'::jsonb) - 'q' || case when nullif(btrim(coalesce(p ->> 'q', '')), '') is not null then '{"q": true}'::jsonb else '{}'::jsonb end)::text, 500)));
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

-- ---------------------------------------------------------------- SR-15: the import line
create or replace function public.record_brand_import(
  p_count integer, p_contacts integer default 0, p_duplicates integer default 0, p_errors integer default 0, p_partial boolean default false
) returns bigint
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_recent bigint;
  v_id bigint;
begin
  if auth.uid() is null or not public.is_staff() then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  if p_count is null or p_count < 0 or p_count > 2000
     or coalesce(p_contacts, 0) < 0 or coalesce(p_contacts, 0) > 2000
     or coalesce(p_duplicates, 0) < 0 or coalesce(p_duplicates, 0) > 2000
     or coalesce(p_errors, 0) < 0 or coalesce(p_errors, 0) > 2000 then
    raise exception 'import counts are out of range' using errcode = 'check_violation';
  end if;
  -- a real import left that many new sponsors behind just now
  select count(*) into v_recent from public.brands b where b.created_at > now() - interval '30 minutes';
  if p_count > v_recent then
    raise exception 'the count is higher than the sponsors that were just created' using errcode = 'check_violation';
  end if;
  insert into public.audit_log (actor_id, action, entity_type, entity_id, details)
  values (auth.uid(), 'brands.imported', 'brand', null,
          jsonb_build_object('count', p_count, 'contacts', coalesce(p_contacts, 0), 'duplicates', coalesce(p_duplicates, 0), 'errors', coalesce(p_errors, 0))
          || case when p_partial then '{"partial": true}'::jsonb else '{}'::jsonb end)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.record_brand_import(integer, integer, integer, integer, boolean) from public, anon, authenticated, service_role;
grant execute on function public.record_brand_import(integer, integer, integer, integer, boolean) to authenticated;

-- log_audit: copy of 20261125001100 with the two import changes.
create or replace function public.log_audit(
  action text, entity_type text default null, entity_id text default null,
  details jsonb default '{}'::jsonb, p_actor uuid default null
) returns bigint
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
#variable_conflict use_variable
declare
  v_id bigint;
  v_ok text[] := array['creator.viewed', 'creators.exported', 'creators.imported', 'creator.subscribers_refreshed',
    'brand.viewed', 'brands.exported', 'brands.imported',
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
  -- SR-15: "imported sponsors" is written only by record_brand_import(), with a count that real new rows back up
  if auth.uid() is not null and action = 'brands.imported' then
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

notify pgrst, 'reload schema';
