-- Fake data for the back-office upgrade (niches, sponsors, contact people, sponsorship records, tags, lists, saved views,
-- 'matched' deals). Local stack only. Runs after seed.sql (run-seed.sh) and is safe to run again: every insert uses a
-- fixed id with "on conflict do nothing", and every update sets the same values each time. Nothing here is random.
-- Dates are whole days before today. Fake names and @example.test addresses only.
begin;

alter table public.creators       disable trigger trg_audit;
alter table public.brands         disable trigger trg_audit;
alter table public.deals          disable trigger trg_audit;
alter table public.brand_contacts disable trigger trg_audit;
alter table public.sponsorships   disable trigger trg_audit;
alter table public.lists          disable trigger trg_audit;

create temp table seed_people as
  select (select id from public.profiles where email = 'owner@example.test')  as owner_id,
         (select id from public.profiles where email = 'worker@example.test') as worker_id;
do $$ begin
  if (select owner_id from seed_people) is null or (select worker_id from seed_people) is null then
    raise exception 'run create-users.mjs first (owner and worker logins missing)';
  end if;
end $$;

-- ---- brands: 16 more (26 in all), then the new columns for all 26
insert into public.brands (id, name, website, notes, created_at)
select md5('brand-' || n)::uuid, name, 'https://' || slug || '.example.test', note, now() - (120 - n) * interval '1 day'
from (values
  (11, 'Harbor & Pine Outfitters',   'harbor-pine',    'Coastal and trail clothing.'),
  (12, 'Copperleaf Tea',             'copperleaf-tea', null),
  (13, 'Voltspire Gadgets',          'voltspire',      'Chargers, hubs and small electronics.'),
  (14, 'Mosaic Money App',           'mosaic-money',   'Budgeting app.'),
  (15, 'Juniper Skincare',           'juniper-skin',   null),
  (16, 'Stonebridge Tools',          'stonebridge',    'Hand tools and workshop gear.'),
  (17, 'Pixelpost Prints',           'pixelpost',      'Photo books and prints.'),
  (18, 'Larkfield Fitness',          'larkfield-fit',  null),
  (19, 'Basil & Brass Kitchenware',  'basil-brass',    'Asked us to pause outreach.'),
  (20, 'Nimbus Cloud Notes',         'nimbus-notes',   'Note-taking software.'),
  (21, 'Ridgeline Bikes',            'ridgeline',      'Gravel and touring bikes.'),
  (22, 'Sunday Roast Spices',        'sunday-roast',   null),
  (23, 'Echo Valley Guitars',        'echo-valley',    'Small-batch guitars and pedals.'),
  (24, 'Cobalt Chess Club',          'cobalt-chess',   null),
  (25, 'Tinker Labs Kits',           'tinker-labs',    'Electronics kits for learners.'),
  (26, 'Wayfarer Packs',             'wayfarer',       'Travel backpacks.')
) as b(n, name, slug, note)
on conflict (id) do nothing;

update public.brands b set
  industry = v.industry, country = v.country, company_size = v.size, target_niches = v.niches::text[],
  target_min_subs = v.min_subs, target_max_subs = v.max_subs,
  budget_min_cents = v.bmin, budget_max_cents = v.bmax, relationship = v.rel,
  last_contacted_at = case when v.days is null then null else now() - v.days * interval '1 day' - interval '3 hours' end
