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
