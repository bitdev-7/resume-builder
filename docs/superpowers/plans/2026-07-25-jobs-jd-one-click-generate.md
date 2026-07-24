# Jobs JD Save + One-Click Generate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Save per-user job description on Add Job, and add a list-row Generate button that one-clicks extract → analyze → PDF download with a loading spinner (no Analyze drawer).

**Architecture:** Add `job_description` on `user_job_status`. Extend jobs service merge/add/list. Jobs page gets JD textarea + Generate action. Orchestration helper reuses extract/analyze/poll/history/PDF paths already used by `JobsGeneratePanel`.

**Tech Stack:** TypeScript, Next.js, Supabase, Vitest, existing `/api/extract-job` + `/api/analyze`

## Global Constraints

- JD stored on `user_job_status.job_description`, not shared `jobs`
- Re-add with non-empty JD overwrites; empty JD on re-add keeps existing
- Generate enabled only when JD trim non-empty
- One in-flight Generate on the list at a time
- Extract JD text first; on extract failure still analyze with raw JD
- Same preflight alerts + PDF preview setting as JobsGeneratePanel
- Fixed Jobs AI model: OpenRouter default (same as panel `FIXED_AI_MODEL`)
- Spec: `docs/superpowers/specs/2026-07-25-jobs-jd-one-click-generate-design.md`
- Out of scope: inline JD editor, batch using stored JD, removing Analyze drawer

## File map

| File | Responsibility |
|------|----------------|
| `supabase/migrations/014_user_job_description.sql` | Add column |
| `lib/supabase/database.types.ts` | `UserJobListItem.job_description` |
| `lib/supabase/services/jobs.ts` | Read/write JD; merge; add overwrite rules |
| `lib/supabase/services/jobs.test.ts` | Unit tests for merge/add JD rules |
| `lib/jobs-one-click-generate.ts` | Client orchestration: extract → analyze → poll → artifacts → PDF |
| `frontend/app/jobs/page.tsx` | JD field on Add; Generate button + loading |

---

### Task 1: Migration + jobs service JD field (TDD)

**Files:**
- Create: `supabase/migrations/014_user_job_description.sql`
- Modify: `lib/supabase/database.types.ts`
- Modify: `lib/supabase/services/jobs.ts`
- Modify: `lib/supabase/services/jobs.test.ts`

**Interfaces:**
- `UserJobListItem.job_description: string`
- `addJobForUser(userId, rawUrl, jobDescription?: string, client?)`
- `mergeCatalogJobsWithUserStatus(jobs, statuses: Array<{ job_id; status; job_description?: string }>)`

- [ ] **Step 1: Write failing tests for merge + add JD rules**

Extend `jobs.test.ts`:

```ts
describe("mergeCatalogJobsWithUserStatus — job_description", () => {
  it("includes job_description from status rows (default empty)", () => {
    const merged = mergeCatalogJobsWithUserStatus(
      [{ id: "job-a", url: "https://example.com/a", created_at: "2026-07-16T00:00:00.000Z" }],
      [{ job_id: "job-a", status: "opened", job_description: "Need a Java engineer" }]
    );
    expect(merged[0].job_description).toBe("Need a Java engineer");
  });

  it("defaults job_description to empty string when status has none", () => {
    const merged = mergeCatalogJobsWithUserStatus(
      [{ id: "job-a", url: "https://example.com/a", created_at: "2026-07-16T00:00:00.000Z" }],
      []
    );
    expect(merged[0].job_description).toBe("");
  });
});

describe("resolveJobDescriptionOnAdd", () => {
  // Prefer exporting a tiny pure helper from jobs.ts for overwrite rules:
  // resolveJobDescriptionOnAdd(existingJd, incomingJd) => string
  it("keeps existing when incoming is empty", () => {
    expect(resolveJobDescriptionOnAdd("old JD", "")).toBe("old JD");
    expect(resolveJobDescriptionOnAdd("old JD", "   ")).toBe("old JD");
  });
  it("overwrites when incoming is non-empty", () => {
    expect(resolveJobDescriptionOnAdd("old JD", " new JD ")).toBe("new JD");
  });
  it("uses incoming when no existing", () => {
    expect(resolveJobDescriptionOnAdd("", "hello")).toBe("hello");
  });
});
```

