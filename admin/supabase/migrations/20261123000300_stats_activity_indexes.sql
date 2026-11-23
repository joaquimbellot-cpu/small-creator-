-- Overview and speed (fix agent FA, audit items M31, M32 with L12 and L43, L07, L09).
--   * stats_overview(): adds emails_failed_7d (real sends that failed in the last 7 days).
--   * recent_activity(): typed uuid comparisons (uses the primary keys), the right action name
--     'creator.subscribers_refreshed', and a real actor name instead of "Someone".
--   * creator_summaries: lateral joins, same columns, still security_invoker.
--   * more indexes (none dropped).
--
-- SAFE ON THE LIVE DATABASE: functions and one view are replaced with the same columns; indexes are created
-- (a short write lock on small tables). No row is changed. Index creation scans each table once.
-- ROLL BACK (manual): re-create the earlier definitions (stats_overview and creator_summaries in
--   20261121000400, recent_activity in 20261121000700) and drop the indexes named here.
set search_path = public, extensions;

-- ---------------------------------------------------------------- L09 indexes
create index if not exists audit_log_action_idx        on public.audit_log (action, created_at desc);
create index if not exists audit_log_actor_idx         on public.audit_log (actor_id, created_at desc);
create index if not exists deals_stage_changed_idx     on public.deals (stage_changed_at desc, id);
-- foreign keys that are set to null on delete (deleting a template or a user must not scan the table)
create index if not exists emails_template_idx         on public.emails (template_id) where template_id is not null;
create index if not exists emails_drafted_by_idx       on public.emails (drafted_by) where drafted_by is not null;
create index if not exists emails_approved_by_idx      on public.emails (approved_by) where approved_by is not null;
create index if not exists emails_sent_by_idx          on public.emails (sent_by) where sent_by is not null;
create index if not exists deals_created_by_idx        on public.deals (created_by) where created_by is not null;
create index if not exists creators_created_by_idx     on public.creators (created_by) where created_by is not null;
create index if not exists contact_messages_handled_by_idx on public.contact_messages (handled_by) where handled_by is not null;

-- ---------------------------------------------------------------- M31 stats_overview
create or replace function public.stats_overview() returns jsonb
language plpgsql stable security definer set search_path = public, extensions, pg_temp as $$
declare
  v_tz       text;
  v_sent     bigint;
  v_replies  bigint;
  v_weekly   jsonb;
  v_stages   jsonb;
begin
  if not public.is_staff() then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  select timezone into v_tz from public.settings where id = 1;

  select count(*) into v_sent    from public.emails where status in ('sent', 'replied') and not is_test;
  select count(*) into v_replies from public.emails where status = 'replied' and not is_test;

  select jsonb_object_agg(st.s, coalesce(d.n, 0) order by st.o) into v_stages
    from (select s::text as s, o from unnest(enum_range(null::public.deal_stage)) with ordinality as t(s, o)) st
    left join (select stage::text as s, count(*) as n from public.deals group by stage) d on d.s = st.s;

  select jsonb_agg(jsonb_build_object('week_start', w.wk, 'sent', coalesce(a.n, 0), 'replies', coalesce(r.n, 0))
                   order by w.wk) into v_weekly
    from (select (date_trunc('week', now() at time zone v_tz)::date - 7 * g) as wk from generate_series(0, 11) g) w
    left join (select date_trunc('week', sent_at at time zone v_tz)::date as wk, count(*) as n
                 from public.emails where status in ('sent', 'replied') and not is_test and sent_at is not null
                group by 1) a on a.wk = w.wk
    left join (select date_trunc('week', coalesce(replied_at, sent_at) at time zone v_tz)::date as wk, count(*) as n
                 from public.emails where status = 'replied' and not is_test
                group by 1) r on r.wk = w.wk;

  return jsonb_build_object(
    'total_creators', (select count(*) from public.creators),
    'emails_sent_all', v_sent,
    'emails_sent_7d',  (select count(*) from public.emails where status in ('sent', 'replied') and not is_test
                         and sent_at >= now() - interval '7 days'),
    'emails_sent_30d', (select count(*) from public.emails where status in ('sent', 'replied') and not is_test
                         and sent_at >= now() - interval '30 days'),
    'emails_failed_7d', (select count(*) from public.emails where status = 'failed' and not is_test
                          and updated_at >= now() - interval '7 days'),
    'replies', v_replies,
    'reply_rate', case when v_sent = 0 then 0 else round(v_replies * 100.0 / v_sent, 1) end,
    'deals_by_stage', v_stages,
    'active_deals', (select count(*) from public.deals where stage in ('negotiating', 'signed', 'completed')),
    'commission_earned_cents', (select coalesce(sum(commission_cents), 0) from public.deals where stage = 'paid'),
    'weekly', v_weekly);
end $$;

-- ---------------------------------------------------------------- M32 recent_activity
-- Same output columns as before. Ids are turned into uuid once (only when they look like one), so the
-- lookups use the primary keys. Actor: the staff member's name, 'A former user' when the profile is gone,
-- 'Smallfold' when there is no actor (system or public form).
create or replace function public.recent_activity(p_limit int default 20)
returns table (created_at timestamptz, actor_name text, action text, entity_type text,
               entity_id text, entity_label text, summary text)
