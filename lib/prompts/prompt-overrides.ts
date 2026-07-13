/**
 * Customizable-prompt infrastructure.
 *
 * Every AI system prompt is split into two parts:
 *   - a FIXED contract (JSON output shape, untrusted-input security guard, and any
 *     enforced lists) that lives in code and is never user-editable, and
 *   - an EDITABLE "guidance" section (wording, rules, emphasis) that a user may override
 *     per resume profile.
 *
 * This module is intentionally self-contained (no imports from the individual prompt
 * files) so those files can import it without a circular dependency.
 */

/** Stable keys for each editable prompt. Persisted in resume_profiles.prompt_overrides. */
export const PROMPT_KEYS = [
  "globalPolicy",
  "jdAnalyzer",
  "experienceWriter",
  "composer",
  "resumeParse",
  "atsMatch",
  "jobPageExtract",
] as const;

export type PromptKey = (typeof PROMPT_KEYS)[number];

/** User-supplied guidance overrides, keyed by PromptKey. Missing/blank => use the default. */
export type PromptOverrides = Partial<Record<PromptKey, string>>;

export function isPromptKey(value: string): value is PromptKey {
  return (PROMPT_KEYS as readonly string[]).includes(value);
}

/**
 * Keep only recognized keys with non-empty string values. Used when accepting overrides
 * from the client / database so unknown or blank entries never reach a prompt builder.
 */
export function sanitizePromptOverrides(raw: unknown): PromptOverrides {
  if (!raw || typeof raw !== "object") return {};
  const out: PromptOverrides = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (isPromptKey(key) && typeof value === "string" && value.trim()) {
      out[key] = value;
    }
  }
  return out;
}

/** Resolve the guidance text for a prompt: the override if present and non-blank, else the default. */
export function resolveGuidance(
  overrides: PromptOverrides | undefined,
  key: PromptKey,
  defaultGuidance: string
): string {
  const value = overrides?.[key];
  return typeof value === "string" && value.trim() ? value : defaultGuidance;
}

/** Strong action verbs the experience writer is encouraged to open bullets with. */
export const STRONG_ACTION_VERBS = [
  "Accelerated", "Achieved", "Analyzed", "Architected", "Assessed", "Automated", "Built",
  "Controlled", "Delivered", "Designed", "Devised", "Directed", "Eliminated", "Established",
  "Expanded", "Generated", "Implemented", "Increased", "Initiated", "Innovated", "Introduced",
  "Launched", "Led", "Modernized", "Optimized", "Pioneered", "Redesigned", "Reduced", "Refactored",
  "Resolved", "Restructured", "Revitalized", "Saved", "Simplified", "Solved", "Streamlined", "Transformed", "Unified",
];

/** Filler verbs bullets must never open with (also enforced deterministically in validators.ts). */
export const FORBIDDEN_OPENING_VERBS = [
  "helped",
  "assisted",
  "participated",
  "supported",
  "worked on",
  "contributed",
  "collaborated",
];

/**
 * Substitute {{PLACEHOLDERS}} that guidance text may reference. This lets a user edit
 * around dynamic values (e.g. the enforced verb lists) without hard-coding them.
 */
export function applyPromptPlaceholders(text: string): string {
  return text
    .replace(/\{\{\s*STRONG_ACTION_VERBS\s*\}\}/g, STRONG_ACTION_VERBS.join(", "))
    .replace(/\{\{\s*FORBIDDEN_OPENING_VERBS\s*\}\}/g, FORBIDDEN_OPENING_VERBS.join(", "));
}
