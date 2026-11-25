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
