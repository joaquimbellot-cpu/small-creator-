-- Back office upgrade: all eleven database files in one, in order.
-- Made from admin/supabase/migrations/20261125*.sql on 25 November 2026. Do not edit by hand: change the migration files and rebuild.
-- Paste the whole file into the Supabase SQL Editor and press Run. Each part is its own transaction, so if one part
-- fails, the parts before it are kept and nothing of the failed part is applied. Every part is safe to run twice,
-- so after a fix the whole file can simply be run again. Take a backup first. Never load the seed files in production.

-- ===================================================================== 20261125000100_niches_creators_brands_contacts.sql
begin;
-- Back-office upgrade, part 1 of 4 (Database agent): niches, new creator and sponsor (brands) columns,
-- sponsor contact people, and the new first deal stage 'matched'.
--   * deal_stage gets the value 'matched' before 'contacted' (a creator linked to a sponsor, no talks yet).
--   * niches: the fixed list of 12, keyed by slug (reference data, so it lives here).
--   * creators: niche_slug, language, country, avg_views and friends, audience_countries, engagement_rate, and four
--     cached counters kept by a trigger in the next file (confirmed and detected sponsorships).
--   * brands (the Sponsors on screen): relationship, industry, country, company_size, targets, budget, last contact,
--     updated_at and the same four cached counters.
--   * brand_contacts: people at a sponsor (personal data: email and phone are never written to the audit log).
--   * the update-time trigger on creators and brands no longer bumps updated_at when only a counter changed.
--
-- SAFE ON THE LIVE DATABASE: only additions. New columns are empty or have a constant default (no table rewrite);
-- no existing row is changed. The enum value is added with "if not exists". Every statement can run twice.
-- ROLL BACK (manual, only if nothing uses it yet): drop table brand_contacts; drop the new columns and indexes named here;
--   drop table niches; restore trg_touch on creators with touch_updated_at(); drop function touch_unless_counters().
--   A Postgres enum value cannot be removed: leave 'matched' in place (nothing reads it once no deal uses it).
set search_path = public, extensions;

-- ---------------------------------------------------------------- deal stage
-- Must be its own step: a new enum value cannot be used until the transaction that adds it has committed.
-- Nothing in this migration set uses the value before 20261125000300 (a later transaction).
alter type public.deal_stage add value if not exists 'matched' before 'contacted';

-- ---------------------------------------------------------------- niches
create table if not exists public.niches (
  slug       text primary key check (slug ~ '^[a-z][a-z0-9-]{1,40}$'),
  name       text not null check (length(btrim(name)) between 1 and 100),
  sort_order integer not null default 0
);
insert into public.niches (slug, name, sort_order) values
  ('tech',      'Tech and gadgets',      1),
  ('gaming',    'Gaming',                2),
  ('diy',       'Woodworking and DIY',   3),
  ('cooking',   'Cooking and food',      4),
  ('fitness',   'Fitness and health',    5),
  ('finance',   'Personal finance',      6),
  ('travel',    'Travel',                7),
  ('education', 'Education and science', 8),
  ('beauty',    'Beauty and style',      9),
  ('music',     'Music and audio',      10),
  ('photo',     'Photo and film',       11),
  ('outdoors',  'Outdoors',             12)
on conflict (slug) do nothing;

alter table public.niches enable row level security;
drop policy if exists staff_select_niches on public.niches;
drop policy if exists staff_insert_niches on public.niches;
drop policy if exists staff_update_niches on public.niches;
drop policy if exists owner_delete_niches on public.niches;
create policy staff_select_niches on public.niches for select to authenticated using ((select public.is_staff()));
create policy staff_insert_niches on public.niches for insert to authenticated with check ((select public.is_staff()));
create policy staff_update_niches on public.niches for update to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));
create policy owner_delete_niches on public.niches for delete to authenticated using ((select public.is_owner()));
revoke all on public.niches from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.niches to authenticated;
grant all on public.niches to service_role;

-- ---------------------------------------------------------------- creators: new optional columns
alter table public.creators
  add column if not exists niche_slug text references public.niches (slug) on update cascade,
  add column if not exists language text check (language is null or language ~ '^[a-z]{2,3}(-[A-Za-z]{2,4})?$'),
  add column if not exists country text check (country is null or country ~ '^[A-Z]{2}$'),
  add column if not exists avg_views integer check (avg_views is null or avg_views >= 0),
  add column if not exists avg_views_checked_at timestamptz,
  add column if not exists last_video_at timestamptz,
  add column if not exists uploads_per_month integer check (uploads_per_month is null or uploads_per_month >= 0),
  add column if not exists engagement_rate numeric(5,2) check (engagement_rate is null or engagement_rate between 0 and 100),
  add column if not exists audience_countries text check (length(audience_countries) <= 500),
  -- cached, kept by trigger (see 20261125000200): confirmed = source_label 'confirmed'; both ignore rejected rows
  add column if not exists sponsorship_count integer not null default 0 check (sponsorship_count >= 0),
  add column if not exists last_sponsorship_at date,
  add column if not exists detected_sponsorship_count integer not null default 0 check (detected_sponsorship_count >= 0),
  add column if not exists last_detected_sponsorship_at date;

-- One index per filter on the creators list.
create index if not exists creators_niche_slug_idx    on public.creators (niche_slug) where niche_slug is not null;
create index if not exists creators_language_idx      on public.creators (language) where language is not null;
create index if not exists creators_country_idx       on public.creators (country) where country is not null;
create index if not exists creators_subscribers_idx   on public.creators (subscribers);
create index if not exists creators_avg_views_idx     on public.creators (avg_views) where avg_views is not null;
create index if not exists creators_last_spons_idx    on public.creators (last_sponsorship_at desc) where last_sponsorship_at is not null;
create index if not exists creators_last_detected_idx on public.creators (last_detected_sponsorship_at desc) where last_detected_sponsorship_at is not null;
create index if not exists creators_has_spons_idx     on public.creators (sponsorship_count) where sponsorship_count > 0;
create index if not exists creators_has_detected_idx  on public.creators (detected_sponsorship_count) where detected_sponsorship_count > 0;
create index if not exists creators_last_contacted_idx on public.creators (last_contacted_at);
create index if not exists creators_last_video_idx    on public.creators (last_video_at desc) where last_video_at is not null;

-- ---------------------------------------------------------------- brands: new optional columns
alter table public.brands
  add column if not exists relationship text not null default 'prospect'
    check (relationship in ('prospect', 'contacted', 'talks', 'partner', 'past', 'do_not_contact')),
  add column if not exists industry text check (length(industry) <= 200),
  add column if not exists country text check (country is null or country ~ '^[A-Z]{2}$'),
  add column if not exists company_size text check (company_size in ('1-10', '11-50', '51-200', '201-1000', '1000+')),
  add column if not exists target_niches text[] default '{}',
  add column if not exists target_min_subs integer check (target_min_subs is null or target_min_subs >= 0),
  add column if not exists target_max_subs integer check (target_max_subs is null or target_max_subs >= 0),
  add column if not exists budget_min_cents bigint check (budget_min_cents is null or budget_min_cents >= 0),
  add column if not exists budget_max_cents bigint check (budget_max_cents is null or budget_max_cents >= 0),
  add column if not exists last_contacted_at timestamptz,
  -- existing rows get the time of this migration; later edits move it
  add column if not exists updated_at timestamptz not null default now(),
  -- cached, kept by trigger. sponsorship counts are DISTINCT CREATORS (not records), confirmed or detected; rejected rows are ignored
  add column if not exists sponsorship_count integer not null default 0 check (sponsorship_count >= 0),
  add column if not exists last_sponsorship_at date,
  add column if not exists detected_sponsorship_count integer not null default 0 check (detected_sponsorship_count >= 0),
  add column if not exists last_detected_sponsorship_at date;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.brands'::regclass and conname = 'brands_target_subs_order') then
    alter table public.brands add constraint brands_target_subs_order
      check (target_min_subs is null or target_max_subs is null or target_min_subs <= target_max_subs);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.brands'::regclass and conname = 'brands_budget_order') then
    alter table public.brands add constraint brands_budget_order
      check (budget_min_cents is null or budget_max_cents is null or budget_min_cents <= budget_max_cents);
  end if;
end $$;

create index if not exists brands_relationship_idx  on public.brands (relationship);
create index if not exists brands_country_idx       on public.brands (country) where country is not null;
create index if not exists brands_industry_idx      on public.brands (industry) where industry is not null;
create index if not exists brands_company_size_idx  on public.brands (company_size) where company_size is not null;
create index if not exists brands_target_niches_gin on public.brands using gin (target_niches);
create index if not exists brands_name_trgm         on public.brands using gin ((name::text) extensions.gin_trgm_ops);
create index if not exists brands_last_spons_idx    on public.brands (last_sponsorship_at desc) where last_sponsorship_at is not null;
create index if not exists brands_last_detected_idx on public.brands (last_detected_sponsorship_at desc) where last_detected_sponsorship_at is not null;
create index if not exists brands_spons_count_idx   on public.brands (sponsorship_count) where sponsorship_count > 0;
create index if not exists brands_last_contacted_idx on public.brands (last_contacted_at) where last_contacted_at is not null;

-- ---------------------------------------------------------------- update time, ignoring cached counters
-- A sponsorship change recalculates the counters on a creator or sponsor. That is not an edit by a person, so
-- updated_at stays put when the counters are the only thing that moved. Anything else bumps it, as before.
create or replace function public.touch_unless_counters() returns trigger
language plpgsql set search_path = public, extensions, pg_temp as $$
declare
  v_cols text[] := array['updated_at', 'sponsorship_count', 'last_sponsorship_at',
                         'detected_sponsorship_count', 'last_detected_sponsorship_at'];
begin
  if (to_jsonb(new) - v_cols) = (to_jsonb(old) - v_cols)
     and (to_jsonb(new) - 'updated_at') is distinct from (to_jsonb(old) - 'updated_at') then
    new.updated_at := old.updated_at;
  else
    new.updated_at := now();
  end if;
  return new;
end $$;
revoke all on function public.touch_unless_counters() from public, anon, authenticated, service_role;

drop trigger if exists trg_touch on public.creators;
create trigger trg_touch before update on public.creators for each row execute function public.touch_unless_counters();
drop trigger if exists trg_touch on public.brands;
create trigger trg_touch before update on public.brands for each row execute function public.touch_unless_counters();

-- ---------------------------------------------------------------- brand_contacts
create table if not exists public.brand_contacts (
  id           uuid primary key default gen_random_uuid(),
  brand_id     uuid not null references public.brands (id) on delete cascade,
  full_name    text not null check (length(btrim(full_name)) between 1 and 200),
  role_title   text check (length(role_title) <= 200),
  email        citext check (length(email) <= 320 and email::text ~ '^[^@\s,;<>]+@[^@\s,;<>]+$'),
  phone        text check (length(phone) <= 50),
  linkedin_url text check (length(linkedin_url) <= 500 and linkedin_url ~* '^https://([a-z0-9-]+\.)?linkedin\.com/'),
  is_primary   boolean not null default false,
  notes        text check (length(notes) <= 5000),
  created_at   timestamptz not null default now(),
  created_by   uuid references public.profiles (id) on delete set null default auth.uid(),
  updated_at   timestamptz not null default now()
);
create index if not exists brand_contacts_brand_idx   on public.brand_contacts (brand_id);
create unique index if not exists brand_contacts_brand_email_key on public.brand_contacts (brand_id, email) where email is not null;
create unique index if not exists brand_contacts_one_primary on public.brand_contacts (brand_id) where is_primary;
create index if not exists brand_contacts_name_trgm   on public.brand_contacts using gin (full_name extensions.gin_trgm_ops);
create index if not exists brand_contacts_email_idx   on public.brand_contacts (email) where email is not null;
create index if not exists brand_contacts_created_by_idx on public.brand_contacts (created_by) where created_by is not null;

-- Marking a person as primary quietly un-marks the previous one (the partial unique index allows only one).
create or replace function public.brand_contacts_primary() returns trigger
language plpgsql set search_path = public, extensions, pg_temp as $$
begin
  if new.is_primary then
    update public.brand_contacts set is_primary = false
     where brand_id = new.brand_id and is_primary and id <> new.id;
  end if;
  return new;
end $$;
revoke all on function public.brand_contacts_primary() from public, anon, authenticated, service_role;
drop trigger if exists trg_primary on public.brand_contacts;
create trigger trg_primary before insert or update of is_primary on public.brand_contacts
  for each row when (new.is_primary) execute function public.brand_contacts_primary();
drop trigger if exists trg_touch on public.brand_contacts;
create trigger trg_touch before update on public.brand_contacts for each row execute function public.touch_updated_at();

