import type {
  CandidateExperience,
  ComposerResult,
  ExperienceGenerationResult,
  ExperiencePlan,
  JDAnalysis,
  SkillCandidate,
  ValidationIssue,
} from "@/lib/types/tailoring";
import { FORBIDDEN_OPENING_VERBS } from "@/lib/prompts/tailoring-policy";
import { skillKey } from "@/lib/tailoring/skill-ontology";

const METRIC_LIKE_PATTERNS: RegExp[] = [
  /\d+(?:\.\d+)?\s?%/g,
  /\b\d+(?:\.\d+)?x\b/gi,
  /\$?\b\d[\d,]*(?:\.\d+)?\s?(?:million|billion|thousand)\b/gi,
  /\b(?:doubled|tripled|quadrupled|halved|cut in half|one-third|one third|one-half|one half|two-thirds|two thirds)\b/gi,
];

function extractMetricLikeClaims(text: string): string[] {
  const claims: string[] = [];
  for (const pattern of METRIC_LIKE_PATTERNS) {
    const matches = text.matchAll(new RegExp(pattern));
    for (const m of matches) claims.push(m[0].toLowerCase().trim());
  }
  return claims;
}

function normalizeForDuplicateCheck(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export interface ValidateTailoredResumeInput {
  jdAnalysis: JDAnalysis;
  experiencePlans: ExperiencePlan[];
  experiencesById: Map<string, CandidateExperience>;
  experienceResults: ExperienceGenerationResult[];
  /** Skills allowed in the FINAL skills section: supported (evidence) + JD-required. */
  allowedFinalSkillsByKey: Map<string, SkillCandidate>;
  composerResult: ComposerResult;
}

/**
 * Stage 9 — deterministic validation. Runs in application code, not as an
 * LLM self-check. Returns a flat issue list; the orchestrator decides
 * whether each issue is repairable, deterministically fixable, or fatal.
 */
export function validateTailoredResume(input: ValidateTailoredResumeInput): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const {
    jdAnalysis,
    experiencePlans,
    experiencesById,
    experienceResults,
    allowedFinalSkillsByKey,
    composerResult,
  } = input;

  const requirementIds = new Set(jdAnalysis.requirements.map((r) => r.id));
  const planById = new Map(experiencePlans.map((p) => [p.experienceId, p]));

  // 12. Invalid or duplicate experience IDs
  const seenExperienceIds = new Set<string>();
  for (const result of experienceResults) {
    if (!planById.has(result.experienceId)) {
      issues.push({
        code: "UNKNOWN_EXPERIENCE_ID",
        path: `experience[${result.experienceId}]`,
        message: `Experience id "${result.experienceId}" is not part of the tailoring plan`,
      });
      continue;
    }
    if (seenExperienceIds.has(result.experienceId)) {
      issues.push({
        code: "DUPLICATE_EXPERIENCE_ID",
        path: `experience[${result.experienceId}]`,
        message: `Experience id "${result.experienceId}" appears more than once`,
      });
    }
    seenExperienceIds.add(result.experienceId);
  }

  const verbCounts = new Map<string, number>();
  const trackVerb = (text: string) => {
    const firstWord = text.trim().split(/\s+/)[0]?.replace(/[^a-zA-Z]/g, "").toLowerCase();
    if (!firstWord) return;
    verbCounts.set(firstWord, (verbCounts.get(firstWord) ?? 0) + 1);
  };

  for (const result of experienceResults) {
    const plan = planById.get(result.experienceId);
    const experience = experiencesById.get(result.experienceId);
    if (!plan || !experience) continue;

    const allowedEvidenceIds = new Set(plan.allowedEvidenceIds);
    const path = `experience[${result.experienceId}]`;

    // 7. Bullet count vs. plan target (tolerance +/-1)
    if (Math.abs(result.bullets.length - plan.targetBulletCount) > 1) {
      issues.push({
        code: "BULLET_COUNT_MISMATCH",
        path,
        message: `Expected ~${plan.targetBulletCount} bullets, got ${result.bullets.length}`,
      });
    }

    const seenNormalized = new Set<string>();

    result.bullets.forEach((bullet, index) => {
      const bulletPath = `${path}.bullets[${index}]`;

      // 2. Evidence references must exist and be scoped to this experience
      for (const evidenceId of bullet.evidenceIds) {
        if (!allowedEvidenceIds.has(evidenceId)) {
          issues.push({
            code: "UNKNOWN_EVIDENCE_ID",
            path: bulletPath,
            message: `Evidence id "${evidenceId}" is not in this experience's allowed evidence`,
          });
        }
      }

      // 3. Requirement references must exist
      for (const reqId of bullet.requirementIds) {
        if (!requirementIds.has(reqId)) {
          issues.push({
            code: "UNKNOWN_REQUIREMENT_ID",
            path: bulletPath,
            message: `Requirement id "${reqId}" does not exist`,
          });
        }
      }

      // 4. Metric grounding — only flag metrics when the bullet cites evidence that lacks them.
      // Creatively invented bullets (empty evidenceIds) are allowed to include metrics.
      if (bullet.evidenceIds.length > 0) {
        const allowedMetricValues = new Set(
          experience.facts.flatMap((f) => (f.metrics ?? []).map((m) => m.value.toLowerCase().trim()))
        );
        for (const claim of extractMetricLikeClaims(bullet.text)) {
          if (!allowedMetricValues.has(claim)) {
            issues.push({
              code: "UNGROUNDED_METRIC",
              path: bulletPath,
              message: `Metric-like claim "${claim}" has no matching candidate evidence in this experience`,
            });
          }
        }
      }

      // (Skills mentioned in bullets are intentionally not restricted — the writer may
      // introduce role-appropriate technologies. Metric grounding below still applies.)

      // 10. Forbidden opening verbs
      const lowerText = bullet.text.trim().toLowerCase();
      if (FORBIDDEN_OPENING_VERBS.some((verb) => lowerText.startsWith(verb))) {
        issues.push({ code: "FORBIDDEN_OPENING_VERB", path: bulletPath, message: "Bullet starts with a forbidden filler verb" });
      }

      // 8. Duplicate bullets (exact + normalized) within this experience
      const normalized = normalizeForDuplicateCheck(bullet.text);
      if (seenNormalized.has(normalized)) {
        issues.push({ code: "DUPLICATE_BULLET", path: bulletPath, message: "Duplicate or near-duplicate bullet" });
      }
      seenNormalized.add(normalized);

      trackVerb(bullet.text);
    });
  }

  // 9. Summary word count
  const summaryWordCount = composerResult.summary.trim().split(/\s+/).filter(Boolean).length;
  if (summaryWordCount < 65 || summaryWordCount > 105) {
    issues.push({
      code: "SUMMARY_WORD_COUNT",
      path: "summary",
      message: `Summary is ${summaryWordCount} words; expected roughly 70-100`,
    });
  }
  trackVerb(composerResult.summary);

  // 5. Skills support — every final skill must be an allowed/supported skill (defense in depth; composer already filters)
  Object.entries(composerResult.skillCategories).forEach(([category, skills]) => {
    skills.forEach((skill, index) => {
      if (!allowedFinalSkillsByKey.has(skillKey(skill))) {
        issues.push({
          code: "UNSUPPORTED_SKILL",
          path: `skills.${category}[${index}]`,
          message: `"${skill}" is neither candidate-supported nor JD-required`,
        });
      }
    });
  });

  // 11. Overused action verbs (lightweight — first word of each bullet/summary, cap 3 repeats)
  for (const [verb, count] of verbCounts.entries()) {
    if (count > 3) {
      issues.push({
        code: "OVERUSED_ACTION_VERB",
        path: "resume",
        message: `Action verb "${verb}" used ${count} times (max recommended 3)`,
      });
    }
  }

  return issues;
}