from (values
  (1,  'Outdoor gear',         'US', '51-200',   '{outdoors,travel}',        1000,  50000,  50000, 300000, 'partner',        12),
  (2,  'Consumer electronics', 'GB', '51-200',   '{music,tech}',             2000,  80000,  40000, 250000, 'partner',         8),
  (3,  'Software',             'US', '11-50',    '{tech,education,finance}', 1000,  30000,  30000, 150000, 'talks',           5),
  (4,  'Food and drink',       'AU', '11-50',    '{cooking,travel}',          500,  20000,  20000,  80000, 'talks',          20),
  (5,  'Food and drink',       'US', '51-200',   '{gaming,cooking,fitness}', 1000,  60000,  25000, 120000, 'partner',        15),
  (6,  'Outdoor gear',         'CA', '11-50',    '{outdoors,fitness}',        800,  25000,  20000,  90000, 'talks',           3),
  (7,  'Stationery',           'GB', '1-10',     '{education,diy}',           500,  15000,  10000,  50000, 'partner',        30),
  (8,  'Education',            'US', '201-1000', '{education,tech,finance}', 2000, 100000,  50000, 400000, 'past',          200),
  (9,  'Furniture',            'DE', '51-200',   '{tech,diy}',               3000,  80000,  60000, 300000, 'contacted',      14),
  (10, 'Food and drink',       'US', '11-50',    '{cooking}',                 500,  30000,  15000,  70000, 'prospect',     null),
  (11, 'Outdoor gear',         'CA', '51-200',   '{outdoors,travel,photo}',  1000,  40000,  30000, 120000, 'prospect',     null),
  (12, 'Food and drink',       'GB', '11-50',    '{cooking,beauty}',          500,  20000,  10000,  60000, 'contacted',       9),
  (13, 'Consumer electronics', 'US', '201-1000', '{tech,gaming}',            5000, 200000, 100000, 600000, 'talks',           4),
  (14, 'Finance',              'US', '51-200',   '{finance,education}',      2000, 100000,  50000, 300000, 'partner',        25),
  (15, 'Beauty',               'FR', '51-200',   '{beauty}',                 2000,  80000,  40000, 200000, 'prospect',     null),
  (16, 'Tools',                'DE', '201-1000', '{diy,outdoors}',           1000,  60000,  30000, 180000, 'past',          300),
  (17, 'Photo services',       'NL', '11-50',    '{photo,travel}',            500,  25000,  15000,  60000, 'contacted',      45),
  (18, 'Fitness',              'AU', '51-200',   '{fitness,outdoors}',       1000,  50000,  20000, 100000, 'prospect',     null),
  (19, 'Kitchenware',          'US', '11-50',    '{cooking,diy}',             500,  30000,  15000,  80000, 'do_not_contact', 60),
  (20, 'Software',             'SE', '11-50',    '{tech,education}',         1000,  40000,  20000,  90000, 'talks',           7),
  (21, 'Sports',               'CA', '51-200',   '{fitness,outdoors,travel}',2000,  70000,  40000, 160000, 'partner',        18),
  (22, 'Food and drink',       'GB', '1-10',     '{cooking}',                 300,  10000,   5000,  25000, 'prospect',     null),
  (23, 'Music',                'US', '11-50',    '{music}',                   500,  30000,  20000,  90000, 'contacted',      11),
  (24, 'Games',                'SE', '1-10',     '{gaming,education}',        300,  20000,   5000,  30000, 'prospect',     null),
  (25, 'Education',            'US', '11-50',    '{education,tech,diy}',      800,  40000,  15000,  70000, 'talks',           6),
  (26, 'Travel gear',          'JP', '51-200',   '{travel,photo,outdoors}',  1500,  60000,  30000, 140000, 'past',          150)
) as v(n, industry, country, size, niches, min_subs, max_subs, bmin, bmax, rel, days)
where b.id = md5('brand-' || v.n)::uuid;

-- ---- brand contacts: 1 to 2 people for 22 of the 26 brands (not 10, 19, 22, 24)
insert into public.brand_contacts (id, brand_id, full_name, role_title, email, phone, linkedin_url, is_primary, notes, created_by, created_at)
select md5('contact-' || k.brand || '-' || k.slot)::uuid, md5('brand-' || k.brand)::uuid,
       k.fn || ' ' || k.ln,
       (array['Partnerships manager','Head of marketing','Influencer lead','Brand manager','Founder','Growth marketer'])[(k.brand + k.slot) % 6 + 1],
       lower(k.fn || '.' || k.ln || k.brand || k.slot) || '@example.test',
       case when (k.brand + k.slot) % 3 = 0 then null else '+1-555-02' || lpad((k.brand * 3 + k.slot)::text, 2, '0') end,
       case when (k.brand + k.slot) % 2 = 0 then 'https://www.linkedin.com/in/' || lower(k.fn || '-' || k.ln) || '-' || k.brand || k.slot else null end,
       k.slot = 1,
       case when k.slot = 1 then 'Found on the company site (seed).' end,
       (select owner_id from seed_people),
       now() - (90 - k.brand) * interval '1 day'
from (
  select b as brand, s as slot,
         (array['Avery','Bodhi','Camila','Dario','Elif','Gus','Harriet','Ines','Jules','Kofi','Linnea','Mateo','Nadia','Otis','Petra','Quentin'])[(b * 3 + s) % 16 + 1] as fn,
         (array['Ashby','Bellamy','Corrigan','Dunmore','Ellery','Foxley','Granger','Holloway','Ishida','Jarrow','Kestrel','Lockhart'])[(b * 5 + s * 7) % 12 + 1] as ln
  from generate_series(1, 26) b, generate_series(1, 2) s
  where b not in (10, 19, 22, 24) and (s = 1 or b % 2 = 1)
) k
on conflict (id) do nothing;

