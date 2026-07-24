# Jobs: save JD on add + one-click Generate — design

Date: 2026-07-25  
Status: Approved in conversation (approach B)

## Goal

On the Jobs page:

1. **Add Job** includes a job-description text field; JD is saved per user with the job.
2. Each list row has a **Generate** button that, in one click: analyze the saved JD → generate resume → download PDF, showing a loading spinner on that button only (no Analyze drawer).

Existing **Analyze** drawer flow remains for the longer paste/extract path.

## Approach

Store JD on **`user_job_status`** (per-user), not on the shared `jobs` catalog. Wire a list-row Generate action that reuses existing `/api/analyze` + PDF download with the user’s active profile and default settings.

## Behavior

### Add Job UI

- Keep URL input + **Add job** button.
- Add a second control: multiline (or large) text input for **Job description**.
- On submit (`addJobForUser`):
  - Normalize/upsert job URL as today.
  - Upsert `user_job_status` including `job_description` (trim; empty string allowed).
- If the user already has a status row for that URL, updating JD on re-add: **overwrite** with the newly pasted JD when non-empty; if new JD is empty, keep existing stored JD (don’t wipe).

### Data model

Migration on `user_job_status`:

```sql
alter table public.user_job_status
  add column if not exists job_description text not null default '';
```

Types:

- `UserJobListItem.job_description: string`
- `listJobsForUser` / `addJobForUser` / status reads select and return it.

### List row Generate

New button **Generate** next to Analyze (label: “Generate”; while running: spinner + disabled / “Generating…”).

**Enabled when** `job_description.trim()` is non-empty; otherwise disabled with a clear title/tooltip (“Add a job description first”).

**One-click flow (no drawer):**

1. Set row-local `generatingJobId`.
2. Resolve **active resume profile** (same source as JobsGeneratePanel / profile defaults) + default resume template + AI settings (fixed Jobs model if that is current product default).
3. Build analyze payload:
   - `jd` = saved `job_description`
   - `jobLink` / URL = job URL
   - `jobId` = catalog job id
   - `pageContent` = JD text (or empty if API allows JD-only)
   - Title/company: best-effort from a lightweight extract call **or** omit and let analyzer fill from JD — prefer one `POST /api/extract-job` with `pageContent = job_description` when cheap, else pass JD with blank title/company and let `/api/analyze` handle it. **Decision: call extract-job on the saved JD text first** to get title/company/normalized JD when possible; on extract failure, still call analyze with raw JD.
4. `POST /api/analyze` → `pollAnalyzeJob`.
5. `createResumeWithArtifacts` + render PDF + `savePdfToDownloadsFolder` (or preview modal if `show_pdf_preview_after_resume` is on — same settings as JobsGeneratePanel).
6. Clear loading; toast success with path or error message.
7. Optional: run existing duplicate/hybrid apply alerts before start (same as single generate). **Decision: run the same preflight alerts as JobsGeneratePanel** when settings enable them; if user cancels, abort without generating.

**Concurrency:** one Generate at a time per page is enough for v1 (disable other Generate buttons while any row is generating), or allow parallel — **Decision: allow only one in-flight Generate on the list** to avoid overlapping toasts/downloads.

### Out of scope

- Editing JD inline on the list (can re-Add with same URL + new JD to overwrite when non-empty)
- Batch Generate using stored JDs (batch prepare stays paste-based)
- Removing the Analyze drawer
- Storing JD on shared `jobs` table

## Scope

**In scope**

- Migration + types + jobs service read/write for `job_description`
- Add Job UI: JD field
- List Generate button + client orchestration (extract → analyze → history → PDF)
- Loading state on the button
- Tests for service upsert/list of JD

**Out of scope**

- JD editor modal on the row
- Changing batch prepare UX

## Success criteria

- Adding a job with JD persists it; list/API returns it after reload.
- Generate with saved JD produces a resume PDF download without opening the Analyze drawer.
- Generate with empty JD is blocked.
- Button shows loading for the duration of the run.
- Analyze drawer still works as before.
