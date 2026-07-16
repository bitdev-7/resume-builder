import { describe, expect, it } from "vitest";
import {
  DEFAULT_WORKFLOW_SETTINGS,
  isHardValidationIssue,
  parseWorkflowSettings,
  workflowSettingsToDefaultSettings,
  workflowSettingsToPipelineOptions,
  WORKFLOW_SETTINGS_KEY,
  type GenerationMode,
} from "@/lib/workflow-settings";

describe("workflow settings", () => {
  it("fast mode disables repair entirely", () => {
    const opts = workflowSettingsToPipelineOptions({ mode: "fast" });
    expect(opts.bulletBudget.maxRepairAttempts).toBe(0);
    expect(opts.repairDisabled).toBe(true);
    expect(opts.hardIssuesOnly).toBe(false);
    expect(opts.experienceMode).toBe("batched");
  });

  it("balanced mode allows one repair round but only for hard issues", () => {
    const opts = workflowSettingsToPipelineOptions({ mode: "balanced" });
    expect(opts.bulletBudget.maxRepairAttempts).toBe(1);
    expect(opts.repairDisabled).toBe(false);
    expect(opts.hardIssuesOnly).toBe(true);
    expect(opts.experienceMode).toBe("batched");
  });

  it("accurate mode allows one repair round on any issue", () => {
    const opts = workflowSettingsToPipelineOptions({ mode: "accurate" });
    expect(opts.bulletBudget.maxRepairAttempts).toBe(1);
    expect(opts.repairDisabled).toBe(false);
    expect(opts.hardIssuesOnly).toBe(false);
    expect(opts.experienceMode).toBe("batched");
  });

  it("thorough mode uses per-experience generation and up to 2 repair rounds", () => {
    const opts = workflowSettingsToPipelineOptions({ mode: "thorough" });
    expect(opts.bulletBudget.maxRepairAttempts).toBe(2);
    expect(opts.repairDisabled).toBe(false);
    expect(opts.hardIssuesOnly).toBe(false);
    expect(opts.experienceMode).toBe("per-experience");
  });

  it("preserves bullet budget min/max across all modes", () => {
    for (const mode of ["fast", "balanced", "accurate", "thorough"] as GenerationMode[]) {
      const opts = workflowSettingsToPipelineOptions({ mode });
      expect(opts.bulletBudget.minBulletsPerExperience).toBe(2);
      expect(opts.bulletBudget.maxBulletsPerExperience).toBe(9);
    }
  });

  it("round-trips through default settings without touching other keys", () => {
    const base = { resume_template: "modern", unrelated: true } as Record<string, unknown>;
    const next = workflowSettingsToDefaultSettings(base, { mode: "fast" });
    expect(next.resume_template).toBe("modern");
    expect(next.unrelated).toBe(true);
    expect((next[WORKFLOW_SETTINGS_KEY] as { mode: string }).mode).toBe("fast");
    expect(parseWorkflowSettings(next).mode).toBe("fast");
  });

  it("falls back to balanced default for unknown/missing mode", () => {
    expect(parseWorkflowSettings(null).mode).toBe("balanced");
    expect(parseWorkflowSettings({}).mode).toBe("balanced");
    expect(parseWorkflowSettings({ [WORKFLOW_SETTINGS_KEY]: { mode: "nonsense" } }).mode).toBe(
      "balanced"
    );
  });

  it("classifies hard vs soft validation issues", () => {
    expect(isHardValidationIssue("UNGROUNDED_METRIC")).toBe(true);
    expect(isHardValidationIssue("UNKNOWN_EVIDENCE_ID")).toBe(true);
    expect(isHardValidationIssue("DUPLICATE_BULLET")).toBe(true);
    // Soft stylistic issues must NOT trigger a balanced-mode repair round.
    expect(isHardValidationIssue("SUMMARY_WORD_COUNT")).toBe(false);
    expect(isHardValidationIssue("FORBIDDEN_OPENING_VERB")).toBe(false);
    expect(isHardValidationIssue("BULLET_COUNT_MISMATCH")).toBe(false);
    expect(isHardValidationIssue("OVERUSED_ACTION_VERB")).toBe(false);
  });

  it("default workflow settings is balanced", () => {
    expect(DEFAULT_WORKFLOW_SETTINGS.mode).toBe("balanced");
  });
});
