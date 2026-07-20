# Batch Parallel Resume Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users multi-select Jobs, paste one JD per job into dedicated boxes, and start independent `/api/analyze` jobs for all ready cards at once.

**Architecture:** Keep existing single-job Analyze drawer. Add list selection + a batch overlay that owns card state, reuses extract/analyze/history APIs per card, and runs generations with `Promise.allSettled` (no new batch backend). Pure helpers in `lib/` drive ready-count, open-all, and batch alert aggregation.

**Tech Stack:** TypeScript, React (Next.js frontend), Vitest, existing Supabase History helpers, existing `/api/extract-job` and `/api/analyze`

## Global Constraints

- One resume per selected catalog job URL
- Per-row paste boxes only (no paste-advances-to-next)
- Every ready card starts immediately (no concurrency cap in v1)
- Each card uses its own backend analyze `jobId` + poll loop
- Same active profile/persona for the whole batch
- Apply alerts: one summary dialog before starting the batch
- Leaving the panel does not cancel in-flight backend jobs
- Spec: `docs/superpowers/specs/2026-07-21-batch-parallel-generate-design.md`

## File map

| File | Responsibility |
|------|----------------|
| `lib/jobs-batch-state.ts` | Pure types + helpers: ready check, open-all result, selection helpers |
| `lib/jobs-batch-state.test.ts` | Unit tests for helpers |
| `lib/jobs-batch-alerts.ts` | Aggregate duplicate/hybrid alerts across ready cards |
| `lib/jobs-batch-alerts.test.ts` | Unit tests for alert aggregation |
| `frontend/components/JobsBatchPanel.tsx` | Batch UI: profile, open all, cards, generate all, progress |
| `frontend/components/JobsBatchAlertDialog.tsx` | One summary alert for the batch (or extend ApplyAlertDialog) |
| `frontend/app/jobs/page.tsx` | Checkboxes, Batch prepare button, mount batch overlay |

Reuse without redesign: `JobsGeneratePanel` poll/generate patterns, `createResumeWithArtifacts`, `getExternalJobUrl`, `ApplyAlertDialog` patterns, `loadApplyAlertSettings`, `listResumes`, `extractedJobIsHybridOrOnsite` / `analyzeJobWorkType`.

---

### Task 1: Batch state helpers (TDD)

**Files:**
- Create: `lib/jobs-batch-state.ts`
- Create: `lib/jobs-batch-state.test.ts`

**Interfaces:**
- Produces:
  - `export type BatchCardStatus = "empty" | "ready" | "generating" | "done" | "failed"`
  - `export interface JobsBatchCard { jobId: string; url: string; bidStatus: BidStatus; pageContent: string; jobTitle: string; companyName: string; jobDescription: string; status: BatchCardStatus; error: string | null; resumeId?: string }`
  - `export function createBatchCardsFromJobs(jobs: UserJobListItem[]): JobsBatchCard[]`
  - `export function isBatchCardReady(card: JobsBatchCard): boolean` — true when `pageContent.trim()` or `jobDescription.trim()` is non-empty and status is not `generating`
  - `export function countReadyBatchCards(cards: JobsBatchCard[]): number`
  - `export function toggleJobSelection(selected: Set<string>, jobId: string): Set<string>`
  - `export function openExternalUrls(urls: string[], openFn: (url: string) => Window | null): { opened: number; blocked: number }`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it, vi } from "vitest";
import {
  countReadyBatchCards,
  createBatchCardsFromJobs,
  isBatchCardReady,
  openExternalUrls,
  toggleJobSelection,
} from "./jobs-batch-state";

const job = {
  job_id: "j1",
  url: "https://example.com/a",
  created_at: "2026-07-21T00:00:00.000Z",
  status: "unapplied" as const,
};

