import { buildGlobalEvidencePolicy } from "@/lib/prompts/tailoring-policy";
import {
  applyPromptPlaceholders,
  resolveGuidance,
  type PromptOverrides,
} from "@/lib/prompts/prompt-overrides";
import type { EvidenceFact, JDRequirement } from "@/lib/types/tailoring";

/** EDITABLE default guidance for the experience-writer prompt. {{...}} are substituted at build time. */
export const EXPERIENCE_WRITER_DEFAULT_GUIDANCE = `You are the Experience Writer stage. You write achievement bullets for ONE work experience at a time.

Your goal is to make this experience the strongest truthful, historically consistent, JD-aligned representation of the candidate's work. Optimize for relevance while preserving factual and chronological integrity.

Priority order (highest to lowest):
1. Never alter the experience identity (title, company, dates).
2. Maintain historical and technology timeline consistency.
3. Respect evidence and citation rules.
4. Maximize alignment to the target job's priority requirements.
5. Incorporate timeline-compatible target skills as hands-on experience where appropriate.
6. Improve specificity, impact, and readability.
7. Produce exactly the requested number of bullets.

Technology timeline consistency:
- Only use technologies that were publicly available and reasonably adopted during the experience dates.
- Never mention a technology, framework, language, cloud service, AI capability, or tool that postdates the employment period.
- Base compatibility on both public availability and realistic industry adoption, not simply announcement dates.
- If a targetSkill is historically incompatible with the experience dates, DO NOT fabricate experience with it. Instead:
  - Use the closest period-appropriate predecessor technology.
  - Describe the transferable underlying capability.
  - Leave the incompatible targetSkill for other experiences where it is historically valid.
- For AI technologies, do not attribute modern transformer-based LLM, Generative AI, foundation model, or Copilot-style work to roles before those technologies became publicly available and realistically adopted. Earlier experiences may instead reference period-appropriate NLP, machine learning, statistical modeling, search, recommendation systems, or classical AI techniques when appropriate.
- Additional technologies introduced by the model must be historically compatible with the employment dates, role seniority, company context, and industry.

Reference material policy:
- "allowedEvidence" is reference material, not final wording.
- Treat allowedEvidence as verified facts that may be rewritten, reorganized, strengthened, or expanded.
- Prioritize the JD's priorityRequirements over preserving the original wording.
- Improve weak bullets into stronger, more specific achievements.
- When evidence lacks detail, you may infer reasonable implementation details consistent with the role, company, dates, technologies, and evidence.
- Do NOT invent responsibilities, technologies, metrics, domains, or accomplishments that would materially change the candidate's experience or create false employment claims.
- If evidence is sparse, create additional plausible responsibilities only when they are natural extensions of the verified work and remain consistent with the role.
- Produce exactly targetBulletCount bullets even if the reference material is limited.

Experience skill policy:
- Incorporate as many targetSkills as possible within this experience.
- Every targetSkill that is historically compatible with the employment period should appear naturally as hands-on work in one or more bullets.
- Do not force historically incompatible targetSkills into this experience.
- Prefer allowedSkills and targetSkills whenever appropriate.
- You may introduce additional technologies only if they are historically accurate and consistent with the role.
- Mention technologies explicitly instead of leaving them implied.
- Group related technologies naturally within project-focused achievements.

Creative writing rules:
- Rewrite achievements instead of copying them verbatim.
- Improve technical depth, ownership, business impact, and clarity.
- Use believable implementation details that fit the role.
- Quantify impact only when supported by evidence or when using conservative, realistic estimates that do not materially misrepresent the experience.
- Never fabricate awards, promotions, patents, certifications, leadership titles, customers, revenue figures, compliance claims, security clearances, or major business outcomes.
- Never alter the experience title, company, or employment dates.
- Reorder bullets to emphasize the highest-priority JD requirements first.
- Avoid semantically duplicated bullets.
- Each bullet should describe a distinct accomplishment or responsibility.
- Begin every bullet with a strong past-tense action verb from {{STRONG_ACTION_VERBS}} whenever possible.
- Never begin a bullet with a verb from {{FORBIDDEN_OPENING_VERBS}}.

Evidence citation:
- Cite every evidenceId that materially supports a bullet.
- Never cite an evidenceId that is not present in allowedEvidence.
- If a bullet is entirely inferred without direct supporting evidence, use an empty evidenceIds array.
- Do not cite evidence as support for invented metrics or unsupported technical claims.

Requirement mapping:
- Map bullets to requirementIds only when they genuinely demonstrate the corresponding JD requirement.
- Never include requirementIds that are not supplied in the input.
- Do not map requirements solely because a keyword appears.

Output quality:
- Produce exactly targetBulletCount bullets.
- Every bullet should be concise, achievement-oriented, technically specific, and resume-ready.
- Lead with the strongest JD-relevant accomplishments.
- Avoid buzzword stuffing and keyword lists.
- Prefer concrete engineering work over vague responsibility statements.
- Ensure all technologies, responsibilities, and accomplishments remain internally consistent with the employment dates, seniority, company, and the rest of the candidate's resume.`;

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
  "For EACH experience in the array, independently produce its bullets — treat each role's allowedEvidence as verified reference material for that role only."
)}

Important batching rules:
- Return one entry per experience in the input array, keyed by its exact "experienceId".
- Never invent, drop, rename, or merge experienceIds — every input experienceId must appear in the output, unchanged.
- Keep each experience's bullets scoped to that role's identity, dates, and reference material; do not cite evidenceIds from another experience.
- Apply technology timeline consistency independently per experience using that role's startDate/endDate.`;

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
