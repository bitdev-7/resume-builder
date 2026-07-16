import type { DefaultSettings } from "@/lib/supabase/database.types";
import type { BulletBudgetConfig } from "@/lib/types/tailoring";
import { DEFAULT_BULLET_BUDGET } from "@/lib/tailoring/tailoring-planner";

/**
 * Stored in profiles.default_settings under this nested key. Account-level
 * (applies to every resume profile the user generates).
 */
export const WORKFLOW_SETTINGS_KEY = "resume_workflow_settings";

/**
 * User-selectable generation mode controlling the speed vs. accuracy tradeoff.
 * The pipeline keeps the LLM composer in every mode; the mode changes whether
 * experience generation is batched (one call) or per-experience (N calls), and
 * how the repair loop behaves.
 *
 * - "fast"      — no LLM repair round at all. Batched experiences. The
 *                 deterministic backstop still fixes hard correctness issues
 *                 (drops bad bullets, filters unsupported skills) for free.
 *                 Fastest; ~2-3 LLM calls.
 * - "balanced"  — batched experiences. One repair round, but ONLY for hard
 *                 correctness issues (unknown evidence/metric/duplicate).
 *                 Stylistic flags are left to the backstop. ~3-5 calls;
 *                 the recommended default.
 * - "accurate"  — batched experiences. One repair round on ANY validation
 *                 issue, including stylistic ones. ~3-5 calls and often repairs.
 * - "thorough"  — per-experience generation (one LLM call per role, up to 5 in
 *                 parallel) plus up to 2 repair rounds on any issue. The
 *                 original "strong but slow" workflow. ~7-18 calls.
 */
export type GenerationMode = "fast" | "balanced" | "accurate" | "thorough";

/**
 * How Stage 7 generates experience bullets.
 * - "batched"        — one LLM call returns bullets for every role.
 * - "per-experience" — one LLM call per role (up to 5, run in parallel).
 */
export type ExperienceGenerationMode = "batched" | "per-experience";

export const GENERATION_MODE_OPTIONS: readonly {
  value: GenerationMode;
  label: string;
  hint: string;
}[] = [
  {
    value: "fast",
    label: "Fast",
    hint: "No repair round. Quickest generation; hard issues are still fixed automatically.",
  },
  {
    value: "balanced",
    label: "Balanced",
    hint: "One repair round, only for real correctness issues. Recommended balance of speed and quality.",
  },
  {
    value: "accurate",
    label: "Accurate",
    hint: "One repair round for any issue, including stylistic polish. Higher quality, slower.",
  },
  {
    value: "thorough",
    label: "Super accurate",
    hint: "One LLM call per work experience (up to 5) plus up to 2 repair rounds. Slowest, highest quality.",
  },
];

export interface WorkflowSettings {
  mode: GenerationMode;
}

export const DEFAULT_WORKFLOW_SETTINGS: WorkflowSettings = {
  mode: "balanced",
};

function isGenerationMode(value: unknown): value is GenerationMode {
  return value === "fast" || value === "balanced" || value === "accurate" || value === "thorough";
}

export function parseWorkflowSettings(
  settings: DefaultSettings | null | undefined
): WorkflowSettings {
  const raw = (settings ?? ({} as DefaultSettings))[WORKFLOW_SETTINGS_KEY] as
    | { mode?: unknown }
    | undefined;
  return {
    mode: isGenerationMode(raw?.mode) ? raw.mode : DEFAULT_WORKFLOW_SETTINGS.mode,
  };
}

export function workflowSettingsToDefaultSettings(
  current: DefaultSettings | null | undefined,
  workflow: WorkflowSettings
): DefaultSettings {
  const next = { ...(current ?? {}) };
  next[WORKFLOW_SETTINGS_KEY] = { mode: workflow.mode };
  return next;
}

/** Hard validation issue codes that can justify an LLM repair round. */
const HARD_ISSUE_CODES = new Set([
  "UNKNOWN_EVIDENCE_ID",
  "UNKNOWN_REQUIREMENT_ID",
  "UNGROUNDED_METRIC",
  "DUPLICATE_BULLET",
  "UNKNOWN_EXPERIENCE_ID",
  "DUPLICATE_EXPERIENCE_ID",
]);

export interface PipelineWorkflowOptions {
  bulletBudget: BulletBudgetConfig;
  /** When true, the repair loop only runs for hard correctness issues. */
  hardIssuesOnly: boolean;
  /** When true, the repair loop is disabled entirely (backstop still runs). */
  repairDisabled: boolean;
  /** How Stage 7 (and repair) generates experience bullets. */
  experienceMode: ExperienceGenerationMode;
}

/**
 * Maps a generation mode to the pipeline options that implement it.
 * Keeps the DEFAULT_BULLET_BUDGET bullet counts; only maxRepairAttempts, the
 * hard-issue filter, and the experience generation strategy change.
 */
export function workflowSettingsToPipelineOptions(
  workflow: WorkflowSettings
): PipelineWorkflowOptions {
  switch (workflow.mode) {
    case "fast":
      return {
        bulletBudget: { ...DEFAULT_BULLET_BUDGET, maxRepairAttempts: 0 },
        hardIssuesOnly: false,
        repairDisabled: true,
        experienceMode: "batched",
      };
    case "thorough":
      return {
        bulletBudget: { ...DEFAULT_BULLET_BUDGET, maxRepairAttempts: 2 },
        hardIssuesOnly: false,
        repairDisabled: false,
        experienceMode: "per-experience",
      };
    case "accurate":
      return {
        bulletBudget: { ...DEFAULT_BULLET_BUDGET, maxRepairAttempts: 1 },
        hardIssuesOnly: false,
        repairDisabled: false,
        experienceMode: "batched",
      };
    case "balanced":
    default:
      return {
        bulletBudget: { ...DEFAULT_BULLET_BUDGET, maxRepairAttempts: 1 },
        hardIssuesOnly: true,
        repairDisabled: false,
        experienceMode: "batched",
      };
  }
}

/** Used by the repair loop to decide which issues can trigger an LLM round. */
export function isHardValidationIssue(code: string): boolean {
  return HARD_ISSUE_CODES.has(code);
}
