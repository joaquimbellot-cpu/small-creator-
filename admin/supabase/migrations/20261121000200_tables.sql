-- Tables and indexes. Row level security and grants are in the last migration.
set search_path = public, extensions;

-- One row per login (id = auth.users.id). Created by a trigger on auth.users.
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text not null default '' check (length(full_name) <= 200),
  email      citext not null default '',
  role       public.app_role,                       -- null = no access
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.creators (
  id                     uuid primary key default gen_random_uuid(),
  full_name              text not null check (length(btrim(full_name)) between 1 and 200),
  email                  citext not null unique check (length(email) <= 320),
  phone                  text check (length(phone) <= 50),
  channel_url            text check (length(channel_url) <= 500),
  youtube_channel_id     text unique,
  channel_name           text check (length(channel_name) <= 200),
  niche                  text check (length(niche) <= 200),
  subscribers            integer check (subscribers is null or subscribers >= 0),
  subscribers_hidden     boolean not null default false,
  subscribers_checked_at timestamptz,
  status                 public.creator_status not null default 'new',
  notes                  text check (length(notes) <= 5000),
  last_contacted_at      timestamptz,
  user_id                uuid references auth.users (id) on delete set null,  -- future creator login
  created_by             uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create unique index creators_user_id_key on public.creators (user_id) where user_id is not null;
-- Search: trigram on name, email (cast to text), channel name. Query with ILIKE '%term%'.
create index creators_full_name_trgm    on public.creators using gin (full_name extensions.gin_trgm_ops);
create index creators_email_trgm        on public.creators using gin ((email::text) extensions.gin_trgm_ops);
create index creators_channel_name_trgm on public.creators using gin (channel_name extensions.gin_trgm_ops);
create index creators_status_idx        on public.creators (status);
create index creators_created_at_idx    on public.creators (created_at desc);

create table public.brands (
  id         uuid primary key default gen_random_uuid(),
  name       citext not null unique check (length(btrim(name)) between 1 and 200),
  website    text check (length(website) <= 500),
  notes      text check (length(notes) <= 5000),
  created_at timestamptz not null default now()
);

create table public.deals (
  id               uuid primary key default gen_random_uuid(),
  creator_id       uuid not null references public.creators (id) on delete restrict,
  brand_id         uuid not null references public.brands (id) on delete restrict,
  stage            public.deal_stage not null default 'contacted',
  amount_cents     bigint not null default 0 check (amount_cents >= 0),
  commission_cents bigint not null default 0,          -- always set by trigger
  currency         text not null default 'USD' check (currency = 'USD'),
  stage_changed_at timestamptz not null default now(),
  created_by       uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index deals_creator_idx on public.deals (creator_id);
create index deals_brand_idx   on public.deals (brand_id);
create index deals_stage_idx   on public.deals (stage);
create index deals_created_idx on public.deals (created_at desc);

create table public.email_templates (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(btrim(name)) between 1 and 200),
  goal       text check (length(goal) <= 2000),
  subject    text not null default '' check (length(subject) <= 500),
  body       text not null default '' check (length(body) <= 20000),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.emails (
  id           uuid primary key default gen_random_uuid(),
  creator_id   uuid not null references public.creators (id) on delete cascade,
  to_email     citext not null check (length(to_email) <= 320),
  subject      text not null default '' check (length(subject) <= 500),
  body         text not null default '' check (length(body) <= 20000),
  status       public.email_status not null default 'draft',
  is_test      boolean not null default false,
  template_id  uuid references public.email_templates (id) on delete set null,
  drafted_by   uuid references public.profiles (id) on delete set null default auth.uid(),
  approved_by  uuid references public.profiles (id) on delete set null,
  approved_at  timestamptz,
  sent_by      uuid references public.profiles (id) on delete set null,
  sent_at      timestamptz,
  error        text check (length(error) <= 2000),
  message_id   text,
  thread_id    text,                                   -- later: Gmail reply tracking
  replied_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index emails_creator_idx    on public.emails (creator_id);
create index emails_status_idx     on public.emails (status);
create index emails_created_at_idx on public.emails (created_at desc);
create index emails_sent_at_idx    on public.emails (sent_at) where sent_at is not null;

create table public.suppression_list (
  email      citext primary key,
  reason     text check (length(reason) <= 500),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null default auth.uid()
);

create table public.settings (
  id                    integer primary key default 1 check (id = 1),
  daily_send_limit      integer not null default 30 check (daily_send_limit >= 0),
  min_seconds_between_sends integer not null default 5 check (min_seconds_between_sends >= 0),
  test_mode             boolean not null default true,
  test_email            text check (length(test_email) <= 320),
  sender_name           text not null default 'Smallfold' check (length(sender_name) <= 200),
  sender_postal_address text check (length(sender_postal_address) <= 500),
  timezone              text not null default 'UTC',
  updated_at            timestamptz not null default now(),
  updated_by            uuid references public.profiles (id) on delete set null
);
insert into public.settings (id) values (1);

-- Append-only. Action names: <entity>.<created|updated|deleted|status_changed|role_changed>,
-- entity_type in creator, deal, brand, email, template, settings, suppression, profile.
-- The app adds its own (auth.login, creator.viewed, creators.exported, creators.imported, ...).
create table public.audit_log (
  id          bigserial primary key,
  actor_id    uuid,                                    -- no FK: the log must outlive users
  action      text not null,
  entity_type text,
  entity_id   text,
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index audit_log_created_idx on public.audit_log (created_at desc);
create index audit_log_entity_idx  on public.audit_log (entity_type, entity_id);

create table public.login_attempts (
  id         bigserial primary key,
  email      citext not null,
  ip         text,
  success    boolean not null,
  created_at timestamptz not null default now()
);
create index login_attempts_email_idx on public.login_attempts (email, created_at desc);
create index login_attempts_ip_idx    on public.login_attempts (ip, created_at desc);
create index login_attempts_time_idx  on public.login_attempts (created_at);
