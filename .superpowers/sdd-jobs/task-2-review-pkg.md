# Review Task 2
BASE: d34c9724a916c77d9f2ecf203a197c806ae96459
HEAD: 55e9656ebe1ee8b4714fcab761f40035495ba367
55e9656 feat: add jobs catalog and user_job_status schema

 supabase/migrations/007_jobs_tracker.sql | 56 +++++++++++++++++++++++++++++++
 supabase/schema.sql                      | 57 ++++++++++++++++++++++++++++++++
 2 files changed, 113 insertions(+)

```
diff --git a/supabase/migrations/007_jobs_tracker.sql b/supabase/migrations/007_jobs_tracker.sql
new file mode 100644
index 0000000..0f9a7ef
--- /dev/null
+++ b/supabase/migrations/007_jobs_tracker.sql
@@ -0,0 +1,56 @@
+-- Jobs tracker: global catalog + per-user status.
+-- Run in Supabase Dashboard -> SQL Editor. Safe to re-run.
+
+create table if not exists public.jobs (
+  id uuid primary key default gen_random_uuid(),
+  url text not null,
+  created_at timestamptz not null default now(),
+  constraint jobs_url_unique unique (url)
+);
+
+alter table public.jobs enable row level security;
+
+drop policy if exists "jobs_select_authenticated" on public.jobs;
+create policy "jobs_select_authenticated" on public.jobs
+  for select to authenticated using (true);
+
+drop policy if exists "jobs_insert_authenticated" on public.jobs;
+create policy "jobs_insert_authenticated" on public.jobs
+  for insert to authenticated with check (true);
+
+-- No update/delete policies for authenticated users in v1.
+create table if not exists public.user_job_status (
+  user_id uuid not null references public.profiles (id) on delete cascade,
+  job_id uuid not null references public.jobs (id) on delete cascade,
+  status text not null default 'unapplied'
+    check (status in (
+      'unapplied', 'opened', 'applied', 'interviewing',
+      'rejected', 'offer', 'accepted'
+    )),
+  updated_at timestamptz not null default now(),
+  primary key (user_id, job_id)
+);
+
+create index if not exists user_job_status_user_id_idx on public.user_job_status (user_id);
+
+alter table public.user_job_status enable row level security;
+
+drop policy if exists "user_job_status_all_own" on public.user_job_status;
+create policy "user_job_status_all_own" on public.user_job_status
+  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
+
+alter table public.resume_history
+  add column if not exists job_id uuid references public.jobs (id) on delete set null;
+
+create index if not exists resume_history_job_id_idx on public.resume_history (job_id);
+
+-- The inline CHECK in schema.sql is generated as resume_history_bid_status_check.
+alter table public.resume_history
+  drop constraint if exists resume_history_bid_status_check;
+
+alter table public.resume_history
+  add constraint resume_history_bid_status_check
+  check (bid_status in (
+    'unapplied', 'opened', 'applied', 'interviewing',
+    'rejected', 'offer', 'accepted'
+  ));
diff --git a/supabase/schema.sql b/supabase/schema.sql
index 793dd26..96b1eae 100644
--- a/supabase/schema.sql
+++ b/supabase/schema.sql
@@ -311,5 +311,62 @@ create index if not exists user_educations_profile_id_idx    on public.user_educ
 create index if not exists user_skills_profile_id_idx         on public.user_skills (profile_id);
 create index if not exists user_certifications_profile_id_idx on public.user_certifications (profile_id);
 create index if not exists user_projects_profile_id_idx       on public.user_projects (profile_id);
 create index if not exists user_companies_profile_id_idx      on public.user_companies (profile_id);
 create index if not exists resume_history_profile_id_idx      on public.resume_history (profile_id);
+
+-- ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
+-- Jobs tracker ΓÇö shared URL catalog + per-user status
+-- ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
+create table if not exists public.jobs (
+  id uuid primary key default gen_random_uuid(),
+  url text not null,
+  created_at timestamptz not null default now(),
+  constraint jobs_url_unique unique (url)
+);
+
+alter table public.jobs enable row level security;
+
+drop policy if exists "jobs_select_authenticated" on public.jobs;
+create policy "jobs_select_authenticated" on public.jobs
+  for select to authenticated using (true);
+
+drop policy if exists "jobs_insert_authenticated" on public.jobs;
+create policy "jobs_insert_authenticated" on public.jobs
+  for insert to authenticated with check (true);
+
+-- No update/delete policies for authenticated users in v1.
+create table if not exists public.user_job_status (
+  user_id uuid not null references public.profiles (id) on delete cascade,
+  job_id uuid not null references public.jobs (id) on delete cascade,
+  status text not null default 'unapplied'
+    check (status in (
+      'unapplied', 'opened', 'applied', 'interviewing',
+      'rejected', 'offer', 'accepted'
+    )),
+  updated_at timestamptz not null default now(),
+  primary key (user_id, job_id)
+);
+
+create index if not exists user_job_status_user_id_idx on public.user_job_status (user_id);
+
+alter table public.user_job_status enable row level security;
+
+drop policy if exists "user_job_status_all_own" on public.user_job_status;
+create policy "user_job_status_all_own" on public.user_job_status
+  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
+
+alter table public.resume_history
+  add column if not exists job_id uuid references public.jobs (id) on delete set null;
+
+create index if not exists resume_history_job_id_idx on public.resume_history (job_id);
+
+-- Expand the generated inline CHECK constraint to the complete status set.
+alter table public.resume_history
+  drop constraint if exists resume_history_bid_status_check;
+
+alter table public.resume_history
+  add constraint resume_history_bid_status_check
+  check (bid_status in (
+    'unapplied', 'opened', 'applied', 'interviewing',
+    'rejected', 'offer', 'accepted'
+  ));

```