language plpgsql stable security definer set search_path = public, extensions, pg_temp as $$
begin
  if not public.is_staff() then
    return;
  end if;
  return query
  with base as (
    select a.id, a.created_at as at, a.actor_id, a.action as act, a.entity_type as et, a.entity_id as eid, a.details as d,
           case when a.entity_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then a.entity_id::uuid end as eid_u,
           case when a.details ->> 'creator_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                then (a.details ->> 'creator_id')::uuid end as creator_u,
           case when a.details ->> 'brand_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                then (a.details ->> 'brand_id')::uuid end as brand_u
      from public.audit_log a
     where (a.action in ('creator.created', 'creator.updated', 'creator.deleted', 'creators.imported',
                         'creator.subscribers_refreshed', 'deal.created', 'deal.updated', 'deal.deleted',
                         'email.created', 'template.created', 'template.updated', 'template.deleted',
                         'suppression.created', 'suppression.deleted')
            or (a.action = 'email.status_changed' and a.details #>> '{changes,status,to}' in ('sent', 'failed', 'replied')))
       and not (a.action like 'email.%' and coalesce(a.details ->> 'is_test', 'false') = 'true')
     order by a.created_at desc, a.id desc
     limit least(greatest(coalesce(p_limit, 20), 1), 50)
  ), j as (
    select b.*,
           case when b.actor_id is null then 'Smallfold'
                else coalesce(nullif(p.full_name, ''), nullif(p.email::text, ''), 'A former user') end as actor,
           coalesce(
             case b.et when 'creator' then (select c.full_name from public.creators c where c.id = b.eid_u)
                       when 'brand' then (select x.name::text from public.brands x where x.id = b.eid_u)
                       when 'template' then (select t.name from public.email_templates t where t.id = b.eid_u)
                       when 'deal' then (select c.full_name from public.creators c where c.id = b.creator_u)
                       when 'email' then (select c.full_name from public.creators c where c.id = b.creator_u)
             end,
             nullif(b.d ->> 'label', '')) as label,
           coalesce((select x.name::text from public.brands x where x.id = b.brand_u), 'a brand') as brand
      from base b left join public.profiles p on p.id = b.actor_id
  )
  select j.at, j.actor, j.act, j.et, j.eid, j.label,
         case
           when j.act = 'email.status_changed' then
             case j.d #>> '{changes,status,to}'
               when 'sent'     then 'sent an email to ' || coalesce(j.label, 'a creator')
               when 'replied'  then 'marked a reply from ' || coalesce(j.label, 'a creator')
               when 'failed'   then 'had an email to ' || coalesce(j.label, 'a creator') || ' fail'
               when 'approved' then 'approved an email to ' || coalesce(j.label, 'a creator')
               else 'moved an email to ' || coalesce(j.label, 'a creator') || ' back to draft' end
           when j.act = 'email.created' then 'drafted an email to ' || coalesce(j.label, 'a creator')
           when j.act = 'email.deleted' then 'discarded a draft to ' || coalesce(j.label, 'a creator')
           when j.act = 'deal.created' then 'added a deal with ' || j.brand || ' for ' || coalesce(j.label, 'a creator')
           when j.act = 'deal.updated' and j.d #>> '{changes,stage,to}' is not null
                then 'moved a deal with ' || j.brand || ' to ' || (j.d #>> '{changes,stage,to}')
           when j.act = 'deal.updated' then 'updated a deal with ' || j.brand
           when j.act = 'deal.deleted' then 'deleted a deal with ' || j.brand
           when j.act = 'creator.created' then 'added creator ' || coalesce(j.label, '')
           when j.act = 'creator.updated' and j.d #>> '{changes,status,to}' is not null
                then 'marked ' || coalesce(j.label, 'a creator') || ' as ' || replace(j.d #>> '{changes,status,to}', '_', ' ')
           when j.act = 'creator.updated' then 'updated creator ' || coalesce(j.label, '')
           when j.act = 'creator.deleted' then 'deleted creator ' || coalesce(j.label, '')
           when j.act = 'creator.subscribers_refreshed' then 'refreshed subscriber counts for '
                || coalesce(j.d ->> 'count', j.d ->> 'refreshed', 'some') || ' creators'
           when j.act = 'creators.imported' then 'imported '
                || coalesce(j.d ->> 'count', j.d ->> 'imported', j.d ->> 'created', 'some') || ' creators'
           when j.act = 'suppression.created' then 'added an opt-out'
           when j.act = 'suppression.deleted' then 'removed an opt-out'
           when j.act like 'template.%' then split_part(j.act, '.', 2) || ' template ' || coalesce(j.label, '')
           when j.act like 'brand.%' then split_part(j.act, '.', 2) || ' brand ' || coalesce(j.label, '')
           when j.act = 'profile.role_changed' then 'changed the role of ' || coalesce(j.label, 'a user')
           else replace(j.act, '.', ' ')
         end
    from j
   order by j.at desc, j.id desc;
end $$;

-- ---------------------------------------------------------------- L07 creator_summaries
-- last_contacted_at = the later of the stored value and the newest real sent email.
-- Lateral joins look at only the creators on the page, not at every deal and email.
create or replace view public.creator_summaries with (security_invoker = true) as
select c.id, c.full_name, c.email, c.phone, c.channel_url, c.youtube_channel_id, c.channel_name, c.niche,
       c.subscribers, c.subscribers_hidden, c.subscribers_checked_at, c.status, c.notes,
       c.user_id, c.created_by, c.created_at, c.updated_at,
       coalesce(d.deal_count, 0)::integer          as deal_count,
       coalesce(d.earned, 0)::bigint               as total_earned_cents,
       greatest(c.last_contacted_at, e.last_sent)  as last_contacted_at
  from public.creators c
  left join lateral (select count(*) as deal_count,
                            sum(x.amount_cents - x.commission_cents) filter (where x.stage = 'paid') as earned
                       from public.deals x where x.creator_id = c.id) d on true
  left join lateral (select max(m.sent_at) as last_sent
                       from public.emails m
                      where m.creator_id = c.id and m.status in ('sent', 'replied') and not m.is_test) e on true;

notify pgrst, 'reload schema';
