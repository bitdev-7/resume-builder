import type { BidStatus, UserJobListItem } from "@/lib/supabase/database.types";

export function filterJobs(
  jobs: UserJobListItem[],
  status: BidStatus | ""
): UserJobListItem[] {
  return status ? jobs.filter((job) => job.status === status) : jobs;
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
