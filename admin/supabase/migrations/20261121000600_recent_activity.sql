-- recent_activity(): the Overview feed for all staff. Workers cannot read audit_log, so this
-- SECURITY DEFINER function returns a filtered, plain-English view of it (newest first, max 50).
-- Left out: creator.viewed, creators.exported, auth.*, user.*, settings.*, smallfold.reserve_send,
-- 'sending' status flips, and every email action on a test email.
set search_path = public, extensions;

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
    select a.id, a.created_at as at, a.actor_id, a.action as act, a.entity_type as et, a.entity_id as eid, a.details as d
      from public.audit_log a
     where a.action not in ('creator.viewed', 'creators.exported', 'auth.login', 'auth.logout',
                            'auth.password_changed', 'smallfold.reserve_send')
       and a.action not like 'user.%' and a.action not like 'settings.%'
       and not (a.action like 'email.%' and coalesce(a.details ->> 'is_test', 'false') = 'true')
       and not (a.action = 'email.status_changed' and a.details #>> '{changes,status,to}' = 'sending')
     order by a.created_at desc, a.id desc
     limit least(greatest(coalesce(p_limit, 20), 1), 50)
  ), j as (
    select b.*,
           coalesce(p.full_name, nullif(p.email::text, ''), 'Someone') as actor,
           coalesce(
             case b.et when 'creator' then (select c.full_name from public.creators c where c.id::text = b.eid)
                       when 'brand' then (select x.name::text from public.brands x where x.id::text = b.eid)
                       when 'template' then (select t.name from public.email_templates t where t.id::text = b.eid)
                       when 'deal' then (select c.full_name from public.creators c where c.id::text = b.d ->> 'creator_id')
                       when 'email' then (select c.full_name from public.creators c where c.id::text = b.d ->> 'creator_id')
             end,
             nullif(b.d ->> 'label', '')) as label,
           coalesce((select x.name::text from public.brands x where x.id::text = b.d ->> 'brand_id'), 'a brand') as brand
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

revoke all on function public.recent_activity(int) from public, anon, authenticated, service_role;
grant execute on function public.recent_activity(int) to authenticated;
notify pgrst, 'reload schema';
