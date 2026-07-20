### Task 2: Supabase schema for jobs + user_job_status + resume_history.job_id

**Files:**
- Modify: `supabase/schema.sql` (append migration-safe DDL; do not rewrite old CHECK mid-table create blindly — use `alter` section at end)
- Optionally create: `supabase/migrations/YYYYMMDD_jobs_tracker.sql` with the same SQL for live projects

**Interfaces:**
- Produces DB tables/policies matching the design spec

- [ ] **Step 1: Append DDL** (exact intent)

```sql
-- Jobs tracker: global catalog + per-user status
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

-- no update/delete policies for authenticated in v1

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
```

**Expand `resume_history.bid_status` check:** Postgres cannot alter CHECK in place easily. Append a migration that:

1. Drops the old check constraint (query `pg_constraint` / known name if any; else recreate table pattern used elsewhere — prefer: `alter table ... drop constraint if exists resume_history_bid_status_check` then `add constraint ... check (bid_status in (...full set...))`).

Implementer must verify constraint name on local Supabase and document it in the commit message if different.

- [ ] **Step 2: Apply schema** to the project’s Supabase (local SQL editor / `supabase db push` / paste into dashboard). Confirm:

```sql
insert into jobs (url) values ('https://example.com/a');
-- second insert same url fails
```

- [ ] **Step 3: Commit**

```bash
git add supabase/schema.sql supabase/migrations/
git commit -m "feat: add jobs catalog and user_job_status schema"
```

---
