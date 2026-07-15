# Jobs Tracker (Shared URLs + Per-Account Status)

Date: 2026-07-16  
Status: Approved in conversation; awaiting implement

## Goal

Bring the Windows Job Tracker into Cubi: a shared job-URL catalog (normalized, no duplicates), per-login apply status, and resume generation folded into the Jobs workflow. History remains the per-account archive of generated bids (URL, status, resume data).

## Decisions (from brainstorming)

| Topic | Choice |
|-------|--------|
| Relation to History / Generator | Hybrid: Jobs = working pipeline; History = saved bids; Generator **folded into Jobs** |
| Status vocabulary | Extend Cubi `bid_status`: add early pipeline states |
| Status set | `unapplied` \| `opened` \| `applied` \| `interviewing` \| `rejected` \| `offer` \| `accepted` |
| Data shape | Shared global URL catalog + per-account status (not private-per-user URLs) |
| Share scope | **A** — every Cubi login shares the same URL list |
| Persistence | New `jobs` + `user_job_status`; generate writes the user’s `resume_history` (optional `job_id` FK) |
| Duplicate URLs | **Not allowed** — unique after normalize (strip query/`?…`) |
| Open link | New tab; for that user only, `unapplied` → `opened` (never downgrade `applied+`) |
| Delete (v1) | Delete only the user’s status (+ optional their History); shared URL remains |
| Out of v1 | JSON import/export, status color picker, copy between accounts, global URL delete |

## Data model

### `jobs` (global catalog)

| Column | Notes |
|--------|--------|
| `id` | UUID PK |
| `url` | Normalized unique text |
| `created_at` | timestamptz |

- **Normalize:** trim whitespace; drop `?` and everything after (same as Windows `normalize_url`).
- **Dedup:** DB unique constraint on normalized `url`. Add flow: if URL exists, reuse row; never insert a second catalog row.
- **RLS:** authenticated users can `SELECT` and `INSERT` (no unrestricted `UPDATE`/`DELETE` for normal users in v1).

### `user_job_status` (per account)

| Column | Notes |
|--------|--------|
| `user_id` | FK → profiles / auth user |
| `job_id` | FK → `jobs` |
| `status` | enum / check: the status set above |
| PK | `(user_id, job_id)` |

- Default on attach: `unapplied`.
- **RLS:** `auth.uid() = user_id` for all ops.
- Adding a URL that already exists globally: ensure a status row for the current user only (if already present → “already on your list”).

### `resume_history` (existing, per account)

- Keep per-user artifacts (JD/resume files, company/title, interviews, etc.).
- Expand allowed `bid_status` values to include `unapplied` and `opened`.
- Add optional `job_id` FK → `jobs` when generated from Jobs.
- Populate `job_link` with the normalized URL on create/update from Jobs.
- Backfill (optional in implement): if a History row has `job_link` but no catalog entry, insert normalized `jobs` row and a `user_job_status` from that row’s status.

## UI & workflow

### Navigation

- Add **Jobs** in app nav.
- Fold current Generator into Jobs; `/generator` redirects to Jobs.

### Jobs page

1. Paste URL → Add → normalize → upsert catalog (no dupes) → attach current user’s status.
2. Table: URL, **your** status, added (catalog `created_at` or your attach time — prefer catalog created_at for shared list consistency; show your status separately).
3. Search / filter by your status / pagination (Windows-like).
4. Open URL → browser new tab; status `unapplied` → `opened` for you only.
5. Manual / bulk status update for **your** rows only.
6. Copy URL; remove from **your** list (delete `user_job_status`).
7. **Generate** on a row: select persona, paste JD, run existing generate pipeline → write **your** `resume_history` linked to `job_id`.

### History page

- Unchanged role: your bids with URL, status, resume data, interviews, downloads.
- Status edits remain yours and stay consistent with `user_job_status` when linked via `job_id` (implementer should keep both in sync when updating status from either surface).

## Account isolation

| Concern | Behavior |
|---------|----------|
| Who sees which URLs | All logged-in users see the shared catalog |
| Who sees whose status | Only your `user_job_status` |
| Who sees whose resumes | Only your `resume_history` / personas |
| Apply independence | Each account applies and updates status independently |

## Edge cases

- Opening a job already at `applied` or later: do not downgrade.
- Generate before marking applied: allowed; status unchanged unless the user updates it.
- Empty URL after normalize: reject.
- Concurrent adds of the same URL: unique constraint + “already exists” handling; second user still gets their own status row.

## Success criteria

- Two different Cubi accounts see the same job URL once in the catalog.
- Each account has independent status for that URL.
- Duplicate normalized URLs cannot be inserted into `jobs`.
- Opening updates only the acting user’s status (`unapplied` → `opened`).
- Generate from a Job row produces that user’s History row with URL + artifacts + `job_id`.
- Generator is reachable from Jobs; old `/generator` redirects.
