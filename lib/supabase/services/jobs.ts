import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeJobUrl } from "@/lib/job-url";
import type {
  BidStatus,
  JobRecord,
  UserJobListItem,
} from "@/lib/supabase/database.types";

async function resolveClient(client?: SupabaseClient): Promise<SupabaseClient> {
  if (client) return client;
  return (await import("@/lib/supabase")).supabase;
}

export function nextStatusAfterOpen(status: BidStatus): BidStatus {
  return status === "unapplied" ? "opened" : status;
}

/** Merge the global catalog with per-user status rows (default `unapplied`). */
export function mergeCatalogJobsWithUserStatus(
  jobs: JobRecord[],
  statuses: Array<{ job_id: string; status: BidStatus }>
): UserJobListItem[] {
  const statusByJobId = new Map(statuses.map((row) => [row.job_id, row.status]));

  return jobs.map((job) => ({
    job_id: job.id,
    url: job.url,
    created_at: job.created_at,
    status: statusByJobId.get(job.id) ?? "unapplied",
  }));
}

async function getJobForUser(
  userId: string,
  jobId: string,
  client: SupabaseClient
): Promise<UserJobListItem> {
  const { data: job, error: jobError } = await client
    .from("jobs")
    .select("id,url,created_at")
    .eq("id", jobId)
    .single();

  if (jobError) throw jobError;

  const { data: statusRow, error: statusError } = await client
    .from("user_job_status")
    .select("status")
    .eq("user_id", userId)
    .eq("job_id", jobId)
    .maybeSingle();

  if (statusError) throw statusError;

  const catalogJob = job as JobRecord;
  return {
    job_id: catalogJob.id,
    url: catalogJob.url,
    created_at: catalogJob.created_at,
    status: (statusRow?.status as BidStatus | undefined) ?? "unapplied",
  };
}

export async function listJobsForUser(
  userId: string,
  client?: SupabaseClient
): Promise<UserJobListItem[]> {
  const db = await resolveClient(client);

  const [jobsResult, statusResult] = await Promise.all([
    db.from("jobs").select("id,url,created_at").order("created_at", { ascending: false }),
    db.from("user_job_status").select("job_id,status").eq("user_id", userId),
  ]);

  if (jobsResult.error) throw jobsResult.error;
  if (statusResult.error) throw statusResult.error;

  return mergeCatalogJobsWithUserStatus(
    (jobsResult.data ?? []) as JobRecord[],
    ((statusResult.data ?? []) as Array<{ job_id: string; status: BidStatus }>)
  );
}

export async function addJobForUser(
  userId: string,
  rawUrl: string,
  client?: SupabaseClient
): Promise<{
  item: UserJobListItem;
  createdCatalog: boolean;
  attached: boolean;
}> {
  const url = normalizeJobUrl(rawUrl);
  if (!url) throw new Error("Job URL cannot be empty.");
  const db = await resolveClient(client);

  const { data: existingJob, error: selectError } = await db
    .from("jobs")
    .select("id,url,created_at")
    .eq("url", url)
    .maybeSingle();

  if (selectError) throw selectError;

  let createdCatalog = false;
  if (!existingJob) {
    const { data: insertedJob, error: insertError } = await db
      .from("jobs")
      .upsert({ url }, { onConflict: "url", ignoreDuplicates: true })
      .select("id")
      .maybeSingle();

    if (insertError) throw insertError;
    createdCatalog = Boolean(insertedJob);
  }

  const { data: job, error: jobError } = await db
    .from("jobs")
    .select("id,url,created_at")
    .eq("url", url)
    .single();

  if (jobError) throw jobError;

  const catalogJob = job as JobRecord;
  let { data: existingStatus, error: statusError } = await db
    .from("user_job_status")
    .select("status")
    .eq("user_id", userId)
    .eq("job_id", catalogJob.id)
    .maybeSingle();

  if (statusError) throw statusError;

  let attached = false;
  if (!existingStatus) {
    const { error: attachError } = await db.from("user_job_status").insert({
      user_id: userId,
      job_id: catalogJob.id,
      status: "unapplied",
    });

    if (attachError?.code === "23505") {
      const { data: concurrentStatus, error: concurrentStatusError } = await db
        .from("user_job_status")
        .select("status")
        .eq("user_id", userId)
        .eq("job_id", catalogJob.id)
        .single();

      if (concurrentStatusError) throw concurrentStatusError;
      existingStatus = concurrentStatus;
    } else if (attachError) {
      throw attachError;
    } else {
      attached = true;
    }
  }

  // Re-adding an ignored URL brings it back into this user's Jobs list.
  if (existingStatus?.status === "ignored") {
    const { error: unignoreError } = await db
      .from("user_job_status")
      .update({ status: "unapplied", updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("job_id", catalogJob.id);

    if (unignoreError) throw unignoreError;
    existingStatus = { status: "unapplied" };
    attached = true;
  }

  return {
    item: {
      job_id: catalogJob.id,
      url: catalogJob.url,
      created_at: catalogJob.created_at,
      status: (existingStatus?.status as BidStatus | undefined) ?? "unapplied",
    },
    createdCatalog,
    attached,
  };
}

export async function openJobForUser(
  userId: string,
  jobId: string,
  client?: SupabaseClient
): Promise<UserJobListItem> {
  const db = await resolveClient(client);
  const item = await getJobForUser(userId, jobId, db);
  const nextStatus = nextStatusAfterOpen(item.status);

  if (nextStatus !== item.status) {
    const { error } = await db.from("user_job_status").upsert(
      {
        user_id: userId,
        job_id: jobId,
        status: nextStatus,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,job_id" }
    );

    if (error) throw error;
  }

  return { ...item, status: nextStatus };
}

export async function setJobStatusForUser(
  userId: string,
  jobIds: string[],
  status: BidStatus,
  client?: SupabaseClient
): Promise<void> {
  if (jobIds.length === 0) return;

  const db = await resolveClient(client);
  const updatedAt = new Date().toISOString();
  const { error: statusError } = await db.from("user_job_status").upsert(
    jobIds.map((jobId) => ({
      user_id: userId,
      job_id: jobId,
      status,
      updated_at: updatedAt,
    })),
    { onConflict: "user_id,job_id" }
  );

  if (statusError) throw statusError;

  // Ignoring is Jobs-list only — do not rewrite History bid status.
  if (status === "ignored") return;

  const { error: resumeError } = await db
    .from("resume_history")
    .update({ bid_status: status, updated_at: updatedAt })
    .eq("user_id", userId)
    .in("job_id", jobIds);

  if (resumeError) throw resumeError;
}

export async function ignoreJobForUser(
  userId: string,
  jobId: string,
  client?: SupabaseClient
): Promise<void> {
  await setJobStatusForUser(userId, [jobId], "ignored", client);
}

export async function removeMyJob(
  userId: string,
  jobId: string,
  client?: SupabaseClient
): Promise<void> {
  const db = await resolveClient(client);
  const { error } = await db
    .from("user_job_status")
    .delete()
    .eq("user_id", userId)
    .eq("job_id", jobId);

  if (error) throw error;
}
