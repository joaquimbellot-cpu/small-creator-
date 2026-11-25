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
