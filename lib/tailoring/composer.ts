import { callAI, formatAIProviderError } from "@/lib/ai-provider";
import type { AIMessage } from "@/lib/ai-provider";
import type { ResolvedAIRequest } from "@/lib/ai-api";
import {
  buildComposerSystemPrompt,
  buildComposerUserPrompt,
  type ComposerInput,
} from "@/lib/prompts/composer-prompt";
import { composerAiOutputSchema } from "@/lib/tailoring/schemas";
import { cleanJsonText } from "@/lib/analyze-json";
import type { ComposerResult, SkillBudgetConfig } from "@/lib/types/tailoring";
import { skillKey } from "@/lib/tailoring/skill-ontology";

export const DEFAULT_SKILL_BUDGET: SkillBudgetConfig = {
  maxTotalSkills: 35,
  maxSkillsPerCategory: 10,
};

/**
 * Last-resort fallback if the composer AI call fails outright (network/API
 * failure, unparseable output) — keeps the pipeline from hard-failing the
 * whole generation when experience bullets already generated successfully.
 * Built only from already-evidence-gated allowed skills, so it can't invent anything.
 */
export function buildDeterministicComposerFallback(input: {
  normalizedTitle: string;
  allowedSkills: string[];
  categoryHints: string[];
}): ComposerResult {
  const topSkills = input.allowedSkills.slice(0, 20);
  const highlight = input.allowedSkills.slice(0, 3).join(", ");
  const summary = highlight
    ? `${input.normalizedTitle} with hands-on experience across ${highlight}. Focused on delivering well-tested, maintainable solutions aligned with team and business goals.`
    : `${input.normalizedTitle} with a track record of delivering well-tested, maintainable solutions aligned with team and business goals.`;
  const category = input.categoryHints[0] || "Skills";

  return {
    summary,
    skillCategories: topSkills.length > 0 ? { [category]: topSkills } : {},
    softSkills: [],
    projects: [],
  };
}

/**
 * Guarantees completeness of the skills section: every eligible skill (all
 * declared/supported skills plus JD-required skills) must appear. Any the
 * composer omitted are appended under an "Additional Skills" category. This is
 * the safety net behind the "include all my skills + JD-required skills" policy.
 */
export function ensureAllEligibleSkills(
  composerResult: ComposerResult,
  eligibleSkillNames: string[]
): ComposerResult {
  const present = new Set<string>();
  for (const skills of Object.values(composerResult.skillCategories)) {
    for (const s of skills) present.add(skillKey(s));
  }

  const missing: string[] = [];
  const seen = new Set<string>();
  for (const name of eligibleSkillNames) {
    const key = skillKey(name);
    if (present.has(key) || seen.has(key)) continue;
    seen.add(key);
    missing.push(name);
  }

  if (missing.length === 0) return composerResult;

  const skillCategories = { ...composerResult.skillCategories };
  const bucket = "Additional Skills";
  skillCategories[bucket] = [...(skillCategories[bucket] ?? []), ...missing];
  return { ...composerResult, skillCategories };
}

export interface ComposerCallResult {
  result: ComposerResult;
  costUsd?: number;
}

/**
 * Stage 8 — summary/skills/projects. Runs only after experience bullets exist.
 * Filters the model's skill selection against the allowed set as a defense-in-depth
 * measure (deterministic validation in validators.ts is the authoritative gate).
 */
export async function composeResumeTopSection(
  input: ComposerInput,
  aiRequest: ResolvedAIRequest,
  skillBudget: SkillBudgetConfig = DEFAULT_SKILL_BUDGET,
  repairNotes?: string
): Promise<ComposerCallResult> {
  const userPrompt = repairNotes
    ? `${buildComposerUserPrompt(input)}\n\nPREVIOUS ATTEMPT HAD THESE PROBLEMS — fix only these, keep everything else the same:\n${repairNotes}`
    : buildComposerUserPrompt(input);

  const messages: AIMessage[] = [
    { role: "system", content: buildComposerSystemPrompt(skillBudget) },
    { role: "user", content: userPrompt },
  ];

  let resp;
  try {
    resp = await callAI({
      useOpenRouter: aiRequest.useOpenRouter,
      model: aiRequest.model,
      ...(aiRequest.provider ? { provider: aiRequest.provider } : {}),
      messages,
      temperature: 0.6,
      max_tokens: 2048,
      tryParseJson: true,
    });
  } catch (err) {
    throw new Error(
      formatAIProviderError(err, aiRequest.model, undefined, {
        useOpenRouter: aiRequest.useOpenRouter,
        provider: aiRequest.provider,
      })
    );
  }

  const text = resp.json
    ? typeof resp.json === "string"
      ? resp.json
      : JSON.stringify(resp.json)
    : resp.text || "";

  let parsedRaw: unknown;
  try {
    parsedRaw = JSON.parse(cleanJsonText(text));
  } catch {
    throw new Error("Composer returned invalid JSON");
  }

  const parsed = composerAiOutputSchema.safeParse(parsedRaw);
  if (!parsed.success) {
    throw new Error(`Composer output failed validation: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
  }

  // Keep only allowed skills (defense in depth). No per-category cap: the allowed
  // set is already intentionally bounded (the candidate's own skills + JD-required),
  // and the policy is to include all of them.
  const allowedKeys = new Set(input.allowedSkills.map(skillKey));
  const filteredSkillCategories: Record<string, string[]> = {};
  for (const [category, skills] of Object.entries(parsed.data.skillCategories)) {
    const filtered = skills.filter((s) => allowedKeys.has(skillKey(s)));
    if (filtered.length > 0) filteredSkillCategories[category] = filtered;
  }

  return {
    result: {
      summary: parsed.data.summary,
      skillCategories: filteredSkillCategories,
      softSkills: parsed.data.softSkills,
      projects: parsed.data.projects,
    },
    costUsd: resp.costUsd,
  };
}