alter table public.brand_contacts enable row level security;
drop policy if exists staff_select_brand_contacts on public.brand_contacts;
drop policy if exists staff_insert_brand_contacts on public.brand_contacts;
drop policy if exists staff_update_brand_contacts on public.brand_contacts;
drop policy if exists owner_delete_brand_contacts on public.brand_contacts;
create policy staff_select_brand_contacts on public.brand_contacts for select to authenticated using ((select public.is_staff()));
create policy staff_insert_brand_contacts on public.brand_contacts for insert to authenticated with check ((select public.is_staff()));
create policy staff_update_brand_contacts on public.brand_contacts for update to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));
create policy owner_delete_brand_contacts on public.brand_contacts for delete to authenticated using ((select public.is_owner()));
revoke all on public.brand_contacts from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.brand_contacts to authenticated;
grant all on public.brand_contacts to service_role;

notify pgrst, 'reload schema';
commit;

-- ===================================================================== 20261125000200_sponsorships.sql
begin;
-- Back-office upgrade, part 2 of 4 (Database agent): sponsorship records and the rules the database enforces.
--   * sponsorships: one row per "creator X did a sponsored video for sponsor Y". source_label is required (no default):
--     'confirmed' (a person checked it) or 'detected' (found automatically, not checked, never stated as fact).
--   * rules: confirmed needs confirmed_at and (except a deal row made by a trigger) confirmed_by; detected needs a signal and
--     a confidence and has no confirm fields; confirming needs an evidence note and takes the person from auth.uid();
--     rejecting keeps the row; a confirmed row never goes back to detected; restoring a rejected row is a staff action.
--   * counters on creators and brands are kept by trigger and ignore rejected rows.
--   * a deal that reaches completed or paid creates one confirmed sponsorship (origin 'deal'), never twice for a deal.
--     Existing completed and paid deals are backfilled (insert only).
--   * view creator_sponsorship_facts: confirmed and not rejected only (the only thing email drafting may read).
--
-- SAFE ON THE LIVE DATABASE: one new table, new triggers on that table and one new AFTER trigger on deals. The only data
-- written is the backfill (one new row per completed or paid deal that has none, and the counters those rows move).
-- Every statement can run twice; the backfill inserts nothing the second time.
-- ROLL BACK (manual): drop trigger trg_deal_sponsorship on deals; drop view creator_sponsorship_facts; drop table sponsorships;
--   drop the functions sponsorships_guard, sponsorships_rollup, sponsorship_refresh, deals_make_sponsorship; then set the
--   counters back to 0 / null on creators and brands (update ... set sponsorship_count = 0, ...).
set search_path = public, extensions;

create table if not exists public.sponsorships (
  id                   uuid primary key default gen_random_uuid(),
  -- cascade: erasing a creator (owner only) erases their records; a creator with deals still cannot be deleted
  creator_id           uuid not null references public.creators (id) on delete cascade,
  -- restrict: a sponsor with records cannot be deleted by accident. Empty when the sponsor is not known.
  brand_id             uuid references public.brands (id) on delete restrict,
  brand_name_raw       text check (length(brand_name_raw) <= 200),
  sponsored_on         date,
  video_url            text check (length(video_url) <= 500 and video_url ~* '^https://'),
  video_title          text check (length(video_title) <= 300),
  source_label         text not null check (source_label in ('confirmed', 'detected')),     -- no default: the writer must choose
  origin               text not null check (origin in ('manual', 'import', 'deal', 'detected')),
  detection_signal     text check (length(detection_signal) <= 100),
  detection_confidence text check (detection_confidence in ('high', 'medium', 'low')),
  evidence_note        text check (length(evidence_note) <= 2000),
  confirmed_by         uuid references public.profiles (id) on delete set null,
  confirmed_at         timestamptz,
  rejected             boolean not null default false,
  rejected_by          uuid references public.profiles (id) on delete set null,
  rejected_at          timestamptz,
  deal_id              uuid references public.deals (id) on delete set null,
  notes                text check (length(notes) <= 5000),
  created_at           timestamptz not null default now(),
  created_by           uuid references public.profiles (id) on delete set null default auth.uid(),
  updated_at           timestamptz not null default now(),

  constraint sponsorships_confirmed_fields check (
    source_label <> 'confirmed'
    or (confirmed_at is not null and not rejected and (confirmed_by is not null or origin = 'deal'))),
  constraint sponsorships_detected_fields check (
    source_label <> 'detected'
    or (confirmed_by is null and confirmed_at is null
        and detection_signal is not null and detection_confidence is not null)),
  constraint sponsorships_rejected_fields check (
    (rejected and rejected_at is not null) or (not rejected and rejected_by is null and rejected_at is null)),
  constraint sponsorships_deal_origin check (origin <> 'deal' or (deal_id is not null and source_label = 'confirmed'))
);

-- A deal makes at most one record; the same creator, video and sponsor is stored once (so a rejected record is not re-created).
create unique index if not exists sponsorships_deal_once on public.sponsorships (deal_id) where origin = 'deal';
create unique index if not exists sponsorships_video_once on public.sponsorships
  (creator_id, video_url, coalesce(brand_id, '00000000-0000-0000-0000-000000000000')) where video_url is not null;

-- Indexes, one per way the lists and profiles read the table.
create index if not exists sponsorships_creator_idx  on public.sponsorships (creator_id, sponsored_on desc);
create index if not exists sponsorships_brand_idx    on public.sponsorships (brand_id, sponsored_on desc) where brand_id is not null;
create index if not exists sponsorships_confirmed_on on public.sponsorships (sponsored_on desc) where source_label = 'confirmed' and not rejected;
create index if not exists sponsorships_detected_on  on public.sponsorships (sponsored_on desc) where source_label = 'detected' and not rejected;
create index if not exists sponsorships_review_idx   on public.sponsorships (detection_confidence, created_at desc) where source_label = 'detected' and not rejected;
create index if not exists sponsorships_deal_idx     on public.sponsorships (deal_id) where deal_id is not null;
create index if not exists sponsorships_created_by_idx   on public.sponsorships (created_by) where created_by is not null;
create index if not exists sponsorships_confirmed_by_idx on public.sponsorships (confirmed_by) where confirmed_by is not null;

-- ---------------------------------------------------------------- rules (guard trigger)
-- "Direct" = a client such as PostgREST as authenticated; the service role and SECURITY DEFINER functions are not direct.
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
revoke all on function public.sponsorships_guard() from public, anon, authenticated, service_role;
drop trigger if exists trg_guard on public.sponsorships;
create trigger trg_guard before insert or update on public.sponsorships
  for each row execute function public.sponsorships_guard();

-- ---------------------------------------------------------------- counters on creators and brands
-- Full recount for one creator and one sponsor (cheap: both read an index). Only writes when a number changed, so a
-- trigger run that changes nothing makes no update. Rejected rows are never counted. Sponsor counts are distinct creators.
create or replace function public.sponsorship_refresh(p_creator uuid, p_brand uuid) returns void
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  if p_creator is not null then
    update public.creators c set
      sponsorship_count = x.n_c, last_sponsorship_at = x.last_c,
      detected_sponsorship_count = x.n_d, last_detected_sponsorship_at = x.last_d
     from (select count(*) filter (where source_label = 'confirmed')::integer as n_c,
                  max(sponsored_on) filter (where source_label = 'confirmed') as last_c,
                  count(*) filter (where source_label = 'detected')::integer as n_d,
                  max(sponsored_on) filter (where source_label = 'detected') as last_d
             from public.sponsorships where creator_id = p_creator and not rejected) x
    where c.id = p_creator
      and (c.sponsorship_count, c.last_sponsorship_at, c.detected_sponsorship_count, c.last_detected_sponsorship_at)
          is distinct from (x.n_c, x.last_c, x.n_d, x.last_d);
  end if;
  if p_brand is not null then
    update public.brands b set
      sponsorship_count = x.n_c, last_sponsorship_at = x.last_c,
      detected_sponsorship_count = x.n_d, last_detected_sponsorship_at = x.last_d
     from (select count(distinct creator_id) filter (where source_label = 'confirmed')::integer as n_c,
                  max(sponsored_on) filter (where source_label = 'confirmed') as last_c,
                  count(distinct creator_id) filter (where source_label = 'detected')::integer as n_d,
                  max(sponsored_on) filter (where source_label = 'detected') as last_d
             from public.sponsorships where brand_id = p_brand and not rejected) x
    where b.id = p_brand
      and (b.sponsorship_count, b.last_sponsorship_at, b.detected_sponsorship_count, b.last_detected_sponsorship_at)
          is distinct from (x.n_c, x.last_c, x.n_d, x.last_d);
  end if;
end $$;
revoke all on function public.sponsorship_refresh(uuid, uuid) from public, anon, authenticated, service_role;

create or replace function public.sponsorships_rollup() returns trigger
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.sponsorship_refresh(old.creator_id, old.brand_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.sponsorship_refresh(new.creator_id, new.brand_id);
  end if;
  return null;
end $$;
revoke all on function public.sponsorships_rollup() from public, anon, authenticated, service_role;
drop trigger if exists trg_rollup on public.sponsorships;
create trigger trg_rollup after insert or update or delete on public.sponsorships
  for each row execute function public.sponsorships_rollup();

-- ---------------------------------------------------------------- deal -> sponsorship
-- A deal that reaches completed or paid is a confirmed sponsorship we brokered. One per deal, never twice.
-- The person is whoever moved the stage (empty when the database did it, for example in the backfill).
-- Moving a deal back later does not delete the record: the owner deletes it if it was a mistake.
create or replace function public.deals_make_sponsorship() returns trigger
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  if new.stage in ('completed', 'paid') then
    insert into public.sponsorships (creator_id, brand_id, sponsored_on, source_label, origin, deal_id,
                                     evidence_note, confirmed_by, confirmed_at, created_by)
    values (new.creator_id, new.brand_id, new.stage_changed_at::date, 'confirmed', 'deal', new.id,
            'Deal with this sponsor reached ' || new.stage::text || '.', auth.uid(), now(), auth.uid())
    on conflict (deal_id) where origin = 'deal' do nothing;
  end if;
  return null;
end $$;
revoke all on function public.deals_make_sponsorship() from public, anon, authenticated, service_role;
drop trigger if exists trg_deal_sponsorship on public.deals;
create trigger trg_deal_sponsorship after insert or update of stage on public.deals
  for each row execute function public.deals_make_sponsorship();

-- ---------------------------------------------------------------- touch, RLS, grants
alter table public.sponsorships enable row level security;
drop policy if exists staff_select_sponsorships on public.sponsorships;
drop policy if exists staff_insert_sponsorships on public.sponsorships;
drop policy if exists staff_update_sponsorships on public.sponsorships;
drop policy if exists owner_delete_sponsorships on public.sponsorships;
create policy staff_select_sponsorships on public.sponsorships for select to authenticated using ((select public.is_staff()));
create policy staff_insert_sponsorships on public.sponsorships for insert to authenticated with check ((select public.is_staff()));
create policy staff_update_sponsorships on public.sponsorships for update to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));
create policy owner_delete_sponsorships on public.sponsorships for delete to authenticated using ((select public.is_owner()));
revoke all on public.sponsorships from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.sponsorships to authenticated;
grant all on public.sponsorships to service_role;

-- ---------------------------------------------------------------- facts view for emails and pitches
-- Only confirmed, not rejected. Detected rows are not in it at all, so they cannot reach a prompt or an email by mistake.
-- Internal notes and the evidence text are left out on purpose.
create or replace view public.creator_sponsorship_facts with (security_invoker = true) as
select s.id, s.creator_id, s.brand_id,
       coalesce(b.name::text, s.brand_name_raw) as brand_name,
       s.sponsored_on, s.video_url, s.video_title, s.origin, s.confirmed_at
  from public.sponsorships s
  left join public.brands b on b.id = s.brand_id
 where s.source_label = 'confirmed' and not s.rejected;
revoke all on public.creator_sponsorship_facts from public, anon, authenticated, service_role;
grant select on public.creator_sponsorship_facts to authenticated, service_role;

-- ---------------------------------------------------------------- backfill (insert only)
-- One confirmed record per completed or paid deal that has none yet. Dated by the day the deal reached that stage.
insert into public.sponsorships (creator_id, brand_id, sponsored_on, source_label, origin, deal_id, evidence_note,
                                 confirmed_at, created_by)
select d.creator_id, d.brand_id, d.stage_changed_at::date, 'confirmed', 'deal', d.id,
       'Deal with this sponsor reached ' || d.stage::text || '.', now(), null
  from public.deals d
 where d.stage in ('completed', 'paid')
   and not exists (select 1 from public.sponsorships s where s.deal_id = d.id and s.origin = 'deal');

