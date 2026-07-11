import type { ResolvedAIRequest } from "@/lib/ai-api";
import type {
  CandidateExperience,
  ComposerResult,
  ExperienceGenerationResult,
  ExperiencePlan,
  JDAnalysis,
  SkillBudgetConfig,
  SkillCandidate,
  ValidationIssue,
} from "@/lib/types/tailoring";
import { generateExperience } from "@/lib/tailoring/experience-generator";
import { composeResumeTopSection, DEFAULT_SKILL_BUDGET } from "@/lib/tailoring/composer";
import type { ComposerInput } from "@/lib/prompts/composer-prompt";
import type { ExperienceWriterInput } from "@/lib/prompts/experience-writer-prompt";
import { validateTailoredResume } from "@/lib/tailoring/validators";
import { skillKey } from "@/lib/tailoring/skill-ontology";

export interface RepairContext {
  jdAnalysis: JDAnalysis;
  experiencePlans: ExperiencePlan[];
  experiencesById: Map<string, CandidateExperience>;
  experienceWriterInputsById: Map<string, ExperienceWriterInput>;
  composerInput: ComposerInput;
  /** Skills allowed in the final skills section: supported (evidence) + JD-required. */
  allowedFinalSkillsByKey: Map<string, SkillCandidate>;
  aiRequest: ResolvedAIRequest;
  skillBudget?: SkillBudgetConfig;
  maxAttempts?: number;
  buildFallback: (input: ExperienceWriterInput) => ExperienceGenerationResult;
}

export interface RepairOutcome {
  experienceResults: ExperienceGenerationResult[];
  composerResult: ComposerResult;
  remainingIssues: ValidationIssue[];
  costUsd: number;
}

const EXPERIENCE_PATH_RE = /^experience\[([^\]]+)\]/;
const EXPERIENCE_BULLET_PATH_RE = /^experience\[([^\]]+)\]\.bullets\[(\d+)\]$/;

function groupExperienceIssues(issues: ValidationIssue[]): Map<string, ValidationIssue[]> {
  const grouped = new Map<string, ValidationIssue[]>();
  for (const issue of issues) {
    const match = issue.path.match(EXPERIENCE_PATH_RE);
    const id = match?.[1];
    if (!id) continue;
    if (!grouped.has(id)) grouped.set(id, []);
    grouped.get(id)!.push(issue);
  }
  return grouped;
}

function filterSkillCategoriesByAllowed(
  composerResult: ComposerResult,
  allowedFinalSkillsByKey: Map<string, SkillCandidate>
): ComposerResult {
  const skillCategories: Record<string, string[]> = {};
  for (const [category, skills] of Object.entries(composerResult.skillCategories)) {
    const filtered = skills.filter((s) => allowedFinalSkillsByKey.has(skillKey(s)));
    if (filtered.length > 0) skillCategories[category] = filtered;
  }
  return { ...composerResult, skillCategories };
}

/** Deterministic, non-AI fixes applied once repair attempts are exhausted — never hard-fails on issues with a safe mechanical fix. */
function applyDeterministicBackstop(
  experienceResults: ExperienceGenerationResult[],
  composerResult: ComposerResult,
  issues: ValidationIssue[],
  ctx: RepairContext
): { experienceResults: ExperienceGenerationResult[]; composerResult: ComposerResult; remainingIssues: ValidationIssue[] } {
  const dropBulletIndexesByExperience = new Map<string, Set<number>>();
  const remainingIssues: ValidationIssue[] = [];
  let nextComposerResult = composerResult;

  for (const issue of issues) {
    const bulletMatch = issue.path.match(EXPERIENCE_BULLET_PATH_RE);
    if (
      bulletMatch &&
      ["UNKNOWN_EVIDENCE_ID", "UNKNOWN_REQUIREMENT_ID", "UNGROUNDED_METRIC", "UNSUPPORTED_EXPERIENCE_SKILL", "DUPLICATE_BULLET"].includes(
        issue.code
      )
    ) {
      const [, expId, idxStr] = bulletMatch;
      if (!dropBulletIndexesByExperience.has(expId)) dropBulletIndexesByExperience.set(expId, new Set());
      dropBulletIndexesByExperience.get(expId)!.add(Number(idxStr));
      continue;
    }

    if (issue.code === "UNSUPPORTED_SKILL") {
      nextComposerResult = filterSkillCategoriesByAllowed(nextComposerResult, ctx.allowedFinalSkillsByKey);
      continue;
    }

    // Soft/stylistic issues (forbidden verb, overused verb, summary length, bullet-count tolerance) are
    // informational only — not worth further AI calls, and not worth deterministically mangling text.
    remainingIssues.push(issue);
  }

  let nextExperienceResults = experienceResults.map((result) => {
    const dropSet = dropBulletIndexesByExperience.get(result.experienceId);
    if (!dropSet || dropSet.size === 0) return result;
    const bullets = result.bullets.filter((_, idx) => !dropSet.has(idx));
    return { ...result, bullets };
  });

  // If dropping bad bullets left an experience empty, fall back to its original evidence-only achievements.
  nextExperienceResults = nextExperienceResults.map((result) => {
    if (result.bullets.length > 0) return result;
    const writerInput = ctx.experienceWriterInputsById.get(result.experienceId);
    if (!writerInput) return result;
    return ctx.buildFallback(writerInput);
  });

  return { experienceResults: nextExperienceResults, composerResult: nextComposerResult, remainingIssues };
}

