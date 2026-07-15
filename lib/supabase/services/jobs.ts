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

interface UserJobStatusWithJob {
  job_id: string;
  status: BidStatus;
  jobs: {
    url: string;
    created_at: string;
  };
}

function toListItem(row: UserJobStatusWithJob): UserJobListItem {
  return {
    job_id: row.job_id,
    url: row.jobs.url,
    created_at: row.jobs.created_at,
    status: row.status,
  };
}

async function getUserJob(
  userId: string,
  jobId: string,
  client: SupabaseClient
): Promise<UserJobListItem> {
  const { data, error } = await client
    .from("user_job_status")
    .select("job_id,status,jobs!inner(url,created_at)")
    .eq("user_id", userId)
    .eq("job_id", jobId)
    .single();

  if (error) throw error;
  return toListItem(data as unknown as UserJobStatusWithJob);
}

export async function listJobsForUser(
  userId: string,
  client?: SupabaseClient
): Promise<UserJobListItem[]> {
  const db = await resolveClient(client);
  const { data, error } = await db
    .from("user_job_status")
    .select("job_id,status,jobs!inner(url,created_at)")
    .eq("user_id", userId)
    .order("created_at", { referencedTable: "jobs", ascending: false });

  if (error) throw error;
  return ((data ?? []) as unknown as UserJobStatusWithJob[]).map(toListItem);
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
  const item = await getUserJob(userId, jobId, db);
  const nextStatus = nextStatusAfterOpen(item.status);

  if (nextStatus !== item.status) {
    const { error } = await db
      .from("user_job_status")
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("job_id", jobId);

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

  const { error: resumeError } = await db
    .from("resume_history")
    .update({ bid_status: status, updated_at: updatedAt })
    .eq("user_id", userId)
    .in("job_id", jobIds);

  if (resumeError) throw resumeError;
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