notify pgrst, 'reload schema';
commit;

-- ===================================================================== 20261125000300_deals_amount_tags_lists_views.sql
begin;
-- Back-office upgrade, part 3 of 4 (Database agent): empty deal amounts, tags, lists and saved views.
--   * deals.amount_cents may be empty (a new link has no price yet). The commission is then 0, never an error.
--     The stage value 'matched' itself was added in 20261125000100 (a new enum value cannot be used in the same
--     transaction that adds it). stats_overview() already lists the active stages by name, so 'matched' is not active.
--   * tags (creator or brand scope), creator_tags, brand_tags.
--   * lists (a named group of creators or of sponsors) and list_items.
--   * saved_views: a person's saved filters; read own and shared, change only own.
--
-- SAFE ON THE LIVE DATABASE: drops the NOT NULL and the default 0 on deals.amount_cents (existing rows keep their
-- numbers), replaces one trigger function, adds new tables. No row is changed or deleted.
-- ROLL BACK (manual): update deals set amount_cents = 0 where amount_cents is null; then alter column amount_cents set default 0
--   and set not null; restore deals_before() from 20261121000300; drop the new tables in this order: list_items, lists,
--   creator_tags, brand_tags, tags, saved_views; drop the functions list_items_guard.
set search_path = public, extensions;

-- ---------------------------------------------------------------- deals: empty amount
alter table public.deals alter column amount_cents drop not null;
alter table public.deals alter column amount_cents drop default;

-- commission_cents() is strict: no amount gives no commission (null); the column itself holds 0.
create or replace function public.deals_before() returns trigger
language plpgsql set search_path = public, extensions, pg_temp as $$
begin
  new.commission_cents := coalesce(public.commission_cents(new.amount_cents), 0);
  if tg_op = 'UPDATE' then
    new.updated_at := now();
    new.stage_changed_at := case when new.stage is distinct from old.stage then now() else old.stage_changed_at end;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------- tags
create table if not exists public.tags (
  id         uuid primary key default gen_random_uuid(),
  name       citext not null check (length(btrim(name)) between 1 and 60),
  scope      text not null check (scope in ('creator', 'brand')),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  unique (scope, name)
);
create index if not exists tags_created_by_idx on public.tags (created_by) where created_by is not null;

create table if not exists public.creator_tags (
  creator_id uuid not null references public.creators (id) on delete cascade,
  tag_id     uuid not null references public.tags (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (creator_id, tag_id)
);
create index if not exists creator_tags_tag_idx on public.creator_tags (tag_id, creator_id);

create table if not exists public.brand_tags (
  brand_id   uuid not null references public.brands (id) on delete cascade,
  tag_id     uuid not null references public.tags (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (brand_id, tag_id)
);
create index if not exists brand_tags_tag_idx on public.brand_tags (tag_id, brand_id);

-- A creator can only carry a creator tag, a sponsor only a sponsor tag.
create or replace function public.tag_scope_guard() returns trigger
language plpgsql set search_path = public, extensions, pg_temp as $$
begin
  if (select t.scope from public.tags t where t.id = new.tag_id) is distinct from tg_argv[0] then
    raise exception 'this tag is not a % tag', tg_argv[0] using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke all on function public.tag_scope_guard() from public, anon, authenticated, service_role;
drop trigger if exists trg_scope on public.creator_tags;
create trigger trg_scope before insert or update on public.creator_tags for each row execute function public.tag_scope_guard('creator');
drop trigger if exists trg_scope on public.brand_tags;
create trigger trg_scope before insert or update on public.brand_tags for each row execute function public.tag_scope_guard('brand');

-- ---------------------------------------------------------------- lists
create table if not exists public.lists (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(btrim(name)) between 1 and 100),
  kind       text not null check (kind in ('creators', 'brands')),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kind, name)
);
create index if not exists lists_created_by_idx on public.lists (created_by) where created_by is not null;
drop trigger if exists trg_touch on public.lists;
create trigger trg_touch before update on public.lists for each row execute function public.touch_updated_at();

create table if not exists public.list_items (
  id         uuid primary key default gen_random_uuid(),
  list_id    uuid not null references public.lists (id) on delete cascade,
  creator_id uuid references public.creators (id) on delete cascade,
  brand_id   uuid references public.brands (id) on delete cascade,
  added_by   uuid references public.profiles (id) on delete set null default auth.uid(),
  added_at   timestamptz not null default now(),
  check ((creator_id is null) <> (brand_id is null))
);
create unique index if not exists list_items_creator_once on public.list_items (list_id, creator_id) where creator_id is not null;
create unique index if not exists list_items_brand_once   on public.list_items (list_id, brand_id) where brand_id is not null;
create index if not exists list_items_creator_idx on public.list_items (creator_id) where creator_id is not null;
create index if not exists list_items_brand_idx   on public.list_items (brand_id) where brand_id is not null;
create index if not exists list_items_added_by_idx on public.list_items (added_by) where added_by is not null;

-- A creators list holds creators and a sponsors list holds sponsors.
create or replace function public.list_items_guard() returns trigger
language plpgsql set search_path = public, extensions, pg_temp as $$
declare v_kind text;
begin
  select l.kind into v_kind from public.lists l where l.id = new.list_id;
  if (v_kind = 'creators' and new.creator_id is null) or (v_kind = 'brands' and new.brand_id is null) then
    raise exception 'this item does not match the list type (%)', v_kind using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke all on function public.list_items_guard() from public, anon, authenticated, service_role;
drop trigger if exists trg_guard on public.list_items;
create trigger trg_guard before insert or update on public.list_items for each row execute function public.list_items_guard();

