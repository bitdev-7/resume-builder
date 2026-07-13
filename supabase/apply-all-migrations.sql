-- ─────────────────────────────────────────────────────────────────────────
-- Apply-all migrations (002–006), consolidated and idempotent.
-- Paste this whole file into the Supabase SQL Editor and run it. Safe to re-run:
-- every statement uses "if not exists" / "add column if not exists", so running
-- it repeatedly (or on a partially-migrated DB) does nothing harmful.
--
-- This brings an existing database up to date with the current app code. For a
-- brand-new database, run supabase/schema.sql instead (it already includes all of this).
-- ─────────────────────────────────────────────────────────────────────────

create extension if not exists pgcrypto;

-- 002 — resume email + headline on the account profile
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists headline text;

-- 003 — multiple resume profiles (personas) per account
create table if not exists public.resume_profiles (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) on delete cascade,
  label            text not null default 'My Profile',
  full_name        text,
  email            text,
  headline         text,
  phone            text,
  linkedin_url     text,
  summary          text,
  location         text,
  resume_template  text,
  is_default       boolean not null default false,
  display_order    integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists resume_profiles_user_id_idx on public.resume_profiles (user_id);
alter table public.resume_profiles enable row level security;
drop policy if exists "resume_profiles_all_own" on public.resume_profiles;
create policy "resume_profiles_all_own" on public.resume_profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

insert into public.resume_profiles
  (user_id, label, full_name, email, headline, phone, linkedin_url, summary, location, resume_template, is_default, display_order)
select p.id, 'My Profile', p.full_name, p.email, p.headline, p.phone, p.linkedin_url, p.summary, p.location,
       coalesce(p.default_settings->>'resume_template', 'standard'), true, 0
from public.profiles p
where not exists (select 1 from public.resume_profiles rp where rp.user_id = p.id);

alter table public.user_educations     add column if not exists profile_id uuid references public.resume_profiles (id) on delete cascade;
alter table public.user_skills          add column if not exists profile_id uuid references public.resume_profiles (id) on delete cascade;
alter table public.user_certifications  add column if not exists profile_id uuid references public.resume_profiles (id) on delete cascade;
alter table public.user_projects        add column if not exists profile_id uuid references public.resume_profiles (id) on delete cascade;
alter table public.user_companies       add column if not exists profile_id uuid references public.resume_profiles (id) on delete cascade;

update public.user_educations c    set profile_id = rp.id from public.resume_profiles rp where rp.user_id = c.user_id and rp.is_default and c.profile_id is null;
update public.user_skills c         set profile_id = rp.id from public.resume_profiles rp where rp.user_id = c.user_id and rp.is_default and c.profile_id is null;
update public.user_certifications c set profile_id = rp.id from public.resume_profiles rp where rp.user_id = c.user_id and rp.is_default and c.profile_id is null;
update public.user_projects c       set profile_id = rp.id from public.resume_profiles rp where rp.user_id = c.user_id and rp.is_default and c.profile_id is null;
update public.user_companies c      set profile_id = rp.id from public.resume_profiles rp where rp.user_id = c.user_id and rp.is_default and c.profile_id is null;

create index if not exists user_educations_profile_id_idx    on public.user_educations (profile_id);
create index if not exists user_skills_profile_id_idx         on public.user_skills (profile_id);
create index if not exists user_certifications_profile_id_idx on public.user_certifications (profile_id);
create index if not exists user_projects_profile_id_idx       on public.user_projects (profile_id);
create index if not exists user_companies_profile_id_idx      on public.user_companies (profile_id);

alter table public.resume_history add column if not exists profile_id uuid references public.resume_profiles (id) on delete set null;
create index if not exists resume_history_profile_id_idx on public.resume_history (profile_id);

-- 004 — photo + languages on resume profiles
alter table public.resume_profiles add column if not exists photo_url text;
alter table public.resume_profiles add column if not exists languages jsonb not null default '[]'::jsonb;

-- 005 — per-profile editable prompt overrides
alter table public.resume_profiles add column if not exists prompt_overrides jsonb not null default '{}'::jsonb;

-- 006 — education start/end dates
alter table public.user_educations add column if not exists start_date date;
alter table public.user_educations add column if not exists end_date date;

-- ─────────────────────────────────────────────────────────────────────────
-- Verify (optional): should list photo_url, languages, prompt_overrides on
-- resume_profiles and start_date, end_date on user_educations.
-- ─────────────────────────────────────────────────────────────────────────
-- select table_name, column_name from information_schema.columns
-- where (table_name = 'resume_profiles' and column_name in ('photo_url','languages','prompt_overrides'))
--    or (table_name = 'user_educations' and column_name in ('start_date','end_date'))
-- order by table_name, column_name;
