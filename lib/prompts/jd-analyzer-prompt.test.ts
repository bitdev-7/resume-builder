import { describe, expect, it } from "vitest";
import {
  buildJdAnalyzerSystemPrompt,
  JD_ANALYZER_DEFAULT_GUIDANCE,
} from "@/lib/prompts/jd-analyzer-prompt";

describe("JD analyzer clearance prompt contract", () => {
  it("includes clearance detection rules in default guidance", () => {
    expect(JD_ANALYZER_DEFAULT_GUIDANCE).toContain("clearanceRequired");
    expect(JD_ANALYZER_DEFAULT_GUIDANCE).toContain("clearanceType");
    expect(JD_ANALYZER_DEFAULT_GUIDANCE).toContain("clearanceStatus");
    expect(JD_ANALYZER_DEFAULT_GUIDANCE).toContain("clearanceRequirementText");
    expect(JD_ANALYZER_DEFAULT_GUIDANCE).toContain("active_required");
    expect(JD_ANALYZER_DEFAULT_GUIDANCE).toContain("obtain_required");
    expect(JD_ANALYZER_DEFAULT_GUIDANCE).toContain("eligibility_required");
    expect(JD_ANALYZER_DEFAULT_GUIDANCE).toContain("background checks");
    expect(JD_ANALYZER_DEFAULT_GUIDANCE).toContain("work authorization");
  });

  it("includes the four clearance fields and status values in the fixed contract", () => {
    const prompt = buildJdAnalyzerSystemPrompt();
    expect(prompt).toContain('"clearanceRequired"');
    expect(prompt).toContain('"clearanceType"');
    expect(prompt).toContain('"clearanceStatus"');
    expect(prompt).toContain('"clearanceRequirementText"');
    expect(prompt).toContain("active_required");
    expect(prompt).toContain("obtain_required");
    expect(prompt).toContain("eligibility_required");
    expect(prompt).toContain("preferred");
  });
});