-- ---------------------------------------------------------------- saved views
create table if not exists public.saved_views (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  scope      text not null check (scope in ('creators', 'sponsors')),
  name       text not null check (length(btrim(name)) between 1 and 100),
  -- the page address query, for example "status=active&sponsored=yes"; the page re-validates it when it loads
  query      text not null default '' check (length(query) <= 2000 and query !~ '^\?' and query !~* '^[a-z]+://'),
  is_shared  boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, scope, name)
);
create index if not exists saved_views_shared_idx on public.saved_views (scope, name) where is_shared;
drop trigger if exists trg_touch on public.saved_views;
create trigger trg_touch before update on public.saved_views for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- RLS and grants
-- tags, creator_tags, brand_tags, lists, list_items: staff read and write, owner delete (the pattern of the other tables)
do $$
declare t text;
begin
  foreach t in array array['tags', 'creator_tags', 'brand_tags', 'lists', 'list_items'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists staff_select_%1$s on public.%1$I', t);
    execute format('drop policy if exists staff_insert_%1$s on public.%1$I', t);
    execute format('drop policy if exists staff_update_%1$s on public.%1$I', t);
    execute format('drop policy if exists owner_delete_%1$s on public.%1$I', t);
    execute format('create policy staff_select_%1$s on public.%1$I for select to authenticated using ((select public.is_staff()))', t);
    execute format('create policy staff_insert_%1$s on public.%1$I for insert to authenticated with check ((select public.is_staff()))', t);
    execute format('create policy staff_update_%1$s on public.%1$I for update to authenticated using ((select public.is_staff())) with check ((select public.is_staff()))', t);
    execute format('create policy owner_delete_%1$s on public.%1$I for delete to authenticated using ((select public.is_owner()))', t);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;
-- Tag links and list items are plain joins: staff may also remove them (taking a tag off a creator is not a delete of data).
drop policy if exists staff_delete_creator_tags on public.creator_tags;
drop policy if exists staff_delete_brand_tags on public.brand_tags;
drop policy if exists staff_delete_list_items on public.list_items;
create policy staff_delete_creator_tags on public.creator_tags for delete to authenticated using ((select public.is_staff()));
create policy staff_delete_brand_tags on public.brand_tags for delete to authenticated using ((select public.is_staff()));
create policy staff_delete_list_items on public.list_items for delete to authenticated using ((select public.is_staff()));

-- saved_views: read your own and the shared ones; add, change and delete only your own (the owner may delete any)
alter table public.saved_views enable row level security;
drop policy if exists staff_select_saved_views on public.saved_views;
drop policy if exists staff_insert_saved_views on public.saved_views;
drop policy if exists staff_update_saved_views on public.saved_views;
drop policy if exists staff_delete_saved_views on public.saved_views;
drop policy if exists owner_delete_saved_views on public.saved_views;
create policy staff_select_saved_views on public.saved_views for select to authenticated
  using ((select public.is_staff()) and (owner_id = (select auth.uid()) or is_shared));
create policy staff_insert_saved_views on public.saved_views for insert to authenticated
  with check ((select public.is_staff()) and owner_id = (select auth.uid()));
create policy staff_update_saved_views on public.saved_views for update to authenticated
  using ((select public.is_staff()) and owner_id = (select auth.uid()))
  with check ((select public.is_staff()) and owner_id = (select auth.uid()));
create policy staff_delete_saved_views on public.saved_views for delete to authenticated
  using ((select public.is_staff()) and owner_id = (select auth.uid()));
create policy owner_delete_saved_views on public.saved_views for delete to authenticated using ((select public.is_owner()));
revoke all on public.saved_views from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.saved_views to authenticated;
grant all on public.saved_views to service_role;

notify pgrst, 'reload schema';
commit;

-- ===================================================================== 20261125000400_views_and_audit.sql
begin;
-- Back-office upgrade, part 4 of 4 (Database agent): summary views and audit changes.
--   * creator_summaries: the new creator columns are appended (old columns and their order unchanged); total_earned_cents
--     now copes with an empty deal amount.
--   * brand_summaries: new view for the Sponsors list (security invoker): the brand columns plus contact_count,
--     deal_count and open_deal_count (open = not completed and not paid; a 'matched' link counts as open).
--   * log_audit: new actions brand.viewed, brands.exported (owner only, like creators.exported), brands.imported,
--     sponsorships.imported. Everything else in it is as in 20261123000400.
--   * audit_row: row triggers for brand_contact, sponsorship and list; sponsorship.confirmed / .rejected / .restored are
--     readable actions; the cached counter columns on creators and brands write no audit lines; a contact person's email,
--     phone, LinkedIn link and notes are stored as {"changed": true}, never as values (like a creator's email and phone).
--
-- SAFE ON THE LIVE DATABASE: two views and two functions are replaced or created, three triggers are added. No row is
-- changed. Old audit lines stay as they are (the log is append-only).
-- ROLL BACK (manual): drop view brand_summaries; recreate creator_summaries as in 20261123000300; recreate log_audit as
--   in 20261123000400 and audit_row as in 20261123000200; drop the triggers trg_audit on brand_contacts, sponsorships, lists.
set search_path = public, extensions;

-- ---------------------------------------------------------------- creator_summaries
create or replace view public.creator_summaries with (security_invoker = true) as
select c.id, c.full_name, c.email, c.phone, c.channel_url, c.youtube_channel_id, c.channel_name, c.niche,
       c.subscribers, c.subscribers_hidden, c.subscribers_checked_at, c.status, c.notes,
       c.user_id, c.created_by, c.created_at, c.updated_at,
       coalesce(d.deal_count, 0)::integer          as deal_count,
       coalesce(d.earned, 0)::bigint               as total_earned_cents,
       greatest(c.last_contacted_at, e.last_sent)  as last_contacted_at,
       -- appended in 20261125000400
       c.niche_slug, c.language, c.country, c.avg_views, c.avg_views_checked_at, c.last_video_at,
       c.uploads_per_month, c.engagement_rate, c.audience_countries,
       c.sponsorship_count, c.last_sponsorship_at, c.detected_sponsorship_count, c.last_detected_sponsorship_at
  from public.creators c
  left join lateral (select count(*) as deal_count,
                            sum(coalesce(x.amount_cents, 0) - x.commission_cents) filter (where x.stage = 'paid') as earned
                       from public.deals x where x.creator_id = c.id) d on true
  left join lateral (select max(m.sent_at) as last_sent
                       from public.emails m
                      where m.creator_id = c.id and m.status in ('sent', 'replied') and not m.is_test) e on true;

-- ---------------------------------------------------------------- brand_summaries
create or replace view public.brand_summaries with (security_invoker = true) as
select b.id, b.name, b.website, b.notes, b.created_at, b.relationship, b.industry, b.country, b.company_size,
       b.target_niches, b.target_min_subs, b.target_max_subs, b.budget_min_cents, b.budget_max_cents,
       b.last_contacted_at, b.updated_at,
       b.sponsorship_count, b.last_sponsorship_at, b.detected_sponsorship_count, b.last_detected_sponsorship_at,
       coalesce(k.contact_count, 0)::integer   as contact_count,
       coalesce(d.deal_count, 0)::integer      as deal_count,
       coalesce(d.open_deal_count, 0)::integer as open_deal_count
  from public.brands b
  left join lateral (select count(*) as contact_count from public.brand_contacts x where x.brand_id = b.id) k on true
  left join lateral (select count(*) as deal_count,
                            count(*) filter (where x.stage not in ('completed', 'paid')) as open_deal_count
                       from public.deals x where x.brand_id = b.id) d on true;
revoke all on public.brand_summaries from public, anon, authenticated, service_role;
grant select on public.brand_summaries to authenticated, service_role;
revoke all on public.creator_summaries from public, anon;
grant select on public.creator_summaries to authenticated, service_role;

-- ---------------------------------------------------------------- log_audit
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
  if octet_length(coalesce(details, '{}'::jsonb)::text) > 8192 then
    raise exception 'audit details too large' using errcode = 'check_violation';
  end if;
  insert into public.audit_log (actor_id, action, entity_type, entity_id, details)
  values (coalesce(auth.uid(), p_actor), action, left(entity_type, 100), left(entity_id, 100),
          coalesce(details, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------- audit_row
-- Same as 20261123000200, plus: counters skipped, personal fields of brand_contact hidden, the new entities.
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
                                                 'is_test', v_rec -> 'is_test', 'status', v_rec -> 'status');
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

drop trigger if exists trg_audit on public.brand_contacts;
create trigger trg_audit after insert or update or delete on public.brand_contacts for each row execute function public.audit_row('brand_contact');
drop trigger if exists trg_audit on public.sponsorships;
create trigger trg_audit after insert or update or delete on public.sponsorships   for each row execute function public.audit_row('sponsorship');
drop trigger if exists trg_audit on public.lists;
create trigger trg_audit after insert or update or delete on public.lists          for each row execute function public.audit_row('list');

notify pgrst, 'reload schema';
commit;

-- ===================================================================== 20261125000500_creators_list.sql
begin;
-- Back-office upgrade, Creators list (Creators list agent): the rows and the facet counts of the list, in the database.
--   * creator_contacted_at(): the last contact of a creator (the same value creator_summaries shows).
--   * like_pattern(), contacted_matches(): small helpers for the search box and the "last contacted" filter.
--   * creators_match_ids(filters): ids of the creators that match every filter (used by the list and the CSV export).
--   * creators_list(filters, sort, page): one page of rows plus the total. It never returns the email address.
--   * creators_facets(filters): how many creators each option would give "with the other filters as they are".
--   * creators_export(filters): the rows of the CSV export (owner only, checked by the API route; RLS still applies).
--   * creators_add_to_list(list, ids), creators_add_tag(tag, ids): bulk actions on up to 200 creators.
-- The four big functions set jit = off: the planner overestimates their cost (many OR-ed conditions) and would spend
-- 200 ms compiling code for a 5 ms query.
-- All functions are SECURITY INVOKER with a fixed search_path, so row level security applies to every table they read.
-- They take typed arguments, never text that is run as SQL. Granted to authenticated only; anon has no access.
--
-- SAFE ON THE LIVE DATABASE: only new functions. No table, column or row changes. Every statement can run twice.
-- ROLL BACK (manual): drop function public.creators_match_ids, creators_list, creators_facets, creators_export,
--   creators_add_to_list, creators_add_tag, creator_contacted_at, like_pattern, contacted_matches (with their argument lists).
set search_path = public, extensions;

-- ---------------------------------------------------------------- helpers
create or replace function public.like_pattern(p_text text) returns text
-- Pure text function that touches no table, so it needs no search_path (and can then be inlined by the planner).
language sql immutable as $$
  select case when nullif(btrim(p_text), '') is null then null
              else '%' || replace(replace(replace(left(btrim(p_text), 100), '\', '\\'), '%', '\%'), '_', '\_') || '%' end
$$;

-- Same rule as creator_summaries.last_contacted_at: the later of the stored date and the last real (not test) send.
create or replace function public.creator_contacted_at(p_id uuid, p_stored timestamptz) returns timestamptz
language sql stable security invoker set search_path = public, pg_temp as $$
  select greatest(p_stored, (select max(m.sent_at) from public.emails m
                              where m.creator_id = p_id and m.status in ('sent', 'replied') and not m.is_test))
$$;

create or replace function public.contacted_matches(p_bucket text, p_at timestamptz) returns boolean
language sql stable set search_path = public, pg_temp as $$
  select case p_bucket
           when 'never'  then p_at is null
           when 'in30'   then p_at >= now() - interval '30 days'
           when 'over30' then p_at < now() - interval '30 days'
           when 'over90' then p_at < now() - interval '90 days'
           else true end
$$;

-- ---------------------------------------------------------------- ids of the matching creators
-- Index use (with enough rows the planner picks these; with a few hundred it may prefer a plain scan, which is as fast):
--   q           creators_full_name_trgm, creators_email_trgm, creators_channel_name_trgm (trigram, ILIKE)
--   subs        creators_subscribers_idx            views     creators_avg_views_idx
--   sponsored   creators_has_spons_idx, creators_has_detected_idx (partial, count > 0)
--   recent      creators_last_spons_idx, creators_last_detected_idx
--   by          sponsorships_brand_idx (brand_id, sponsored_on) and sponsorships_creator_idx
--   niche       creators_niche_slug_idx     lang  creators_language_idx     country  creators_country_idx
--   status      creators_status_idx         contacted  emails_creator_idx (the last send) and creators_last_contacted_idx
--   tag         creator_tags primary key and creator_tags_tag_idx          list  list_items_creator_idx and list_items_creator_once
create or replace function public.creators_match_ids(
  p_q text default null, p_subs_min bigint default null, p_subs_max bigint default null,
  p_sponsored text default null, p_detected boolean default false, p_recent integer default null,
  p_by uuid[] default null, p_niche text[] default null, p_status text[] default null,
  p_contacted text default null, p_views integer default null, p_lang text[] default null,
  p_country text[] default null, p_email boolean default false, p_tag uuid[] default null, p_list uuid[] default null
) returns setof uuid
language sql stable security invoker set search_path = public, extensions, pg_temp set jit = off as $$
  -- a: values derived from the arguments, worked out once (not once per row)
  with a as (select public.like_pattern(p_q) as pat, p_status::public.creator_status[] as st)
  select c.id
    from public.creators c cross join a
   where
     (a.pat is null or c.full_name ilike a.pat or c.email::text ilike a.pat or c.channel_name ilike a.pat)
     and ((p_subs_min is null or c.subscribers >= p_subs_min) and (p_subs_max is null or c.subscribers <= p_subs_max))
     and (p_sponsored is null or p_sponsored not in ('yes', 'no') or ((c.sponsorship_count > 0 or (coalesce(p_detected, false) and c.detected_sponsorship_count > 0)) = (p_sponsored = 'yes')))
     and (p_recent is null or c.last_sponsorship_at >= current_date - p_recent or (coalesce(p_detected, false) and c.last_detected_sponsorship_at >= current_date - p_recent))
     and (coalesce(cardinality(p_by), 0) = 0 or exists (select 1 from public.sponsorships s where s.creator_id = c.id and s.brand_id = any (p_by) and not s.rejected and (s.source_label = 'confirmed' or coalesce(p_detected, false))))
     and (coalesce(cardinality(p_niche), 0) = 0 or c.niche_slug = any (p_niche))
     and (coalesce(cardinality(p_status), 0) = 0 or c.status = any (a.st))
     and (p_contacted is null or public.contacted_matches(p_contacted, public.creator_contacted_at(c.id, c.last_contacted_at)))
     and (p_views is null or c.avg_views >= p_views)
     and (coalesce(cardinality(p_lang), 0) = 0 or c.language = any (p_lang))
     and (coalesce(cardinality(p_country), 0) = 0 or c.country = any (p_country))
     and (not coalesce(p_email, false) or c.email <> '')
     and (coalesce(cardinality(p_tag), 0) = 0 or exists (select 1 from public.creator_tags t where t.creator_id = c.id and t.tag_id = any (p_tag)))
     and (coalesce(cardinality(p_list), 0) = 0 or exists (select 1 from public.list_items li where li.creator_id = c.id and li.list_id = any (p_list)))
$$;

-- ---------------------------------------------------------------- one page of rows
create or replace function public.creators_list(
  p_q text default null, p_subs_min bigint default null, p_subs_max bigint default null,
  p_sponsored text default null, p_detected boolean default false, p_recent integer default null,
  p_by uuid[] default null, p_niche text[] default null, p_status text[] default null,
  p_contacted text default null, p_views integer default null, p_lang text[] default null,
  p_country text[] default null, p_email boolean default false, p_tag uuid[] default null, p_list uuid[] default null,
  p_sort text default 'subscribers', p_dir text default 'desc', p_limit integer default 25, p_offset integer default 0
) returns table (
  id uuid, full_name text, channel_name text, niche_slug text, country text, language text, subscribers integer,
  subscribers_hidden boolean, avg_views integer, status text, last_contacted_at timestamptz, created_at timestamptz,
  sponsorship_count integer, last_sponsorship_at date, detected_sponsorship_count integer, last_detected_sponsorship_at date,
  has_email boolean, total bigint
)
language sql stable security invoker set search_path = public, extensions, pg_temp set jit = off as $$
  -- The last contact needs a look at the emails: it is worked out for the rows of the page only (for all rows only when sorting by it).
  with m as (select x as id from public.creators_match_ids(p_q, p_subs_min, p_subs_max, p_sponsored, p_detected, p_recent, p_by, p_niche, p_status, p_contacted, p_views, p_lang, p_country, p_email, p_tag, p_list) x),
  r as (
    select c.id, c.full_name, c.channel_name, c.niche_slug, c.country, c.language, c.subscribers, c.subscribers_hidden,
           c.avg_views, c.status::text as status, c.last_contacted_at as stored_contact,
           case when p_sort = 'last_contacted' then public.creator_contacted_at(c.id, c.last_contacted_at) end as sort_contact,
           c.created_at, c.sponsorship_count, c.last_sponsorship_at, c.detected_sponsorship_count, c.last_detected_sponsorship_at,
           (c.email <> '') as has_email,
           case when coalesce(p_detected, false) then greatest(c.last_sponsorship_at, c.last_detected_sponsorship_at)
                else c.last_sponsorship_at end as sp_at
      from public.creators c join m on m.id = c.id
  ),
  pg as (
    select r.*, count(*) over () as total
      from r
     order by
     case when p_sort = 'subscribers' and p_dir = 'asc'  then r.subscribers end asc  nulls last,
     case when p_sort = 'subscribers' and p_dir <> 'asc' then r.subscribers end desc nulls last,
     case when p_sort = 'sponsored' and p_dir = 'asc'  then r.sp_at end asc  nulls last,
     case when p_sort = 'sponsored' and p_dir <> 'asc' then r.sp_at end desc nulls last,
     case when p_sort = 'last_contacted' and p_dir = 'asc'  then r.sort_contact end asc  nulls last,
     case when p_sort = 'last_contacted' and p_dir <> 'asc' then r.sort_contact end desc nulls last,
     case when p_sort = 'added' and p_dir = 'asc'  then r.created_at end asc  nulls last,
     case when p_sort = 'added' and p_dir <> 'asc' then r.created_at end desc nulls last,
     case when p_sort = 'name' and p_dir <> 'desc' then r.full_name end asc,
     case when p_sort = 'name' and p_dir = 'desc' then r.full_name end desc,
     -- "match" (best match for a sponsor) is added by the Matching agent; until then it falls back to subscribers
     case when p_sort not in ('sponsored', 'last_contacted', 'added', 'name') and p_sort <> 'subscribers' then r.subscribers end desc nulls last,
     r.full_name asc, r.id asc
     limit greatest(1, least(coalesce(p_limit, 25), 100)) offset greatest(0, coalesce(p_offset, 0))
  )
  select pg.id, pg.full_name, pg.channel_name, pg.niche_slug, pg.country, pg.language, pg.subscribers, pg.subscribers_hidden,
         pg.avg_views, pg.status, public.creator_contacted_at(pg.id, pg.stored_contact) as last_contacted_at, pg.created_at,
         pg.sponsorship_count, pg.last_sponsorship_at, pg.detected_sponsorship_count, pg.last_detected_sponsorship_at,
         pg.has_email, pg.total
    from pg
   order by
     case when p_sort = 'subscribers' and p_dir = 'asc'  then pg.subscribers end asc  nulls last,
     case when p_sort = 'subscribers' and p_dir <> 'asc' then pg.subscribers end desc nulls last,
     case when p_sort = 'sponsored' and p_dir = 'asc'  then pg.sp_at end asc  nulls last,
     case when p_sort = 'sponsored' and p_dir <> 'asc' then pg.sp_at end desc nulls last,
     case when p_sort = 'last_contacted' and p_dir = 'asc'  then pg.sort_contact end asc  nulls last,
     case when p_sort = 'last_contacted' and p_dir <> 'asc' then pg.sort_contact end desc nulls last,
     case when p_sort = 'added' and p_dir = 'asc'  then pg.created_at end asc  nulls last,
     case when p_sort = 'added' and p_dir <> 'asc' then pg.created_at end desc nulls last,
     case when p_sort = 'name' and p_dir <> 'desc' then pg.full_name end asc,
     case when p_sort = 'name' and p_dir = 'desc' then pg.full_name end desc,
     -- "match" (best match for a sponsor) is added by the Matching agent; until then it falls back to subscribers
     case when p_sort not in ('sponsored', 'last_contacted', 'added', 'name') and p_sort <> 'subscribers' then pg.subscribers end desc nulls last,
     pg.full_name asc, pg.id asc
$$;

-- ---------------------------------------------------------------- facet counts
-- One pass over the creators. Each creator gets the list of filters it FAILS; an option of filter K counts the creators
-- that fail nothing, or fail only K. That is "the result with the other filters as they are".
-- Rows: facet '_total' (matches everything), '_all' (every creator), then one row per option: niche, status, sponsored
-- (yes, no), recent (30, 90, 180), by (sponsor id), contacted, views, lang, country, email (1), tag (tag id), list (list id).
-- Options that no creator has still come back with 0 (every niche, every status, every tag and list, every sponsor with a record).
create or replace function public.creators_facets(
  p_q text default null, p_subs_min bigint default null, p_subs_max bigint default null,
  p_sponsored text default null, p_detected boolean default false, p_recent integer default null,
  p_by uuid[] default null, p_niche text[] default null, p_status text[] default null,
  p_contacted text default null, p_views integer default null, p_lang text[] default null,
  p_country text[] default null, p_email boolean default false, p_tag uuid[] default null, p_list uuid[] default null
) returns table (facet text, value text, n bigint)
language sql stable security invoker set search_path = public, extensions, pg_temp set jit = off as $$
  with a as (select public.like_pattern(p_q) as pat, p_status::public.creator_status[] as st),
  b as (
    select c.id, c.niche_slug, c.status::text as status, c.language, c.country, c.avg_views, (c.email <> '') as has_email,
           c.sponsorship_count, c.detected_sponsorship_count, c.last_sponsorship_at, c.last_detected_sponsorship_at, x.lc,
           array_remove(array[
        case when not coalesce((a.pat is null or c.full_name ilike a.pat or c.email::text ilike a.pat or c.channel_name ilike a.pat), false) then 'q' end,
        case when not coalesce(((p_subs_min is null or c.subscribers >= p_subs_min) and (p_subs_max is null or c.subscribers <= p_subs_max)), false) then 'subs' end,
        case when not coalesce((p_sponsored is null or p_sponsored not in ('yes', 'no') or ((c.sponsorship_count > 0 or (coalesce(p_detected, false) and c.detected_sponsorship_count > 0)) = (p_sponsored = 'yes'))), false) then 'sponsored' end,
        case when not coalesce((p_recent is null or c.last_sponsorship_at >= current_date - p_recent or (coalesce(p_detected, false) and c.last_detected_sponsorship_at >= current_date - p_recent)), false) then 'recent' end,
        case when not coalesce((coalesce(cardinality(p_by), 0) = 0 or exists (select 1 from public.sponsorships s where s.creator_id = c.id and s.brand_id = any (p_by) and not s.rejected and (s.source_label = 'confirmed' or coalesce(p_detected, false)))), false) then 'by' end,
        case when not coalesce((coalesce(cardinality(p_niche), 0) = 0 or c.niche_slug = any (p_niche)), false) then 'niche' end,
        case when not coalesce((coalesce(cardinality(p_status), 0) = 0 or c.status = any (a.st)), false) then 'status' end,
        case when not coalesce((p_contacted is null or public.contacted_matches(p_contacted, lc)), false) then 'contacted' end,
        case when not coalesce((p_views is null or c.avg_views >= p_views), false) then 'views' end,
        case when not coalesce((coalesce(cardinality(p_lang), 0) = 0 or c.language = any (p_lang)), false) then 'lang' end,
        case when not coalesce((coalesce(cardinality(p_country), 0) = 0 or c.country = any (p_country)), false) then 'country' end,
        case when not coalesce((not coalesce(p_email, false) or c.email <> ''), false) then 'email' end,
        case when not coalesce((coalesce(cardinality(p_tag), 0) = 0 or exists (select 1 from public.creator_tags t where t.creator_id = c.id and t.tag_id = any (p_tag))), false) then 'tag' end,
        case when not coalesce((coalesce(cardinality(p_list), 0) = 0 or exists (select 1 from public.list_items li where li.creator_id = c.id and li.list_id = any (p_list))), false) then 'list' end
           ], null) as failed
      from public.creators c cross join a
      left join (select m.creator_id, max(m.sent_at) as last_sent from public.emails m
                  where m.status in ('sent', 'replied') and not m.is_test group by m.creator_id) e on e.creator_id = c.id
     cross join lateral (select greatest(c.last_contacted_at, e.last_sent) as lc) x
  )
  select '_total', 'all', count(*) filter (where b.failed = '{}') from b
  union all select '_all', 'all', count(*) from b
  union all
  select 'niche', n.slug, count(b.id)
    from public.niches n left join b on b.niche_slug = n.slug and b.failed <@ array['niche'] group by n.slug
  union all
  select 'status', s.v, count(b.id)
    from (select unnest(enum_range(null::public.creator_status))::text as v) s
    left join b on b.status = s.v and b.failed <@ array['status'] group by s.v
  union all
  select 'sponsored', o.v, count(b.id)
    from (values ('yes'), ('no')) o(v)
    left join b on b.failed <@ array['sponsored']
               and ((b.sponsorship_count > 0 or (coalesce(p_detected, false) and b.detected_sponsorship_count > 0)) = (o.v = 'yes'))
   group by o.v
  union all
  select 'recent', o.v::text, count(b.id)
    from (values (30), (90), (180)) o(v)
    left join b on b.failed <@ array['recent']
               and (b.last_sponsorship_at >= current_date - o.v or (coalesce(p_detected, false) and b.last_detected_sponsorship_at >= current_date - o.v))
   group by o.v
  union all
  select 'by', s.brand_id::text,
         count(distinct s.creator_id) filter (where b.failed <@ array['by'] and (s.source_label = 'confirmed' or coalesce(p_detected, false)))
    from public.sponsorships s join b on b.id = s.creator_id
   where s.brand_id is not null and not s.rejected
   group by s.brand_id
  union all
  select 'contacted', o.v, count(b.id)
    from (values ('never'), ('in30'), ('over30'), ('over90')) o(v)
    left join b on b.failed <@ array['contacted'] and public.contacted_matches(o.v, b.lc)
   group by o.v
  union all
  select 'views', o.v::text, count(b.id)
    from (values (1000), (5000), (10000), (25000)) o(v)
    left join b on b.failed <@ array['views'] and b.avg_views >= o.v
   group by o.v
  union all
  select 'lang', b.language, count(*) filter (where b.failed <@ array['lang']) from b where b.language is not null group by b.language
  union all
  select 'country', b.country, count(*) filter (where b.failed <@ array['country']) from b where b.country is not null group by b.country
  union all
  select 'email', '1', count(*) filter (where b.failed <@ array['email'] and b.has_email) from b
  union all
  select 'tag', t.id::text, count(b.id)
    from public.tags t
    left join public.creator_tags ct on ct.tag_id = t.id
    left join b on b.id = ct.creator_id and b.failed <@ array['tag']
   where t.scope = 'creator' group by t.id
  union all
  select 'list', l.id::text, count(b.id)
    from public.lists l
    left join public.list_items li on li.list_id = l.id and li.creator_id is not null
    left join b on b.id = li.creator_id and b.failed <@ array['list']
   where l.kind = 'creators' group by l.id
$$;

-- ---------------------------------------------------------------- rows of the CSV export
-- Contains the email address and phone: only the export route (owner only, audit line first) calls it.
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
language sql stable security invoker set search_path = public, extensions, pg_temp set jit = off as $$
  select c.full_name, c.email::text, c.phone, c.channel_url, c.niche, c.niche_slug, c.country, c.language,
         c.subscribers, c.avg_views, c.status::text, c.notes
    from public.creators c
   where c.id in (select public.creators_match_ids(p_q, p_subs_min, p_subs_max, p_sponsored, p_detected, p_recent, p_by, p_niche, p_status, p_contacted, p_views, p_lang, p_country, p_email, p_tag, p_list))
   order by c.full_name, c.id
   limit greatest(1, least(coalesce(p_limit, 1000), 1000)) offset greatest(0, coalesce(p_offset, 0))
$$;

-- ---------------------------------------------------------------- bulk actions (up to 200 creators)
create or replace function public.creators_add_to_list(p_list uuid, p_ids uuid[]) returns integer
language plpgsql security invoker set search_path = public, extensions, pg_temp as $$
declare v_n integer;
begin
  if coalesce(cardinality(p_ids), 0) = 0 or cardinality(p_ids) > 200 then
    raise exception 'between 1 and 200 creators' using errcode = 'invalid_parameter_value';
  end if;
  insert into public.list_items (list_id, creator_id)
    select p_list, c.id from public.creators c where c.id = any (p_ids)
    on conflict (list_id, creator_id) where creator_id is not null do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

create or replace function public.creators_add_tag(p_tag uuid, p_ids uuid[]) returns integer
language plpgsql security invoker set search_path = public, extensions, pg_temp as $$
declare v_n integer;
begin
  if coalesce(cardinality(p_ids), 0) = 0 or cardinality(p_ids) > 200 then
    raise exception 'between 1 and 200 creators' using errcode = 'invalid_parameter_value';
  end if;
  insert into public.creator_tags (creator_id, tag_id)
    select c.id, p_tag from public.creators c where c.id = any (p_ids)
    on conflict (creator_id, tag_id) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- ---------------------------------------------------------------- grants: authenticated only, never anon
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public'
              and p.proname in ('like_pattern', 'creator_contacted_at', 'contacted_matches', 'creators_match_ids', 'creators_list',
                                'creators_facets', 'creators_export', 'creators_add_to_list', 'creators_add_tag')
  loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
commit;

-- ===================================================================== 20261125000700_sponsors.sql
begin;
-- Sponsors list (Sponsors agent): the filtered, sorted list of sponsors (the brands table), the count beside every filter
-- option, and the export rows, all worked out in the database so the page never builds SQL from text.
--   * sponsor_args(jsonb): reads the filter object (already validated by the app) into typed values; anything
--     odd is ignored, never cast blindly.
--   * sponsor_rows(jsonb, skip): the sponsors that pass every filter (except the one named in skip).
--   * sponsors_list, sponsors_count, sponsor_facets (counts per option), sponsors_export.
--   All are SECURITY INVOKER (the caller's RLS applies), have a fixed search_path and are granted to
--   authenticated only (never anon).
-- "Currently active" = a sponsorship in the last 90 days. Counts use confirmed records only (the cached columns of
-- brands) unless the filter object says detected = true; then confirmed and detected records count, not rejected ones.
-- SAFE ON THE LIVE DATABASE: only new functions; no table, column or row changes. Every statement can run twice.
-- ROLL BACK (manual): drop function sponsors_export, sponsor_facets, sponsors_count, sponsors_list, sponsor_rows,
--   sponsor_args, sponsor_uuid_array, sponsor_text_array (all in schema public).
set search_path = public, extensions;

-- ---------------------------------------------------------------- argument helpers
create or replace function public.sponsor_text_array(j jsonb) returns text[]
language sql immutable security invoker set search_path = public, extensions as $$
  select nullif(case when jsonb_typeof(j) = 'array' and jsonb_array_length(j) between 1 and 100
              then array(select left(x, 200) from jsonb_array_elements_text(j) x where x <> '') end, '{}')
$$;

create or replace function public.sponsor_uuid_array(j jsonb) returns uuid[]
language sql immutable security invoker set search_path = public, extensions as $$
  select nullif(case when jsonb_typeof(j) = 'array' and jsonb_array_length(j) between 1 and 100
              then array(select x::uuid from jsonb_array_elements_text(j) x
                          where x ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') end, '{}')
$$;

create or replace function public.sponsor_args(p jsonb)
returns table (q text, industry text[], niches text[], t_lo bigint, t_hi bigint, b_lo bigint, b_hi bigint,
               active text, detected boolean, cnt integer, last_days integer,
               rel text[], size text[], country text[], contact boolean, tag uuid[])
language sql immutable security invoker set search_path = public, extensions as $$
  select nullif(btrim(left(p ->> 'q', 100)), ''),
         public.sponsor_text_array(p -> 'industry'),
         public.sponsor_text_array(p -> 'niches'),
         case when p ->> 'target_min' ~ '^[0-9]{1,10}$' then (p ->> 'target_min')::bigint end,
         case when p ->> 'target_max' ~ '^[0-9]{1,10}$' then (p ->> 'target_max')::bigint end,
         -- budgets arrive in dollars; the table stores cents
         case when p ->> 'budget_min' ~ '^[0-9]{1,10}$' then (p ->> 'budget_min')::bigint * 100 end,
         case when p ->> 'budget_max' ~ '^[0-9]{1,10}$' then (p ->> 'budget_max')::bigint * 100 end,
         case when p ->> 'active' in ('yes', 'no') then p ->> 'active' end,
         coalesce(p ->> 'detected' = 'true', false),
         case when p ->> 'count' ~ '^[0-9]{1,4}$' then (p ->> 'count')::integer end,
         case when p ->> 'last' ~ '^[0-9]{1,4}$' then (p ->> 'last')::integer end,
         public.sponsor_text_array(p -> 'rel'),
         public.sponsor_text_array(p -> 'size'),
         public.sponsor_text_array(p -> 'country'),
         coalesce(p ->> 'contact' = 'true', false),
         public.sponsor_uuid_array(p -> 'tag')
$$;

-- ---------------------------------------------------------------- the rows that pass the filters
create or replace function public.sponsor_rows(p jsonb, p_skip text default null)
returns table (
  id uuid, name text, website text, industry text, country text, company_size text, relationship text,
  target_niches text[], target_min_subs integer, target_max_subs integer, budget_min_cents bigint, budget_max_cents bigint,
  last_contacted_at timestamptz, sponsorship_count integer, detected_sponsorship_count integer,
  last_sponsorship_at date, last_detected_sponsorship_at date, contact_count integer, deal_count integer,
  tag_ids uuid[], tag_names text[], eff_count integer, eff_last date)
language sql stable security invoker set search_path = public, extensions as $$
  with a as (select s.*, coalesce(p_skip, '') as skip from public.sponsor_args(p) s)
  select b.id, b.name::text, b.website, b.industry, b.country, b.company_size, b.relationship,
         coalesce(b.target_niches, '{}'), b.target_min_subs, b.target_max_subs, b.budget_min_cents, b.budget_max_cents,
         b.last_contacted_at, b.sponsorship_count, b.detected_sponsorship_count,
         b.last_sponsorship_at, b.last_detected_sponsorship_at, b.contact_count, b.deal_count,
         coalesce(tg.ids, '{}'), coalesce(tg.names, '{}'), e.eff_count, e.eff_last
    from public.brand_summaries b
   cross join a
   cross join lateral (select array_agg(t.id order by t.name) as ids, array_agg(t.name::text order by t.name) as names
                         from public.brand_tags bt join public.tags t on t.id = bt.tag_id where bt.brand_id = b.id) tg
   cross join lateral (
     select case when a.detected then coalesce(x.n, 0)::integer else b.sponsorship_count end as eff_count,
            case when a.detected then x.last_on else b.last_sponsorship_at end as eff_last
       from (select count(distinct s.creator_id) as n, max(s.sponsored_on) as last_on
               from public.sponsorships s where a.detected and s.brand_id = b.id and not s.rejected) x) e
   where (a.skip = 'q' or a.q is null
          or b.name::text ilike '%' || replace(replace(replace(a.q, '\', '\\'), '%', '\%'), '_', '\_') || '%'
          or b.industry   ilike '%' || replace(replace(replace(a.q, '\', '\\'), '%', '\%'), '_', '\_') || '%'
          or b.website    ilike '%' || replace(replace(replace(a.q, '\', '\\'), '%', '\%'), '_', '\_') || '%')
     and (a.skip = 'industry' or a.industry is null or b.industry = any (a.industry))
     and (a.skip = 'niches' or a.niches is null or coalesce(b.target_niches, '{}') && a.niches)
     -- a range matches when it overlaps the wanted one; a missing end is open; a sponsor with no range never matches
     and (a.skip = 'target' or (a.t_lo is null and a.t_hi is null)
          or ((b.target_min_subs is not null or b.target_max_subs is not null)
              and coalesce(b.target_max_subs, 2147483647) >= coalesce(a.t_lo, 0)
              and coalesce(b.target_min_subs, 0) <= coalesce(a.t_hi, 9999999999)))
     and (a.skip = 'budget' or (a.b_lo is null and a.b_hi is null)
          or ((b.budget_min_cents is not null or b.budget_max_cents is not null)
              and coalesce(b.budget_max_cents, 9223372036854775807) >= coalesce(a.b_lo, 0)
              and coalesce(b.budget_min_cents, 0) <= coalesce(a.b_hi, 9223372036854775807)))
     and (a.skip = 'active' or a.active is null
          or ((e.eff_last >= current_date - 90) is true) = (a.active = 'yes'))
     and (a.skip = 'count' or a.cnt is null or e.eff_count >= a.cnt)
     and (a.skip = 'last' or a.last_days is null or e.eff_last >= current_date - a.last_days)
     and (a.skip = 'rel' or a.rel is null or b.relationship = any (a.rel))
     and (a.skip = 'size' or a.size is null or b.company_size = any (a.size))
     and (a.skip = 'country' or a.country is null or b.country = any (a.country))
     and (a.skip = 'contact' or not a.contact or b.contact_count > 0)
     and (a.skip = 'tag' or a.tag is null or coalesce(tg.ids, '{}') && a.tag)
$$;

create or replace function public.sponsors_count(p jsonb) returns bigint
language sql stable security invoker set search_path = public, extensions as $$
  select count(*) from public.sponsor_rows(p, null)
$$;

-- One page of sponsors. p_sort: name | count | last | budget | match. p_dir: asc | desc (default: name asc, others desc).
-- p_for is the creator for "Best match" (sort = match). The Matching agent replaces this function with a scoring
-- version of the same signature; until then match sorts by name.
create or replace function public.sponsors_list(p jsonb, p_sort text default 'name', p_dir text default null,
                                                p_for uuid default null, p_limit integer default 25, p_offset integer default 0)
returns table (
  id uuid, name text, website text, industry text, country text, company_size text, relationship text,
  target_niches text[], target_min_subs integer, target_max_subs integer, budget_min_cents bigint, budget_max_cents bigint,
  last_contacted_at timestamptz, sponsorship_count integer, detected_sponsorship_count integer,
  last_sponsorship_at date, last_detected_sponsorship_at date, contact_count integer, deal_count integer,
  tag_ids uuid[], tag_names text[], eff_count integer, eff_last date, total bigint)
language sql stable security invoker set search_path = public, extensions as $$
  with o as (
    select case when p_sort in ('name', 'count', 'last', 'budget', 'match') then p_sort else 'name' end as s,
           case when p_dir in ('asc', 'desc') then p_dir
                when p_sort in ('count', 'last', 'budget') then 'desc' else 'asc' end as d)
  select r.*, count(*) over () as total
    from public.sponsor_rows(p, null) r cross join o
   order by
     case when o.s = 'count'  and o.d = 'desc' then r.eff_count end desc nulls last,
     case when o.s = 'count'  and o.d = 'asc'  then r.eff_count end asc nulls last,
     case when o.s = 'last'   and o.d = 'desc' then r.eff_last end desc nulls last,
     case when o.s = 'last'   and o.d = 'asc'  then r.eff_last end asc nulls last,
     case when o.s = 'budget' and o.d = 'desc' then coalesce(r.budget_max_cents, r.budget_min_cents) end desc nulls last,
     case when o.s = 'budget' and o.d = 'asc'  then coalesce(r.budget_max_cents, r.budget_min_cents) end asc nulls last,
     case when o.s in ('name', 'match') and o.d = 'desc' then r.name end desc,
     r.name asc, r.id
   limit greatest(least(coalesce(p_limit, 25), 1000), 0)
  offset greatest(coalesce(p_offset, 0), 0)
$$;

-- ---------------------------------------------------------------- counts beside every option
-- One row per (facet, option value): how many sponsors the option would give with every OTHER filter as it is now.
-- Options that exist in the data but give 0 are returned too (the page dims them). Values: industry and country as
-- stored, niches / rel / size as the slug, tag as the tag id, target and budget as the band "min-max" (dollars for
-- budget), active yes|no, count 1|3|5, last 30|90|180, contact 1.
create or replace function public.sponsor_facets(p jsonb)
returns table (facet text, value text, n bigint)
language sql stable security invoker set search_path = public, extensions as $$
  select 'industry', u.v, count(r.id)
    from (select distinct x.industry as v from public.brands x where x.industry is not null) u
    left join public.sponsor_rows(p, 'industry') r on r.industry = u.v group by u.v
  union all
  select 'niches', nn.slug, count(r.id)
    from public.niches nn left join public.sponsor_rows(p, 'niches') r on nn.slug = any (r.target_niches) group by nn.slug
  union all
  select 'target', band.v, count(r.id)
    from (values ('1000-10000', 1000::bigint, 10000::bigint), ('10000-50000', 10000, 50000),
                 ('50000-100000', 50000, 100000), ('100000-', 100000, null)) band (v, lo, hi)
    left join public.sponsor_rows(p, 'target') r
      on (r.target_min_subs is not null or r.target_max_subs is not null)
     and coalesce(r.target_max_subs, 2147483647) >= band.lo
     and (band.hi is null or coalesce(r.target_min_subs, 0) <= band.hi)
   group by band.v
  union all
  select 'budget', band.v, count(r.id)
    from (values ('0-250', 0::bigint, 250::bigint), ('250-1000', 250, 1000), ('1000-5000', 1000, 5000), ('5000-', 5000, null)) band (v, lo, hi)
    left join public.sponsor_rows(p, 'budget') r
      on (r.budget_min_cents is not null or r.budget_max_cents is not null)
     and coalesce(r.budget_max_cents, 9223372036854775807) >= band.lo * 100
     and (band.hi is null or coalesce(r.budget_min_cents, 0) <= band.hi * 100)
   group by band.v
  union all
  select 'active', v.v, count(r.id)
    from (values ('yes'), ('no')) v (v)
    left join public.sponsor_rows(p, 'active') r on ((r.eff_last >= current_date - 90) is true) = (v.v = 'yes') group by v.v
  union all
  select 'count', v.v, count(r.id)
    from (values ('1'), ('3'), ('5')) v (v)
    left join public.sponsor_rows(p, 'count') r on r.eff_count >= v.v::integer group by v.v
  union all
  select 'last', v.v, count(r.id)
    from (values ('30'), ('90'), ('180')) v (v)
    left join public.sponsor_rows(p, 'last') r on r.eff_last >= current_date - v.v::integer group by v.v
  union all
  select 'rel', v.v, count(r.id)
    from (values ('prospect'), ('contacted'), ('talks'), ('partner'), ('past'), ('do_not_contact')) v (v)
    left join public.sponsor_rows(p, 'rel') r on r.relationship = v.v group by v.v
  union all
  select 'size', v.v, count(r.id)
    from (values ('1-10'), ('11-50'), ('51-200'), ('201-1000'), ('1000+')) v (v)
    left join public.sponsor_rows(p, 'size') r on r.company_size = v.v group by v.v
  union all
  select 'country', u.v, count(r.id)
    from (select distinct x.country as v from public.brands x where x.country is not null) u
    left join public.sponsor_rows(p, 'country') r on r.country = u.v group by u.v
  union all
  select 'contact', '1', count(*) from public.sponsor_rows(p, 'contact') r where r.contact_count > 0
  union all
  select 'tag', t.id::text, count(r.id)
    from public.tags t left join public.sponsor_rows(p, 'tag') r on t.id = any (r.tag_ids)
   where t.scope = 'brand' group by t.id
$$;

-- ---------------------------------------------------------------- export rows (same columns as the import file)
create or replace function public.sponsors_export(p jsonb, p_sort text default 'name', p_dir text default null,
                                                  p_limit integer default 1000, p_offset integer default 0)
returns table (name text, website text, industry text, country text, company_size text, niches text,
               target_min_subs integer, target_max_subs integer, budget_min numeric, budget_max numeric,
               relationship text, notes text, contact_name text, contact_role text, contact_email text,
               contact_phone text, contact_linkedin text)
language sql stable security invoker set search_path = public, extensions as $$
  select l.name, l.website, l.industry, l.country, l.company_size, array_to_string(l.target_niches, ';'),
         l.target_min_subs, l.target_max_subs, l.budget_min_cents / 100.0, l.budget_max_cents / 100.0,
         l.relationship, b.notes, c.full_name, c.role_title, c.email::text, c.phone, c.linkedin_url
    from public.sponsors_list(p, p_sort, p_dir, null, p_limit, p_offset) l
    join public.brands b on b.id = l.id
    left join lateral (select x.* from public.brand_contacts x where x.brand_id = l.id
                        order by x.is_primary desc, x.created_at, x.id limit 1) c on true
$$;

-- ---------------------------------------------------------------- who may call them
do $$
declare f text;
begin
  foreach f in array array[
    'sponsor_text_array(jsonb)', 'sponsor_uuid_array(jsonb)', 'sponsor_args(jsonb)', 'sponsor_rows(jsonb, text)',
    'sponsors_count(jsonb)', 'sponsors_list(jsonb, text, text, uuid, integer, integer)', 'sponsor_facets(jsonb)',
    'sponsors_export(jsonb, text, text, integer, integer)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;
commit;

-- ===================================================================== 20261125000800_matching.sql
begin;
-- Matching (Matching and Link agent): the match score in SQL, and the "Best match" sort of the two lists.
--   * match_short(), match_num(): small text helpers for the reasons ("12.5k", "12,500").
--   * match_pairs(creator, sponsor, ids): the score (0 to 100) for every creator/sponsor pair asked for, with one plain-English
--     reason per input, a band, and the reasons a pair is not suggested. match_for_creator() and match_for_brand() are the two
--     ways in. Weights: niche fit 40, size fit 25, the sponsor backed similar creators 20, recency 15. Missing data gives 0 points
--     and a sentence that says what is missing. Detected-only records give half the points of the similar-creators input and
--     the reason starts with "Possibly" (unconfirmed). Never suggested: creator marked do_not_contact or on the suppression
--     list, sponsor marked do_not_contact, an open deal for the pair, a confirmed sponsorship for the pair in the last 180 days.
--   * creators_list() and sponsors_list(): create or replace, same signature and same return type, bodies copied from
--     20261125000500 / 20261125000700 with one change each: the ordering by score for "Best match".
--     creators_list has no "for" argument and its signature cannot change, so the sponsor is carried in p_sort as
--     'match:<sponsor uuid>'. A plain 'match' (no sponsor) still falls back to subscribers, as before.
-- All SECURITY INVOKER (the caller's RLS applies), fixed search_path, granted to authenticated only (never anon).
-- SAFE ON THE LIVE DATABASE: only functions; no table, column or row changes. Every statement can run twice.
-- ROLL BACK (manual): re-apply 20261125000500 and 20261125000700 (they restore the two list functions), then
--   drop function match_for_brand(uuid, uuid[]), match_for_creator(uuid, uuid[]), match_pairs(uuid, uuid, uuid[]), match_num(bigint), match_short(bigint).
set search_path = public, extensions;

create or replace function public.match_short(n bigint) returns text
language sql immutable security invoker set search_path = public, pg_temp as $$
  select case when n is null then null
              when n >= 1000000 then regexp_replace(round(n / 1000000.0, 1)::text, '\.0$', '') || 'M'
              when n >= 1000 then regexp_replace(round(n / 1000.0, 1)::text, '\.0$', '') || 'k'
              else n::text end
$$;

create or replace function public.match_num(n bigint) returns text
language sql immutable security invoker set search_path = public, pg_temp as $$
  select to_char(n, 'FM999,999,999,999')
$$;

-- ---------------------------------------------------------------- the score
create or replace function public.match_pairs(p_creator uuid default null, p_brand uuid default null, p_ids uuid[] default null)
returns table (creator_id uuid, brand_id uuid, total integer, band text, reasons jsonb, blocked text, open_stage text, recent_on date, suggestable boolean)
language sql stable security invoker set search_path = public, extensions, pg_temp as $$
  with pairs as (
    select c.id as cid, c.niche_slug, c.subscribers, c.subscribers_hidden, c.status::text as cstatus, c.email,
           b.id as bid, b.name as bname, b.target_niches, b.target_min_subs, b.target_max_subs, b.relationship,
           b.last_sponsorship_at, n.name as niche_name
      from public.creators c
      join public.brands b on true
      left join public.niches n on n.slug = c.niche_slug
     where (p_creator is not null or p_brand is not null)
       and (p_creator is null or c.id = p_creator)
       and (p_brand is null or b.id = p_brand)
       and (p_ids is null or (case when p_creator is null then c.id else b.id end) = any (p_ids))
  ),
  x as (
    select p.*,
           tn.names as target_names,
           sim.conf, sim.det,
           od.stage as open_stage,
           rc.on_day as recent_on,
           exists (select 1 from public.suppression_list sl where sl.email = p.email) as opted_out
      from pairs p
      left join lateral (select string_agg(lower(n2.name), ', ' order by n2.sort_order, n2.slug) as names
                           from public.niches n2 where n2.slug = any (p.target_niches)) tn on true
      left join lateral (select count(distinct s.creator_id) filter (where s.source_label = 'confirmed') as conf,
                                count(distinct s.creator_id) filter (where s.source_label = 'detected') as det
                           from public.sponsorships s join public.creators c2 on c2.id = s.creator_id
                          where s.brand_id = p.bid and not s.rejected and p.niche_slug is not null
                            and c2.niche_slug = p.niche_slug and s.creator_id <> p.cid) sim on true
      left join lateral (select d.stage::text as stage from public.deals d
                          where d.creator_id = p.cid and d.brand_id = p.bid and d.stage not in ('completed', 'paid')
                          order by d.stage_changed_at desc limit 1) od on true
      left join lateral (select max(s.sponsored_on) as on_day from public.sponsorships s
                          where s.creator_id = p.cid and s.brand_id = p.bid and s.source_label = 'confirmed' and not s.rejected
                            and s.sponsored_on >= current_date - 180) rc on true
  ),
  y as (
    select x.*,
           coalesce(x.conf, 0) as nc, coalesce(x.det, 0) as nd,
           (x.subscribers is not null and not x.subscribers_hidden) as has_subs,
           (x.target_min_subs is not null or x.target_max_subs is not null) as has_target,
           coalesce(x.target_min_subs, 0) as lo,
           case when x.niche_slug is not null and x.niche_slug = any (x.target_niches) then 40 else 0 end as p_niche,
           case when x.last_sponsorship_at is null then 0
                when current_date - x.last_sponsorship_at <= 90 then 15
                when current_date - x.last_sponsorship_at <= 180 then 10
                when current_date - x.last_sponsorship_at <= 365 then 5 else 0 end as p_rec,
           case when x.target_min_subs is not null and x.target_max_subs is not null then public.match_short(x.target_min_subs) || ' to ' || public.match_short(x.target_max_subs)
                when x.target_min_subs is not null then public.match_short(x.target_min_subs) || ' and above'
                else 'up to ' || public.match_short(x.target_max_subs) end as target_phrase
      from x
  ),
  z as (
    select y.*,
           case when not (y.has_subs and y.has_target) then 0
                when y.subscribers >= y.lo and (y.target_max_subs is null or y.subscribers <= y.target_max_subs) then 25
                when y.subscribers >= y.lo * 0.5 and (y.target_max_subs is null or y.subscribers <= y.target_max_subs * 1.5) then 12
                else 0 end as p_size,
           case when y.niche_slug is null then 0
                when y.nc > 0 then case when y.nc >= 3 then 20 when y.nc = 2 then 14 else 8 end
                when y.nd > 0 then case when y.nd >= 3 then 10 when y.nd = 2 then 7 else 4 end
                else 0 end as p_sim
      from y
  ),
  w as (
    select z.*,
           case when z.niche_slug is null then 'This channel has no niche set, so niche fit cannot be judged.'
                when coalesce(cardinality(z.target_niches), 0) = 0 then z.bname || ' has no target niches set, so niche fit cannot be judged.'
                when z.p_niche > 0 then coalesce(z.niche_name, z.niche_slug) || ' is a niche ' || z.bname || ' targets.'
                else z.bname || ' targets ' || coalesce(z.target_names, 'other niches') || '. This channel is ' || lower(coalesce(z.niche_name, z.niche_slug)) || '.' end as t_niche,
           case when not z.has_subs then 'This channel''s subscriber count is hidden or missing, so size fit cannot be judged.'
                when not z.has_target then z.bname || ' has no target subscriber range set, so size fit cannot be judged.'
                else public.match_num(z.subscribers) || ' subscribers is ' ||
                     case z.p_size when 25 then 'inside' when 12 then 'just outside' else 'far from' end ||
                     ' the sponsor''s target of ' || z.target_phrase || '.' end as t_size,
           case when z.niche_slug is null then 'This channel has no niche set, so similar creators cannot be counted.'
                when z.nc > 0 then z.bname || ' has sponsored ' || z.nc || ' other ' || lower(coalesce(z.niche_name, z.niche_slug)) ||
                     case when z.nc = 1 then ' channel' else ' channels' end || ' (confirmed).'
                when z.nd > 0 then 'Possibly sponsored ' || z.nd || ' similar ' || case when z.nd = 1 then 'channel' else 'channels' end || ' (detected, not confirmed yet).'
                else 'No record yet of ' || z.bname || ' sponsoring other ' || lower(coalesce(z.niche_name, z.niche_slug)) || ' channels.' end as t_sim,
           case when z.last_sponsorship_at is null then 'No confirmed sponsorship by ' || z.bname || ' on record.'
                else z.bname || ' last sponsored a creator ' ||
                     case when current_date - z.last_sponsorship_at <= 0 then 'today'
                          when current_date - z.last_sponsorship_at = 1 then 'yesterday'
                          when current_date - z.last_sponsorship_at < 60 then (current_date - z.last_sponsorship_at) || ' days ago'
                          else ((current_date - z.last_sponsorship_at) / 30) || ' months ago' end || ' (confirmed).' end as t_rec
      from z
  )
  select w.cid, w.bid,
         (w.p_niche + w.p_size + w.p_sim + w.p_rec)::integer,
         case when w.p_niche + w.p_size + w.p_sim + w.p_rec >= 70 then 'Strong'
              when w.p_niche + w.p_size + w.p_sim + w.p_rec >= 40 then 'Possible' else 'Weak' end,
         jsonb_build_array(
           jsonb_build_object('points', w.p_niche, 'text', w.t_niche, 'unconfirmed', false),
           jsonb_build_object('points', w.p_size, 'text', w.t_size, 'unconfirmed', false),
           jsonb_build_object('points', w.p_sim, 'text', w.t_sim, 'unconfirmed', w.nc = 0 and w.nd > 0 and w.niche_slug is not null),
           jsonb_build_object('points', w.p_rec, 'text', w.t_rec, 'unconfirmed', false)),
         case when w.cstatus = 'do_not_contact' then 'The creator is marked Do not contact.'
              when w.opted_out then 'The creator has opted out of email.'
              when w.relationship = 'do_not_contact' then 'The sponsor is marked Do not contact.' end,
         w.open_stage,
         w.recent_on,
         (w.cstatus <> 'do_not_contact' and not w.opted_out and w.relationship <> 'do_not_contact'
          and w.open_stage is null and w.recent_on is null)
    from w
$$;

-- For one creator: every sponsor. p_ids limits the answer to those sponsors.
create or replace function public.match_for_creator(p_creator uuid, p_ids uuid[] default null)
returns table (brand_id uuid, total integer, band text, reasons jsonb, blocked text, open_stage text, recent_on date, suggestable boolean)
language sql stable security invoker set search_path = public, extensions, pg_temp as $$
  select m.brand_id, m.total, m.band, m.reasons, m.blocked, m.open_stage, m.recent_on, m.suggestable
    from public.match_pairs(p_creator, null, p_ids) m
   where p_creator is not null
$$;

-- For one sponsor: every creator. p_ids limits the answer to those creators.
create or replace function public.match_for_brand(p_brand uuid, p_ids uuid[] default null)
returns table (creator_id uuid, total integer, band text, reasons jsonb, blocked text, open_stage text, recent_on date, suggestable boolean)
language sql stable security invoker set search_path = public, extensions, pg_temp as $$
  select m.creator_id, m.total, m.band, m.reasons, m.blocked, m.open_stage, m.recent_on, m.suggestable
    from public.match_pairs(null, p_brand, p_ids) m
   where p_brand is not null
$$;

-- ---------------------------------------------------------------- creators_list (copy of 20261125000500 + the match ordering)
create or replace function public.creators_list(
  p_q text default null, p_subs_min bigint default null, p_subs_max bigint default null,
  p_sponsored text default null, p_detected boolean default false, p_recent integer default null,
  p_by uuid[] default null, p_niche text[] default null, p_status text[] default null,
  p_contacted text default null, p_views integer default null, p_lang text[] default null,
  p_country text[] default null, p_email boolean default false, p_tag uuid[] default null, p_list uuid[] default null,
  p_sort text default 'subscribers', p_dir text default 'desc', p_limit integer default 25, p_offset integer default 0
) returns table (
  id uuid, full_name text, channel_name text, niche_slug text, country text, language text, subscribers integer,
  subscribers_hidden boolean, avg_views integer, status text, last_contacted_at timestamptz, created_at timestamptz,
  sponsorship_count integer, last_sponsorship_at date, detected_sponsorship_count integer, last_detected_sponsorship_at date,
  has_email boolean, total bigint
)
language sql stable security invoker set search_path = public, extensions, pg_temp set jit = off as $$
  -- The last contact needs a look at the emails: it is worked out for the rows of the page only (for all rows only when sorting by it).
  with f as (select case when p_sort ~ '^match:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then substr(p_sort, 7)::uuid end as for_id),
  m as (select x as id from public.creators_match_ids(p_q, p_subs_min, p_subs_max, p_sponsored, p_detected, p_recent, p_by, p_niche, p_status, p_contacted, p_views, p_lang, p_country, p_email, p_tag, p_list) x),
  r as (
    select c.id, c.full_name, c.channel_name, c.niche_slug, c.country, c.language, c.subscribers, c.subscribers_hidden,
           c.avg_views, c.status::text as status, c.last_contacted_at as stored_contact,
           case when p_sort = 'last_contacted' then public.creator_contacted_at(c.id, c.last_contacted_at) end as sort_contact,
           c.created_at, c.sponsorship_count, c.last_sponsorship_at, c.detected_sponsorship_count, c.last_detected_sponsorship_at,
           (c.email <> '') as has_email,
           mm.total as m_total, (mm.blocked is null) as m_ok,
           case when coalesce(p_detected, false) then greatest(c.last_sponsorship_at, c.last_detected_sponsorship_at)
                else c.last_sponsorship_at end as sp_at
      from public.creators c join m on m.id = c.id
      cross join f
      left join public.match_for_brand(f.for_id) mm on mm.creator_id = c.id
  ),
  pg as (
    select r.*, count(*) over () as total
      from r
     order by
     -- "Best match" for a sponsor (p_sort = 'match:<sponsor id>'): people we may contact first, then the highest score
     case when p_sort like 'match:%' then r.m_ok end desc nulls last,
     case when p_sort like 'match:%' then r.m_total end desc nulls last,
     case when p_sort = 'subscribers' and p_dir = 'asc'  then r.subscribers end asc  nulls last,
     case when p_sort = 'subscribers' and p_dir <> 'asc' then r.subscribers end desc nulls last,
     case when p_sort = 'sponsored' and p_dir = 'asc'  then r.sp_at end asc  nulls last,
     case when p_sort = 'sponsored' and p_dir <> 'asc' then r.sp_at end desc nulls last,
     case when p_sort = 'last_contacted' and p_dir = 'asc'  then r.sort_contact end asc  nulls last,
     case when p_sort = 'last_contacted' and p_dir <> 'asc' then r.sort_contact end desc nulls last,
     case when p_sort = 'added' and p_dir = 'asc'  then r.created_at end asc  nulls last,
     case when p_sort = 'added' and p_dir <> 'asc' then r.created_at end desc nulls last,
     case when p_sort = 'name' and p_dir <> 'desc' then r.full_name end asc,
     case when p_sort = 'name' and p_dir = 'desc' then r.full_name end desc,
     -- "match" alone (no sponsor chosen) and "match:<id>" ties fall back to subscribers
     case when p_sort not in ('sponsored', 'last_contacted', 'added', 'name') and p_sort <> 'subscribers' then r.subscribers end desc nulls last,
     r.full_name asc, r.id asc
     limit greatest(1, least(coalesce(p_limit, 25), 100)) offset greatest(0, coalesce(p_offset, 0))
  )
  select pg.id, pg.full_name, pg.channel_name, pg.niche_slug, pg.country, pg.language, pg.subscribers, pg.subscribers_hidden,
         pg.avg_views, pg.status, public.creator_contacted_at(pg.id, pg.stored_contact) as last_contacted_at, pg.created_at,
         pg.sponsorship_count, pg.last_sponsorship_at, pg.detected_sponsorship_count, pg.last_detected_sponsorship_at,
         pg.has_email, pg.total
    from pg
   order by
     case when p_sort like 'match:%' then pg.m_ok end desc nulls last,
     case when p_sort like 'match:%' then pg.m_total end desc nulls last,
     case when p_sort = 'subscribers' and p_dir = 'asc'  then pg.subscribers end asc  nulls last,
     case when p_sort = 'subscribers' and p_dir <> 'asc' then pg.subscribers end desc nulls last,
     case when p_sort = 'sponsored' and p_dir = 'asc'  then pg.sp_at end asc  nulls last,
     case when p_sort = 'sponsored' and p_dir <> 'asc' then pg.sp_at end desc nulls last,
     case when p_sort = 'last_contacted' and p_dir = 'asc'  then pg.sort_contact end asc  nulls last,
     case when p_sort = 'last_contacted' and p_dir <> 'asc' then pg.sort_contact end desc nulls last,
     case when p_sort = 'added' and p_dir = 'asc'  then pg.created_at end asc  nulls last,
     case when p_sort = 'added' and p_dir <> 'asc' then pg.created_at end desc nulls last,
     case when p_sort = 'name' and p_dir <> 'desc' then pg.full_name end asc,
     case when p_sort = 'name' and p_dir = 'desc' then pg.full_name end desc,
     -- "match" alone (no sponsor chosen) and "match:<id>" ties fall back to subscribers
     case when p_sort not in ('sponsored', 'last_contacted', 'added', 'name') and p_sort <> 'subscribers' then pg.subscribers end desc nulls last,
     pg.full_name asc, pg.id asc
$$;

-- ---------------------------------------------------------------- sponsors_list (copy of 20261125000700 + the match ordering)
create or replace function public.sponsors_list(p jsonb, p_sort text default 'name', p_dir text default null,
                                                p_for uuid default null, p_limit integer default 25, p_offset integer default 0)
returns table (
  id uuid, name text, website text, industry text, country text, company_size text, relationship text,
  target_niches text[], target_min_subs integer, target_max_subs integer, budget_min_cents bigint, budget_max_cents bigint,
  last_contacted_at timestamptz, sponsorship_count integer, detected_sponsorship_count integer,
  last_sponsorship_at date, last_detected_sponsorship_at date, contact_count integer, deal_count integer,
  tag_ids uuid[], tag_names text[], eff_count integer, eff_last date, total bigint)
language sql stable security invoker set search_path = public, extensions as $$
  with o as (
    select case when p_sort in ('name', 'count', 'last', 'budget', 'match') then p_sort else 'name' end as s,
           case when p_dir in ('asc', 'desc') then p_dir
                when p_sort in ('count', 'last', 'budget') then 'desc' else 'asc' end as d)
  select r.*, count(*) over () as total
    from public.sponsor_rows(p, null) r cross join o
    left join public.match_for_creator(p_for) mm on mm.brand_id = r.id
   order by
     -- "Best match" for a creator: sponsors we may contact first, then the highest score
     case when o.s = 'match' and p_for is not null then (mm.blocked is null) end desc nulls last,
     case when o.s = 'match' and p_for is not null then mm.total end desc nulls last,
     case when o.s = 'count'  and o.d = 'desc' then r.eff_count end desc nulls last,
     case when o.s = 'count'  and o.d = 'asc'  then r.eff_count end asc nulls last,
     case when o.s = 'last'   and o.d = 'desc' then r.eff_last end desc nulls last,
     case when o.s = 'last'   and o.d = 'asc'  then r.eff_last end asc nulls last,
     case when o.s = 'budget' and o.d = 'desc' then coalesce(r.budget_max_cents, r.budget_min_cents) end desc nulls last,
     case when o.s = 'budget' and o.d = 'asc'  then coalesce(r.budget_max_cents, r.budget_min_cents) end asc nulls last,
     case when o.s in ('name', 'match') and o.d = 'desc' then r.name end desc,
     r.name asc, r.id
   limit greatest(least(coalesce(p_limit, 25), 1000), 0)
  offset greatest(coalesce(p_offset, 0), 0)
$$;

-- ---------------------------------------------------------------- who may call them
do $$
declare f text;
begin
  foreach f in array array['match_short(bigint)', 'match_num(bigint)', 'match_pairs(uuid, uuid, uuid[])',
                           'match_for_creator(uuid, uuid[])', 'match_for_brand(uuid, uuid[])'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;

-- create or replace keeps the grants of the two list functions; say it again so a fresh database is right too.
revoke all on function public.creators_list(text, bigint, bigint, text, boolean, integer, uuid[], text[], text[], text, integer, text[], text[], boolean, uuid[], uuid[], text, text, integer, integer) from public, anon;
grant execute on function public.creators_list(text, bigint, bigint, text, boolean, integer, uuid[], text[], text[], text, integer, text[], text[], boolean, uuid[], uuid[], text, text, integer, integer) to authenticated;
revoke all on function public.sponsors_list(jsonb, text, text, uuid, integer, integer) from public, anon;
grant execute on function public.sponsors_list(jsonb, text, text, uuid, integer, integer) to authenticated, service_role;
commit;

-- ===================================================================== 20261125000900_outreach.sql
begin;
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
commit;

-- ===================================================================== 20261125001000_search.sql
begin;
-- Global search (Search and polish agent): one function for the search box (command palette) in the top bar.
--   * global_search(p_q): creators by name or channel name, sponsors by name or industry, deals by the creator's or the
--     sponsor's name. At most 6 rows of each kind. Case-insensitive; % and _ in the text are plain characters
--     (like_pattern escapes them). Rows carry ids, names and one line of public context (channel, subscribers,
--     industry, deal stage). Never an email, phone, note or contact person, so no audit line is needed.
-- SECURITY INVOKER with a fixed search_path: the caller's row level security applies, so a login without a staff
-- role gets no rows. Granted to authenticated only (anon has nothing). Uses the trigram indexes that already exist
-- (creators_full_name_trgm, creators_channel_name_trgm, brands_name_trgm); no new index.
-- SAFE ON THE LIVE DATABASE: one new function; no table, column or row changes. Can run twice.
-- ROLL BACK (manual): drop function public.global_search(text);
set search_path = public, extensions;

create or replace function public.global_search(p_q text)
returns table (kind text, id uuid, name text, channel text, subscribers integer, industry text, stage text, other_name text)
language sql stable security invoker set search_path = public, extensions as $$
  with a as (select public.like_pattern(p_q) as pat, lower(left(btrim(coalesce(p_q, '')), 100)) as raw)
  (select 'creator'::text, c.id, c.full_name::text, c.channel_name::text, c.subscribers::integer, null::text, null::text, null::text
     from public.creators c cross join a
    where a.pat is not null and (c.full_name ilike a.pat or c.channel_name ilike a.pat)
    order by (lower(c.full_name) like left(a.raw, 100) || '%') desc, c.subscribers desc nulls last, c.full_name
    limit 6)
  union all
  (select 'sponsor'::text, b.id, b.name::text, null::text, null::integer, b.industry::text, null::text, null::text
     from public.brands b cross join a
    where a.pat is not null and (b.name::text ilike a.pat or b.industry ilike a.pat)
    order by (lower(b.name::text) like a.raw || '%') desc, b.name::text
    limit 6)
  union all
  (select 'deal'::text, d.id, c.full_name::text, null::text, null::integer, null::text, d.stage::text, b.name::text
     from public.deals d
     join public.creators c on c.id = d.creator_id
     join public.brands b on b.id = d.brand_id
     cross join a
    where a.pat is not null and (c.full_name ilike a.pat or b.name::text ilike a.pat)
    order by d.stage_changed_at desc, d.id
    limit 6)
$$;

revoke all on function public.global_search(text) from public, anon;
grant execute on function public.global_search(text) to authenticated, service_role;
commit;

-- ===================================================================== 20261125001100_review_fixes.sql
begin;
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
commit;

-- ===================================================================== 20261125001200_retest_fixes.sql
begin;
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
commit;

-- Final check: one row, niches = 12, and the first stage is matched.
select (select count(*) from public.niches) as niches, (select count(*) from public.creators) as creators,
       (select (enum_range(null::public.deal_stage))[1]::text) as first_stage;
