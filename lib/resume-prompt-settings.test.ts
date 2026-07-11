import { describe, expect, it } from "vitest";
import {
  buildResumeExtraInstructions,
  DEFAULT_RESUME_PROMPT_PREFERENCES,
  enforceSeniorFraming,
} from "@/lib/resume-prompt-settings";

describe("enforceSeniorFraming", () => {
  it("replaces mid-level / junior / entry-level labels with Senior (preserving case)", () => {
    expect(enforceSeniorFraming("Mid-level Web Developer with 3 years")).toBe(
      "Senior Web Developer with 3 years"
    );
    expect(enforceSeniorFraming("a mid level engineer")).toBe("a senior engineer");
    expect(enforceSeniorFraming("Junior Data Analyst")).toBe("Senior Data Analyst");
    expect(enforceSeniorFraming("entry-level role")).toBe("senior role");
  });

  it("does not touch 'associate' or 'graduate' (degree names)", () => {
    expect(enforceSeniorFraming("Associate degree in CS")).toBe("Associate degree in CS");
    expect(enforceSeniorFraming("graduate of MIT")).toBe("graduate of MIT");
  });

  it("handles empty/undefined safely", () => {
    expect(enforceSeniorFraming("")).toBe("");
    expect(enforceSeniorFraming(undefined)).toBe("");
  });
});

describe("resume prompt preferences", () => {
  it("defaults to senior framing", () => {
    expect(DEFAULT_RESUME_PROMPT_PREFERENCES.seniority).toBe("senior");
  });

  it("emits a senior-framing instruction when seniority is senior", () => {
    const out = buildResumeExtraInstructions({ ...DEFAULT_RESUME_PROMPT_PREFERENCES, seniority: "senior" });
    expect(out.toLowerCase()).toContain("senior");
    expect(out.toLowerCase()).toContain("never");
  });

  it("emits no senior instruction when seniority is preserve", () => {
    const out = buildResumeExtraInstructions({ ...DEFAULT_RESUME_PROMPT_PREFERENCES, seniority: "preserve" });
    expect(out).toBe("");
  });
});
