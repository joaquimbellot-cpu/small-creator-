-- Deterministic fake data. Every id comes from md5('<kind>-<n>')::uuid and every date is
-- relative to now() with whole-day offsets that stay away from the 7 / 30 / 84 day edges, so
-- the overview numbers in EXPECTED.md hold on any day. Nothing here is random.
-- Requires the two logins from create-users.mjs. Audit triggers are switched off while seeding
-- so the log is filled with hand-made, realistic lines at the end instead of 150 "created" rows.
begin;

alter table public.creators         disable trigger trg_audit;
alter table public.brands           disable trigger trg_audit;
alter table public.deals            disable trigger trg_audit;
alter table public.emails           disable trigger trg_audit;
alter table public.email_templates  disable trigger trg_audit;
alter table public.suppression_list disable trigger trg_audit;
alter table public.settings         disable trigger trg_audit;

create temp table seed_people as
  select (select id from public.profiles where email = 'owner@example.test')  as owner_id,
         (select id from public.profiles where email = 'worker@example.test') as worker_id;
do $$ begin
  if (select owner_id from seed_people) is null or (select worker_id from seed_people) is null then
    raise exception 'run create-users.mjs first (owner and worker logins missing)';
  end if;
end $$;

-- ---- settings (test mode stays on; postal address stays empty so real sending is locked)
update public.settings set test_email = 'owner@example.test' where id = 1;

-- ---- brands (10)
insert into public.brands (id, name, website, notes, created_at)
select md5('brand-' || n)::uuid, name, 'https://' || slug || '.example.test', note, now() - (100 - n) * interval '1 day'
from (values
  (1,  'Northwind Gear Co',      'northwind-gear',   'Outdoor and travel gear.'),
  (2,  'Lumen Audio',            'lumen-audio',      'Headphones and desk speakers.'),
  (3,  'Paperplane Apps',        'paperplane-apps',  'Productivity apps.'),
  (4,  'Tidewater Coffee',       'tidewater-coffee', null),
  (5,  'Gridiron Snacks',        'gridiron-snacks',  'Snack subscription box.'),
  (6,  'Fernhill Outdoor',       'fernhill-outdoor', null),
  (7,  'Quill & Co Stationery',  'quill-co',         'Notebooks and pens.'),
  (8,  'Brightpath Learning',    'brightpath',       'Online courses.'),
  (9,  'Orbit Desk',             'orbit-desk',       'Standing desks.'),
  (10, 'Kettle Street Foods',    'kettle-street',    null)
) as b(n, name, slug, note);

-- ---- creators (60): 1-18 new, 19-30 contacted, 31-38 replied, 39-48 active, 49-58 inactive, 59-60 do_not_contact
insert into public.creators (id, full_name, email, phone, channel_url, youtube_channel_id, channel_name, niche,
                             subscribers, subscribers_hidden, subscribers_checked_at, status, notes,
                             created_by, created_at, updated_at)
select md5('creator-' || i)::uuid,
       fn || ' ' || ln,
       lower(fn || '.' || ln) || lpad(i::text, 2, '0') || '@example.test',
       case when i % 4 = 0 then null else '+1-555-01' || lpad(i::text, 2, '0') end,
       'https://www.youtube.com/@' || lower(fn || ln) || i,
       case when i % 3 = 0 then null else 'UC' || lpad(i::text, 22, '0') end,
       fn || ' ' || ln || ' ' || initcap(niche),
       niche,
       case when i % 9 = 0 then null else 800 + (i * i * 37) % 9000 end,
       i % 9 = 0,
       now() - ((i % 20) + 1) * interval '1 day',
       case when i <= 18 then 'new' when i <= 30 then 'contacted' when i <= 38 then 'replied'
            when i <= 48 then 'active' when i <= 58 then 'inactive' else 'do_not_contact' end::public.creator_status,
       case when i % 5 = 0 then 'Prefers short emails. Fine to mention the channel by name.' when i % 11 = 0 then 'Asked us to follow up next month.' end,
       case when i % 2 = 1 then (select owner_id from seed_people) else (select worker_id from seed_people) end,
       now() - (60 - i) * interval '1 day' - interval '2 hours',
       now() - (60 - i) * interval '1 day' - interval '2 hours'
from (
  select i,
         (array['Maya','Theo','Priya','Jonas','Lena','Marcus','Sofia','Idris','Hana','Callum',
                'Noor','Felix','Amara','Dmitri','Rosa','Kenji','Imogen','Tariq','Wren','Oskar'])[(i - 1) % 20 + 1] as fn,
         (array['Brooks','Okafor','Lindqvist','Navarro','Whitlock','Petrov','Hartmann','Castellano','Mbeki','Fairweather',
                'Quinn','Ashdown','Varga','Sorensen','Delacroix','Ibarra','Thornton','Nakamura','Eriksen','Pemberton'])[((i - 1) * 7 + (i - 1) / 20) % 20 + 1] as ln,
         (array['woodworking','retro gaming','budget travel','home baking','indie music','urban gardening',
                'chess','film essays','running','board games','photography','personal finance'])[(i * 5) % 12 + 1] as niche
  from generate_series(1, 60) as i
) g;

