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