-- ---- creators: the new columns for all 60
update public.creators c set
  niche_slug = case when g.i % 15 = 7 then 'tech' when g.i % 15 = 12 then 'beauty'
                    else case c.niche when 'woodworking' then 'diy' when 'retro gaming' then 'gaming' when 'budget travel' then 'travel'
                                      when 'home baking' then 'cooking' when 'indie music' then 'music' when 'urban gardening' then 'outdoors'
                                      when 'chess' then 'education' when 'film essays' then 'photo' when 'running' then 'fitness'
                                      when 'board games' then 'gaming' when 'photography' then 'photo' else 'finance' end end,
  country = g.country,
  language = case g.country when 'DE' then 'de' when 'FR' then 'fr' when 'BR' then 'pt' when 'JP' then 'ja' when 'MX' then 'es'
                            when 'NL' then 'nl' when 'SE' then 'sv' when 'IN' then 'hi' else 'en' end,
  avg_views = case when g.i % 10 = 0 then null
                   when c.subscribers is null then 500 + (g.i * 131) % 3000
                   else round(c.subscribers * (0.08 + (g.i % 7) * 0.05))::integer end,
  avg_views_checked_at = case when g.i % 10 = 0 then null else now() - ((g.i % 25) + 1) * interval '1 day' end,
  last_video_at = now() - (case when g.i % 11 = 0 then 90 else (g.i * 3) % 45 + 1 end) * interval '1 day',
  uploads_per_month = 1 + (g.i * 5) % 9,
  engagement_rate = case when g.i % 4 = 1 then null else round(1.5 + ((g.i * 13) % 70) / 10.0, 2) end,
  audience_countries = case when g.i % 5 in (1, 2, 3) then
    (array['US 40%, UK 15%, CA 10%', 'US 55%, AU 12%, DE 8%', 'UK 35%, US 30%, IE 6%', 'DE 45%, AT 10%, US 12%'])[g.i % 4 + 1] end
from (
  select i, (array['US','GB','CA','AU','DE','FR','BR','IN','JP','MX','SE','NL'])[(i * 7) % 12 + 1] as country
  from generate_series(1, 60) i
) g
where c.id = md5('creator-' || g.i)::uuid;

-- ---- sponsorship records: 110 more on top of the 5 the deal trigger makes (completed and paid deals)
-- Creators: the 36 whose number leaves 1, 2 or 3 when divided by 5 (60% of 60). Brand: spread over all 26.
-- Rows with n % 20 below 10 are confirmed (59), the rest detected (51; 5 with no brand, 2 rejected).
insert into public.sponsorships (id, creator_id, brand_id, brand_name_raw, sponsored_on, video_url, video_title,
                                 source_label, origin, detection_signal, detection_confidence, evidence_note,
                                 confirmed_by, confirmed_at, rejected, rejected_by, rejected_at, notes, created_by, created_at)
select md5('sponsorship-' || n)::uuid,
       md5('creator-' || ci)::uuid,
       case when no_brand then null else md5('brand-' || bi)::uuid end,
       case when no_brand and n % 8 = 4 then (array['Plum Street Tea','Hollow Oak Games','Dovetail Studio'])[n % 3 + 1] end,
       d,
       case when n % 10 < 7 then 'https://www.youtube.com/watch?v=seedvid' || lpad(n::text, 4, '0') end,
       case when n % 10 < 7 then (array['I tried it for a month','Honest first impressions','My new setup tour','Why I switched','Behind the scenes this week'])[n % 5 + 1] end,
       lbl, org,
       case when lbl = 'detected' then sig end,
       case when lbl = 'detected' then case sig when 'sponsored_by' then 'high' when 'thanks_sponsor' then 'high'
                                                when 'paid_partnership' then 'high' when 'tracking_link' then 'low' else 'medium' end end,
       case when lbl = 'confirmed' then 'Checked the video and the description (seed).' end,
       case when lbl = 'confirmed' then who end,
       case when lbl = 'confirmed' then d::timestamptz + interval '3 days' end,
       n in (33, 73),
       case when n in (33, 73) then who end,
       case when n in (33, 73) then now() - interval '4 days' end,
       case when n % 17 = 0 then 'Added from the old sponsor spreadsheet (seed).' end,
       who, now() - ((n * 3) % 90 + 1) * interval '1 day'
from (
  select n, e.ci, ((n * 5) % 26 + 1) as bi,
         (current_date - ((n * 17) % 800 + 3)) as d,
         (n % 20 < 10) as is_conf,
         case when n % 20 < 10 then 'confirmed' else 'detected' end as lbl,
         case when n % 20 < 10 then case when n % 3 = 0 then 'import' else 'manual' end
              when n % 7 = 0 then 'import' else 'detected' end as org,
         case when n % 20 < 10 then null
              when n % 7 = 0 then 'imported_unverified'
              else (array['sponsored_by','thanks_sponsor','paid_partnership','hashtag_ad','discount_code','tracking_link','paid_flag'])[n % 7 + 1] end as sig,
         (n in (12, 32, 52, 72, 92)) as no_brand,
         case when n % 2 = 0 then (select owner_id from seed_people) else (select worker_id from seed_people) end as who
  from generate_series(1, 110) n
  join lateral (
    select (array_agg(i order by i))[(n * 7) % 36 + 1] as ci from generate_series(1, 60) i where i % 5 in (1, 2, 3)
  ) e on true
) r
on conflict do nothing;
-- the no-brand rows that carry no raw text must be "paid flag only" detections
update public.sponsorships set detection_signal = 'paid_flag', detection_confidence = 'medium'
 where id in (md5('sponsorship-32')::uuid, md5('sponsorship-72')::uuid) and brand_name_raw is null and source_label = 'detected';

