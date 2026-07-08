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

export interface CreateResumeParams {
  userId: string;
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
  const resumeId = crypto.randomUUID();

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
      ai_type: params.aiType ?? null,
      model: params.model ?? null,
      job_site: params.jobSite ?? null,
      job_link: params.jobLink ?? null,
      job_title: params.jobTitle ?? null,
      job_company: params.jobCompany ?? null,
      jd_file_path: jdFilePath,
      resume_file_path: resumeFilePath,
      bid_status: "applied",
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
  return data as ResumeRecord;
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
