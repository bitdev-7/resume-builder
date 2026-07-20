-- Resume Maker — database schema (canonical, up to date with migrations
-- 002–009 and 012). Prefer this file for a full idempotent bootstrap;
-- migrations/ remains the incremental history for existing projects.
--
-- How to run: Supabase Dashboard → SQL Editor → paste this file → Run.
-- Safe to re-run: every statement is idempotent (IF NOT EXISTS / OR REPLACE).

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────────────────
-- profiles — one row per auth user, id = auth.users.id
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  full_name        text,
  email            text,
  phone            text,
  role             text not null default 'user',
  default_settings jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Columns added after initial release (safe on existing installs).
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists role text not null default 'user';

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check check (role in ('admin', 'user'));

-- Redundant account fields moved to resume_profiles (migration 012).
alter table public.profiles drop column if exists headline;
alter table public.profiles drop column if exists linkedin_url;
alter table public.profiles drop column if exists summary;
alter table public.profiles drop column if exists location;

-- Block JWT clients from changing role (service_role can still promote manually)
create or replace function public.prevent_profile_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.role is distinct from old.role then
    if coalesce(auth.role(), '') <> 'service_role' then
      raise exception 'Cannot change profiles.role';
    end if;
  end if;
  if tg_op = 'INSERT' and new.role is distinct from 'user' then
    if coalesce(auth.role(), '') <> 'service_role' then
      raise exception 'Cannot set profiles.role on insert';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_prevent_role_escalation on public.profiles;
create trigger profiles_prevent_role_escalation
  before insert or update on public.profiles
  for each row
  execute function public.prevent_profile_role_escalation();

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_delete_own" on public.profiles
  for delete using (auth.uid() = id);

-- ─────────────────────────────────────────────────────────────────────────
-- resume_profiles — one row per persona (many per account). Holds the resume
-- contact/summary/title + PDF template; content tables reference it.
-- ─────────────────────────────────────────────────────────────────────────
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
  photo_url        text,
  languages        jsonb not null default '[]'::jsonb,
  prompt_overrides jsonb not null default '{}'::jsonb,
  is_default       boolean not null default false,
  display_order    integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists resume_profiles_user_id_idx on public.resume_profiles (user_id);

-- Columns added after the resume_profiles table shipped (safe on existing installs).
alter table public.resume_profiles add column if not exists photo_url text;
alter table public.resume_profiles add column if not exists languages jsonb not null default '[]'::jsonb;
alter table public.resume_profiles add column if not exists prompt_overrides jsonb not null default '{}'::jsonb;

alter table public.resume_profiles enable row level security;

drop policy if exists "resume_profiles_all_own" on public.resume_profiles;
create policy "resume_profiles_all_own" on public.resume_profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────
-- user_educations
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.user_educations (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) on delete cascade,
  profile_id       uuid references public.resume_profiles (id) on delete cascade,
  school           text not null,
  degree           text,
  field_of_study   text,
  gpa              numeric,
  location         text,
  start_date       date,
  end_date         date,
  graduation_date  date,
  description      text,
  display_order    integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists user_educations_user_id_idx on public.user_educations (user_id);

-- Columns added after user_educations shipped (safe on existing installs).
alter table public.user_educations add column if not exists start_date date;
alter table public.user_educations add column if not exists end_date date;

alter table public.user_educations enable row level security;

drop policy if exists "user_educations_all_own" on public.user_educations;
create policy "user_educations_all_own" on public.user_educations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────
-- user_skills
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.user_skills (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete cascade,
  profile_id     uuid references public.resume_profiles (id) on delete cascade,
  skill_name     text not null,
  category       text,
  proficiency    text,
  display_order  integer not null default 0,
  created_at     timestamptz not null default now()
);

create index if not exists user_skills_user_id_idx on public.user_skills (user_id);

alter table public.user_skills enable row level security;