-- ---- tags
insert into public.tags (id, name, scope, created_by, created_at)
select md5('tag-' || n)::uuid, name, scope, (select owner_id from seed_people), now() - (60 - n) * interval '1 day'
from (values
  (1, 'Premium', 'creator'), (2, 'Quick replier', 'creator'), (3, 'Needs follow-up', 'creator'), (4, 'Small but loyal', 'creator'),
  (5, 'Big budget', 'brand'), (6, 'Pays fast', 'brand'), (7, 'Agency', 'brand')
) as t(n, name, scope)
on conflict (id) do nothing;

insert into public.creator_tags (creator_id, tag_id)
select md5('creator-' || i)::uuid, md5('tag-' || t)::uuid
from generate_series(1, 60) i, generate_series(1, 4) t
where (t = 1 and i % 7 = 0) or (t = 2 and i % 6 = 1) or (t = 3 and i % 9 = 2) or (t = 4 and i % 8 = 3)
on conflict do nothing;

insert into public.brand_tags (brand_id, tag_id)
select md5('brand-' || b)::uuid, md5('tag-' || t)::uuid
from generate_series(1, 26) b, generate_series(5, 7) t
where (t = 5 and b in (2, 8, 13, 16)) or (t = 6 and b in (1, 5, 14, 21)) or (t = 7 and b in (9, 17, 26))
on conflict do nothing;

-- ---- lists
insert into public.lists (id, name, kind, created_by, created_at)
values (md5('list-1')::uuid, 'Spring campaign shortlist', 'creators', (select owner_id from seed_people), now() - interval '12 days'),
       (md5('list-2')::uuid, 'Tech sponsors to pitch',    'brands',   (select worker_id from seed_people), now() - interval '9 days')
on conflict (id) do nothing;
insert into public.list_items (id, list_id, creator_id, added_by)
select md5('list-item-c-' || i)::uuid, md5('list-1')::uuid, md5('creator-' || i)::uuid, (select owner_id from seed_people)
from unnest(array[41, 42, 43, 44, 45, 46, 47]) i
on conflict do nothing;
insert into public.list_items (id, list_id, brand_id, added_by)
select md5('list-item-b-' || b)::uuid, md5('list-2')::uuid, md5('brand-' || b)::uuid, (select worker_id from seed_people)
from unnest(array[3, 9, 13, 20, 25]) b
on conflict do nothing;

-- ---- saved views (one shared by the owner, one private to the worker, one private to the owner)
insert into public.saved_views (id, owner_id, scope, name, query, is_shared, created_at)
select md5('view-' || n)::uuid, (case o when 'owner' then (select owner_id from seed_people) else (select worker_id from seed_people) end),
       scope, name, query, shared, now() - n * interval '3 days'
from (values
  (1, 'owner',  'creators', 'Active and sponsored in the last 90 days', 'status=active&sponsored=yes&recent=90', true),
  (2, 'worker', 'creators', 'Gaming under 20k',                          'niche=gaming&subs=0-20000',             false),
  (3, 'owner',  'sponsors', 'Partners with a budget',                    'rel=partner&budget=500-3000',           false)
) as v(n, o, scope, name, query, shared)
on conflict (id) do nothing;

-- ---- deals at the new first stage 'matched' (two with no amount yet). Creators 3, 4, 9, 12 are 'new'.
insert into public.deals (id, creator_id, brand_id, stage, amount_cents, created_by, created_at, stage_changed_at, updated_at)
select md5('deal-' || n)::uuid, md5('creator-' || c)::uuid, md5('brand-' || b)::uuid, 'matched', amount,
       (select owner_id from seed_people), now() - d * interval '1 day', now() - d * interval '1 day', now() - d * interval '1 day'
from (values
  (16, 3,  11, null::bigint, 4),
  (17, 4,  13, null::bigint, 3),
  (18, 9,  15, 40000::bigint, 2),
  (19, 12, 21, 65000::bigint, 1)
) as d(n, c, b, amount, d)
on conflict (id) do nothing;

alter table public.creators       enable trigger trg_audit;
alter table public.brands         enable trigger trg_audit;
alter table public.deals          enable trigger trg_audit;
alter table public.brand_contacts enable trigger trg_audit;
alter table public.sponsorships   enable trigger trg_audit;
alter table public.lists          enable trigger trg_audit;

commit;
