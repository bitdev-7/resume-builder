-- Education start/end dates (previously only graduation_date existed).
-- end_date is the completion date; graduation_date is kept for backward compatibility.
alter table public.user_educations add column if not exists start_date date;
alter table public.user_educations add column if not exists end_date date;
