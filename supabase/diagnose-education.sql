-- ─────────────────────────────────────────────────────────────────────────
-- Why is the Education section empty? Run these in the Supabase SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────

-- (1) Do the new columns exist? Expect start_date and end_date.
select column_name
from information_schema.columns
where table_name = 'user_educations'
order by column_name;

-- (2) How many education rows exist, and are they linked to a resume profile?
--     null profile_id = orphaned (won't load, since the app queries by profile_id).
select
  count(*)                                    as total_rows,
  count(*) filter (where profile_id is null)  as orphaned_null_profile,
  count(*) filter (where profile_id is not null) as linked_rows
from public.user_educations;

-- (3) List rows with their profile linkage (see if they point at your active profile).
select e.id, e.school, e.degree, e.profile_id, rp.label, rp.is_default
from public.user_educations e
left join public.resume_profiles rp on rp.id = e.profile_id
order by e.created_at;
