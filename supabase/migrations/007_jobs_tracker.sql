-- Jobs tracker: global catalog + per-user status.
-- Run in Supabase Dashboard -> SQL Editor. Safe to re-run.

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
      'unapplied', 'opened', 'applied', 'interviewing',
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

-- The inline CHECK in schema.sql is generated as resume_history_bid_status_check.
alter table public.resume_history
  drop constraint if exists resume_history_bid_status_check;

alter table public.resume_history
  add constraint resume_history_bid_status_check
  check (bid_status in (
    'unapplied', 'opened', 'applied', 'interviewing',
    'rejected', 'offer', 'accepted'
  ));