drop policy if exists "user_skills_all_own" on public.user_skills;
create policy "user_skills_all_own" on public.user_skills
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────
-- user_certifications
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.user_certifications (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references public.profiles (id) on delete cascade,
  profile_id            uuid references public.resume_profiles (id) on delete cascade,
  certification_name    text not null,
  issuing_organization  text,
  issue_date            date,
  expiration_date       date,
  credential_id         text,
  credential_url        text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists user_certifications_user_id_idx on public.user_certifications (user_id);

alter table public.user_certifications enable row level security;

drop policy if exists "user_certifications_all_own" on public.user_certifications;
create policy "user_certifications_all_own" on public.user_certifications
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────
-- user_projects
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.user_projects (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete cascade,
  profile_id     uuid references public.resume_profiles (id) on delete cascade,
  project_name   text not null,
  description    text,
  technologies   text[],
  github_url     text,
  live_url       text,
  start_date     date,
  end_date       date,
  display_order  integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists user_projects_user_id_idx on public.user_projects (user_id);

alter table public.user_projects enable row level security;

drop policy if exists "user_projects_all_own" on public.user_projects;
create policy "user_projects_all_own" on public.user_projects
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────
-- user_companies
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.user_companies (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete cascade,
  profile_id        uuid references public.resume_profiles (id) on delete cascade,
  company_name      text not null,
  title             text,
  company_location  text,
  work_type         text check (work_type in ('Remote', 'Hybrid', 'Onsite')),
  start_date        date,
  end_date          date,
  is_current        boolean not null default false,
  description       text,
  achievements      text[],
  display_order     integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists user_companies_user_id_idx on public.user_companies (user_id);

alter table public.user_companies enable row level security;

drop policy if exists "user_companies_all_own" on public.user_companies;
create policy "user_companies_all_own" on public.user_companies
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────
-- resume_history — one row per generated/tailored resume ("bid")
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.resume_history (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles (id) on delete cascade,
  profile_id         uuid references public.resume_profiles (id) on delete set null,
  ai_type            text,
  model              text,
  job_site           text,
  job_link           text,
  job_title          text,
  job_company        text,
  jd_file_path       text,
  resume_file_path   text,
  bid_status         text not null default 'applied'
                       check (bid_status in (
                         'unapplied', 'opened', 'applied', 'ignored', 'interviewing',
                         'rejected', 'offer', 'accepted'
                       )),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists resume_history_user_id_idx on public.resume_history (user_id);
create index if not exists resume_history_created_at_idx on public.resume_history (created_at desc);

alter table public.resume_history enable row level security;

drop policy if exists "resume_history_all_own" on public.resume_history;
create policy "resume_history_all_own" on public.resume_history
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────
-- interview_history
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.interview_history (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) on delete cascade,
  resume_id        uuid references public.resume_history (id) on delete set null,
  interview_date   date not null,
  caller           text,
  interviewer      text,
  call_type        text check (call_type in ('intro', 'hr', 'live_coding', 'system_design', 'culture', 'final')),
  video_name       text,
  note             text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists interview_history_user_id_idx on public.interview_history (user_id);
create index if not exists interview_history_resume_id_idx on public.interview_history (resume_id);

alter table public.interview_history enable row level security;

drop policy if exists "interview_history_all_own" on public.interview_history;
create policy "interview_history_all_own" on public.interview_history
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────
-- Storage buckets — jds (job description text) and resumes (resume/cover
-- letter JSON), paths are "{userId}/..." so RLS is scoped by the first
-- path segment matching the authenticated user's id.
-- ─────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('jds', 'jds', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('resumes', 'resumes', false)
on conflict (id) do nothing;

drop policy if exists "jds_all_own" on storage.objects;
create policy "jds_all_own" on storage.objects
  for all using (bucket_id = 'jds' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'jds' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "resumes_all_own" on storage.objects;
create policy "resumes_all_own" on storage.objects
  for all using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);

-- ─────────────────────────────────────────────────────────────────────────
-- Per-profile content link (kept alongside user_id, which backs RLS).
-- ─────────────────────────────────────────────────────────────────────────
alter table public.user_educations     add column if not exists profile_id uuid references public.resume_profiles (id) on delete cascade;
alter table public.user_skills          add column if not exists profile_id uuid references public.resume_profiles (id) on delete cascade;
alter table public.user_certifications  add column if not exists profile_id uuid references public.resume_profiles (id) on delete cascade;
alter table public.user_projects        add column if not exists profile_id uuid references public.resume_profiles (id) on delete cascade;
alter table public.user_companies       add column if not exists profile_id uuid references public.resume_profiles (id) on delete cascade;
alter table public.resume_history       add column if not exists profile_id uuid references public.resume_profiles (id) on delete set null;

create index if not exists user_educations_profile_id_idx    on public.user_educations (profile_id);
create index if not exists user_skills_profile_id_idx         on public.user_skills (profile_id);
create index if not exists user_certifications_profile_id_idx on public.user_certifications (profile_id);
create index if not exists user_projects_profile_id_idx       on public.user_projects (profile_id);
create index if not exists user_companies_profile_id_idx      on public.user_companies (profile_id);
create index if not exists resume_history_profile_id_idx      on public.resume_history (profile_id);

-- ─────────────────────────────────────────────────────────────────────────
-- Jobs tracker — shared URL catalog + per-user status
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  created_at timestamptz not null default now(),
  constraint jobs_url_unique unique (url)
);

alter table public.jobs enable row level security;

drop policy if exists "jobs_select_authenticated" on public.jobs;
create policy "jobs_select_authenticated" on public.jobs
  for select to authenticated using (true);

drop policy if exists "jobs_insert_authenticated" on public.jobs;
create policy "jobs_insert_authenticated" on public.jobs
  for insert to authenticated with check (true);

-- No update/delete policies for authenticated users in v1.
create table if not exists public.user_job_status (
  user_id uuid not null references public.profiles (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  status text not null default 'unapplied'
    check (status in (
      'unapplied', 'opened', 'applied', 'ignored', 'interviewing',
      'rejected', 'offer', 'accepted'
    )),
  updated_at timestamptz not null default now(),
  primary key (user_id, job_id)
);

create index if not exists user_job_status_user_id_idx on public.user_job_status (user_id);

alter table public.user_job_status enable row level security;

drop policy if exists "user_job_status_all_own" on public.user_job_status;
create policy "user_job_status_all_own" on public.user_job_status
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.resume_history
  add column if not exists job_id uuid references public.jobs (id) on delete set null;

create index if not exists resume_history_job_id_idx on public.resume_history (job_id);

-- Expand the generated inline CHECK constraint to the complete status set.
alter table public.resume_history
  drop constraint if exists resume_history_bid_status_check;

alter table public.resume_history
  add constraint resume_history_bid_status_check
  check (bid_status in (
    'unapplied', 'opened', 'applied', 'ignored', 'interviewing',
    'rejected', 'offer', 'accepted'
  ));

-- ─────────────────────────────────────────────────────────────────────────
-- ai_usage_logs — one row per LLM call (tokens / cost / model / stage)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.ai_usage_logs (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete cascade,
  profile_id        uuid references public.resume_profiles (id) on delete set null,
  source            text not null default 'resume_generation',
  stage             text not null default 'ai-call',
  provider          text,
  model             text not null,
  prompt_tokens     integer not null default 0,
  completion_tokens integer not null default 0,
  total_tokens      integer not null default 0,
  cost_usd          numeric not null default 0,
  cost_source       text not null default 'estimated'
    check (cost_source in ('provider', 'estimated')),
  duration_ms       integer,
  success           boolean not null default true,
  error             text,
  created_at        timestamptz not null default now()
);

create index if not exists ai_usage_logs_user_id_idx on public.ai_usage_logs (user_id);
create index if not exists ai_usage_logs_profile_id_idx on public.ai_usage_logs (profile_id);
create index if not exists ai_usage_logs_created_at_idx on public.ai_usage_logs (created_at);
create index if not exists ai_usage_logs_source_idx on public.ai_usage_logs (source);

alter table public.ai_usage_logs enable row level security;

drop policy if exists "ai_usage_logs_all_own" on public.ai_usage_logs;
create policy "ai_usage_logs_all_own" on public.ai_usage_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────
-- Skill catalog + role archetype additions (global, any authenticated user)
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.skill_catalog_additions (
  id             uuid primary key default gen_random_uuid(),
  canonical_name text not null,
  aliases        text[] not null default '{}',
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  version        integer not null default 1,
  constraint skill_catalog_additions_canonical_name_unique unique (canonical_name)
);

create index if not exists skill_catalog_additions_canonical_name_idx
  on public.skill_catalog_additions (canonical_name);

drop trigger if exists "skill_catalog_additions_set_updated_at" on public.skill_catalog_additions;
create trigger "skill_catalog_additions_set_updated_at"
  before update on public.skill_catalog_additions
  for each row execute function public.set_updated_at();

alter table public.skill_catalog_additions enable row level security;

drop policy if exists "skill_catalog_additions_auth_all" on public.skill_catalog_additions;
create policy "skill_catalog_additions_auth_all" on public.skill_catalog_additions
  for all to authenticated using (true) with check (true);

create table if not exists public.role_archetype_additions (
  id                   text primary key,
  label                text not null,
  title_keywords       text[] not null default '{}',
  core                 text[] not null default '{}',
  ecosystem            jsonb not null default '{}'::jsonb,
  market_relevant      text[] not null default '{}',
  skill_category_hints text[] not null default '{}',
  created_by           uuid references public.profiles (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  version              integer not null default 1
);

drop trigger if exists "role_archetype_additions_set_updated_at" on public.role_archetype_additions;
create trigger "role_archetype_additions_set_updated_at"
  before update on public.role_archetype_additions
  for each row execute function public.set_updated_at();

alter table public.role_archetype_additions enable row level security;

drop policy if exists "role_archetype_additions_auth_all" on public.role_archetype_additions;
create policy "role_archetype_additions_auth_all" on public.role_archetype_additions
  for all to authenticated using (true) with check (true);
