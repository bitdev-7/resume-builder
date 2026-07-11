-- Adds an optional photo (data URL) and languages (with proficiency) to each
-- resume profile, for the richer two-column "sidebar" template.
-- Run in Supabase Dashboard -> SQL Editor. Safe to re-run.

alter table public.resume_profiles add column if not exists photo_url text;
alter table public.resume_profiles add column if not exists languages jsonb not null default '[]'::jsonb;
