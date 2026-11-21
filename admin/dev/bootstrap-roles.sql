-- Local-only: recreate what a hosted Supabase project already has (roles, schemas, default grants).
-- Idempotent. Real Supabase needs none of this.
do $$
begin
  if not exists (select from pg_roles where rolname = 'anon')          then create role anon nologin noinherit; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select from pg_roles where rolname = 'service_role')  then create role service_role nologin noinherit bypassrls; end if;
  if not exists (select from pg_roles where rolname = 'authenticator') then create role authenticator login noinherit password 'local-dev'; end if;
  if not exists (select from pg_roles where rolname = 'supabase_auth_admin') then create role supabase_auth_admin login noinherit createrole password 'local-dev'; end if;
  if not exists (select from pg_roles where rolname = 'supabase_admin')  then create role supabase_admin login superuser password 'local-dev'; end if;
  if not exists (select from pg_roles where rolname = 'dashboard_user')  then create role dashboard_user nologin; end if;
end $$;

grant anon, authenticated, service_role to authenticator;
grant supabase_auth_admin to postgres;

create schema if not exists auth authorization supabase_auth_admin;
create schema if not exists extensions;
alter role supabase_auth_admin set search_path = auth;
grant create on database postgres to supabase_auth_admin;

-- Hosted Supabase defaults: API roles can use the schemas ...
grant usage on schema public, extensions to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
-- ... and new objects created by postgres in public are granted to them automatically.
-- The migrations must undo this for anon; the tests prove they do.
alter default privileges for role postgres in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on functions to anon, authenticated, service_role;
