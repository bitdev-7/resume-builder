import { describe, expect, it } from "vitest";
import type { UserJobListItem } from "@/lib/supabase/database.types";
import { filterJobs, getExternalJobUrl, jobsInPipeline, paginateJobs } from "./jobs-page-state";

const JOBS: UserJobListItem[] = [
  {
    job_id: "1",
    url: "example.com/first",
    created_at: "2026-07-16T00:00:00.000Z",
    status: "unapplied",
  },
  {
    job_id: "2",
    url: "https://example.com/second",
    created_at: "2026-07-15T00:00:00.000Z",
    status: "applied",
  },
  {
    job_id: "3",
    url: "http://example.com/third",
    created_at: "2026-07-14T00:00:00.000Z",
    status: "applied",
  },
];

describe("jobs page state", () => {
  it("filters jobs by status and hides applied from the default pipeline", () => {
    expect(filterJobs(JOBS, "applied").map((job) => job.job_id)).toEqual([]);
    expect(filterJobs(JOBS, "").map((job) => job.job_id)).toEqual(["1"]);
    expect(filterJobs(JOBS, "opened")).toEqual([]);
  });

  it("jobsInPipeline excludes applied rows", () => {
    expect(jobsInPipeline(JOBS).map((job) => job.job_id)).toEqual(["1"]);
  });

  it("paginates filtered jobs", () => {
    expect(paginateJobs(JOBS, 2, 2).map((job) => job.job_id)).toEqual(["3"]);
  });

  it("adds https only when a URL has no protocol", () => {
    expect(getExternalJobUrl("example.com/job")).toBe("https://example.com/job");
    expect(getExternalJobUrl("https://example.com/job")).toBe("https://example.com/job");
    expect(getExternalJobUrl("http://example.com/job")).toBe("http://example.com/job");
  });
});
