-- Add per-user "ignored" job status (hide from Jobs list for that account only).
-- Safe to re-run.

alter table public.user_job_status
  drop constraint if exists user_job_status_status_check;

alter table public.user_job_status
  add constraint user_job_status_status_check
  check (status in (
    'unapplied', 'opened', 'applied', 'ignored', 'interviewing',
    'rejected', 'offer', 'accepted'
  ));

alter table public.resume_history
  drop constraint if exists resume_history_bid_status_check;

alter table public.resume_history
  add constraint resume_history_bid_status_check
  check (bid_status in (
    'unapplied', 'opened', 'applied', 'ignored', 'interviewing',
    'rejected', 'offer', 'accepted'
  ));
