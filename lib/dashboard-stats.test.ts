import { describe, expect, it } from "vitest";
import {
  computeBidSuccessStats,
  isBidAdvanced,
  isBidRejected,
  isBidSucceeded,
} from "./dashboard-stats";
import type { BidStatus, ResumeRecord } from "./supabase/database.types";

function resume(id: string, bidStatus: BidStatus): ResumeRecord {
  return {
    id,
    user_id: "user-1",
    profile_id: null,
    job_id: null,
    ai_type: null,
    model: null,
    job_site: null,
    job_link: null,
    job_title: null,
    job_company: null,
    jd_file_path: null,
    resume_file_path: null,
    bid_status: bidStatus,
    created_at: "2026-07-16T00:00:00.000Z",
    updated_at: "2026-07-16T00:00:00.000Z",
  };
}

describe("dashboard bid status compatibility", () => {
  it.each(["unapplied", "opened"] as const)(
    "does not treat %s as advanced, rejected, or succeeded",
    (status) => {
      const record = resume(status, status);

      expect(isBidAdvanced(record, 0)).toBe(false);
      expect(isBidRejected(status)).toBe(false);
      expect(isBidSucceeded(status)).toBe(false);
    }
  );

  it("excludes not-yet-applied jobs from success-rate counts", () => {
    const records = [
      resume("unapplied", "unapplied"),
      resume("opened", "opened"),
      resume("applied", "applied"),
      resume("interviewing", "interviewing"),
    ];

    expect(computeBidSuccessStats(records, new Map())).toEqual({
      bidCount: 2,
      interviewBidCount: 1,
      interviewRate: 50,
    });
  });
});