Export from `jobs.ts`:

```ts
export function resolveJobDescriptionOnAdd(
  existingJd: string | null | undefined,
  incomingJd: string | null | undefined
): string {
  const incoming = typeof incomingJd === "string" ? incomingJd.trim() : "";
  const existing = typeof existingJd === "string" ? existingJd.trim() : "";
  if (incoming) return incoming;
  return existing;
}
```

- [ ] **Step 2: Run — expect FAIL**

`npm test -- lib/supabase/services/jobs.test.ts`

- [ ] **Step 3: Migration + types + service**

`supabase/migrations/014_user_job_description.sql`:

```sql
alter table public.user_job_status
  add column if not exists job_description text not null default '';
```

Update `UserJobListItem`:

```ts
export interface UserJobListItem {
  job_id: string;
  url: string;
  created_at: string;
  status: BidStatus;
  job_description: string;
}
```

Update `mergeCatalogJobsWithUserStatus` to accept `job_description?: string` on status rows and set `job_description: row?.job_description ?? ""`.

Update `listJobsForUser` status select: `"job_id,status,job_description"`.

Update `getJobForUser` similarly.

Update `addJobForUser(userId, rawUrl, jobDescription = "", client?)`:

- Select existing status with `status,job_description`.
- On insert: include `job_description: resolveJobDescriptionOnAdd("", jobDescription)`.
- On existing row: `update`/`upsert` with `job_description: resolveJobDescriptionOnAdd(existing.job_description, jobDescription)` (and still handle ignored → unapplied).
- Return item with `job_description`.

Update `openJobForUser` / any returned items to include `job_description`.

Update `setJobStatusForUser` upserts to **not** wipe JD — when upserting status only, either omit `job_description` (Postgres keeps existing on conflict if column not in payload — verify Supabase upsert behavior) or select+merge. **Decision: for status-only upserts, do not include `job_description` in the payload** so existing JD is preserved (PostgREST upsert updates only provided columns when using default — actually upsert replaces; check). Safer approach: read existing JD before upsert, or use `.update({ status })` when row exists. Prefer: status change uses `update({ status, updated_at })` when possible; for upsert of new rows set `job_description: ""`. Implement carefully so Generate JD is never cleared by status dropdown.

- [ ] **Step 4: Run tests — expect PASS**

`npm test -- lib/supabase/services/jobs.test.ts`

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/014_user_job_description.sql lib/supabase/database.types.ts lib/supabase/services/jobs.ts lib/supabase/services/jobs.test.ts
git commit -m "feat: store per-user job description on user_job_status"
```

---

### Task 2: Add Job UI — JD field

**Files:**
- Modify: `frontend/app/jobs/page.tsx`

**Interfaces:**
- State `jobDescription: string`
- `addJobForUser(user.id, jobUrl, jobDescription)`

- [ ] **Step 1: Update Add form layout**

Change the add form to stack on all sizes:

```tsx
<form onSubmit={handleAdd} className="card-soft flex flex-col gap-2 p-3">
  <div className="flex flex-col gap-2 sm:flex-row">
    <label htmlFor="job-url" className="sr-only">Job URL</label>
    <input id="job-url" ... value={jobUrl} ... placeholder="Paste a job URL" className="input-shell min-w-0 flex-1" />
    <button type="submit" className="btn-primary shrink-0 sm:min-w-24" disabled={adding}>
      {adding ? "Adding…" : "Add job"}
    </button>
  </div>
  <label htmlFor="job-description" className="sr-only">Job description</label>
  <textarea
    id="job-description"
    value={jobDescription}
    onChange={(e) => setJobDescription(e.target.value)}
    placeholder="Paste the job description (required for one-click Generate)"
    rows={4}
    className="input-shell min-w-0 w-full resize-y"
    disabled={adding}
  />