/**
 * Stage 10 — targeted repair. Re-invokes only the implicated experience(s)
 * and/or the composer, passing validation errors as explicit repair notes.
 * Bounded by maxAttempts; after exhausting attempts, falls back to a
 * deterministic backstop pass rather than failing the whole request.
 */
export async function repairTailoredResume(
  initialExperienceResults: ExperienceGenerationResult[],
  initialComposerResult: ComposerResult,
  ctx: RepairContext
): Promise<RepairOutcome> {
  let experienceResults = initialExperienceResults;
  let composerResult = initialComposerResult;
  let costUsd = 0;
  const maxAttempts = ctx.maxAttempts ?? 2;
  const skillBudget = ctx.skillBudget ?? DEFAULT_SKILL_BUDGET;

  const validate = () =>
    validateTailoredResume({
      jdAnalysis: ctx.jdAnalysis,
      experiencePlans: ctx.experiencePlans,
      experiencesById: ctx.experiencesById,
      experienceResults,
      allowedFinalSkillsByKey: ctx.allowedFinalSkillsByKey,
      composerResult,
    });

  let issues = validate();

  for (let attempt = 0; attempt < maxAttempts && issues.length > 0; attempt++) {
    const experienceIssuesById = groupExperienceIssues(issues.filter((i) => i.path.startsWith("experience[")));
    const composerIssues = issues.filter((i) => !i.path.startsWith("experience["));

    if (experienceIssuesById.size > 0) {
      const entries = Array.from(experienceIssuesById.entries());
      const settled = await Promise.allSettled(
        entries.map(async ([expId, expIssues]) => {
          const writerInput = ctx.experienceWriterInputsById.get(expId);
          if (!writerInput) return null;
          const notes = expIssues.map((i) => `- [${i.code}] ${i.message}`).join("\n");
          return generateExperience(writerInput, ctx.aiRequest, notes);
        })
      );

      const resultById = new Map(experienceResults.map((r) => [r.experienceId, r]));
      settled.forEach((outcome, i) => {
        const [expId] = entries[i];
        if (outcome.status === "fulfilled" && outcome.value) {
          resultById.set(expId, outcome.value.result);
          costUsd += outcome.value.costUsd ?? 0;
        } else if (outcome.status === "rejected") {
          console.error(`[tailoring] Repair failed for experience ${expId}, keeping previous version:`, outcome.reason);
        }
      });
      experienceResults = Array.from(resultById.values());
    }

    if (composerIssues.length > 0) {
      const onlyUnsupportedSkills = composerIssues.every((i) => i.code === "UNSUPPORTED_SKILL");
      if (onlyUnsupportedSkills) {
        composerResult = filterSkillCategoriesByAllowed(composerResult, ctx.allowedFinalSkillsByKey);
      } else {
        const notes = composerIssues.map((i) => `- [${i.code}] ${i.message}`).join("\n");
        try {
          const { result, costUsd: c } = await composeResumeTopSection(
            ctx.composerInput,
            ctx.aiRequest,
            skillBudget,
            notes
          );
          composerResult = result;
          costUsd += c ?? 0;
        } catch (err) {
          console.error("[tailoring] Composer repair failed, keeping previous version:", err);
        }
      }
    }

    issues = validate();
  }

  if (issues.length === 0) {
    return { experienceResults, composerResult, remainingIssues: [], costUsd };
  }

  const backstop = applyDeterministicBackstop(experienceResults, composerResult, issues, ctx);
  return { ...backstop, costUsd };
}
