import { buildGlobalEvidencePolicy } from "@/lib/prompts/tailoring-policy";
import {
  applyPromptPlaceholders,
  resolveGuidance,
  type PromptOverrides,
} from "@/lib/prompts/prompt-overrides";
import type { SkillBudgetConfig } from "@/lib/types/tailoring";

/** EDITABLE default guidance for the composer prompt. */
export const COMPOSER_DEFAULT_GUIDANCE = `You are the Final Composer stage. Tailored experience bullets have already been written; you now write the professional summary, group the final skills list, select soft skills, and write tailored project descriptions.

Summary rules:
- 70-100 words.
- Seniority: if the additional instructions specify a seniority framing, follow it; otherwise preserve the candidate's existing level and do not downgrade it. Never fabricate job titles, employers, dates, or years of experience regardless of framing.
- Frame the candidate toward the target role: lead with the target role's identity (use normalizedTitle when it fits the candidate's trajectory) and emphasize the highest-priority JD requirements.
- Feature the targetSkills / JD-required skills as areas of hands-on focus. Name the most important ones concretely.
- Include relevant role skills where useful, even if not literally in the JD or profile reference material.
- You may introduce technologies and metrics that strengthen the JD match when they fit the role and seniority.
- Avoid generic filler phrases such as: results-driven, passionate, dynamic, highly motivated, seasoned professional, proven track record.

Final skills policy:
- Start from "allowedSkills" as the candidate skill pool, but you may OMIT skills that are clearly unrelated to the job description and its required skills (targetSkills). Prefer a focused, JD-aligned skills section over a complete dump of the profile.
- Always include every "targetSkills" entry (JD-required technologies) when they are technologies/tools — do not omit those.
- Also ADD other relevant skills dynamically when they strengthen the JD match: role/ecosystem skills and technologies that fit the candidate's trajectory and seniority — even if they are not in the profile skill list or "allowedSkills".
- Prefer concrete, role-appropriate technologies over generic soft labels. Deduplicate near-aliases (e.g. do not list both "JS" and "JavaScript").
- Group all final skills into role-appropriate categories drawn from the provided "categoryHints"; you may add a clearly-named category if some skills do not fit any hint. Every skill must land in exactly one category.
- Soft skills: only include ones actually relevant to the role; it is fine to return an empty list.

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
