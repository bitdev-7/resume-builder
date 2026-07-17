import { randomUUID } from "node:crypto";
import type { UpdatedResume } from "@/lib/types/resume";
import type { ClearanceAnalysis } from "@/lib/clearance-warning";
import type {
  EnrichmentRecommendation,
  RoleArchetypeDetection,
  ValidationIssue,
} from "@/lib/types/tailoring";

export type AnalyzeJobStatus = "running" | "completed" | "failed";

/** The completed job payload — the same shape the synchronous route returned inline. */
export interface AnalyzeJobResult {
  resume: UpdatedResume;
  providerUsed: string;
  modelUsed: string;
  jobTitle: string;
  companyName: string;
  jobDescription: string;
  generationCostUsd: number;
  normalizedJobTitle: string;
  roleArchetype: RoleArchetypeDetection;
  enrichmentRecommendations: EnrichmentRecommendation[];
  clearance: ClearanceAnalysis;
  validationIssues?: ValidationIssue[];
  pdfBase64?: string;
  pdfError?: string;
}

export interface AnalyzeJob {
  id: string;
  userId: string;
  status: AnalyzeJobStatus;
  result?: AnalyzeJobResult;
  error?: string;
  createdAt: number;
}

/**
 * In-memory job store. The pipeline can run for minutes, so POST /api/analyze kicks
 * off a background job and returns a jobId immediately; GET /api/analyze/status/:id
 * polls for the result. Jobs are scoped per user and pruned after TTL. Because the
 * store is in-process, a backend restart loses in-flight jobs (the poll then 404s and
 * the user re-submits); completed resumes are still persisted to resume_history as
 * before, so nothing durable is lost.
 */
const jobs = new Map<string, AnalyzeJob>();
const JOB_TTL_MS = 30 * 60 * 1000;

export function createAnalyzeJob(userId: string): AnalyzeJob {
  pruneOldJobs();
  const job: AnalyzeJob = {
    id: randomUUID(),
    userId,
    status: "running",
    createdAt: Date.now(),
  };
  jobs.set(job.id, job);
  return job;
}

export function getAnalyzeJob(id: string): AnalyzeJob | undefined {
  return jobs.get(id);
}

export function completeAnalyzeJob(id: string, result: AnalyzeJobResult): void {
  const job = jobs.get(id);
  if (job) {
    job.status = "completed";
    job.result = result;
  }
}

export function failAnalyzeJob(id: string, error: string): void {
  const job = jobs.get(id);
  if (job) {
    job.status = "failed";
    job.error = error;
  }
}

function pruneOldJobs(): void {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (now - job.createdAt > JOB_TTL_MS) {
      jobs.delete(id);
    }
  }
}
