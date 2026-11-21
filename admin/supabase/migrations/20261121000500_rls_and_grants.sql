-- Row level security, policies and grants. Deny by default.
-- Policy names: staff_* / owner_* now; creator_self_* and brand_member_* can be added beside them.
set search_path = public, extensions;

alter table public.profiles        enable row level security;
alter table public.creators        enable row level security;
alter table public.brands          enable row level security;
alter table public.deals           enable row level security;
alter table public.email_templates enable row level security;
alter table public.emails          enable row level security;
alter table public.suppression_list enable row level security;
alter table public.settings        enable row level security;
alter table public.audit_log       enable row level security;
alter table public.login_attempts  enable row level security;   -- no policies: service role only

-- ---- policies
-- creators, brands, deals, email_templates: staff read/write, owner delete
do $$
declare t text;
begin
  foreach t in array array['creators', 'brands', 'deals', 'email_templates'] loop
    execute format('create policy staff_select_%1$s on public.%1$I for select to authenticated using ((select public.is_staff()))', t);
    execute format('create policy staff_insert_%1$s on public.%1$I for insert to authenticated with check ((select public.is_staff()))', t);
    execute format('create policy staff_update_%1$s on public.%1$I for update to authenticated using ((select public.is_staff())) with check ((select public.is_staff()))', t);
    execute format('create policy owner_delete_%1$s on public.%1$I for delete to authenticated using ((select public.is_owner()))', t);
  end loop;
end $$;

-- emails: staff read/write; staff may throw away unsent drafts, nobody deletes the sent log
create policy staff_select_emails on public.emails for select to authenticated using ((select public.is_staff()));
create policy staff_insert_emails on public.emails for insert to authenticated with check ((select public.is_staff()));
create policy staff_update_emails on public.emails for update to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));
create policy staff_delete_unsent_emails on public.emails for delete to authenticated
  using ((select public.is_staff()) and status in ('draft', 'approved'));

-- settings: staff read, owner update (single row, no insert / delete)
create policy staff_select_settings on public.settings for select to authenticated using ((select public.is_staff()));
create policy owner_update_settings on public.settings for update to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

-- profiles: staff read, owner update (role, is_active, full_name; see column grants)
create policy staff_select_profiles on public.profiles for select to authenticated using ((select public.is_staff()));
create policy owner_update_profiles on public.profiles for update to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

-- suppression list: staff read and add, only the owner removes
create policy staff_select_suppression on public.suppression_list for select to authenticated using ((select public.is_staff()));
create policy staff_insert_suppression on public.suppression_list for insert to authenticated with check ((select public.is_staff()));
create policy owner_delete_suppression on public.suppression_list for delete to authenticated using ((select public.is_owner()));

-- audit log: owner reads. No insert / update / delete policy for anyone.
create policy owner_select_audit_log on public.audit_log for select to authenticated using ((select public.is_owner()));

-- ---- privileges: start from nothing, then grant exactly what is needed
-- Hosted Supabase grants new objects to anon / authenticated / service_role by default; undo that.
alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;
alter default privileges in schema public revoke execute on functions from public;

revoke all on all tables    in schema public from anon, authenticated, service_role;
revoke all on all sequences in schema public from anon, authenticated, service_role;

-- functions that belong to extensions are left alone
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.prokind in ('f', 'p')
              and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', r.sig);
  end loop;
end $$;

grant select, insert, update, delete on public.creators, public.brands, public.deals, public.email_templates,
      public.emails, public.suppression_list to authenticated;
grant select, update on public.settings to authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, role, is_active) on public.profiles to authenticated;
grant select on public.audit_log to authenticated;
grant select on public.creator_summaries to authenticated;

-- service role: full access to data tables (like hosted), but the audit log stays append-only
grant all on public.profiles, public.creators, public.brands, public.deals, public.email_templates,
      public.emails, public.suppression_list, public.settings, public.login_attempts to service_role;
grant select, insert on public.audit_log to service_role;
grant select on public.creator_summaries to service_role;
grant usage, select on all sequences in schema public to service_role;

-- functions
grant execute on function public.is_staff(), public.is_owner(), public.commission_cents(bigint),
  public.reserve_send(uuid), public.mark_sent(uuid, text), public.mark_failed(uuid, text),
  public.mark_replied(uuid), public.stats_overview(),
  public.log_audit(text, text, text, jsonb, uuid) to authenticated, service_role;
grant execute on function public.opt_out(text, text), public.bootstrap_owner(text),
  public.login_allowed(text, text), public.record_login_attempt(text, text, boolean) to service_role;

notify pgrst, 'reload schema';
