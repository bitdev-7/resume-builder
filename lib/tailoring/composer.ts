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
import {
  FALLBACK_SKILL_CATEGORY,
  normalizeSkillCategories,
  resolveCanonicalSkillCategory,
} from "@/lib/tailoring/skill-categories";
import type { PromptOverrides } from "@/lib/prompts/prompt-overrides";

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

  return {
    summary,
    skillCategories: normalizeSkillCategories(
      topSkills.length > 0 ? { [FALLBACK_SKILL_CATEGORY]: topSkills } : {}
    ),
    softSkills: [],
    projects: [],
  };
}

/**
 * Guarantees selected skills appear in the skills section: typically JD-required
 * target skills and technologies introduced in experience bullets. Any omitted
 * names are placed under their real category (profile category when known,
 * otherwise "Tools & Protocols"). Unrelated profile skills may be omitted
 * by the composer and are intentionally not forced back here.
 */
export function ensureAllEligibleSkills(
  composerResult: ComposerResult,
  eligibleSkillNames: string[],
  categoryByKey?: Map<string, string>
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

  let skillCategories = { ...composerResult.skillCategories };
  for (const name of missing) {
    const knownRaw = categoryByKey?.get(skillKey(name))?.trim();
    const category =
      resolveCanonicalSkillCategory(knownRaw) ?? FALLBACK_SKILL_CATEGORY;
    skillCategories[category] = [...(skillCategories[category] ?? []), name];
  }

  skillCategories = normalizeSkillCategories(skillCategories);
  return { ...composerResult, skillCategories };
}

export interface ComposerCallResult {
  result: ComposerResult;
  costUsd?: number;
}

/**
 * Stage 8 — summary/skills/projects. Runs only after experience bullets exist.
 * Keeps composer-chosen skills (including JD-relevant additions beyond allowedSkills).
 * ensureAllEligibleSkills later forces only must-keep skills (e.g. JD targets + bullet mentions).
 */
export async function composeResumeTopSection(
  input: ComposerInput,
  aiRequest: ResolvedAIRequest,
  skillBudget: SkillBudgetConfig = DEFAULT_SKILL_BUDGET,
  repairNotes?: string,
  promptOverrides?: PromptOverrides
): Promise<ComposerCallResult> {
  const userPrompt = repairNotes
    ? `${buildComposerUserPrompt(input)}\n\nPREVIOUS ATTEMPT HAD THESE PROBLEMS — fix only these, keep everything else the same:\n${repairNotes}`
    : buildComposerUserPrompt(input);

  const messages: AIMessage[] = [
    { role: "system", content: buildComposerSystemPrompt(skillBudget, promptOverrides) },
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
      stage: "composer",
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

  // Keep composer skills as returned (allowed baseline + dynamic JD-relevant additions).
  // Deduplicate within each category by skill key; drop empty categories.
  const seenKeys = new Set<string>();
  const skillCategories: Record<string, string[]> = {};
  for (const [category, skills] of Object.entries(parsed.data.skillCategories)) {
    const unique: string[] = [];
    for (const s of skills) {
      const key = skillKey(s);
      if (!key || seenKeys.has(key)) continue;
      seenKeys.add(key);
      unique.push(s);
    }
    if (unique.length > 0) skillCategories[category] = unique;
  }

  return {
    result: {
      summary: parsed.data.summary,
      skillCategories: normalizeSkillCategories(skillCategories),
      softSkills: parsed.data.softSkills,
      projects: parsed.data.projects,
    },
    costUsd: resp.costUsd,
  };
}
