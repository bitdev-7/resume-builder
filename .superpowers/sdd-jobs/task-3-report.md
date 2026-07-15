# Task 3 Report: Jobs Supabase service

## Status

**COMPLETE_WITH_CONCERNS**

## Summary

Added the Jobs catalog/per-user status service, including normalized race-safe catalog attachment, open-state promotion, bulk status updates, removal, and resume-history synchronization. Resume creation now accepts `jobId` and an optional `bidStatus`; resume status edits upsert the linked per-user job status.

## Files

- `lib/supabase/services/jobs.ts` — Jobs service API and exported `nextStatusAfterOpen`.
- `lib/supabase/services/jobs.test.ts` — TDD coverage for open-state promotion and non-downgrade behavior.
- `lib/supabase/services/resumes.ts` — linked job fields on create and reverse status sync on update.
- `lib/supabase/services/index.ts` — Jobs API exports.

## TDD Evidence

- RED: `nextStatusAfterOpen("unapplied")` returned `"unapplied"` instead of `"opened"` (1 failed, 1 passed).
- GREEN: `npm test -- lib/supabase/services/jobs.test.ts lib/job-url.test.ts` — 2 files and 5 tests passed.

## Verification

- `npx tsc -p frontend/tsconfig.json --noEmit` — passed.
- Commit: `18c9690 feat: add jobs service with per-user status sync`

## Concerns

- Migration `supabase/migrations/007_jobs_tracker.sql` must be applied to the target Supabase project.
- Database operations were type-checked but not exercised against a live Supabase instance.
- Cross-table status synchronization is sequential, so a failure in the second write can require retrying the operation.

## Important Review Fixes

- Catalog creation is now reported only when this request's conflict-safe insert returns an inserted row.
- Concurrent same-user attachment conflicts re-select the winning row and return `attached: false`.
- `ResumeRecord` now includes `job_id: string | null`, removing the temporary intersection cast.
- Regression tests: `npm test -- lib/supabase/services/jobs.test.ts lib/job-url.test.ts` — 2 files and 7 tests passed.
- TypeScript: `npx tsc -p frontend/tsconfig.json --noEmit` — passed.
- Commit: `fix: harden jobs add race handling and ResumeRecord.job_id`
