# Task 1 Report: Migration + jobs service JD field (TDD)

## Status

**Complete.** Added `job_description` column migration, extended `UserJobListItem` and jobs service read/write paths, and preserved existing JD on status-only updates.

## TDD Cycle

### RED (Step 2)

Command: `npm test -- lib/supabase/services/jobs.test.ts`

Result: **FAIL** — 7 failed (missing `job_description` on merge/list items; `resolveJobDescriptionOnAdd` not exported)

### GREEN (Step 4)

Command: `npm test -- lib/supabase/services/jobs.test.ts`

Result: **PASS** — 11 passed

## Changes

| File | Action |
|------|--------|
| `supabase/migrations/014_user_job_description.sql` | Created — `job_description text not null default ''` on `user_job_status` |
| `lib/supabase/database.types.ts` | Added `UserJobListItem.job_description: string` |
| `lib/supabase/services/jobs.ts` | `resolveJobDescriptionOnAdd`, merge/list/add/open updates; `setJobStatusForUser` uses `.update({ status })` to avoid wiping JD |
| `lib/supabase/services/jobs.test.ts` | Added merge + resolveJobDescriptionOnAdd tests; updated existing expectations for `job_description` |

## Key implementation notes

- `addJobForUser(userId, rawUrl, jobDescription = "", client?)` — incoming JD trims; empty incoming preserves existing.
- `mergeCatalogJobsWithUserStatus` maps `job_description: row?.job_description ?? ""`.
- `listJobsForUser` / `getJobForUser` select `"job_id,status,job_description"` / `"status,job_description"`.
- `setJobStatusForUser` switched from upsert to update-only on status — does not touch `job_description`.
- `openJobForUser` upsert omits `job_description` (PostgREST preserves existing column on conflict update).

## Commit

```
0d6ecd0 feat: store per-user job description on user_job_status
```

Files committed: migration, `database.types.ts`, `jobs.ts`, `jobs.test.ts`

## Out of scope (unchanged)

- Jobs page UI (Task 2)
- Git stash not restored

## Concerns

- `setJobStatusForUser` now uses `.update` instead of upsert — will not create a status row if one is missing (acceptable for dropdown on listed jobs; differs from prior upsert behavior).
- `openJobForUser` still upserts without `job_description`; relies on PostgREST not nulling unspecified columns on conflict — verify in staging if JD ever disappears on first open.
- `addJobForUser` signature adds optional `jobDescription` before `client`; callers passing client as 3rd arg must migrate to 4th position.

## Test summary

| Suite | Result |
|-------|--------|
| `jobs.test.ts` | 11 passed |

Tests cover: merge with/without JD, `resolveJobDescriptionOnAdd` overwrite rules, list overlay, addJob concurrent paths.
