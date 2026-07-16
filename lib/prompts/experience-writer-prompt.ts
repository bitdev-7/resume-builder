import { buildGlobalEvidencePolicy } from "@/lib/prompts/tailoring-policy";
import {
  applyPromptPlaceholders,
  resolveGuidance,
  type PromptOverrides,
} from "@/lib/prompts/prompt-overrides";
import type { EvidenceFact, JDRequirement } from "@/lib/types/tailoring";

/** EDITABLE default guidance for the experience-writer prompt. {{...}} are substituted at build time. */
export const EXPERIENCE_WRITER_DEFAULT_GUIDANCE = `You are the Experience Writer stage. You write achievement bullets for ONE work experience at a time.

Your job is to make this role a compelling, JD-aligned match — not to transcribe the reference material verbatim.

Reference material policy:
- "allowedEvidence" is REFERENCE ONLY — hints about what the candidate may have done. You are not limited to it.
- Start from JD relevance: prioritize the given "priorityRequirements" and "targetSkills".
- Refine any useful reference bullets into stronger, more specific, more relevant achievements.
- When reference material is sparse or missing JD-critical detail, CREATE additional plausible bullets so this company reads as a strong tenure for the target role.
- Produce exactly the requested "targetBulletCount" bullets (typically 8–10). Do not stop early because reference evidence is thin.

Experience skill policy:
- EVERY "targetSkill" (JD-required technology) must appear as hands-on work in this role's bullets — woven naturally, not left for the skills list alone.
- Prefer "allowedSkills" and "targetSkills", but you may introduce additional technologies that fit this title, seniority, company context, and target job.
- Name technologies explicitly. Group related stack pieces into natural project-style sentences (e.g. "Built the customer portal with a Go backend and a Next.js frontend").
- Present each targetSkill as genuine first-hand experience in this job — confident, specific, and role-appropriate.

Creative writing rules:
- Invent responsibilities, technical scope, stakeholder interactions, domains, and outcomes when needed to fill out a strong JD match.
- Metrics and quantified impact are welcome — use believable numbers that fit the role and seniority even when not present in reference material.
- Never alter the experience's title, company, or dates — identity fields are for context only.
- Reorder bullets to lead with the highest-priority JD requirements.
- Avoid semantically duplicated bullets.
- Start every bullet with a strong action verb from this list when possible: {{STRONG_ACTION_VERBS}}.
- Never start a bullet with any of: {{FORBIDDEN_OPENING_VERBS}}.

Evidence citation (for pipeline bookkeeping):
- Cite "evidenceIds" when a bullet draws on reference material. Use an empty "evidenceIds" array for bullets you created or substantially invented.
- NEVER cite an evidenceId that is not in this experience's allowedEvidence.
- Map bullets to "requirementIds" when they address specific JD requirements.`;

/** FIXED output contract — never user-editable. */
const EXPERIENCE_WRITER_CONTRACT = `Return ONLY valid JSON matching this exact shape, no markdown, no commentary:
{
  "experienceId": string,
  "bullets": [
    { "text": string, "evidenceIds": string[], "requirementIds": string[] }
  ]
}`;

/** EDITABLE default guidance for the batched experience-writer prompt. {{...}} are substituted at build time. */
export const EXPERIENCE_WRITER_BATCHED_DEFAULT_GUIDANCE = `You are the Experience Writer stage. You receive an array of work experiences and write achievement bullets for EACH one independently.

${EXPERIENCE_WRITER_DEFAULT_GUIDANCE.replace(
  "You write achievement bullets for ONE work experience at a time.",
  "For EACH experience in the array, independently produce its bullets — treat each role's allowedEvidence as reference-only context for that role."
)}

Important batching rules:
- Return one entry per experience in the input array, keyed by its exact "experienceId".
- Never invent, drop, rename, or merge experienceIds — every input experienceId must appear in the output, unchanged.
- Keep each experience's bullets scoped to that role's identity and reference material; do not cite evidenceIds from another experience.`;

/** FIXED output contract for the batched call — never user-editable. */
const EXPERIENCE_WRITER_BATCHED_CONTRACT = `Return ONLY valid JSON matching this exact shape, no markdown, no commentary:
{
  "experiences": [
    { "experienceId": string, "bullets": [ { "text": string, "evidenceIds": string[], "requirementIds": string[] } ] }
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

/** Batched variant system prompt — writes bullets for every experience in one call. */
export function buildExperienceWriterBatchedSystemPrompt(overrides?: PromptOverrides): string {
  const guidance = applyPromptPlaceholders(
    resolveGuidance(overrides, "experienceWriter", EXPERIENCE_WRITER_BATCHED_DEFAULT_GUIDANCE)
  );
  return `${buildGlobalEvidencePolicy(overrides)}

${guidance}

${EXPERIENCE_WRITER_BATCHED_CONTRACT}`;
}

export interface ExperienceWriterInput {
  experienceId: string;
  title: string;
  company: string;
  startDate: string;
  endDate: string;
  allowedEvidence: EvidenceFact[];
  allowedSkills: string[];
  /** JD-required skills to feature strongly in this role's bullets. */
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
    referenceEvidence: input.allowedEvidence.map((f) => ({
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
    ? `\n\nADDITIONAL USER-CONFIGURED INSTRUCTIONS (apply unless they conflict with producing a strong JD-aligned resume):\n${input.extraInstructions.trim()}`
    : "";

  return `${JSON.stringify(payload, null, 2)}${extra}`;
}

/** Builds the user prompt for the batched experience-writer call (one or more experiences). */
export function buildExperienceWriterBatchedUserPrompt(inputs: ExperienceWriterInput[]): string {
  const experiences = inputs.map((input) => ({
    experienceId: input.experienceId,
    identity: {
      title: input.title,
      company: input.company,
      startDate: input.startDate,
      endDate: input.endDate,
    },
    referenceEvidence: input.allowedEvidence.map((f) => ({
      id: f.id,
      text: f.text,
      factType: f.factType,
      metrics: f.metrics?.map((m) => ({ id: m.id, value: m.value })) ?? [],
    })),
    allowedSkills: input.allowedSkills,
    targetSkills: input.targetSkills,
    priorityRequirements: input.priorityRequirements,
    targetBulletCount: input.targetBulletCount,
    extraInstructions: input.extraInstructions?.trim() || undefined,
  }));

  const sharedExtra = inputs.every((i) => i.extraInstructions?.trim()) &&
    new Set(inputs.map((i) => i.extraInstructions?.trim())).size === 1
    ? `\n\nADDITIONAL USER-CONFIGURED INSTRUCTIONS (apply to every experience, unless they conflict with producing a strong JD-aligned resume):\n${inputs[0].extraInstructions!.trim()}`
    : "";

  return `${JSON.stringify({ experiences }, null, 2)}${sharedExtra}`;
}
