import type { BidStatus, UserJobListItem } from "@/lib/supabase/database.types";
import { BID_STATUSES } from "@/lib/supabase/database.types";

/** Statuses shown on the Jobs working list (applied/ignored stay hidden for this user). */
export const JOBS_PIPELINE_STATUSES: BidStatus[] = BID_STATUSES.filter(
  (status) => status !== "applied" && status !== "ignored"
);

/** Statuses selectable on a Jobs row (Ignore uses its own button). */
export const JOBS_ROW_STATUSES: BidStatus[] = BID_STATUSES.filter(
  (status) => status !== "ignored"
);

export function isJobsPipelineStatus(status: BidStatus): boolean {
  return status !== "applied" && status !== "ignored";
}

export function jobsInPipeline(jobs: UserJobListItem[]): UserJobListItem[] {
  return jobs.filter((job) => isJobsPipelineStatus(job.status));
}

export function filterJobs(
  jobs: UserJobListItem[],
  status: BidStatus | ""
): UserJobListItem[] {
  const pipeline = jobsInPipeline(jobs);
  return status ? pipeline.filter((job) => job.status === status) : pipeline;
}

export function paginateJobs(
  jobs: UserJobListItem[],
  page: number,
  pageSize: number
): UserJobListItem[] {
  const start = (page - 1) * pageSize;
  return jobs.slice(start, start + pageSize);
}

export function getExternalJobUrl(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}
