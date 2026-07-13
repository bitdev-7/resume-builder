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
import { skillKey, detectSkillMentions } from "@/lib/tailoring/skill-ontology";
import type { PromptOverrides } from "@/lib/prompts/prompt-overrides";

export interface RunTailoringPipelineInput {
  jd: string;
  profileData: LegacyAnalyzeProfile;
  aiRequest: ResolvedAIRequest;
  /** User's custom prompt override from Settings -> Prompt, if any (kept for backward compatibility). */
  customPromptOverride?: string | null;
  /** Per-resume-profile editable prompt guidance overrides. */
  promptOverrides?: PromptOverrides;
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Join names into "A", "A and B", or "A, B, and C". */
function formatSkillList(names: string[]): string {
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

/**
 * Deterministic backstop for the "every target skill must appear in the experience
 * bullets" policy. The writer usually weaves them in; for any target skill not present
 * in any bullet, append one grouped, natural bullet to the most substantial experience
 * so the skill is shown as used in real work (never with a fabricated metric).
 */
export function ensureTargetSkillsInExperiences(
  results: ExperienceGenerationResult[],
  targetSkillNames: string[]
): ExperienceGenerationResult[] {
  if (targetSkillNames.length === 0 || results.length === 0) return results;

  const combined = results
    .flatMap((r) => r.bullets.map((b) => b.text))
    .join("\n")
    .toLowerCase();

  const uncovered = targetSkillNames.filter((name) => {
    const re = new RegExp(`(^|[^a-z0-9+#.])${escapeRegExp(name.toLowerCase())}([^a-z0-9+#]|$)`, "i");
    return !re.test(combined);
  });
  if (uncovered.length === 0) return results;

  // Append to the experience that already has the most bullets (most substantial role).
  let targetIdx = 0;
  for (let i = 1; i < results.length; i += 1) {
    if (results[i].bullets.length > results[targetIdx].bullets.length) targetIdx = i;
  }

  const text = `Built and delivered production features using ${formatSkillList(uncovered)}.`;
  return results.map((r, i) =>
    i === targetIdx
      ? { ...r, bullets: [...r.bullets, { text, evidenceIds: [], requirementIds: [] }] }
      : r
  );
}

/**
 * Deterministic backstop for the "every target skill must also appear in the projects
 * section" policy. Adds any target skill missing from all project tech lists/descriptions
 * to the most substantial project's technology list.
 */
export function ensureTargetSkillsInProjects<T extends { description?: string; technologies?: string[] }>(
  projects: T[],
  targetSkillNames: string[]
): T[] {
  if (targetSkillNames.length === 0 || projects.length === 0) return projects;

  const combined = projects
    .flatMap((p) => [p.description ?? "", ...(p.technologies ?? [])])
    .join("\n")
    .toLowerCase();

  const uncovered = targetSkillNames.filter((name) => {
    const re = new RegExp(`(^|[^a-z0-9+#.])${escapeRegExp(name.toLowerCase())}([^a-z0-9+#]|$)`, "i");
    return !re.test(combined);
  });
  if (uncovered.length === 0) return projects;

  // Append to the project that already lists the most technologies (most substantial).
  let targetIdx = 0;
  for (let i = 1; i < projects.length; i += 1) {
    if ((projects[i].technologies?.length ?? 0) > (projects[targetIdx].technologies?.length ?? 0)) {
      targetIdx = i;
    }
  }

  return projects.map((p, i) =>
    i === targetIdx ? { ...p, technologies: [...(p.technologies ?? []), ...uncovered] } : p
  );
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

  const promptOverrides = input.promptOverrides;

  // Stage 1 — JD Analyzer
  const { analysis: jdAnalysis, costUsd: jdCost, providerUsed, modelUsed } = await analyzeJobDescription(
    input.jd,
    input.aiRequest,
    promptOverrides
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

  // The user's own skill categories (from their profile). Used to (a) hint the composer's
  // grouping so it mirrors how the candidate categorized their skills, and (b) place any
  // leftover/introduced skill under its real category instead of an "Additional Skills" bucket.
  const profileSkillCategoryByKey = new Map<string, string>();
  const profileSkillCategoryOrder: string[] = [];
  for (const record of [input.profileData.default_resume?.skills, input.profileData.default_resume?.hardSkills]) {
    if (!record) continue;
    for (const [category, list] of Object.entries(record)) {
      if (!category || /soft/i.test(category)) continue;
      if (!profileSkillCategoryOrder.includes(category)) profileSkillCategoryOrder.push(category);
      for (const raw of list || []) {
        const key = skillKey(String(raw));
        if (key && !profileSkillCategoryByKey.has(key)) profileSkillCategoryByKey.set(key, category);
      }
    }
  }

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

  const jdRequiredMissingNames = jdRequiredMissingSkills.map((c) => c.canonicalName);

  // Skills to actively surface in experiences AND projects: the JD-required skills the
  // candidate lacks, PLUS the JD's own ATS technology terms. Using atsTerms makes this
  // robust even when the analyzer mis-categorizes requirements (so a JD tech isn't tagged
  // category="technology"), which otherwise leaves the target list empty. Deduped + capped.
  const targetSkillNames = Array.from(
    new Map(
      [...jdRequiredMissingNames, ...(jdAnalysis.atsTerms ?? [])]
        .map((n) => String(n || "").trim())
        .filter(Boolean)
        .map((n) => [skillKey(n), n] as const)
    ).values()
  ).slice(0, 20);
  console.log(
    `[tailoring] target skills to weave (${targetSkillNames.length}): ${targetSkillNames.join(", ") || "(none)"}`
  );

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
      targetSkills: targetSkillNames,
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
    buildFallback,
    promptOverrides
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
    targetSkills: targetSkillNames,
    // Prefer the candidate's own categories, then fall back to role-catalog hints.
    categoryHints: Array.from(new Set([...profileSkillCategoryOrder, ...catalogEntry.skillCategoryHints])),
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
    const composed = await composeResumeTopSection(composerInput, input.aiRequest, skillBudget, undefined, promptOverrides);
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
    promptOverrides,
  });
  totalCost += repairOutcome.costUsd;

  // Guarantee every JD-required target skill is shown as used in the experience bullets
  // (user policy: all target skills must appear in experiences, not just the skills list).
  const coveredExperienceResults = ensureTargetSkillsInExperiences(
    repairOutcome.experienceResults,
    targetSkillNames
  );

  // Technologies the writer introduced in the final experience bullets (beyond the
  // candidate's declared + JD-required skills). Surface them in the skills section too,
  // so a skill shown as used in an experience also appears categorized under Skills.
  const introducedSkillNames = new Set<string>();
  for (const r of coveredExperienceResults) {
    for (const b of r.bullets) {
      for (const mention of detectSkillMentions(b.text)) introducedSkillNames.add(mention);
    }
  }

  // Guarantee every eligible skill (declared/supported + JD-required + introduced)
  // appears in the final skills section, each under its real category.
  const finalComposerResult = ensureAllEligibleSkills(
    repairOutcome.composerResult,
    [...resumeEligibleSkills.map((c) => c.canonicalName), ...introducedSkillNames],
    profileSkillCategoryByKey
  );

  // Stage 11 — Final Resume Assembly
  const resume = assembleFinalResume(candidateProfile, coveredExperienceResults, finalComposerResult);

  // Guarantee every JD-required target skill also appears in the projects section.
  if (resume.projects && resume.projects.length > 0) {
    resume.projects = ensureTargetSkillsInProjects(resume.projects, targetSkillNames);
  }

  // Stage 12 — Gap / Enrichment Recommendations (exclude skills we already added to the resume)
  const addedSkillKeys = new Set([
    ...resumeEligibleSkills.map((c) => skillKey(c.canonicalName)),
    ...Array.from(introducedSkillNames).map((n) => skillKey(n)),
  ]);
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
