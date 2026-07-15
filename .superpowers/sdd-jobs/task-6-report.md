Status: Implemented
Changes:
- Dashboard success rates now exclude `unapplied` and `opened` jobs from bid and interview-stage counts.
- Added regression coverage confirming early statuses are neither advanced, rejected, nor succeeded.
- History already resolves both statuses through `BID_STATUSES`; no change was required.
- Interview auto-promotion remains unchanged and does not promote `unapplied` or `opened`.
- Audited TypeScript status references; no stale hard-coded status union or exhaustive status switch was found.
Verify: `npm test` — 22 files, 91 tests passed.
Verify: `git diff --check` — passed.
Report: `.superpowers/sdd-jobs/task-6-report.md`
