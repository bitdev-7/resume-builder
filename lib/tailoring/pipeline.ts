import type { ResolvedAIRequest } from "@/lib/ai-api";
import type { LegacyAnalyzeProfile } from "@/lib/mappers/profile-to-resume";
import type { UpdatedResume } from "@/lib/types/resume";
import type {
  BulletBudgetConfig,
  CandidateExperience,
  EnrichmentRecommendation,
  ExperienceGenerationResult,
  RoleArchetypeDetection,
  SkillBudgetConfig,
  ValidationIssue,
} from "@/lib/types/tailoring";

import { analyzeJobDescription } from "@/lib/tailoring/jd-analyzer";
import { detectRoleArchetype } from "@/lib/tailoring/role-archetype";
import { buildCandidateEvidenceProfile, getPossessedSkillNames } from "@/lib/tailoring/candidate-evidence";
import { expandRoleSkills, getRoleCatalogEntryOrDefault } from "@/lib/tailoring/role-skill-expansion";
import { resolveSkillEvidence } from "@/lib/tailoring/skill-evidence-resolver";
import { createTailoringPlan, DEFAULT_BULLET_BUDGET } from "@/lib/tailoring/tailoring-planner";
import { generateExperiencesInParallel } from "@/lib/tailoring/experience-generator";
import {
  buildDeterministicComposerFallback,
  composeResumeTopSection,
  ensureAllEligibleSkills,
  DEFAULT_SKILL_BUDGET,
} from "@/lib/tailoring/composer";
import type { ComposerInput } from "@/lib/prompts/composer-prompt";
import type { ExperienceWriterInput } from "@/lib/prompts/experience-writer-prompt";
import { repairTailoredResume } from "@/lib/tailoring/repair";
import { assembleFinalResume } from "@/lib/tailoring/assemble";
import { buildEnrichmentRecommendations } from "@/lib/tailoring/enrichment";
import { skillKey } from "@/lib/tailoring/skill-ontology";

export interface RunTailoringPipelineInput {
  jd: string;
  profileData: LegacyAnalyzeProfile;
  aiRequest: ResolvedAIRequest;
  /** User's custom prompt override from Settings -> Prompt, if any (kept for backward compatibility). */
  customPromptOverride?: string | null;
  skillBudget?: SkillBudgetConfig;
  bulletBudget?: BulletBudgetConfig;
}

export interface RunTailoringPipelineResult {
  resume: UpdatedResume;
  providerUsed: string;
  modelUsed: string;
  jobTitle: string;
  roleArchetype: RoleArchetypeDetection;
  enrichmentRecommendations: EnrichmentRecommendation[];
  remainingValidationIssues: ValidationIssue[];
  generationCostUsd: number;
}

function buildFallbackFactory(experiencesById: Map<string, CandidateExperience>) {
  return (writerInput: ExperienceWriterInput): ExperienceGenerationResult => {
    const exp = experiencesById.get(writerInput.experienceId);
    const facts = exp?.facts ?? [];
    const bullets = facts.slice(0, writerInput.targetBulletCount).map((f) => ({
      text: f.text,
      evidenceIds: [f.id],
      requirementIds: [] as string[],
    }));
    return { experienceId: writerInput.experienceId, bullets, usedFallback: true };
  };
}

/**
 * Orchestrates the full multi-stage tailoring pipeline (JD analysis through
 * final assembly + enrichment recommendations). Replaces the single
 * mega-prompt previously used by POST /api/analyze.
 */
