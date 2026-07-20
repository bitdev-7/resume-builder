# Review Task 1
BASE: f2d992e670a3af130322fa2d76084e292b214278
HEAD: d34c9724a916c77d9f2ecf203a197c806ae96459
## Commits
d34c972 feat: add job URL normalize and expand bid statuses

## Diff
```
diff --git a/lib/job-url.test.ts b/lib/job-url.test.ts
new file mode 100644
index 0000000..19afb89
--- /dev/null
+++ b/lib/job-url.test.ts
@@ -0,0 +1,20 @@
+import { describe, expect, it } from "vitest";
+import { normalizeJobUrl } from "./job-url";
+
+describe("normalizeJobUrl", () => {
+  it("strips query string", () => {
+    expect(normalizeJobUrl("https://jobs.example.com/x?utm_source=li&foo=1")).toBe(
+      "https://jobs.example.com/x"
+    );
+  });
+
+  it("trims and collapses whitespace", () => {
+    expect(normalizeJobUrl("  https://jobs.example.com/a   ")).toBe(
+      "https://jobs.example.com/a"
+    );
+  });
+
+  it("returns empty for blank input", () => {
+    expect(normalizeJobUrl("   ")).toBe("");
+  });
+});
diff --git a/lib/job-url.ts b/lib/job-url.ts
new file mode 100644
index 0000000..e559124
--- /dev/null
+++ b/lib/job-url.ts
@@ -0,0 +1,8 @@
+/** Strip UTM/query params; same rule as Windows Job Tracker. */
+export function normalizeJobUrl(url: string): string {
+  let s = String(url).trim().split(/\s+/).join(" ");
+  if (s.includes("?")) {
+    s = s.split("?", 2)[0] ?? s;
+  }
+  return s;
+}
diff --git a/lib/supabase/database.types.ts b/lib/supabase/database.types.ts
index d00ea46..686431e 100644
--- a/lib/supabase/database.types.ts
+++ b/lib/supabase/database.types.ts
@@ -1,14 +1,16 @@
 import type { ResumeTemplateId } from "@/lib/resume-templates";
 import type { JobsiteId } from "@/lib/jobsites";
 
 export type WorkType = "Remote" | "Hybrid" | "Onsite";
 
 export type BidStatus =
+  | "unapplied"
+  | "opened"
   | "applied"
   | "interviewing"
   | "rejected"
   | "offer"
   | "accepted";
 
 export type InterviewCallType =
   | "intro"
@@ -246,23 +248,38 @@ export interface ProfileBundle {
   companies: UserCompany[];
 }
 
 export const WORK_TYPES: WorkType[] = ["Remote", "Hybrid", "Onsite"];
 
 export const DEFAULT_BID_STATUS: BidStatus = "applied";
 
 export const BID_STATUSES: BidStatus[] = [
+  "unapplied",
+  "opened",
   "applied",
   "interviewing",
   "rejected",
   "offer",
   "accepted",
 ];
 
+export interface JobRecord {
+  id: string;
+  url: string;
+  created_at: string;
+}
+
+export interface UserJobListItem {
+  job_id: string;
+  url: string;
+  created_at: string;
+  status: BidStatus;
+}
+
 export const INTERVIEW_CALL_TYPES: InterviewCallType[] = [
   "intro",
   "hr",
   "live_coding",
   "system_design",
   "culture",
   "final",
 ];

```
