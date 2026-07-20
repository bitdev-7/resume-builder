### Task 3: Jobs Supabase service (+ status sync with resume_history)

**Files:**
- Create: `lib/supabase/services/jobs.ts`
- Create: `lib/supabase/services/jobs.test.ts` (pure helpers mock-free where possible; at minimum test normalize-used paths via exported helpers)
- Modify: `lib/supabase/services/resumes.ts` — `CreateResumeParams.jobId?`, `bidStatus?`; `updateResumeBidStatus` also updates `user_job_status` when `job_id` set
- Modify: `lib/supabase/services/index.ts` — export jobs API

**Interfaces:**
- Produces:
  - `listJobsForUser(userId): Promise<UserJobListItem[]>`
  - `addJobForUser(userId, rawUrl): Promise<{ item: UserJobListItem; createdCatalog: boolean; attached: boolean }>`
  - `openJobForUser(userId, jobId): Promise<UserJobListItem>` — sets opened if unapplied; returns row (caller opens window)
  - `setJobStatusForUser(userId, jobIds: string[], status: BidStatus): Promise<void>` — also patches linked `resume_history.bid_status` for that user+job_id
  - `removeMyJob(userId, jobId): Promise<void>` — deletes `user_job_status` only

- [ ] **Step 1: TDD for normalize guard in add**

Test file can assert: empty normalize throws; duplicate attach returns `attached: false` logic via a small pure `assertNonEmptyUrl` or by testing `normalizeJobUrl` already covered — for service, add:

```ts
// jobs.test.ts — test decideOpenStatus
import { describe, expect, it } from "vitest";
import { nextStatusAfterOpen } from "./jobs";

describe("nextStatusAfterOpen", () => {
  it("promotes unapplied to opened", () => {
    expect(nextStatusAfterOpen("unapplied")).toBe("opened");
  });
  it("leaves applied alone", () => {
    expect(nextStatusAfterOpen("applied")).toBe("applied");
  });
});
```

Export `nextStatusAfterOpen(status: BidStatus): BidStatus` from `jobs.ts`.

- [ ] **Step 2: FAIL then implement helpers + service**

`addJobForUser` algorithm:

1. `url = normalizeJobUrl(raw)`; if empty throw `Error("Job URL cannot be empty.")`
2. `select id,url,created_at from jobs where url = url` 
3. If missing: `insert into jobs (url) … on conflict (url) do nothing` then select again (race-safe)
4. `select status from user_job_status where user_id and job_id`
5. If missing: insert status `unapplied`; `attached: true`
6. Else `attached: false`
7. Return list item

`listJobsForUser`: join `jobs` + `user_job_status` where `user_id = ?` order by `jobs.created_at desc`.

`setJobStatusForUser`: upsert status; then `update resume_history set bid_status = ? where user_id = ? and job_id in (?)`.

`updateResumeBidStatus`: after updating resume row, if record has `job_id`, upsert `user_job_status` for that user/job.

`createResumeWithArtifacts`: add `jobId?: string | null`, `bidStatus?: BidStatus` — insert `job_id`, use `bidStatus ?? "applied"`.

- [ ] **Step 3: Run** `npm test -- lib/supabase/services/jobs.test.ts lib/job-url.test.ts`

- [ ] **Step 4: Commit**

```bash
git add lib/supabase/services/jobs.ts lib/supabase/services/jobs.test.ts lib/supabase/services/resumes.ts lib/supabase/services/index.ts
git commit -m "feat: add jobs service with per-user status sync"
```

---
