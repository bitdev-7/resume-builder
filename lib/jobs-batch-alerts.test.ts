import { describe, expect, it } from "vitest";
import type { ResumeRecord } from "@/lib/supabase/database.types";
import { buildBatchAlertSummary } from "./jobs-batch-alerts";

function makeResume(overrides: Partial<ResumeRecord> = {}): ResumeRecord {
  return {
    id: "r1",
    user_id: "u",
    profile_id: null,
    job_id: null,
    ai_type: null,
    model: null,
    job_site: null,
    job_link: null,
    job_title: "Eng",
    job_company: "Acme",
    jd_file_path: null,
    resume_file_path: null,
    bid_status: "applied",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("buildBatchAlertSummary", () => {
  it("returns hasAny false when alerts disabled", () => {
    const summary = buildBatchAlertSummary({
      cards: [
        {
          jobId: "j1",
          companyName: "Acme",
          pageContent: "hybrid office",
          jobDescription: "",
        },
      ],
      resumes: [],
      duplicateEnabled: false,
      duplicateMonths: 6,
      hybridEnabled: false,
    });
    expect(summary.hasAny).toBe(false);
  });

  it("flags hybrid location jobs and duplicates independently", () => {
    const summary = buildBatchAlertSummary({
      cards: [
        {
          jobId: "j1",
          companyName: "Acme",
          pageContent: "Hybrid schedule: 3 days in office",
          jobDescription: "",
        },
        {
          jobId: "j2",
          companyName: "Acme",
          pageContent: "Remote-first role",
          jobDescription: "",
        },
      ],
      resumes: [makeResume()],
      duplicateEnabled: true,
      duplicateMonths: 12,
      hybridEnabled: true,
    });
    expect(summary.hybridJobIds).toContain("j1");
    expect(summary.hybridJobIds).not.toContain("j2");
    expect(summary.duplicateByJobId.j1?.length).toBeGreaterThan(0);
    expect(summary.hasAny).toBe(true);
  });
});
