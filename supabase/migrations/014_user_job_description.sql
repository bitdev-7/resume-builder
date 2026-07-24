alter table public.user_job_status
  add column if not exists job_description text not null default '';
