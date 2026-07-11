-- Adds a resume email (separate from the sign-in email) and a professional
-- headline/title (e.g. "Software Engineer") to the profiles table.
-- Run in Supabase Dashboard -> SQL Editor. Safe to re-run.

alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists headline text;
