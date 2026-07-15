Status: Implemented; manual generate→History/Jobs verification pending
Commit: 6fae350 feat: fold resume generation into Jobs workflow
Changes:
- Recovered old `frontend/app/generator/page.tsx` (git show aa0fc22^) into new `frontend/components/JobsGeneratePanel.tsx` (job-scoped: props `jobId`, `jobUrl`, `bidStatus`, `onBack`; workspace autosave now keyed by `${userId}:${jobId}`)
- `frontend/app/jobs/page.tsx`: added "Generate" action per row; `generateJobId` state renders `JobsGeneratePanel` in place of the list, with a "← Back to Jobs" header showing the locked job URL
- `createResumeWithArtifacts` now called with `jobId`, `jobLink: normalizeJobUrl(jobUrl)`, `bidStatus` (current per-user status, not forced `"applied"`)
- `frontend/app/generator/page.tsx` untouched — still redirects to `/jobs`
Verify: `npm test` — 21 files, 88 tests passed
Verify: `npx tsc -p frontend/tsconfig.json --noEmit` — passed
Verify: `npx eslint app/jobs/page.tsx components/JobsGeneratePanel.tsx app/generator/page.tsx` — clean; broader `eslint app components` shows only 6 pre-existing warnings unrelated to this change
Concern: Step 3 (manual generate-once → History shows link/status, Jobs unchanged) not run — no authenticated browser session available in this environment
Concern: `next build` not run (Task 4 noted transient `.next` trace EPERM lock on Windows); relied on tsc+eslint+vitest instead
Report: `.superpowers/sdd-jobs/task-5-report.md`
