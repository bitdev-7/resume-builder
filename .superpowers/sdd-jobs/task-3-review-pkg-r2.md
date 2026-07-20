BASE: 55e9656ebe1ee8b4714fcab761f40035495ba367 HEAD: 3010f2aa1159625429ed93843505e0f0550da315
3010f2a fix: harden jobs add race handling and ResumeRecord.job_id
18c9690 feat: add jobs service with per-user status sync

 .superpowers/sdd-jobs/task-3-report.md |  41 ++++++
 lib/supabase/database.types.ts         |   1 +
 lib/supabase/services/index.ts         |   8 ++
 lib/supabase/services/jobs.test.ts     |  86 +++++++++++++
 lib/supabase/services/jobs.ts          | 221 +++++++++++++++++++++++++++++++++
 lib/supabase/services/resumes.ts       |  23 +++-
 6 files changed, 378 insertions(+), 2 deletions(-)

```
diff --git a/.superpowers/sdd-jobs/task-3-report.md b/.superpowers/sdd-jobs/task-3-report.md
new file mode 100644
index 0000000..99ae999
--- /dev/null
+++ b/.superpowers/sdd-jobs/task-3-report.md
@@ -0,0 +1,41 @@
+# Task 3 Report: Jobs Supabase service
+
+## Status
+
+**COMPLETE_WITH_CONCERNS**
+
+## Summary
+
+Added the Jobs catalog/per-user status service, including normalized race-safe catalog attachment, open-state promotion, bulk status updates, removal, and resume-history synchronization. Resume creation now accepts `jobId` and an optional `bidStatus`; resume status edits upsert the linked per-user job status.
+
+## Files
+
+- `lib/supabase/services/jobs.ts` ΓÇö Jobs service API and exported `nextStatusAfterOpen`.
+- `lib/supabase/services/jobs.test.ts` ΓÇö TDD coverage for open-state promotion and non-downgrade behavior.
+- `lib/supabase/services/resumes.ts` ΓÇö linked job fields on create and reverse status sync on update.
+- `lib/supabase/services/index.ts` ΓÇö Jobs API exports.
+
+## TDD Evidence
+
+- RED: `nextStatusAfterOpen("unapplied")` returned `"unapplied"` instead of `"opened"` (1 failed, 1 passed).
+- GREEN: `npm test -- lib/supabase/services/jobs.test.ts lib/job-url.test.ts` ΓÇö 2 files and 5 tests passed.
+
+## Verification
+
+- `npx tsc -p frontend/tsconfig.json --noEmit` ΓÇö passed.
+- Commit: `18c9690 feat: add jobs service with per-user status sync`
+
+## Concerns
+
+- Migration `supabase/migrations/007_jobs_tracker.sql` must be applied to the target Supabase project.
+- Database operations were type-checked but not exercised against a live Supabase instance.
+- Cross-table status synchronization is sequential, so a failure in the second write can require retrying the operation.
+
+## Important Review Fixes
+
+- Catalog creation is now reported only when this request's conflict-safe insert returns an inserted row.
+- Concurrent same-user attachment conflicts re-select the winning row and return `attached: false`.
+- `ResumeRecord` now includes `job_id: string | null`, removing the temporary intersection cast.
+- Regression tests: `npm test -- lib/supabase/services/jobs.test.ts lib/job-url.test.ts` ΓÇö 2 files and 7 tests passed.
+- TypeScript: `npx tsc -p frontend/tsconfig.json --noEmit` ΓÇö passed.
+- Commit: `fix: harden jobs add race handling and ResumeRecord.job_id`
diff --git a/lib/supabase/database.types.ts b/lib/supabase/database.types.ts
index 686431e..08a386a 100644
--- a/lib/supabase/database.types.ts
+++ b/lib/supabase/database.types.ts
@@ -205,10 +205,11 @@ export interface UserCompany {
 
 export interface ResumeRecord {
   id: string;
   user_id: string;
   profile_id: string | null;
+  job_id: string | null;
   ai_type: string | null;
   model: string | null;
   job_site: string | null;
   job_link: string | null;
   job_title: string | null;
diff --git a/lib/supabase/services/index.ts b/lib/supabase/services/index.ts
index 725a98b..8506f05 100644
--- a/lib/supabase/services/index.ts
+++ b/lib/supabase/services/index.ts
@@ -18,10 +18,18 @@ export {
   listResumes,
   updateResumeBidStatus,
   getResumeArtifacts,
   type CreateResumeParams,
 } from "@/lib/supabase/services/resumes";
+export {
+  nextStatusAfterOpen,
+  listJobsForUser,
+  addJobForUser,
+  openJobForUser,
+  setJobStatusForUser,
+  removeMyJob,
+} from "@/lib/supabase/services/jobs";
 export {
   listInterviews,
   createInterview,
   updateInterview,
   deleteInterview,
diff --git a/lib/supabase/services/jobs.test.ts b/lib/supabase/services/jobs.test.ts
new file mode 100644
index 0000000..61c941e
--- /dev/null
+++ b/lib/supabase/services/jobs.test.ts
@@ -0,0 +1,86 @@
+import type { SupabaseClient } from "@supabase/supabase-js";
+import { describe, expect, it } from "vitest";
+import { addJobForUser, nextStatusAfterOpen } from "./jobs";
+
+function scriptedClient(
+  responses: Array<{ data: unknown; error: unknown }>
+): SupabaseClient {
+  let query = 0;
+
+  return {
+    from() {
+      const response = responses[query++];
+      const builder = new Proxy(
+        {
+          then(
+            resolve: (value: { data: unknown; error: unknown }) => unknown
+          ) {
+            return Promise.resolve(response).then(resolve);
+          },
+        },
+        {
+          get(target, property) {
+            if (property === "then") return target.then;
+            return () => builder;
+          },
+        }
+      );
+      return builder;
+    },
+  } as unknown as SupabaseClient;
+}
+
+describe("nextStatusAfterOpen", () => {
+  it("promotes unapplied to opened", () => {
+    expect(nextStatusAfterOpen("unapplied")).toBe("opened");
+  });
+
+  it("leaves applied alone", () => {
+    expect(nextStatusAfterOpen("applied")).toBe("applied");
+  });
+});
+
+describe("addJobForUser", () => {
+  const job = {
+    id: "job-1",
+    url: "https://example.com/jobs/1",
+    created_at: "2026-07-16T00:00:00.000Z",
+  };
+
+  it("does not claim catalog creation when a concurrent insert wins", async () => {
+    const client = scriptedClient([
+      { data: null, error: null },
+      { data: null, error: null },
+      { data: job, error: null },
+      { data: { status: "opened" }, error: null },
+    ]);
+
+    const result = await addJobForUser(
+      "user-1",
+      "https://example.com/jobs/1",
+      client
+    );
+
+    expect(result.createdCatalog).toBe(false);
+  });
+
+  it("returns the existing attachment after a concurrent attach wins", async () => {
+    const duplicateKeyError = { code: "23505", message: "duplicate key" };
+    const client = scriptedClient([
+      { data: job, error: null },
+      { data: job, error: null },
+      { data: null, error: null },
+      { data: null, error: duplicateKeyError },
+      { data: { status: "opened" }, error: null },
+    ]);
+
+    const result = await addJobForUser(
+      "user-1",
+      "https://example.com/jobs/1",
+      client
+    );
+
+    expect(result.attached).toBe(false);
+    expect(result.item.status).toBe("opened");
+  });
+});
diff --git a/lib/supabase/services/jobs.ts b/lib/supabase/services/jobs.ts
new file mode 100644
index 0000000..b1c2336
--- /dev/null
+++ b/lib/supabase/services/jobs.ts
@@ -0,0 +1,221 @@
+import type { SupabaseClient } from "@supabase/supabase-js";
+import { normalizeJobUrl } from "@/lib/job-url";
+import type {
+  BidStatus,
+  JobRecord,
+  UserJobListItem,
+} from "@/lib/supabase/database.types";
+
+async function resolveClient(client?: SupabaseClient): Promise<SupabaseClient> {
+  if (client) return client;
+  return (await import("@/lib/supabase")).supabase;
+}
+
+export function nextStatusAfterOpen(status: BidStatus): BidStatus {
+  return status === "unapplied" ? "opened" : status;
+}
+
+interface UserJobStatusWithJob {
+  job_id: string;
+  status: BidStatus;
+  jobs: {
+    url: string;
+    created_at: string;
+  };
+}
+
+function toListItem(row: UserJobStatusWithJob): UserJobListItem {
+  return {
+    job_id: row.job_id,
+    url: row.jobs.url,
+    created_at: row.jobs.created_at,
+    status: row.status,
+  };
+}
+
+async function getUserJob(
+  userId: string,
+  jobId: string,
+  client: SupabaseClient
+): Promise<UserJobListItem> {
+  const { data, error } = await client
+    .from("user_job_status")
+    .select("job_id,status,jobs!inner(url,created_at)")
+    .eq("user_id", userId)
+    .eq("job_id", jobId)
+    .single();
+
+  if (error) throw error;
+  return toListItem(data as unknown as UserJobStatusWithJob);
+}
+
+export async function listJobsForUser(
+  userId: string,
+  client?: SupabaseClient
+): Promise<UserJobListItem[]> {
+  const db = await resolveClient(client);
+  const { data, error } = await db
+    .from("user_job_status")
+    .select("job_id,status,jobs!inner(url,created_at)")
+    .eq("user_id", userId)
+    .order("created_at", { referencedTable: "jobs", ascending: false });
+
+  if (error) throw error;
+  return ((data ?? []) as unknown as UserJobStatusWithJob[]).map(toListItem);
+}
+
+export async function addJobForUser(
+  userId: string,
+  rawUrl: string,
+  client?: SupabaseClient
+): Promise<{
+  item: UserJobListItem;
+  createdCatalog: boolean;
+  attached: boolean;
+}> {
+  const url = normalizeJobUrl(rawUrl);
+  if (!url) throw new Error("Job URL cannot be empty.");
+  const db = await resolveClient(client);
+
+  const { data: existingJob, error: selectError } = await db
+    .from("jobs")
+    .select("id,url,created_at")
+    .eq("url", url)
+    .maybeSingle();
+
+  if (selectError) throw selectError;
+
+  let createdCatalog = false;
+  if (!existingJob) {
+    const { data: insertedJob, error: insertError } = await db
+      .from("jobs")
+      .upsert({ url }, { onConflict: "url", ignoreDuplicates: true })
+      .select("id")
+      .maybeSingle();
+
+    if (insertError) throw insertError;
+    createdCatalog = Boolean(insertedJob);
+  }
+
+  const { data: job, error: jobError } = await db
+    .from("jobs")
+    .select("id,url,created_at")
+    .eq("url", url)
+    .single();
+
+  if (jobError) throw jobError;
+
+  const catalogJob = job as JobRecord;
+  let { data: existingStatus, error: statusError } = await db
+    .from("user_job_status")
+    .select("status")
+    .eq("user_id", userId)
+    .eq("job_id", catalogJob.id)
+    .maybeSingle();
+
+  if (statusError) throw statusError;
+
+  let attached = false;
+  if (!existingStatus) {
+    const { error: attachError } = await db.from("user_job_status").insert({
+      user_id: userId,
+      job_id: catalogJob.id,
+      status: "unapplied",
+    });
+
+    if (attachError?.code === "23505") {
+      const { data: concurrentStatus, error: concurrentStatusError } = await db
+        .from("user_job_status")
+        .select("status")
+        .eq("user_id", userId)
+        .eq("job_id", catalogJob.id)
+        .single();
+
+      if (concurrentStatusError) throw concurrentStatusError;
+      existingStatus = concurrentStatus;
+    } else if (attachError) {
+      throw attachError;
+    } else {
+      attached = true;
+    }
+  }
+
+  return {
+    item: {
+      job_id: catalogJob.id,
+      url: catalogJob.url,
+      created_at: catalogJob.created_at,
+      status: (existingStatus?.status as BidStatus | undefined) ?? "unapplied",
+    },
+    createdCatalog,
+    attached,
+  };
+}
+
+export async function openJobForUser(
+  userId: string,
+  jobId: string,
+  client?: SupabaseClient
+): Promise<UserJobListItem> {
+  const db = await resolveClient(client);
+  const item = await getUserJob(userId, jobId, db);
+  const nextStatus = nextStatusAfterOpen(item.status);
+
+  if (nextStatus !== item.status) {
+    const { error } = await db
+      .from("user_job_status")
+      .update({ status: nextStatus, updated_at: new Date().toISOString() })
+      .eq("user_id", userId)
+      .eq("job_id", jobId);
+
+    if (error) throw error;
+  }
+
+  return { ...item, status: nextStatus };
+}
+
+export async function setJobStatusForUser(
+  userId: string,
+  jobIds: string[],
+  status: BidStatus,
+  client?: SupabaseClient
+): Promise<void> {
+  if (jobIds.length === 0) return;
+
+  const db = await resolveClient(client);
+  const updatedAt = new Date().toISOString();
+  const { error: statusError } = await db.from("user_job_status").upsert(
+    jobIds.map((jobId) => ({
+      user_id: userId,
+      job_id: jobId,
+      status,
+      updated_at: updatedAt,
+    })),
+    { onConflict: "user_id,job_id" }
+  );
+
+  if (statusError) throw statusError;
+
+  const { error: resumeError } = await db
+    .from("resume_history")
+    .update({ bid_status: status, updated_at: updatedAt })
+    .eq("user_id", userId)
+    .in("job_id", jobIds);
+
+  if (resumeError) throw resumeError;
+}
+
+export async function removeMyJob(
+  userId: string,
+  jobId: string,
+  client?: SupabaseClient
+): Promise<void> {
+  const db = await resolveClient(client);
+  const { error } = await db
+    .from("user_job_status")
+    .delete()
+    .eq("user_id", userId)
+    .eq("job_id", jobId);
+
+  if (error) throw error;
+}
diff --git a/lib/supabase/services/resumes.ts b/lib/supabase/services/resumes.ts
index 9fe1973..0b76418 100644
--- a/lib/supabase/services/resumes.ts
+++ b/lib/supabase/services/resumes.ts
@@ -12,10 +12,12 @@ import type { UpdatedResume } from "@/lib/types/resume";
 import { randomId } from "@/lib/uuid";
 
 export interface CreateResumeParams {
   userId: string;
   profileId?: string | null;
+  jobId?: string | null;
+  bidStatus?: BidStatus;
   jd: string;
   resume: UpdatedResume;
   aiType?: string | null;
   model?: string | null;
   jobSite?: JobsiteId | null;
@@ -42,19 +44,20 @@ export async function createResumeWithArtifacts(
     .from("resume_history")
     .insert({
       id: resumeId,
       user_id: params.userId,
       profile_id: params.profileId ?? null,
+      job_id: params.jobId ?? null,
       ai_type: params.aiType ?? null,
       model: params.model ?? null,
       job_site: params.jobSite ?? null,
       job_link: params.jobLink ?? null,
       job_title: params.jobTitle ?? null,
       job_company: params.jobCompany ?? null,
       jd_file_path: jdFilePath,
       resume_file_path: resumeFilePath,
-      bid_status: "applied",
+      bid_status: params.bidStatus ?? "applied",
     })
     .select("*")
     .single();
 
   if (error) throw error;
@@ -86,11 +89,27 @@ export async function updateResumeBidStatus(
     .eq("id", resumeId)
     .select("*")
     .single();
 
   if (error) throw error;
-  return data as ResumeRecord;
+
+  const record = data as ResumeRecord;
+  if (record.job_id) {
+    const { error: statusError } = await client.from("user_job_status").upsert(
+      {
+        user_id: record.user_id,
+        job_id: record.job_id,
+        status: bidStatus,
+        updated_at: record.updated_at,
+      },
+      { onConflict: "user_id,job_id" }
+    );
+
+    if (statusError) throw statusError;
+  }
+
+  return record;
 }
 
 export async function getResumeArtifacts(
   record: ResumeRecord,
   client: SupabaseClient = supabase

```