</form>
```

- [ ] **Step 2: Wire handleAdd**

```ts
const result = await addJobForUser(user.id, jobUrl, jobDescription);
// clear both fields on success
setJobUrl("");
setJobDescription("");
```

Ensure list state uses returned `item.job_description`.

- [ ] **Step 3: Manual smoke** — typecheck frontend

`npx tsc --noEmit -p frontend`

- [ ] **Step 4: Commit**

```bash
git add frontend/app/jobs/page.tsx
git commit -m "feat: add job description field to Jobs add form"
```

---

### Task 3: One-click Generate on list row

**Files:**
- Create: `lib/jobs-one-click-generate.ts` (orchestration)
- Modify: `frontend/app/jobs/page.tsx` (button + handler + loading)
- Optionally reuse alert helpers from JobsGeneratePanel patterns

**Interfaces:**

```ts
export type OneClickGenerateInput = {
  accessToken: string;
  userId: string;
  jobId: string;
  jobUrl: string;
  jobDescription: string;
  bidStatus: BidStatus;
  profileId: string;
  resumeTemplate: string;
  promptOverrides?: PromptOverrides;
  useOpenRouter: boolean;
  apiModel: string;
  showPdfPreview: boolean;
  downloadBaseDir?: string;
};

export type OneClickGenerateResult = {
  savedPath: string;
  previewPdfBase64?: string; // when showPdfPreview
  jobTitle: string;
  companyName: string;
};

export async function runJobsOneClickGenerate(
  input: OneClickGenerateInput
): Promise<OneClickGenerateResult>;
```

- [ ] **Step 1: Implement orchestration**

`runJobsOneClickGenerate`:

1. `POST /api/extract-job` with `{ pageContent: jobDescription, useOpenRouter, promptOverrides? }`. On failure, continue with `jd = jobDescription`, empty title/company.
2. On success, use extracted `jobDescription` (or fallback raw), `jobTitle`, `companyName`.
3. `POST /api/analyze` with same shape as `JobsGeneratePanel.generateResumeForSession` (profileId, template, FIXED model, jobId, jobLink, bidStatus, jd, …).
4. `pollAnalyzeJob`.
5. `createResumeWithArtifacts` + `renderResumePdfBase64`.
6. If `showPdfPreview`: return base64 for caller to open preview dialog; else `savePdfToDownloadsFolder` and return `savedPath`.

Keep FIXED model constants aligned with panel (`DEFAULT_OPENROUTER_MODEL`).

- [ ] **Step 2: Wire page**

State: `generatingJobId: string | null`, optional preview state if needed.

Before generate:
- Load active profile (reuse `loadGeneratorProfileBundle` or whatever JobsGeneratePanel uses — grep `loadActive` / profile list).
- Load AI settings for preview + download path.
- Run apply-alert preflight if enabled (duplicate company / hybrid); abort on cancel.

Button in actions column:

```tsx
<button
  type="button"
  className="btn-secondary"
  disabled={!job.job_description.trim() || generatingJobId !== null}
  title={!job.job_description.trim() ? "Add a job description first" : "Generate resume and download"}
  onClick={() => void handleOneClickGenerate(job)}
>
  {generatingJobId === job.job_id ? (
    <>{/* spinner */} Generating…</>
  ) : (
    "Generate"
  )}
</button>
```

Use an existing spinner class/icon from the app if present (e.g. `animate-spin` SVG).

`handleOneClickGenerate`:
- Guard empty JD + `generatingJobId`
- Set `generatingJobId = job.job_id`
- try/finally clear
- toast success/error

- [ ] **Step 3: Run focused checks**

```bash
npm test -- lib/supabase/services/jobs.test.ts
npx tsc --noEmit -p frontend
```

- [ ] **Step 4: Commit**

```bash
git add lib/jobs-one-click-generate.ts frontend/app/jobs/page.tsx
git commit -m "feat: one-click generate resume from saved job description"
```

---

## Spec coverage

| Spec item | Task |
|-----------|------|
| Migration + types | Task 1 |
| Add overwrite rules | Task 1 |
| Add Job JD UI | Task 2 |
| Generate button + loading | Task 3 |
| Extract → analyze → download | Task 3 |
| Empty JD blocked | Task 3 |
| One in-flight generate | Task 3 |
| Analyze drawer unchanged | Task 3 (no removal) |

## Placeholder scan

None.
