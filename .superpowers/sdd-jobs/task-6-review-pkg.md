BASE 7b973b2c47560608e6cd3e79a5bbe005d38ad8ce HEAD c9e7c0f6733cefb5db3e454881adedcd7fb8c309
c9e7c0f fix: support unapplied/opened statuses in history and stats

 .superpowers/sdd-jobs/task-6-report.md | 10 ++++++
 lib/dashboard-stats.test.ts            | 56 ++++++++++++++++++++++++++++++++++
 lib/dashboard-stats.ts                 | 11 +++++--
 3 files changed, 75 insertions(+), 2 deletions(-)

```
diff --git a/.superpowers/sdd-jobs/task-6-report.md b/.superpowers/sdd-jobs/task-6-report.md
new file mode 100644
index 0000000..6b2193a
--- /dev/null
+++ b/.superpowers/sdd-jobs/task-6-report.md
@@ -0,0 +1,10 @@
+Status: Implemented
+Changes:
+- Dashboard success rates now exclude `unapplied` and `opened` jobs from bid and interview-stage counts.
+- Added regression coverage confirming early statuses are neither advanced, rejected, nor succeeded.
+- History already resolves both statuses through `BID_STATUSES`; no change was required.
+- Interview auto-promotion remains unchanged and does not promote `unapplied` or `opened`.
+- Audited TypeScript status references; no stale hard-coded status union or exhaustive status switch was found.
+Verify: `npm test` ΓÇö 22 files, 91 tests passed.
+Verify: `git diff --check` ΓÇö passed.
+Report: `.superpowers/sdd-jobs/task-6-report.md`
diff --git a/lib/dashboard-stats.test.ts b/lib/dashboard-stats.test.ts
new file mode 100644
index 0000000..e41a3cb
--- /dev/null
+++ b/lib/dashboard-stats.test.ts
@@ -0,0 +1,56 @@
+import { describe, expect, it } from "vitest";
+import {
+  computeBidSuccessStats,
+  isBidAdvanced,
+  isBidRejected,
+  isBidSucceeded,
+} from "./dashboard-stats";
+import type { BidStatus, ResumeRecord } from "./supabase/database.types";
+
+function resume(id: string, bidStatus: BidStatus): ResumeRecord {
+  return {
+    id,
+    user_id: "user-1",
+    profile_id: null,
+    job_id: null,
+    ai_type: null,
+    model: null,
+    job_site: null,
+    job_link: null,
+    job_title: null,
+    job_company: null,
+    jd_file_path: null,
+    resume_file_path: null,
+    bid_status: bidStatus,
+    created_at: "2026-07-16T00:00:00.000Z",
+    updated_at: "2026-07-16T00:00:00.000Z",
+  };
+}
+
+describe("dashboard bid status compatibility", () => {
+  it.each(["unapplied", "opened"] as const)(
+    "does not treat %s as advanced, rejected, or succeeded",
+    (status) => {
+      const record = resume(status, status);
+
+      expect(isBidAdvanced(record, 0)).toBe(false);
+      expect(isBidRejected(status)).toBe(false);
+      expect(isBidSucceeded(status)).toBe(false);
+    }
+  );
+
+  it("excludes not-yet-applied jobs from success-rate counts", () => {
+    const records = [
+      resume("unapplied", "unapplied"),
+      resume("opened", "opened"),
+      resume("applied", "applied"),
+      resume("interviewing", "interviewing"),
+    ];
+
+    expect(computeBidSuccessStats(records, new Map())).toEqual({
+      bidCount: 2,
+      interviewBidCount: 1,
+      interviewRate: 50,
+    });
+  });
+});
diff --git a/lib/dashboard-stats.ts b/lib/dashboard-stats.ts
index 1c56d2d..8cdee5c 100644
--- a/lib/dashboard-stats.ts
+++ b/lib/dashboard-stats.ts
@@ -30,14 +30,20 @@ export interface JobsiteRateEntry {
 export function resolveBidStatusForStats(status: string | null | undefined): string {
   if (!status || status === "draft") return DEFAULT_BID_STATUS;
   return status;
 }
 
+export function isBidApplied(status: string | null | undefined): boolean {
+  const resolved = resolveBidStatusForStats(status);
+  return resolved !== "unapplied" && resolved !== "opened";
+}
+
 export function isBidAdvanced(
   record: ResumeRecord,
   interviewCountForBid: number
 ): boolean {
+  if (!isBidApplied(record.bid_status)) return false;
   if (interviewCountForBid > 0) return true;
   return resolveBidStatusForStats(record.bid_status) !== DEFAULT_BID_STATUS;
 }
 
 export function buildInterviewsByResume<T extends { resume_id: string | null }>(
@@ -56,19 +62,20 @@ export function buildInterviewsByResume<T extends { resume_id: string | null }>(
 export function computeBidSuccessStats(
   records: ResumeRecord[],
   interviewsByResume: Map<string, { resume_id: string | null }[]>
 ): BidSuccessStats {
   let interviewBidCount = 0;
+  const appliedRecords = records.filter((record) => isBidApplied(record.bid_status));
 
-  for (const record of records) {
+  for (const record of appliedRecords) {
     const linked = interviewsByResume.get(record.id) ?? [];
     if (isBidAdvanced(record, linked.length)) {
       interviewBidCount += 1;
     }
   }
 
-  const bidCount = records.length;
+  const bidCount = appliedRecords.length;
   const interviewRate =
     bidCount > 0 ? Math.round((interviewBidCount / bidCount) * 1000) / 10 : 0;
 
   return { bidCount, interviewBidCount, interviewRate };
 }

```
