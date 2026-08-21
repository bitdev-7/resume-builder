-- Allow authenticated users to permanently delete jobs from the shared catalog.
-- Cascades: user_job_status rows are removed; resume_history.job_id is set null.

drop policy if exists "jobs_delete_authenticated" on public.jobs;
create policy "jobs_delete_authenticated" on public.jobs
  for delete to authenticated using (true);
