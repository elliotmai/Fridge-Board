-- Just enough of Supabase to run the migrations on plain Postgres in tests:
-- the auth schema, auth.uid(), and the three API roles.
-- Supabase keeps extensions in their own schema.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
do $$ begin
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
exception when duplicate_object then null; end $$;
grant usage on schema extensions to anon, authenticated, service_role;
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}', created_at timestamptz default now());
create or replace function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

-- Made by Supabase when a project is created.
create or replace function public.rls_auto_enable() returns void language sql security definer as $$ select $$;

-- Columns the household screen functions read (household_people_emails).
alter table auth.users add column if not exists email_confirmed_at timestamptz;
alter table auth.users add column if not exists is_anonymous boolean default false;
alter table auth.users add column if not exists confirmed_at timestamptz;

-- Supabase Storage, as far as the migrations touch it. (pg_cron must be installed
-- and in shared_preload_libraries, as it is on Supabase.)
create schema if not exists storage;
create table if not exists storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[] language sql immutable as
  $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
grant usage on schema storage to anon, authenticated, service_role;
create or replace function auth.jwt() returns jsonb language sql stable as
  $$ select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $$;
grant execute on function auth.jwt() to anon, authenticated, service_role;
