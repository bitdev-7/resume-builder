import type { DefaultSettings } from "@/lib/supabase/database.types";

/**
 * User-configurable resume generation PREFERENCES.
 *
 * These are layered on top of the evidence-grounded pipeline as extra
 * instructions (see buildResumeExtraInstructions -> pipeline extraInstructions).
 * They only influence style/emphasis/wording/language degrees of freedom that
 * the pipeline deliberately leaves open. They can NEVER override the evidence
 * rules (no fabricated facts or metrics), which are enforced in the prompts and
 * in deterministic validation.
 *
 * Replaces the old free-form "resume_generate_prompt" template, which assumed a
 * single mega-prompt with {{placeholders}} that the multi-stage pipeline no
 * longer uses.
 */

export const RESUME_PROMPT_SETTINGS_KEY = "resume_prompt_settings";
/** Legacy key from the old single-prompt design; removed on save. */
const LEGACY_PROMPT_KEY = "resume_generate_prompt";

export type ResumeTone = "concise" | "balanced" | "detailed";
export type ResumeSpelling = "us" | "uk";
export type ResumeSeniority = "preserve" | "senior";

export interface ResumePromptPreferences {
  tone: ResumeTone;
  spelling: ResumeSpelling;
  /** Blank means English (the default). Any other value asks for that language. */
  language: string;
  /** How to frame seniority in the summary/wording. */
  seniority: ResumeSeniority;
  /** Free-text extra guidance (emphasis, words to avoid, domain lens, etc.). */
  additionalInstructions: string;
}

export const DEFAULT_RESUME_PROMPT_PREFERENCES: ResumePromptPreferences = {
  tone: "balanced",
  spelling: "us",
  language: "",
  // Default to senior framing: never present as junior/mid-level unless the
  // user explicitly switches to "Match evidence".
  seniority: "senior",
  additionalInstructions: "",
};

const TONES: ResumeTone[] = ["concise", "balanced", "detailed"];
const SPELLINGS: ResumeSpelling[] = ["us", "uk"];
const SENIORITIES: ResumeSeniority[] = ["preserve", "senior"];

export const RESUME_SENIORITY_OPTIONS: { value: ResumeSeniority; label: string; hint: string }[] = [
  { value: "preserve", label: "Match evidence", hint: "Frame seniority to match your actual experience" },
  { value: "senior", label: "Always senior / expert", hint: "Present as a senior expert; never say junior or mid-level" },
];

export const RESUME_TONE_OPTIONS: { value: ResumeTone; label: string; hint: string }[] = [
  { value: "concise", label: "Concise", hint: "Short, high-signal bullets" },
  { value: "balanced", label: "Balanced", hint: "Default phrasing" },
  { value: "detailed", label: "Detailed", hint: "Longer, more technical bullets" },
];

export const RESUME_SPELLING_OPTIONS: { value: ResumeSpelling; label: string }[] = [
  { value: "us", label: "US English (optimize, color)" },
  { value: "uk", label: "UK English (optimise, colour)" },
];

/** Reads preferences out of the profile default_settings blob, applying defaults. */
export function parseResumePromptPreferences(
  settings: DefaultSettings | null | undefined
): ResumePromptPreferences {
  const raw = settings?.[RESUME_PROMPT_SETTINGS_KEY];
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_RESUME_PROMPT_PREFERENCES };
  }

  const obj = raw as Record<string, unknown>;
  const tone = typeof obj.tone === "string" && TONES.includes(obj.tone as ResumeTone)
    ? (obj.tone as ResumeTone)
    : DEFAULT_RESUME_PROMPT_PREFERENCES.tone;
  const spelling =
    typeof obj.spelling === "string" && SPELLINGS.includes(obj.spelling as ResumeSpelling)
      ? (obj.spelling as ResumeSpelling)
      : DEFAULT_RESUME_PROMPT_PREFERENCES.spelling;
  const language = typeof obj.language === "string" ? obj.language.trim() : "";
  const seniority =
    typeof obj.seniority === "string" && SENIORITIES.includes(obj.seniority as ResumeSeniority)
      ? (obj.seniority as ResumeSeniority)
      : DEFAULT_RESUME_PROMPT_PREFERENCES.seniority;
  const additionalInstructions =
    typeof obj.additionalInstructions === "string" ? obj.additionalInstructions.trim() : "";

  return { tone, spelling, language, seniority, additionalInstructions };
}

/** Merges preferences into default_settings and drops the legacy key. */
export function resumePromptPreferencesToDefaultSettings(
  current: DefaultSettings | null | undefined,
  prefs: ResumePromptPreferences
): DefaultSettings {
  const next = { ...(current ?? {}) };
  delete next[LEGACY_PROMPT_KEY];

  next[RESUME_PROMPT_SETTINGS_KEY] = {
    tone: prefs.tone,
    spelling: prefs.spelling,
    language: prefs.language.trim(),
    seniority: prefs.seniority,
    additionalInstructions: prefs.additionalInstructions.trim(),
  };

  return next;
}

/**
 * Composes preferences into the single instruction string the pipeline appends
 * to the experience-writer and composer stages. Returns "" when everything is
 * at its default (so the pipeline adds nothing).
 */
export function buildResumeExtraInstructions(prefs: ResumePromptPreferences): string {
  const lines: string[] = [];

  if (prefs.tone === "concise") {
    lines.push("- Keep bullets and the summary concise: short, high-signal sentences with no filler.");
  } else if (prefs.tone === "detailed") {
    lines.push(
      "- Prefer detailed, technically specific bullets where the evidence supports it (still no invented facts)."
    );
  }

  if (prefs.spelling === "uk") {
    lines.push("- Use British/Commonwealth English spelling (e.g. optimise, organise, colour, centre).");
  }

  const language = prefs.language.trim();
  if (language && language.toLowerCase() !== "english") {
    lines.push(`- Write all generated resume prose (summary, bullets, project descriptions) in ${language}.`);
  }

  if (prefs.seniority === "senior") {
    lines.push(
      "- SENIORITY FRAMING (overrides any default 'preserve seniority' guidance): present the candidate as a senior, expert professional. Never label them 'junior', 'entry-level', 'mid-level', 'associate', or similar. Use confident, senior-level, authoritative wording in the summary and throughout. This changes framing and word choice ONLY — do not invent job titles, employers, dates, years of experience, or metrics."
    );
  }

  const extra = prefs.additionalInstructions.trim();
  if (extra) {
    lines.push(extra);
  }

  return lines.join("\n");
}

/**
 * Deterministic backstop for "always senior" framing: replaces explicit
 * junior / mid-level / entry-level labels with "Senior" so those words can
 * never appear even if the model slips. Applied to AI-generated prose only
 * (summary), never to user-entered fields. Deliberately conservative — it
 * does not touch "associate"/"graduate" (which appear in degree names).
 */
export function enforceSeniorFraming(text: string | undefined | null): string {
  if (!text) return text ?? "";
  return text.replace(/\b(Junior|Mid[-\s]?level|Entry[-\s]?level)\b/gi, (match) =>
    /^[A-Z]/.test(match) ? "Senior" : "senior"
  );
}
