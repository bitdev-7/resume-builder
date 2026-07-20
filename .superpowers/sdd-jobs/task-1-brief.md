### Task 1: Normalize URL + expand BidStatus types

**Files:**
- Create: `lib/job-url.ts`
- Create: `lib/job-url.test.ts`
- Modify: `lib/supabase/database.types.ts`

**Interfaces:**
- Produces: `normalizeJobUrl(raw: string): string`
- Produces: `BidStatus` includes `unapplied` | `opened` | … existing five
- Produces: `BID_STATUSES` array updated; keep `DEFAULT_BID_STATUS = "applied"` for History create backward compat (Jobs attach uses `unapplied` in services)

- [ ] **Step 1: Write failing tests**

`lib/job-url.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { normalizeJobUrl } from "./job-url";

describe("normalizeJobUrl", () => {
  it("strips query string", () => {
    expect(normalizeJobUrl("https://jobs.example.com/x?utm_source=li&foo=1")).toBe(
      "https://jobs.example.com/x"
    );
  });

  it("trims and collapses whitespace", () => {
    expect(normalizeJobUrl("  https://jobs.example.com/a   ")).toBe(
      "https://jobs.example.com/a"
    );
  });

  it("returns empty for blank input", () => {
    expect(normalizeJobUrl("   ")).toBe("");
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npm test -- lib/job-url.test.ts`  
Expected: cannot find module `./job-url`

- [ ] **Step 3: Implement**

`lib/job-url.ts`:

```ts
/** Strip UTM/query params; same rule as Windows Job Tracker. */
export function normalizeJobUrl(url: string): string {
  let s = String(url).trim().split(/\s+/).join(" ");
  if (s.includes("?")) {
    s = s.split("?", 2)[0] ?? s;
  }
  return s;
}
```

Update `database.types.ts`:

```ts
export type BidStatus =
  | "unapplied"
  | "opened"
  | "applied"
  | "interviewing"
  | "rejected"
  | "offer"
  | "accepted";

export const BID_STATUSES: BidStatus[] = [
  "unapplied",
  "opened",
  "applied",
  "interviewing",
  "rejected",
  "offer",
  "accepted",
];
```

Add:

```ts
export interface JobRecord {
  id: string;
  url: string;
  created_at: string;
}

export interface UserJobListItem {
  job_id: string;
  url: string;
  created_at: string;
  status: BidStatus;
}
```

- [ ] **Step 4: Run tests — expect PASS**

`npm test -- lib/job-url.test.ts`

- [ ] **Step 5: Commit**

```bash
git add lib/job-url.ts lib/job-url.test.ts lib/supabase/database.types.ts
git commit -m "feat: add job URL normalize and expand bid statuses"
```

---
