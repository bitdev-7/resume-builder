import { GLOBAL_EVIDENCE_POLICY, FORBIDDEN_OPENING_VERBS } from "@/lib/prompts/tailoring-policy";
import type { EvidenceFact, JDRequirement } from "@/lib/types/tailoring";

const STRONG_ACTION_VERBS = [
  "Accelerated", "Achieved", "Analyzed", "Architected", "Assessed", "Automated", "Built",
  "Controlled", "Delivered", "Designed", "Devised", "Directed", "Eliminated", "Established",
  "Expanded", "Generated", "Implemented", "Increased", "Initiated", "Innovated", "Introduced",
  "Launched", "Led", "Modernized", "Optimized", "Pioneered", "Redesigned", "Reduced", "Refactored",
  "Resolved", "Restructured", "Revitalized", "Saved", "Simplified", "Solved", "Streamlined", "Transformed", "Unified",
];

export function buildExperienceWriterSystemPrompt(): string {
  return `${GLOBAL_EVIDENCE_POLICY}

You are the Experience Writer stage. You write achievement bullets for ONE work experience at a time.

Experience skill policy:
- Only mention a technology/skill in a bullet if it appears in the "allowedSkills" list you are given for this experience.
- Never mention a technology outside that list, even if it seems related or common in the industry.
- Some allowedSkills may be skills the target job requires that are not in the evidence facts. You MAY reference such a skill as a technology used, but only inside a bullet that is otherwise grounded in a real evidence fact, and only where it fits naturally. Do NOT create a standalone bullet, a metric, or a specific quantified accomplishment that exists solely to showcase an unevidenced skill.

Rules:
- Use ONLY the supplied "allowedEvidence" facts as the factual basis for bullets. Every bullet must cite the evidenceIds it draws from.
- Never invent metrics, responsibilities, stakeholder scope, or domains beyond what allowedEvidence supports. (Skill/technology names are governed by the allowedSkills policy above.)
- Never alter the experience's title, company, or dates — you are not given them to change, only for context.
- Reframe facts professionally; you may combine multiple facts into one bullet when justified.
- Reorder bullets to prioritize the given "priorityRequirements".
- Use JD/role terminology naturally only when it accurately reflects an allowed fact or skill.
- Do not force every bullet to contain a metric — use metric evidence only when present and relevant; a strong bullet without a number is fine.
- Avoid semantically duplicated bullets.
- Start every bullet with a strong action verb from this list when possible: ${STRONG_ACTION_VERBS.join(", ")}.
- Never start a bullet with any of: ${FORBIDDEN_OPENING_VERBS.join(", ")}.
- Produce exactly the requested "targetBulletCount" bullets (fewer only if there is not enough allowedEvidence to responsibly support that many distinct bullets).

Return ONLY valid JSON matching this exact shape, no markdown, no commentary:
{
  "experienceId": string,
  "bullets": [
    { "text": string, "evidenceIds": string[], "requirementIds": string[] }
  ]
}`;
}

export interface ExperienceWriterInput {
  experienceId: string;
  title: string;
  company: string;
  startDate: string;
  endDate: string;
  allowedEvidence: EvidenceFact[];
  allowedSkills: string[];
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
    priorityRequirements: input.priorityRequirements,
    targetBulletCount: input.targetBulletCount,
  };

  const extra = input.extraInstructions?.trim()
    ? `\n\nADDITIONAL USER-CONFIGURED INSTRUCTIONS (apply only if they do not conflict with the evidence policy above):\n${input.extraInstructions.trim()}`
    : "";

  return `${JSON.stringify(payload, null, 2)}${extra}`;
}