describe("jobs-batch-state", () => {
  it("creates empty cards from selected jobs", () => {
    const cards = createBatchCardsFromJobs([job]);
    expect(cards).toEqual([
      expect.objectContaining({
        jobId: "j1",
        url: job.url,
        pageContent: "",
        status: "empty",
      }),
    ]);
  });

  it("marks a card ready when paste text exists", () => {
    const [card] = createBatchCardsFromJobs([job]);
    expect(isBatchCardReady(card)).toBe(false);
    expect(isBatchCardReady({ ...card, pageContent: "  JD text  " })).toBe(true);
  });

  it("counts ready cards", () => {
    const cards = createBatchCardsFromJobs([job, { ...job, job_id: "j2" }]);
    cards[0].pageContent = "hello";
    expect(countReadyBatchCards(cards)).toBe(1);
  });

  it("toggles selection set immutably", () => {
    const next = toggleJobSelection(new Set(["j1"]), "j2");
    expect([...next].sort()).toEqual(["j1", "j2"]);
    expect([...toggleJobSelection(next, "j1")]).toEqual(["j2"]);
  });

  it("reports popup-blocked opens", () => {
    const openFn = vi
      .fn()
      .mockReturnValueOnce({} as Window)
      .mockReturnValueOnce(null);
    expect(openExternalUrls(["https://a.com", "https://b.com"], openFn)).toEqual({
      opened: 1,
      blocked: 1,
    });
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npx vitest run lib/jobs-batch-state.test.ts`  
Expected: FAIL (module/functions missing)

- [ ] **Step 3: Implement helpers**

```ts
import type { BidStatus, UserJobListItem } from "@/lib/supabase/database.types";
import { getExternalJobUrl } from "@/lib/jobs-page-state";

export type BatchCardStatus = "empty" | "ready" | "generating" | "done" | "failed";

export interface JobsBatchCard {
  jobId: string;
  url: string;
  bidStatus: BidStatus;
  pageContent: string;
  jobTitle: string;
  companyName: string;
  jobDescription: string;
  status: BatchCardStatus;
  error: string | null;
  resumeId?: string;
}

export function createBatchCardsFromJobs(jobs: UserJobListItem[]): JobsBatchCard[] {
  return jobs.map((job) => ({
    jobId: job.job_id,
    url: job.url,
    bidStatus: job.status,
    pageContent: "",
    jobTitle: "",
    companyName: "",
    jobDescription: "",
    status: "empty",
    error: null,
  }));
}

export function isBatchCardReady(card: JobsBatchCard): boolean {
  if (card.status === "generating") return false;
  return Boolean(card.pageContent.trim() || card.jobDescription.trim());
}

export function countReadyBatchCards(cards: JobsBatchCard[]): number {
  return cards.filter(isBatchCardReady).length;
}

export function toggleJobSelection(selected: Set<string>, jobId: string): Set<string> {
  const next = new Set(selected);
  if (next.has(jobId)) next.delete(jobId);
  else next.add(jobId);
  return next;
}

export function openExternalUrls(
  urls: string[],
  openFn: (url: string) => Window | null = (url) => window.open(url, "_blank")
): { opened: number; blocked: number } {
  let opened = 0;
  let blocked = 0;
  for (const raw of urls) {
    const tab = openFn(getExternalJobUrl(raw));
    if (tab) {
      tab.opener = null;
      opened += 1;
    } else {
      blocked += 1;
    }
  }
  return { opened, blocked };
}
```

Also derive display status: when paste becomes non-empty and status is `empty`/`failed`, UI should set `ready` (panel responsibility in Task 3).

- [ ] **Step 4: Run tests — expect PASS**

Run: `npx vitest run lib/jobs-batch-state.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/jobs-batch-state.ts lib/jobs-batch-state.test.ts
git commit -m "feat: add jobs batch state helpers"
```

---

### Task 2: Batch apply-alert aggregation (TDD)

**Files:**
- Create: `lib/jobs-batch-alerts.ts`
- Create: `lib/jobs-batch-alerts.test.ts`
- Modify: `lib/apply-alerts.ts` only if a small shared formatter helps (prefer new file)

**Interfaces:**
- Consumes: `findDuplicateCompanyApplications`, `jobContainsHybridOrOnsite` / `analyzeJobWorkType` + `extractedJobIsHybridOrOnsite`
- Produces:
  - `export interface BatchAlertSummary { duplicateByJobId: Record<string, DuplicateApplicationMatch[]>; hybridJobIds: string[]; hasAny: boolean }`
  - `export function buildBatchAlertSummary(input: { cards: Array<{ jobId: string; companyName: string; pageContent: string; jobDescription: string }>; resumes: ResumeRecord[]; duplicateEnabled: boolean; duplicateMonths: number; hybridEnabled: boolean }): BatchAlertSummary`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest";
import { buildBatchAlertSummary } from "./jobs-batch-alerts";

describe("buildBatchAlertSummary", () => {
  it("returns hasAny false when alerts disabled", () => {
    const summary = buildBatchAlertSummary({
      cards: [{ jobId: "j1", companyName: "Acme", pageContent: "hybrid office", jobDescription: "" }],
      resumes: [],
      duplicateEnabled: false,
      duplicateMonths: 6,
      hybridEnabled: false,
    });
    expect(summary.hasAny).toBe(false);
  });

  it("flags hybrid location jobs and duplicates independently", () => {
    const summary = buildBatchAlertSummary({
      cards: [
        {
          jobId: "j1",
          companyName: "Acme",
          pageContent: "Hybrid schedule: 3 days in office",
          jobDescription: "",
        },
        {
          jobId: "j2",
          companyName: "Acme",
          pageContent: "Remote-first role",
          jobDescription: "",
        },
      ],
      resumes: [
        {
          id: "r1",
          user_id: "u",
          profile_id: null,
          job_title: "Eng",
          job_company: "Acme",
          job_link: null,
          job_id: null,
          bid_status: "applied",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as never,
      ],
      duplicateEnabled: true,
      duplicateMonths: 12,
      hybridEnabled: true,
    });
    expect(summary.hybridJobIds).toContain("j1");
    expect(summary.hybridJobIds).not.toContain("j2");
    expect(summary.duplicateByJobId.j1?.length).toBeGreaterThan(0);
    expect(summary.hasAny).toBe(true);
  });
});
```

(Adjust `ResumeRecord` fixture fields to match `lib/supabase/database.types.ts` exactly when implementing.)

- [ ] **Step 2: Run — expect FAIL**

Run: `npx vitest run lib/jobs-batch-alerts.test.ts`

- [ ] **Step 3: Implement `buildBatchAlertSummary`**

For each card:
- text = `jobDescription || pageContent`
- if hybridEnabled and location-hybrid via `jobContainsHybridOrOnsite(text)` → push jobId
- if duplicateEnabled and companyName → `findDuplicateCompanyApplications(resumes, companyName, months)` → store under jobId when non-empty  
`hasAny` = any hybrid id or any duplicate list non-empty.

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add lib/jobs-batch-alerts.ts lib/jobs-batch-alerts.test.ts
git commit -m "feat: aggregate batch generate apply alerts"
```

---

### Task 3: Jobs list multi-select + Batch prepare entry

**Files:**
- Modify: `frontend/app/jobs/page.tsx`
- Test: manual / light unit not required if helpers covered; optional React test skipped (repo has few component tests)

**Interfaces:**
- Consumes: `toggleJobSelection`, `createBatchCardsFromJobs`
- Produces: page state `selectedJobIds: Set<string>`, `batchJobs: UserJobListItem[] | null`

- [ ] **Step 1: Add selection state**

```tsx
const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(() => new Set());
const [batchOpen, setBatchOpen] = useState(false);

const selectedJobs = useMemo(
  () => visibleJobs.filter((job) => selectedJobIds.has(job.job_id)),
  [visibleJobs, selectedJobIds]
);
```

Clear selection entries that disappear from `pipelineJobs` when jobs reload/status changes.

- [ ] **Step 2: UI — checkbox column + toolbar**

In the table header and each row, add a checkbox. Above the table (near filters), add:

```tsx
<button
  type="button"
  className="btn-primary"
  disabled={selectedJobIds.size === 0}
  onClick={() => setBatchOpen(true)}
>
  Batch prepare ({selectedJobIds.size})
</button>
```

- [ ] **Step 3: Overlay shell**

Mirror Analyze drawer pattern (`jobs-analyse-backdrop` / drawer) OR full-page overlay. Prefer full-width drawer/panel titled “Batch prepare”. When `batchOpen`, render placeholder:

```tsx
{batchOpen ? (
  <JobsBatchPanel
    jobs={jobs.filter((j) => selectedJobIds.has(j.job_id))}
    onClose={() => setBatchOpen(false)}
  />
) : null}
```

Stub `JobsBatchPanel` in Task 4 if needed with minimal props.

- [ ] **Step 4: Manual check**

Select 2 jobs → Batch prepare enabled → opens panel with those jobs; Escape/backdrop closes without cancelling imaginary generates (none yet).

- [ ] **Step 5: Commit**

```bash
git add frontend/app/jobs/page.tsx
git commit -m "feat: multi-select jobs for batch prepare"
```

---

### Task 4: JobsBatchPanel UI (paste + open all + extract)

**Files:**
- Create: `frontend/components/JobsBatchPanel.tsx`
- Modify: `frontend/app/jobs/page.tsx` (wire real panel)

**Interfaces:**
- Consumes: `createBatchCardsFromJobs`, `countReadyBatchCards`, `openExternalUrls`, `apiUrl("/api/extract-job")`, auth session, profile loader patterns from `JobsGeneratePanel`
- Props: `{ jobs: UserJobListItem[]; onClose: () => void }`

- [ ] **Step 1: Scaffold panel state**

```tsx
const [cards, setCards] = useState(() => createBatchCardsFromJobs(jobs));
const [activeProfileId, setActiveProfileId] = useState<string>("");
// load profiles like JobsGeneratePanel (list + active)
```

Header actions: Back/Close, profile `<select>`, **Open all**, ready count, **Generate all ready** (disabled when `countReadyBatchCards(cards) === 0` — wire generate in Task 5).

- [ ] **Step 2: Per-card UI**

Each card:
- URL + Open button (`getExternalJobUrl` + `window.open`)
- Textarea bound to `pageContent` (per-row only)
- On change: update text; set `status` to `ready` if trimmed text else `empty` (unless generating/done)
- **Extract** button → POST extract-job with `pageContent`; fill `jobTitle`, `companyName`, `jobDescription`; keep status `ready`
- Status chip + error text

- [ ] **Step 3: Open all**

```tsx
const { opened, blocked } = openExternalUrls(cards.map((c) => c.url));
if (blocked > 0) showToast("warning", `Opened ${opened}; ${blocked} blocked by popup settings`);
else showToast("success", `Opened ${opened} job tabs`);
```

- [ ] **Step 4: Manual check**

Paste into two boxes independently; Extract on one fills title; Open all opens tabs; Generate still no-op/disabled until Task 5 completes wiring.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/JobsBatchPanel.tsx frontend/app/jobs/page.tsx
git commit -m "feat: add batch prepare panel with per-job paste"
```

---

### Task 5: Parallel generate all ready

**Files:**
- Modify: `frontend/components/JobsBatchPanel.tsx`
- Create or modify: `frontend/components/JobsBatchAlertDialog.tsx` (summary list of hybrid job URLs + duplicate matches grouped by job)
- Reuse: poll loop from `JobsGeneratePanel` (`pollAnalyzeJob` — extract to shared helper if duplication is large; otherwise copy the poll function into `lib/analyze-job-client.ts`)

**Preferred small extract (if copying would exceed ~40 lines twice):**
- Create: `lib/analyze-job-client.ts` with `pollAnalyzeJob(jobId, token): Promise<AnalysisResponse>` moved from `JobsGeneratePanel`
- Modify: `JobsGeneratePanel.tsx` to import it

**Interfaces:**
- Consumes: `buildBatchAlertSummary`, `createResumeWithArtifacts`, FIXED model constants from generate panel, `notifyCompletion`
- Generate payload per card: `{ jd: card.jobDescription || card.pageContent, jobTitle, companyName, pageContent: card.pageContent, profileId: activeProfileId, template, apiModel, apiProvider, useOpenRouter }` plus History `jobId: card.jobId`, `jobLink: card.url`, `bidStatus: card.bidStatus`

- [ ] **Step 1: Preflight**

On Generate all ready:
1. Snapshot `readyCards = cards.filter(isBatchCardReady)`
2. Load apply alert settings + `listResumes`
3. `summary = buildBatchAlertSummary(...)`
4. If `summary.hasAny`, open batch alert dialog; on Continue proceed; on Cancel return
5. Else proceed

- [ ] **Step 2: Start all immediately**

```ts
await Promise.allSettled(
  readyCards.map((card) => generateOneCard(card.jobId))
);
```

`generateOneCard`:
1. set card `generating`, clear error
2. If `!jobDescription.trim()`, call extract-job once; on failure mark `failed` and return
3. POST `/api/analyze` → poll until complete
4. `createResumeWithArtifacts({ userId, profileId, jd, resume, jobId: card.jobId, jobLink: card.url, bidStatus: card.bidStatus, ... })`
5. set `done` + `resumeId` OR `failed` + error  
Do not await other cards inside `generateOneCard`.

- [ ] **Step 3: Batch completion feedback**

After `allSettled`, toast: `Generated X of Y` + desktop notify summary. Failed cards keep Retry button calling `generateOneCard` only.

- [ ] **Step 4: Closing panel**

`onClose` only unmounts UI; in-flight fetches continue (document in comment). Do not abort controllers in v1.

- [ ] **Step 5: Manual verification**

Two jobs with pasted JDs → Generate all → both show Generating → both complete into History with correct links. Fail one (invalid paste) → other still succeeds.

- [ ] **Step 6: Commit**

```bash
git add frontend/components/JobsBatchPanel.tsx frontend/components/JobsBatchAlertDialog.tsx lib/analyze-job-client.ts frontend/components/JobsGeneratePanel.tsx
git commit -m "feat: parallel generate for batch-prepared jobs"
```

---

### Task 6: Verify + polish polish

**Files:** touched UI files; tests from Tasks 1–2

- [ ] **Step 1: Run unit tests**

Run: `npx vitest run lib/jobs-batch-state.test.ts lib/jobs-batch-alerts.test.ts`  
Expected: PASS

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p frontend/tsconfig.json`  
Expected: exit 0

- [ ] **Step 3: Spec checklist**

Confirm against `docs/superpowers/specs/2026-07-21-batch-parallel-generate-design.md`:
- Multi-select + Batch prepare
- Per-row paste
- Open all
- Generate all ready starts N independent analyze jobs
- One alert summary
- History linked per job
- No concurrency cap

- [ ] **Step 4: Commit any polish**

```bash
git add -u
git commit -m "fix: polish batch parallel generate UX"
```

---

## Plan self-review

**Spec coverage:** Selection, panel, open all, per-row paste, optional extract, generate-all-at-once, per-card progress, alert summary, History linkage, failure isolation, leave-panel behavior — covered in Tasks 1–6. Out-of-scope items intentionally omitted.

**Placeholders:** None intentional; ResumeRecord fixture note tells implementer to match real type fields.

**Type consistency:** `JobsBatchCard`, `BatchCardStatus`, `buildBatchAlertSummary`, `isBatchCardReady` names are consistent across tasks.
