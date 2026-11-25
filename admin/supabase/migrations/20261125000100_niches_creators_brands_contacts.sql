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
