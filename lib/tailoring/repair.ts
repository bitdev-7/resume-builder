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
import { generateExperience, generateExperiencesBatched } from "@/lib/tailoring/experience-generator";
import { composeResumeTopSection, DEFAULT_SKILL_BUDGET } from "@/lib/tailoring/composer";
import type { ComposerInput } from "@/lib/prompts/composer-prompt";
import type { ExperienceWriterInput } from "@/lib/prompts/experience-writer-prompt";
import type { PromptOverrides } from "@/lib/prompts/prompt-overrides";
import { validateTailoredResume } from "@/lib/tailoring/validators";
import { isHardValidationIssue, type ExperienceGenerationMode } from "@/lib/workflow-settings";

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
  /**
   * When true, the repair loop only re-runs the LLM for hard correctness issues
   * (unknown evidence/metric/duplicate). Stylistic issues (summary word count,
   * forbidden verbs, bullet-count tolerance, overused verbs) skip the loop and
   * fall straight to the deterministic backstop. Matches the "balanced" mode.
   */
  hardIssuesOnly?: boolean;
  /**
   * How the experience repair re-run calls the LLM. "batched" = one call for
   * every experience with issues; "per-experience" = one call per experience
   * (the "thorough" workflow). Defaults to "batched".
   */
  experienceMode?: ExperienceGenerationMode;
  buildFallback: (input: ExperienceWriterInput) => ExperienceGenerationResult;
  promptOverrides?: PromptOverrides;
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

/** Deterministic, non-AI fixes applied once repair attempts are exhausted — never hard-fails on issues with a safe mechanical fix. */
function applyDeterministicBackstop(
  experienceResults: ExperienceGenerationResult[],
  composerResult: ComposerResult,
  issues: ValidationIssue[],
  ctx: RepairContext
): { experienceResults: ExperienceGenerationResult[]; composerResult: ComposerResult; remainingIssues: ValidationIssue[] } {
  const dropBulletIndexesByExperience = new Map<string, Set<number>>();
  const remainingIssues: ValidationIssue[] = [];
  const nextComposerResult = composerResult;

  for (const issue of issues) {
    const bulletMatch = issue.path.match(EXPERIENCE_BULLET_PATH_RE);
    if (
      bulletMatch &&
      ["UNKNOWN_EVIDENCE_ID", "UNKNOWN_REQUIREMENT_ID", "UNGROUNDED_METRIC", "DUPLICATE_BULLET"].includes(
        issue.code
      )
    ) {
      const [, expId, idxStr] = bulletMatch;
      if (!dropBulletIndexesByExperience.has(expId)) dropBulletIndexesByExperience.set(expId, new Set());
      dropBulletIndexesByExperience.get(expId)!.add(Number(idxStr));
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

  // "balanced" mode: only re-run the LLM for hard correctness issues. Soft
  // stylistic flags (summary word count, forbidden verbs, bullet-count
  // tolerance, overused verbs) skip the loop and fall to the backstop below.
  const filterLoopIssues = (all: ValidationIssue[]): ValidationIssue[] =>
    ctx.hardIssuesOnly ? all.filter((i) => isHardValidationIssue(i.code)) : all;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const loopIssues = filterLoopIssues(issues);
    if (loopIssues.length === 0) break;

    const experienceIssuesById = groupExperienceIssues(
      loopIssues.filter((i) => i.path.startsWith("experience["))
    );
    const composerIssues = loopIssues.filter((i) => !i.path.startsWith("experience["));

    if (experienceIssuesById.size > 0) {
      const entries = Array.from(experienceIssuesById.entries());
      const repairInputs: ExperienceWriterInput[] = [];
      const perExperienceNotes: string[] = [];
      for (const [expId, expIssues] of entries) {
        const writerInput = ctx.experienceWriterInputsById.get(expId);
        if (!writerInput) continue;
        repairInputs.push(writerInput);
        const notes = expIssues.map((i) => `- [${i.code}] ${i.message}`).join("\n");
        perExperienceNotes.push(`experienceId ${expId}:\n${notes}`);
      }

      if (repairInputs.length > 0) {
        const resultById = new Map(experienceResults.map((r) => [r.experienceId, r]));
        const mergeRepaired = (repaired: ExperienceGenerationResult[]) => {
          for (const r of repaired) {
            if (r.bullets.length > 0) resultById.set(r.experienceId, r);
          }
        };

        if (ctx.experienceMode === "per-experience") {
          // One LLM call per experience with issues (the "thorough" workflow).
          const settled = await Promise.allSettled(
            repairInputs.map(async (input, idx) => {
              const notes = perExperienceNotes[idx];
              return generateExperience(input, ctx.aiRequest, notes, ctx.promptOverrides);
            })
          );
          settled.forEach((outcome, idx) => {
            const expId = repairInputs[idx].experienceId;
            if (outcome.status === "fulfilled" && outcome.value) {
              costUsd += outcome.value.costUsd ?? 0;
              resultById.set(expId, outcome.value.result);
            } else if (outcome.status === "rejected") {
              console.error(
                `[tailoring] Per-experience repair failed for ${expId}, keeping previous version:`,
                outcome.reason
              );
            }
          });
          experienceResults = Array.from(resultById.values());
        } else {
          // Single batched re-run (one LLM call) for every experience with issues.
          const combinedNotes = perExperienceNotes.join("\n\n");
          try {
            const { results: repaired, costUsd: c } = await generateExperiencesBatched(
              repairInputs,
              ctx.aiRequest,
              ctx.buildFallback,
              ctx.promptOverrides,
              combinedNotes
            );
            costUsd += c;
            mergeRepaired(repaired);
            experienceResults = Array.from(resultById.values());
          } catch (err) {
            console.error("[tailoring] Batched experience repair failed, keeping previous versions:", err);
          }
        }
      }
    }

    if (composerIssues.length > 0) {
      const notes = composerIssues.map((i) => `- [${i.code}] ${i.message}`).join("\n");
      try {
        const { result, costUsd: c } = await composeResumeTopSection(
          ctx.composerInput,
          ctx.aiRequest,
          skillBudget,
          notes,
          ctx.promptOverrides
        );
        composerResult = result;
        costUsd += c ?? 0;
      } catch (err) {
        console.error("[tailoring] Composer repair failed, keeping previous version:", err);
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
