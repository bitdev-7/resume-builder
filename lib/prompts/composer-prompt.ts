import { buildGlobalEvidencePolicy } from "@/lib/prompts/tailoring-policy";
import {
  applyPromptPlaceholders,
  resolveGuidance,
  type PromptOverrides,
} from "@/lib/prompts/prompt-overrides";
import type { SkillBudgetConfig } from "@/lib/types/tailoring";

/** EDITABLE default guidance for the composer prompt. */
export const COMPOSER_DEFAULT_GUIDANCE = `You are the Final Composer stage. Tailored experience bullets have already been written; you now write the professional summary, skills grouping, and tailored project descriptions.

Summary rules:
- 70-100 words.
- Seniority: if the additional instructions specify a seniority framing, follow it; otherwise preserve the candidate's existing level and do not downgrade it. Never fabricate job titles, employers, dates, or years of experience regardless of framing.
- Frame the candidate toward the target role: lead with the target role's identity (use normalizedTitle when it fits the candidate's trajectory) and emphasize the highest-priority JD requirements.
- Feature the targetSkills / JD-required skills as areas of hands-on focus. Name the most important ones concretely.
- Include relevant role skills where useful, even if not literally in the JD or profile reference material.
- You may introduce technologies and metrics that strengthen the JD match when they fit the role and seniority.
- Avoid generic filler phrases such as: results-driven, passionate, dynamic, highly motivated, seasoned professional, proven track record.

Skills:
- Use the candidate's existing skillsets and categories from allowedSkills and categoryHints. Prefer the user's category names; do not invent a new taxonomy.
- Include the existing skills in skillCategories; do not drop the profile skill set wholesale. You may omit a skill only if it is clearly unrelated to the job.
- Do not invent large sets of skills that are not in allowedSkills unless the user-edited guidance above explicitly asks you to.
- softSkills: only include if relevant; empty list is fine.

Project rules:
- For each project you are given, write a short tailored description and technology list.
- Use project reference facts as a starting point, then strengthen and JD-align the description creatively.
- Technologies: include the project's real technologies, and ALSO add the "targetSkills" (JD-required technologies) so that EVERY targetSkill appears somewhere in the projects section. Spread them across projects where they best fit.
- You may omit a project if it is not relevant to the target role.`;

/** FIXED output contract — never user-editable. */
const COMPOSER_CONTRACT = `Return ONLY valid JSON matching this exact shape, no markdown, no commentary:
{
  "summary": string,
  "skillCategories": { "<category name>": string[] },
  "softSkills": string[],
  "projects": [ { "id": string, "description": string, "technologies": string[] } ]
}`;

export function buildComposerSystemPrompt(
  _skillBudget: SkillBudgetConfig,
  overrides?: PromptOverrides
): string {
  const guidance = applyPromptPlaceholders(
    resolveGuidance(overrides, "composer", COMPOSER_DEFAULT_GUIDANCE)
  );
  return `${buildGlobalEvidencePolicy(overrides)}

${guidance}

${COMPOSER_CONTRACT}`;
}

export interface ComposerInput {
  normalizedTitle: string;
  seniority: string;
  domains: string[];
  topRequirements: { id: string; text: string; priority: number }[];
  summaryEvidence: string[];
  allowedSkills: string[];
  /** JD-required skills to weave into project tech/descriptions where plausible. */
  targetSkills: string[];
  categoryHints: string[];
  projects: { id: string; name: string; facts: string[]; technologies: string[] }[];
  extraInstructions?: string;
}

export function buildComposerUserPrompt(input: ComposerInput): string {
  const payload = {
    role: { normalizedTitle: input.normalizedTitle, seniority: input.seniority, domains: input.domains },
    topRequirements: input.topRequirements,
    summaryEvidence: input.summaryEvidence,
    allowedSkills: input.allowedSkills,
    targetSkills: input.targetSkills,
    categoryHints: input.categoryHints,
    projects: input.projects,
  };

  const extra = input.extraInstructions?.trim()
    ? `\n\nADDITIONAL USER-CONFIGURED INSTRUCTIONS (apply only if they do not conflict with the evidence policy above):\n${input.extraInstructions.trim()}`
    : "";

  return `${JSON.stringify(payload, null, 2)}${extra}`;
}