-- ---- templates (3)
insert into public.email_templates (id, name, goal, subject, body, created_by, created_at, updated_at)
select md5('template-' || n)::uuid, name, goal, subject, body, (select owner_id from seed_people),
       now() - (50 - n) * interval '1 day', now() - (50 - n) * interval '1 day'
from (values
  (1, 'First outreach', 'Introduce Smallfold and ask if they are open to sponsors.',
      'A sponsor idea for {{channel_name}}',
      E'Hi {{first_name}},\n\nI watch {{channel_name}} and like your {{niche}} videos. Smallfold finds sponsors for small YouTube channels, and we would love to know if you are open to brand deals.\n\nWould a short chat be useful?\n\nThe Smallfold team'),
  (2, 'Follow-up after no reply', 'Gentle nudge a week after the first email.',
      'Following up: {{channel_name}}',
      E'Hi {{first_name}},\n\nJust checking whether you saw my note about sponsorships for {{channel_name}}. No pressure either way.\n\nThe Smallfold team'),
  (3, 'Sponsorship offer details', 'Share the terms once a creator replies with interest.',
      'Details for your sponsorship with Smallfold',
      E'Hi {{first_name}},\n\nThanks for replying. Here is how it works: we match you with a brand that fits {{niche}}, you keep full creative control, and we take a commission only when you are paid.\n\nShall I send the first match?\n\nThe Smallfold team')
) as t(n, name, goal, subject, body);

-- ---- deals (15): contacted 2, replied 2, negotiating 3, signed 3, completed 2, paid 3
insert into public.deals (id, creator_id, brand_id, stage, amount_cents, created_by, created_at, stage_changed_at, updated_at)
select md5('deal-' || n)::uuid, md5('creator-' || c)::uuid, md5('brand-' || b)::uuid, stage::public.deal_stage, amount,
       (select owner_id from seed_people),
       now() - d * interval '1 day', now() - (d / 2) * interval '1 day', now() - (d / 2) * interval '1 day'
from (values
  (1,  39, 1,  'paid',        80000, 70),
  (2,  40, 2,  'paid',        30000, 55),
  (3,  41, 3,  'paid',       250000, 80),
  (4,  42, 4,  'completed',  120000, 40),
  (5,  43, 5,  'completed',   45000, 30),
  (6,  44, 6,  'signed',      60000, 20),
  (7,  45, 7,  'signed',     200000, 18),
  (8,  46, 8,  'signed',      49999, 15),
  (9,  47, 9,  'negotiating',150000, 12),
  (10, 48, 10, 'negotiating', 35000,  9),
  (11, 39, 2,  'negotiating',500000,  6),
  (12, 31, 1,  'replied',     25000,  5),
  (13, 32, 3,  'replied',     99999,  4),
  (14, 33, 5,  'contacted',   15000,  3),
  (15, 34, 7,  'contacted',   70000,  2)
) as d(n, c, b, stage, amount, d);

-- ---- emails (40). days = whole days ago (+3 hours). Real: 16 sent, 12 replied, 3 failed, 4 draft, 2 approved. Test: 3 sent.
insert into public.emails (id, creator_id, to_email, subject, body, status, is_test, drafted_by, approved_by, approved_at,
                           sent_by, sent_at, error, message_id, replied_at, created_at, updated_at)
select md5('email-' || s.n)::uuid, c.id, c.email,
       case when s.n % 3 = 0 then 'Following up: ' || c.channel_name else 'A sponsor idea for ' || c.channel_name end,
       'Hi ' || split_part(c.full_name, ' ', 1) || E',\n\nI watch ' || c.channel_name || ' and like your ' || c.niche
         || E' videos. Smallfold finds sponsors for small YouTube channels. Would you be open to a short chat?\n\nThe Smallfold team',
       s.st::public.email_status, s.test, who.id,
       case when s.st <> 'draft' then who.id end,
       case when s.st <> 'draft' then b.base - interval '1 day' end,
       case when s.st in ('sent', 'replied') then who.id end,
       case when s.st in ('sent', 'replied') then b.base end,
       case when s.st = 'failed' then 'SMTP error: mailbox unavailable (seed)' end,
       case when s.st in ('sent', 'replied') then '<seed-' || s.n || '@mail.example.test>' end,
       case when s.st = 'replied' then b.base + interval '1 day' end,
       case when s.st in ('draft', 'approved') then b.base else b.base - interval '1 day' end,
       b.base
