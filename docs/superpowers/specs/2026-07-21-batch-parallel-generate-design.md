# Batch Parallel Resume Generation

Date: 2026-07-21  
Status: Approved

## Goal

Let a logged-in user prepare several different Jobs-list URLs at once, paste each job’s description into its own slot, and start **one resume generation per job** so they run **simultaneously** (separate backend AI jobs), saving time versus opening/generating one job at a time.

## Scope

### In scope

- Multi-select on the Jobs list and a **Batch prepare** entry point.
- Batch panel with **one card per selected catalog job**.
- **Open all** (and per-row Open) for job URLs in new tabs.
- **Per-row paste boxes** for job posting / JD text (no auto-advance focus).
- **Generate all ready**: for every card with JD text, start an independent `/api/analyze` job immediately (no concurrency cap in v1).
- Shared profile/persona picker for the batch.
- Per-card progress: ready → generating → done / failed.
- One-shot apply-alert summary (duplicate company / hybrid-onsite) before the batch starts.
- Persist completed resumes to that user’s History with the correct `job_id` / URL (same as single-job generate).

### Out of scope

- Browser extension or reading selection/text from other tabs.
- Auto-fetching JD HTML from the job URL.
- Multiple resumes for a single job inside this flow.
- Server-side batch API that generates many resumes in one request.
- Changing the global shared `jobs` catalog semantics.
- Cross-account visibility of pasted JDs or generate status.

## User decisions (locked)

| Topic | Choice |
|-------|--------|
| Mapping | One resume per one Jobs catalog URL |
| Paste UX | Per-row boxes only (safer assignment) |
| Parallelism | Every ready job starts at once; each is its own backend analyze job |
| Not in v1 | Cap-at-3/5 queue; focus-advances paste |

## UX flow

1. On `/jobs`, user selects one or more visible pipeline jobs (checkboxes). Applied/ignored remain hidden from the list as today.
2. **Batch prepare** opens a batch panel (full-page or modal overlay consistent with existing Analyze overlay patterns).
3. Header: active **profile/persona**, **Open all**, count of ready vs total, **Generate all ready** (disabled until ≥1 card has paste text).
4. Each card shows:
   - Job URL (and title/company once known)
   - Open link
   - Paste textarea for page content / JD
   - Optional Extract / Analyse for that card alone (reuse existing extract API)
   - Status chip: empty | ready | generating | done | failed
5. User opens tabs, copies each posting, pastes into the matching Cubi card.
6. **Generate all ready**:
   - Run apply-alert checks across ready cards; if any warnings, show one summary dialog; Cancel aborts; Continue starts all ready generations.
   - For each ready card, POST `/api/analyze` with that card’s JD + shared `profileId` + job metadata; poll each `jobId` independently.
7. On success: save History + artifacts as today’s single-job path; mark card done; toast/desktop notify can summarize batch completion.
8. Leaving the panel does not cancel in-flight backend jobs; results still appear in History when complete.

## Data / API

- No new multi-resume backend endpoint in v1.
- Reuse:
  - `POST /api/extract-job` (optional per card)
  - `POST /api/analyze` → `{ jobId }` then `GET /api/analyze/status/:id` per card
  - Existing History create path with `jobId` / `jobLink` / `bidStatus`
- Client holds batch card state (selection, paste text, extract fields, generate status, errors). Session persistence for batch drafts is optional in v1; prefer keeping state while the panel is open.

## Account isolation

| Concern | Behavior |
|---------|----------|
| Who sees which URLs | Unchanged shared catalog |
| Pasted JDs / batch UI | Current user only (client + their generate calls) |
| Generated resumes | Current user’s `resume_history` only |
| Status updates | Only acting user’s `user_job_status` if we touch status |

## Error handling

- One card failing does not stop others.
- Failed cards show error and allow retry for that card alone.
- Empty paste cards are skipped by **Generate all ready**.
- Popup blockers on **Open all**: warn; remaining opens still attempted where possible.
- Backend restart / lost analyze job: same messaging as single-job generate for that card.

## Success criteria

- User can select N jobs, paste N JDs into distinct rows, and start N independent generate jobs without waiting for each to finish before starting the next.
- Each completed generation produces exactly one History resume linked to that job.
- Wrong-JD mix-ups are minimized by per-row paste boxes (no auto-advance).
- Apply alerts do not require N separate dialogs when starting a batch.

## Open implementation notes

- Exact overlay vs dedicated route is an implementer choice; prefer consistency with current Jobs Analyze overlay.
- Whether Extract runs automatically before generate or only on explicit Extract is an implementer choice; must not block parallel starts once JD text exists.
- Desktop notifications: prefer one batch summary plus optional per-job failures.
