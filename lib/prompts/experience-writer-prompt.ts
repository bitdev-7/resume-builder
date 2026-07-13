import { buildGlobalEvidencePolicy } from "@/lib/prompts/tailoring-policy";
import {
  applyPromptPlaceholders,
  resolveGuidance,
  type PromptOverrides,
} from "@/lib/prompts/prompt-overrides";
import type { EvidenceFact, JDRequirement } from "@/lib/types/tailoring";

/** EDITABLE default guidance for the experience-writer prompt. {{...}} are substituted at build time. */
export const EXPERIENCE_WRITER_DEFAULT_GUIDANCE = `You are the Experience Writer stage. You write achievement bullets for ONE work experience at a time.

Experience skill policy (TARGET SKILLS ARE A TOP PRIORITY — this section OVERRIDES the general "treat a missing skill as a gap" guidance in the evidence policy above, for skill/technology framing):
- Prefer the technologies in "allowedSkills" and "targetSkills". You are NOT limited to those lists: you may also introduce additional technologies that genuinely fit this role, its seniority, and the target job when doing so makes the experience stronger and more relevant. Only introduce a technology a person in this role would realistically use.
- "targetSkills" are technologies the target job requires. EVERY targetSkill must be shown as actually used in the experience bullets — do not skip any and do not leave one sitting only in the skills list. Present each confidently as genuine first-hand experience in this job, even if the original allowedEvidence does not mention it (never as something being learned).
- Name the technologies explicitly and group ones that would realistically be used together into a single natural, project-style sentence — for example: "Built the customer portal with a Go backend and a Next.js frontend" or "Shipped data pipelines in Python on AWS using Kafka and PostgreSQL". Prefer this natural "built X using A and B" phrasing over bolting keywords on, and make a targetSkill the SUBJECT of its own bullet when it deserves emphasis.
- Describe realistic, role-appropriate scope for each targetSkill: what was built, the type of system, the responsibility, and the qualitative outcome. Keep it plausible for this role's title, seniority, and domain.
- Evidence citation: cite the evidenceIds of any real allowedEvidence facts a bullet builds on. If a bullet is driven purely by a targetSkill and has no matching fact, use an empty "evidenceIds" array. NEVER cite an evidenceId that is not in this experience's allowedEvidence.
- The ONE hard limit: never invent numeric or quantified claims — no percentages, dollar amounts, multipliers, or "doubled/tripled" style figures — for a targetSkill or anything else. Describe impact qualitatively instead. Everything else about a targetSkill may be written confidently and assertively.

Rules:
- Use ONLY the supplied "allowedEvidence" facts as the factual basis for bullets. Every bullet must cite the evidenceIds it draws from.
- Never invent metrics, responsibilities, stakeholder scope, or domains beyond what allowedEvidence supports. (Skill/technology names are governed by the allowedSkills policy above.)
- Never alter the experience's title, company, or dates — you are not given them to change, only for context.
- Reframe facts professionally; you may combine multiple facts into one bullet when justified.
- Reorder bullets to prioritize the given "priorityRequirements".
- Use JD/role terminology naturally only when it accurately reflects an allowed fact or skill.
- Do not force every bullet to contain a metric — use metric evidence only when present and relevant; a strong bullet without a number is fine.
- Avoid semantically duplicated bullets.
- Start every bullet with a strong action verb from this list when possible: {{STRONG_ACTION_VERBS}}.
- Never start a bullet with any of: {{FORBIDDEN_OPENING_VERBS}}.
- Produce exactly the requested "targetBulletCount" bullets (fewer only if there is not enough allowedEvidence to responsibly support that many distinct bullets).`;

/** FIXED output contract — never user-editable. */
const EXPERIENCE_WRITER_CONTRACT = `Return ONLY valid JSON matching this exact shape, no markdown, no commentary:
{
  "experienceId": string,
  "bullets": [
    { "text": string, "evidenceIds": string[], "requirementIds": string[] }
  ]
}`;

export function buildExperienceWriterSystemPrompt(overrides?: PromptOverrides): string {
  const guidance = applyPromptPlaceholders(
    resolveGuidance(overrides, "experienceWriter", EXPERIENCE_WRITER_DEFAULT_GUIDANCE)
  );
  return `${buildGlobalEvidencePolicy(overrides)}

${guidance}

${EXPERIENCE_WRITER_CONTRACT}`;
}

export interface ExperienceWriterInput {
  experienceId: string;
  title: string;
  company: string;
  startDate: string;
  endDate: string;
  allowedEvidence: EvidenceFact[];
  allowedSkills: string[];
  /**
   * JD-required skills to feature strongly in this role's bullets — including writing
   * plausible hands-on usage even when the original evidence does not mention them.
   * Skill/technology framing only; numeric claims are never fabricated.
   */
  targetSkills: string[];
  priorityRequirements: Pick<JDRequirement, "id" | "text">[];
  targetBulletCount: number;
  extraInstructions?: string;
}

export function buildExperienceWriterUserPrompt(input: ExperienceWriterInput): string {
  const payload = {
    experienceId: input.experienceId,
    identity: {
      title: input.title,
      company: input.company,
      startDate: input.startDate,
      endDate: input.endDate,
    },
    allowedEvidence: input.allowedEvidence.map((f) => ({
      id: f.id,
      text: f.text,
      factType: f.factType,
      metrics: f.metrics?.map((m) => ({ id: m.id, value: m.value })) ?? [],
    })),
    allowedSkills: input.allowedSkills,
    targetSkills: input.targetSkills,
    priorityRequirements: input.priorityRequirements,
    targetBulletCount: input.targetBulletCount,
  };

  const extra = input.extraInstructions?.trim()
    ? `\n\nADDITIONAL USER-CONFIGURED INSTRUCTIONS (apply only if they do not conflict with the evidence policy above):\n${input.extraInstructions.trim()}`
    : "";

  return `${JSON.stringify(payload, null, 2)}${extra}`;
}
