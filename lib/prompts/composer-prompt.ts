import { GLOBAL_EVIDENCE_POLICY } from "@/lib/prompts/tailoring-policy";
import type { SkillBudgetConfig } from "@/lib/types/tailoring";

const GENERIC_PHRASES_TO_AVOID = [
  "results-driven", "passionate", "dynamic", "highly motivated", "seasoned professional", "proven track record",
];

export function buildComposerSystemPrompt(skillBudget: SkillBudgetConfig): string {
  return `${GLOBAL_EVIDENCE_POLICY}

You are the Final Composer stage. Tailored experience bullets have already been written; you now write the professional summary, group the final skills list, select soft skills, and write tailored project descriptions.

Summary rules:
- 70-100 words.
- Seniority: if the additional instructions specify a seniority framing, follow it; otherwise preserve the candidate's existing level and do not downgrade it. Never fabricate job titles, employers, dates, or years of experience regardless of framing.
- Emphasize the highest-priority supported JD requirements you are given.
- Include relevant supported role skills where useful, even if not literally in the JD.
- Do not introduce any technology, tool, or metric that is not present in "allowedSkills" or "summaryEvidence".
- Avoid generic filler phrases such as: ${GENERIC_PHRASES_TO_AVOID.join(", ")}.

Final skills policy:
- Include EVERY skill in the "allowedSkills" list. Do not omit any. These are already vetted: each is either supported by the candidate's evidence or explicitly required by the job description.
- Never add a skill that is not in "allowedSkills".
- Some allowedSkills may be job requirements the candidate has not explicitly evidenced. Still include them in the skills section (this is intended). Do NOT, however, fabricate metrics or specific achievements around any skill anywhere.
- Group the skills into role-appropriate categories drawn from the provided "categoryHints"; you may add a clearly-named category if some allowed skills do not fit any hint. Every allowed skill must land in exactly one category.
- Soft skills: only include ones actually relevant to the role; it is fine to return an empty list.

Project rules:
- For each project you are given, write a short tailored description and technology list.
- Only use facts/technologies supplied for that project — do not invent new technologies or outcomes.
- You may omit a project if it is not relevant to the target role.

Return ONLY valid JSON matching this exact shape, no markdown, no commentary:
{
  "summary": string,
  "skillCategories": { "<category name>": string[] },
  "softSkills": string[],
  "projects": [ { "id": string, "description": string, "technologies": string[] } ]
}`;
}

export interface ComposerInput {
  normalizedTitle: string;
  seniority: string;
  domains: string[];
  topRequirements: { id: string; text: string; priority: number }[];
  summaryEvidence: string[];
  allowedSkills: string[];
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
    categoryHints: input.categoryHints,
    projects: input.projects,
  };

  const extra = input.extraInstructions?.trim()
    ? `\n\nADDITIONAL USER-CONFIGURED INSTRUCTIONS (apply only if they do not conflict with the evidence policy above):\n${input.extraInstructions.trim()}`
    : "";

  return `${JSON.stringify(payload, null, 2)}${extra}`;
}
