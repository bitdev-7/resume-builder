import { describe, expect, it } from "vitest";
import { JD_ANALYZER_DEFAULT_GUIDANCE } from "@/lib/prompts/jd-analyzer-prompt";
import { getClearanceWarning, type ClearanceAnalysis } from "@/lib/clearance-warning";

/**
 * Regression: citizenship / background checks / etc. alone must not be treated
 * as clearance. Detection is LLM-driven; we verify guidance excludes them and
 * that a model returning no-clearance for such JDs yields no UI warning.
 */
describe("clearance false-positive regressions", () => {
  const aloneDoNotTrigger = [
    "citizenship",
    "export-control eligibility",
    "background checks",
    "drug screening",
    "work authorization",
    "suitability checks",
  ];

  it("documents exclusion rules in JD analyzer guidance", () => {
    for (const phrase of aloneDoNotTrigger) {
      expect(JD_ANALYZER_DEFAULT_GUIDANCE.toLowerCase()).toContain(phrase.toLowerCase());
    }
  });

  it("shows no warning when the analyzer returns no clearance for those phrases", () => {
    const noClearance: ClearanceAnalysis = {
      clearanceRequired: false,
      clearanceType: null,
      clearanceStatus: null,
      clearanceRequirementText: null,
    };
    expect(getClearanceWarning(noClearance).level).toBe("none");
  });
});
