-- Smallfold back office: extensions and enum types.
-- Runs unchanged on hosted Supabase (Postgres 15/17) and on the local stack in admin/dev.
set search_path = public, extensions;

create schema if not exists extensions;
create extension if not exists citext  with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- Roles. Extend later with: alter type public.app_role add value 'brand_member';
create type public.app_role       as enum ('owner', 'worker');
create type public.creator_status as enum ('new', 'contacted', 'replied', 'active', 'inactive', 'do_not_contact');
create type public.deal_stage     as enum ('contacted', 'replied', 'negotiating', 'signed', 'completed', 'paid');
create type public.email_status   as enum ('draft', 'approved', 'sending', 'sent', 'failed', 'replied');
