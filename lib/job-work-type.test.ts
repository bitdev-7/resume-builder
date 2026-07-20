import { describe, expect, it } from "vitest";
import {
  analyzeJobWorkType,
  extractedJobIsHybridOrOnsite,
} from "@/lib/job-work-type";

const OFFSHORE_LAUNCH_SNIPPET = `
This is a hybrid support-and-development role — you'll own the morning support queue,
resolve bugs independently, and progressively take on deeper technical work.
Environment & Onboarding: This is a remote-first role.
`;

describe("analyzeJobWorkType — hybrid false positives", () => {
  it("does not treat hybrid support/dev role wording as location hybrid", () => {
    const analysis = analyzeJobWorkType(OFFSHORE_LAUNCH_SNIPPET);
    expect(analysis.jobTypes).toEqual(["remote"]);
    expect(extractedJobIsHybridOrOnsite(analysis)).toBe(false);
  });

  it("still detects explicit hybrid work arrangements", () => {
    const analysis = analyzeJobWorkType(
      "Hybrid schedule: 3 days in office, 2 days remote. Some flexibility on which days."
    );
    expect(analysis.jobTypes).toContain("hybrid");
    expect(extractedJobIsHybridOrOnsite(analysis)).toBe(true);
  });

  it("detects remote plus in-office options as hybrid", () => {
    const analysis = analyzeJobWorkType(
      "Work remotely or in an office depending on team needs."
    );
    expect(analysis.jobTypes).toContain("hybrid");
    expect(analysis.jobTypes).toContain("remote");
  });

  it("ignores AI hybrid hint when text only describes a hybrid role mix", () => {
    const analysis = analyzeJobWorkType(
      OFFSHORE_LAUNCH_SNIPPET,
      "hybrid",
      ["hybrid", "remote"]
    );
    expect(analysis.jobTypes).toEqual(["remote"]);
    expect(extractedJobIsHybridOrOnsite(analysis)).toBe(false);
  });
});
