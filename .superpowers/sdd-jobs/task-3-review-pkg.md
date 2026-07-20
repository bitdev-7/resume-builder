BASE: 55e9656ebe1ee8b4714fcab761f40035495ba367
HEAD: 18c9690b16447a03a1a6a9bcefdcc7db61b13dba
18c9690 feat: add jobs service with per-user status sync

 lib/supabase/services/index.ts     |   8 ++
 lib/supabase/services/jobs.test.ts |  12 +++
 lib/supabase/services/jobs.ts      | 204 +++++++++++++++++++++++++++++++++++++
 lib/supabase/services/resumes.ts   |  23 ++++-
 4 files changed, 245 insertions(+), 2 deletions(-)

```
diff --git a/lib/supabase/services/index.ts b/lib/supabase/services/index.ts
index 725a98b..8506f05 100644
--- a/lib/supabase/services/index.ts
+++ b/lib/supabase/services/index.ts
@@ -17,12 +17,20 @@ export {
   createResumeWithArtifacts,
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
   type InterviewFormInput,
diff --git a/lib/supabase/services/jobs.test.ts b/lib/supabase/services/jobs.test.ts
new file mode 100644
index 0000000..156bec7
--- /dev/null
+++ b/lib/supabase/services/jobs.test.ts
@@ -0,0 +1,12 @@
+import { describe, expect, it } from "vitest";
+import { nextStatusAfterOpen } from "./jobs";
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
diff --git a/lib/supabase/services/jobs.ts b/lib/supabase/services/jobs.ts
new file mode 100644
index 0000000..47eecab
--- /dev/null
+++ b/lib/supabase/services/jobs.ts
@@ -0,0 +1,204 @@
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
+  const createdCatalog = !existingJob;
+  if (!existingJob) {
+    const { error: insertError } = await db
+      .from("jobs")
+      .upsert({ url }, { onConflict: "url", ignoreDuplicates: true });
+
+    if (insertError) throw insertError;
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
+  const { data: existingStatus, error: statusError } = await db
+    .from("user_job_status")
+    .select("status")
+    .eq("user_id", userId)
+    .eq("job_id", catalogJob.id)
+    .maybeSingle();
+
+  if (statusError) throw statusError;
+
+  const attached = !existingStatus;
+  if (attached) {
+    const { error: attachError } = await db.from("user_job_status").insert({
+      user_id: userId,
+      job_id: catalogJob.id,
+      status: "unapplied",
+    });
+
+    if (attachError) throw attachError;
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
index 9fe1973..410af36 100644
--- a/lib/supabase/services/resumes.ts
+++ b/lib/supabase/services/resumes.ts
@@ -11,12 +11,14 @@ import {
 import type { UpdatedResume } from "@/lib/types/resume";
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
   jobLink?: string | null;
@@ -41,21 +43,22 @@ export async function createResumeWithArtifacts(
   const { data, error } = await client
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
   return data as ResumeRecord;
@@ -85,13 +88,29 @@ export async function updateResumeBidStatus(
     .update({ bid_status: bidStatus, updated_at: new Date().toISOString() })
     .eq("id", resumeId)
     .select("*")
     .single();
 
   if (error) throw error;
-  return data as ResumeRecord;
+
+  const record = data as ResumeRecord & { job_id?: string | null };
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
 ): Promise<{ jd: string; resume: UpdatedResume }> {

```
