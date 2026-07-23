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
- Baseline: start from "allowedSkills" (the candidate's existing skill set). Keep those skills as the foundation of the skills section. You may omit a skill only when it is clearly unrelated to the job description and targetSkills.
- Reorder: within each category, list JD-required / high-priority technologies (targetSkills and must-have JD tech) first, then remaining baseline skills.
- Add gaps only: if a targetSkills entry (JD-required technology) is missing from the baseline, ADD it under the correct category. Do NOT invent large sets of extra role/ecosystem skills that are not in allowedSkills and not in targetSkills.
- Prefer concrete technologies over generic soft labels. Deduplicate near-aliases (e.g. do not list both "JS" and "JavaScript").
- Group hard skills ONLY into these exact category names (and only these), in this conceptual order: Languages, AI & Generative AI, Data Engineering, Backend, Frontend, Mobile Development, Machine Learning, APIs & Protocols, Databases, Cloud & DevOps, Security & Compliance, Testing. Use the provided "categoryHints" list. Do NOT invent any other category heading. If a skill does not fit any of these, omit it from skillCategories.
- JD-gated categories: omit "Mobile Development" and "Machine Learning" entirely when the job is not about mobile apps or machine learning (unless allowedSkills clearly includes mobile/ML technologies that belong there). All other category names remain allowed; still omit a category from the JSON when it has no skills (no empty arrays needed).
- Soft skills: only include ones actually relevant to the role in softSkills; never put soft skills inside skillCategories. It is fine to return an empty softSkills list.

Project rules:
- For each project you are given, write a short tailored description and technology list.
- Use project reference facts as a starting point, then strengthen and JD-align the description creatively.
- Technologies: include the project's real technologies, and ALSO add the "targetSkills" (JD-required technologies) so that EVERY targetSkill appears somewhere in the projects section. Spread them across projects where they best fit.
- You may omit a project if it is not relevant to the target role.`;

/** FIXED output contract — never user-editable. */
const COMPOSER_CONTRACT = `Return ONLY valid JSON matching this exact shape, no markdown, no commentary:
{
  "summary": string,
  "skillCategories": { "<one of: Languages|AI & Generative AI|Data Engineering|Backend|Frontend|Mobile Development|Machine Learning|APIs & Protocols|Databases|Cloud & DevOps|Security & Compliance|Testing>": string[] },
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
