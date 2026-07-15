import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { BidStatus, ResumeRecord } from "@/lib/supabase/database.types";
import type { JobsiteId } from "@/lib/jobsites";
import {
  uploadJd,
  uploadResumeJson,
  downloadJd,
  downloadResumeJson,
} from "@/lib/supabase/storage";
import type { UpdatedResume } from "@/lib/types/resume";
import { randomId } from "@/lib/uuid";

export interface CreateResumeParams {
  userId: string;
  profileId?: string | null;
  jobId?: string | null;
  bidStatus?: BidStatus;
  jd: string;
  resume: UpdatedResume;
  aiType?: string | null;
  model?: string | null;
  jobSite?: JobsiteId | null;
  jobLink?: string | null;
  jobTitle?: string | null;
  jobCompany?: string | null;
}

export async function createResumeWithArtifacts(
  params: CreateResumeParams,
  client: SupabaseClient = supabase
): Promise<ResumeRecord> {
  const resumeId = randomId();

  const jdFilePath = await uploadJd(params.userId, resumeId, params.jd, client);
  const resumeFilePath = await uploadResumeJson(
    params.userId,
    resumeId,
    params.resume,
    client
  );

  const { data, error } = await client
    .from("resume_history")
    .insert({
      id: resumeId,
      user_id: params.userId,
      profile_id: params.profileId ?? null,
      job_id: params.jobId ?? null,
      ai_type: params.aiType ?? null,
      model: params.model ?? null,
      job_site: params.jobSite ?? null,
      job_link: params.jobLink ?? null,
      job_title: params.jobTitle ?? null,
      job_company: params.jobCompany ?? null,
      jd_file_path: jdFilePath,
      resume_file_path: resumeFilePath,
      bid_status: params.bidStatus ?? "applied",
    })
    .select("*")
    .single();

  if (error) throw error;
  return data as ResumeRecord;
}

export async function listResumes(
  userId: string,
  client: SupabaseClient = supabase
): Promise<ResumeRecord[]> {
  const { data, error } = await client
    .from("resume_history")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as ResumeRecord[];
}

export async function updateResumeBidStatus(
  resumeId: string,
  bidStatus: BidStatus,
  client: SupabaseClient = supabase
): Promise<ResumeRecord> {
  const { data, error } = await client
    .from("resume_history")
    .update({ bid_status: bidStatus, updated_at: new Date().toISOString() })
    .eq("id", resumeId)
    .select("*")
    .single();

  if (error) throw error;

  const record = data as ResumeRecord & { job_id?: string | null };
  if (record.job_id) {
    const { error: statusError } = await client.from("user_job_status").upsert(
      {
        user_id: record.user_id,
        job_id: record.job_id,
        status: bidStatus,
        updated_at: record.updated_at,
      },
      { onConflict: "user_id,job_id" }
    );

    if (statusError) throw statusError;
  }

  return record;
}

export async function getResumeArtifacts(
  record: ResumeRecord,
  client: SupabaseClient = supabase
): Promise<{ jd: string; resume: UpdatedResume }> {
  const [jd, resume] = await Promise.all([
    record.jd_file_path
      ? downloadJd(record.jd_file_path, client)
      : Promise.resolve(""),
    record.resume_file_path
      ? downloadResumeJson<UpdatedResume>(record.resume_file_path, client)
      : Promise.resolve({} as UpdatedResume),
  ]);

  return { jd, resume };
}