from (values
  -- sent, real (contacted creators 19-30)
  (1, 19, 'sent', 1, false), (2, 20, 'sent', 2, false), (3, 21, 'sent', 4, false), (4, 22, 'sent', 6, false),
  (5, 23, 'sent', 9, false), (6, 24, 'sent', 12, false), (7, 25, 'sent', 15, false), (8, 26, 'sent', 19, false),
  (9, 27, 'sent', 23, false), (10, 28, 'sent', 26, false), (11, 29, 'sent', 29, false), (12, 30, 'sent', 33, false),
  -- sent, real (inactive 49-50, do_not_contact 59-60)
  (13, 49, 'sent', 75, false), (14, 50, 'sent', 88, false), (15, 59, 'sent', 50, false), (16, 60, 'sent', 66, false),
  -- replied (replied creators 31-38, active 39-42)
  (17, 31, 'replied', 5, false), (18, 32, 'replied', 8, false), (19, 33, 'replied', 11, false), (20, 34, 'replied', 17, false),
  (21, 35, 'replied', 24, false), (22, 36, 'replied', 34, false), (23, 37, 'replied', 45, false), (24, 38, 'replied', 60, false),
  (25, 39, 'replied', 40, false), (26, 40, 'replied', 55, false), (27, 41, 'replied', 70, false), (28, 42, 'replied', 87, false),
  -- failed
  (29, 5, 'failed', 3, false), (30, 6, 'failed', 10, false), (31, 7, 'failed', 20, false),
  -- drafts and approved (nothing sent yet)
  (32, 1, 'draft', 0, false), (33, 2, 'draft', 0, false), (34, 3, 'draft', 1, false), (35, 4, 'draft', 2, false),
  (36, 8, 'approved', 1, false), (37, 9, 'approved', 2, false),
  -- test sends to the owner's test address
  (38, 10, 'sent', 2, true), (39, 11, 'sent', 14, true), (40, 12, 'sent', 40, true)
) as s(n, cidx, st, days, test)
join public.creators c on c.id = md5('creator-' || s.cidx)::uuid
cross join lateral (select now() - s.days * interval '1 day' - interval '3 hours' as base) b
cross join lateral (select case when s.n % 2 = 0 then (select owner_id from seed_people) else (select worker_id from seed_people) end as id) who;

-- creators.last_contacted_at from their newest real sent email
update public.creators c set last_contacted_at = e.last_sent
from (select creator_id, max(sent_at) as last_sent from public.emails
       where status in ('sent', 'replied') and not is_test group by creator_id) e
where e.creator_id = c.id;

-- ---- suppression (2): creator 59 plus one address that was never a creator
insert into public.suppression_list (email, reason, created_at, created_by)
select email, reason, created_at, (select owner_id from seed_people)
from (values
  ((select email from public.creators where id = md5('creator-59')::uuid), 'Opted out via unsubscribe link', now() - interval '45 days'),
  ('removed.sample@example.test', 'Asked by reply to be removed', now() - interval '20 days')
) as v(email, reason, created_at);

-- ---- audit log: hand-made lines in the same shape the triggers write
insert into public.audit_log (actor_id, action, entity_type, entity_id, details, created_at)
select e.sent_by, 'email.status_changed', 'email', e.id::text,
       jsonb_build_object('label', c.full_name, 'creator_id', c.id, 'to_email', e.to_email, 'is_test', e.is_test,
                          'status', 'sent', 'changes', jsonb_build_object('status', jsonb_build_object('from', 'sending', 'to', 'sent'))),
       e.sent_at
from public.emails e join public.creators c on c.id = e.creator_id
where e.sent_at is not null;

insert into public.audit_log (actor_id, action, entity_type, entity_id, details, created_at)
select (select owner_id from seed_people), 'email.status_changed', 'email', e.id::text,
       jsonb_build_object('label', c.full_name, 'creator_id', c.id, 'to_email', e.to_email, 'is_test', e.is_test,
                          'status', 'replied', 'changes', jsonb_build_object('status', jsonb_build_object('from', 'sent', 'to', 'replied'))),
       e.replied_at
from public.emails e join public.creators c on c.id = e.creator_id
where e.status = 'replied';

insert into public.audit_log (actor_id, action, entity_type, entity_id, details, created_at)
select (select owner_id from seed_people), 'deal.created', 'deal', d.id::text,
       jsonb_build_object('label', c.full_name, 'creator_id', c.id, 'brand_id', d.brand_id, 'stage', d.stage, 'amount_cents', d.amount_cents),
       d.created_at
from public.deals d join public.creators c on c.id = d.creator_id;

insert into public.audit_log (actor_id, action, entity_type, entity_id, details, created_at)
values
  ((select owner_id from seed_people),  'auth.login', 'profile', (select owner_id::text from seed_people),  '{"label":"Olive Owner"}', now() - interval '1 hour'),
  ((select worker_id from seed_people), 'auth.login', 'profile', (select worker_id::text from seed_people), '{"label":"Wes Worker"}', now() - interval '5 hours'),
  ((select owner_id from seed_people),  'settings.updated', 'settings', '1',
     '{"label":"","changes":{"test_email":{"from":null,"to":"owner@example.test"}}}', now() - interval '12 days'),
  ((select owner_id from seed_people),  'suppression.created', 'suppression', 'removed.sample@example.test',
     '{"label":"removed.sample@example.test"}', now() - interval '20 days');

alter table public.creators         enable trigger trg_audit;
alter table public.brands           enable trigger trg_audit;
alter table public.deals            enable trigger trg_audit;
alter table public.emails           enable trigger trg_audit;
alter table public.email_templates  enable trigger trg_audit;
alter table public.suppression_list enable trigger trg_audit;
alter table public.settings         enable trigger trg_audit;

commit;