export async function runTailoringPipeline(
  input: RunTailoringPipelineInput
): Promise<RunTailoringPipelineResult> {
  let totalCost = 0;

  // Stage 1 — JD Analyzer
  const { analysis: jdAnalysis, costUsd: jdCost, providerUsed, modelUsed } = await analyzeJobDescription(
    input.jd,
    input.aiRequest
  );
  totalCost += jdCost ?? 0;

  // Stage 2 — Role Archetype Detection (deterministic)
  const roleArchetype = detectRoleArchetype(jdAnalysis);

  // Stage 4 — Candidate Evidence Profile (built early: stage 3 needs possessed skill names)
  const candidateProfile = buildCandidateEvidenceProfile(input.profileData);
  if (candidateProfile.experiences.length === 0) {
    throw new Error(
      "No work experience found in your profile. Add at least one company under Profile before generating a tailored resume."
    );
  }
  const possessedSkillNames = getPossessedSkillNames(candidateProfile);

  // Stage 3 — Role Skill Expansion (deterministic)
  const rawCandidates = await expandRoleSkills(jdAnalysis, roleArchetype, possessedSkillNames);

  // Stage 5 — Skill Evidence Resolution
  const resolvedCandidates = resolveSkillEvidence(rawCandidates, candidateProfile);
  const candidateById = new Map(resolvedCandidates.map((c) => [c.id, c]));

  // Skills eligible for the FINAL resume = everything the candidate has evidence for,
  // PLUS skills the JD explicitly requires even without candidate evidence. This is a
  // deliberate, user-chosen policy: JD-required gaps are surfaced across the skills
  // section, summary, and experience bullets so the resume clears ATS keyword filters.
  // Note: metric grounding stays strict regardless — no fabricated numbers are ever
  // attached to these skills (see validators.ts UNGROUNDED_METRIC).
  const supportedSkills = resolvedCandidates.filter((c) => c.evidenceStatus !== "unsupported");
  const jdRequiredMissingSkills = resolvedCandidates.filter(
    (c) => c.evidenceStatus === "unsupported" && c.sources.includes("explicit_jd")
  );
  const resumeEligibleSkills = [...supportedSkills, ...jdRequiredMissingSkills];
  const allowedFinalSkillsByKey = new Map(
    resumeEligibleSkills.map((c) => [skillKey(c.canonicalName), c])
  );
  const jdRequiredMissingSkillIds = jdRequiredMissingSkills.map((c) => c.id);

  // Stage 6 — Tailoring Planner
  const bulletBudget = input.bulletBudget ?? DEFAULT_BULLET_BUDGET;
  const plan = createTailoringPlan(candidateProfile, jdAnalysis, roleArchetype, resolvedCandidates, bulletBudget);

  // Let every role reference JD-required skills so they can be woven into bullets
  // (and pass the experience-skill validator). Evidence facts and metrics are still
  // the only basis for factual claims; this only widens which skill names may appear.
  if (jdRequiredMissingSkillIds.length > 0) {
    for (const expPlan of plan.experiencePlans) {
      expPlan.relevantSkillIds = Array.from(
        new Set([...expPlan.relevantSkillIds, ...jdRequiredMissingSkillIds])
      );
    }
  }

  const experiencesById = new Map(candidateProfile.experiences.map((e) => [e.id, e]));
  const factById = new Map(candidateProfile.experiences.flatMap((e) => e.facts).map((f) => [f.id, f]));

  const experienceWriterInputsById = new Map<string, ExperienceWriterInput>();
  for (const expPlan of plan.experiencePlans) {
    const exp = experiencesById.get(expPlan.experienceId);
    if (!exp) continue;

    const allowedSkills = expPlan.relevantSkillIds
      .map((id) => candidateById.get(id)?.canonicalName)
      .filter((name): name is string => Boolean(name));

    const priorityRequirements = expPlan.priorityRequirementIds
      .map((id) => jdAnalysis.requirements.find((r) => r.id === id))
      .filter((r): r is NonNullable<typeof r> => Boolean(r))
      .map((r) => ({ id: r.id, text: r.text }));

    experienceWriterInputsById.set(exp.id, {
      experienceId: exp.id,
      title: exp.title,
      company: exp.company,
      startDate: exp.startDate,
      endDate: exp.endDate,
      allowedEvidence: exp.facts,
      allowedSkills,
      priorityRequirements,
      targetBulletCount: expPlan.targetBulletCount,
      extraInstructions: input.customPromptOverride ?? undefined,
    });
  }

  const buildFallback = buildFallbackFactory(experiencesById);

  // Stage 7 — Per-Experience Bullet Generation (concurrent)
  const writerInputs = plan.experiencePlans
    .map((p) => experienceWriterInputsById.get(p.experienceId))
    .filter((i): i is ExperienceWriterInput => Boolean(i));
  const { results: initialExperienceResults, costUsd: expCost } = await generateExperiencesInParallel(
    writerInputs,
    input.aiRequest,
    buildFallback
  );
  totalCost += expCost;

  // Stage 8 — Final Composer (summary/skills/projects), built only after experience bullets exist
  const summaryEvidence = plan.summaryEvidenceIds
    .map((id) => {
      if (id.startsWith("skill_")) {
        const candidate = candidateById.get(id);
        return candidate ? `Skill: ${candidate.canonicalName}` : null;
      }
      return factById.get(id)?.text ?? null;
    })
    .filter((s): s is string => Boolean(s));

  const topRequirements = jdAnalysis.requirements
    .filter((r) => r.type === "must_have" || r.priority >= 8)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 10)
    .map((r) => ({ id: r.id, text: r.text, priority: r.priority }));

  const catalogEntry = getRoleCatalogEntryOrDefault(roleArchetype.primaryRoleArchetype);
  const composerInput: ComposerInput = {
    normalizedTitle: jdAnalysis.normalizedTitle,
    seniority: jdAnalysis.seniority,
    domains: jdAnalysis.domains,
    topRequirements,
    summaryEvidence: [
      ...summaryEvidence,
      ...jdRequiredMissingSkills.map((c) => `Required skill: ${c.canonicalName}`),
    ],
    allowedSkills: resumeEligibleSkills.map((c) => c.canonicalName),
    categoryHints: catalogEntry.skillCategoryHints,
    projects: candidateProfile.projects.map((p) => ({
      id: p.id,
      name: p.name,
      facts: p.facts.map((f) => f.text),
      technologies: p.technologies.map((t) => t.name),
    })),
    extraInstructions: input.customPromptOverride ?? undefined,
  };

  const skillBudget = input.skillBudget ?? DEFAULT_SKILL_BUDGET;
  let initialComposerResult;
  try {
    const composed = await composeResumeTopSection(composerInput, input.aiRequest, skillBudget);
    initialComposerResult = composed.result;
    totalCost += composed.costUsd ?? 0;
  } catch (err) {
    console.error("[tailoring] Composer failed outright, using deterministic fallback:", err);
    initialComposerResult = buildDeterministicComposerFallback({
      normalizedTitle: jdAnalysis.normalizedTitle,
      allowedSkills: composerInput.allowedSkills,
      categoryHints: composerInput.categoryHints,
    });
  }

  // Stage 9/10 — Deterministic Validation + Targeted Repair
  const repairOutcome = await repairTailoredResume(initialExperienceResults, initialComposerResult, {
    jdAnalysis,
    experiencePlans: plan.experiencePlans,
    experiencesById,
    experienceWriterInputsById,
    composerInput,
    allowedFinalSkillsByKey,
    aiRequest: input.aiRequest,
    skillBudget,
    maxAttempts: bulletBudget.maxRepairAttempts,
    buildFallback,
  });
  totalCost += repairOutcome.costUsd;

  // Guarantee every eligible skill (all declared/supported + JD-required) appears
  // in the final skills section, even if the composer omitted some.
  const finalComposerResult = ensureAllEligibleSkills(
    repairOutcome.composerResult,
    resumeEligibleSkills.map((c) => c.canonicalName)
  );

  // Stage 11 — Final Resume Assembly
  const resume = assembleFinalResume(candidateProfile, repairOutcome.experienceResults, finalComposerResult);

  // Stage 12 — Gap / Enrichment Recommendations (exclude skills we already added to the resume)
  const addedSkillKeys = new Set(resumeEligibleSkills.map((c) => skillKey(c.canonicalName)));
  const enrichmentRecommendations = buildEnrichmentRecommendations(plan).filter(
    (rec) => !addedSkillKeys.has(skillKey(rec.skill))
  );

  return {
    resume,
    providerUsed,
    modelUsed,
    jobTitle: jdAnalysis.normalizedTitle,
    roleArchetype,
    enrichmentRecommendations,
    remainingValidationIssues: repairOutcome.remainingIssues,
    generationCostUsd: totalCost,
  };
}
