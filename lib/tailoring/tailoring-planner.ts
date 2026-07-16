import type {
  BulletBudgetConfig,
  CandidateExperience,
  CandidateProfile,
  ExperiencePlan,
  JDAnalysis,
  JDRequirement,
  RequirementMatch,
  RequirementMatchStatus,
  RoleArchetypeDetection,
  SkillCandidate,
  TailoringPlan,
} from "@/lib/types/tailoring";
import { getArchetypeRoleSkills } from "@/lib/tailoring/role-skill-catalog";
import { skillKey } from "@/lib/tailoring/skill-ontology";
import { getBulletCountForTenure, getTenureYears } from "@/lib/resume-bullets";

export const DEFAULT_BULLET_BUDGET: BulletBudgetConfig = {
  minBulletsPerExperience: 2,
  maxBulletsPerExperience: 9,
  maxRepairAttempts: 1,
};

const STOPWORDS = new Set([
  "the", "a", "an", "of", "to", "in", "and", "or", "for", "with", "on", "is", "are", "be",
  "this", "that", "as", "at", "by", "from", "will", "you", "your", "our", "we", "have",
  "experience", "years", "strong", "ability", "skills", "knowledge",
]);

function significantTokens(text: string): string[] {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9+#.\s]/g, " ")
        .split(/\s+/)
        .filter((t) => t.length > 2 && !STOPWORDS.has(t))
    )
  );
}

function keywordOverlapScore(requirementText: string, factTexts: string[]): number {
  const reqTokens = significantTokens(requirementText);
  if (reqTokens.length === 0) return 0;
  const haystack = factTexts.join(" \n ").toLowerCase();
  const matched = reqTokens.filter((t) => haystack.includes(t));
  return matched.length / reqTokens.length;
}

function resolveNonTechnologyMatch(
  requirement: JDRequirement,
  allFactTexts: { id: string; text: string }[]
): RequirementMatch {
  const scored = allFactTexts
    .map((f) => ({ id: f.id, score: keywordOverlapScore(requirement.text, [f.text]) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  let status: RequirementMatchStatus = "unsupported";
  if (best) {
    status = best.score >= 0.5 ? "supported" : "weakly_supported";
  }

  return {
    requirementId: requirement.id,
    status,
    evidenceIds: scored.slice(0, 3).map((s) => s.id),
  };
}

function resolveTechnologyMatch(
  requirement: JDRequirement,
  candidatesByKey: Map<string, SkillCandidate>
): RequirementMatch {
  const candidate = requirement.canonicalTerm ? candidatesByKey.get(skillKey(requirement.canonicalTerm)) : undefined;

  if (!candidate) {
    return { requirementId: requirement.id, status: "unsupported", evidenceIds: [] };
  }

  const statusByEvidence: RequirementMatchStatus =
    candidate.evidenceStatus === "direct" || candidate.evidenceStatus === "entailed"
      ? "strongly_supported"
      : candidate.evidenceStatus === "declared"
        ? "supported"
        : candidate.evidenceStatus === "project_only"
          ? "weakly_supported"
          : "unsupported";

  return { requirementId: requirement.id, status: statusByEvidence, evidenceIds: candidate.evidenceIds };
}

function buildRequirementMatches(
  jdAnalysis: JDAnalysis,
  candidatesByKey: Map<string, SkillCandidate>,
  allFacts: { id: string; text: string }[]
): RequirementMatch[] {
  return jdAnalysis.requirements.map((req) =>
    req.category === "technology" && req.canonicalTerm
      ? resolveTechnologyMatch(req, candidatesByKey)
      : resolveNonTechnologyMatch(req, allFacts)
  );
}

function experienceRelevanceToJD(
  exp: CandidateExperience,
  candidatesByKey: Map<string, SkillCandidate>,
  jdAnalysis: JDAnalysis
): number {
  const explicitTechCount = jdAnalysis.requirements.filter(
    (r) => r.category === "technology" && r.canonicalTerm
  ).length;
  const nonTechCount = jdAnalysis.requirements.length - explicitTechCount;

  const supportedTechMentions = exp.technologies.filter((t) => {
    const candidate = candidatesByKey.get(skillKey(t.name));
    return candidate && candidate.evidenceStatus !== "unsupported" && candidate.matchedRequirementIds.length > 0;
  }).length;

  const techScore = explicitTechCount > 0 ? Math.min(1, supportedTechMentions / explicitTechCount) : 0;

  const factTexts = exp.facts.map((f) => f.text);
  const nonTechRequirements = jdAnalysis.requirements.filter(
    (r) => !(r.category === "technology" && r.canonicalTerm)
  );
  const nonTechMatches = nonTechRequirements.filter(
    (r) => keywordOverlapScore(r.text, factTexts) >= 0.4
  ).length;
  const nonTechScore = nonTechCount > 0 ? Math.min(1, nonTechMatches / nonTechCount) : 0;

  return Math.min(1, techScore * 0.7 + nonTechScore * 0.3);
}

const CONFIDENCE_WEIGHT: Record<string, number> = {
  candidate_confirmed: 1,
  imported: 0.75,
  inferred: 0.4,
};

function experienceEvidenceStrength(exp: CandidateExperience): number {
  if (exp.facts.length === 0) return 0;
  const avgConfidence =
    exp.facts.reduce((sum, f) => sum + (CONFIDENCE_WEIGHT[f.confidence] ?? 0.5), 0) / exp.facts.length;
  const volumeFactor = Math.min(1, exp.facts.length / 6);
  return avgConfidence * 0.6 + volumeFactor * 0.4;
}

function experienceRoleImportance(exp: CandidateExperience, primaryArchetypeId: string): number {
  const { core, ecosystem } = getArchetypeRoleSkills(primaryArchetypeId);
  const roleSkillKeys = new Set([...core, ...ecosystem].map(skillKey));
  if (exp.technologies.length === 0) return 0;
  const aligned = exp.technologies.filter((t) => roleSkillKeys.has(skillKey(t.name))).length;
  return aligned / exp.technologies.length;
}

export function parseEndDateForSort(dateStr: string): number {
  if (!dateStr || /present/i.test(dateStr)) return Number.MAX_SAFE_INTEGER;
  const [month, year] = dateStr.split("/");
  const y = parseInt(year, 10);
  const m = parseInt(month, 10);
  if (Number.isNaN(y)) return 0;
  return y * 12 + (Number.isNaN(m) ? 0 : m);
}

function buildExperiencePlans(
  profile: CandidateProfile,
  jdAnalysis: JDAnalysis,
  roleArchetype: RoleArchetypeDetection,
  candidatesByKey: Map<string, SkillCandidate>,
  budget: BulletBudgetConfig
): ExperiencePlan[] {
  const sorted = [...profile.experiences].sort(
    (a, b) => parseEndDateForSort(b.endDate) - parseEndDateForSort(a.endDate)
  );

  const scored = sorted.map((exp, rank) => {
    const tenureYears = getTenureYears(exp.startDate, exp.endDate || "Present");
    const tenureBase = getBulletCountForTenure(tenureYears);
    const relevanceToJD = experienceRelevanceToJD(exp, candidatesByKey, jdAnalysis);
    const recency = Math.max(0.1, 1 - rank * 0.15);
    const evidenceStrength = experienceEvidenceStrength(exp);
    const roleImportance = experienceRoleImportance(exp, roleArchetype.primaryRoleArchetype);
    const bulletPriority = relevanceToJD * 0.45 + recency * 0.25 + evidenceStrength * 0.2 + roleImportance * 0.1;

    return { exp, tenureBase, bulletPriority };
  });

  const maxPriority = Math.max(0.0001, ...scored.map((s) => s.bulletPriority));

  return scored.map(({ exp, tenureBase, bulletPriority }) => {
    // Relevance can only scale a role DOWN from its tenure-based ceiling, never above it —
    // a long-tenure but weakly relevant role should not mechanically get 9 bullets.
    const relFactor = 0.5 + 0.5 * (bulletPriority / maxPriority);
    const target = Math.round(tenureBase * relFactor);
    const targetBulletCount = Math.max(
      budget.minBulletsPerExperience,
      Math.min(budget.maxBulletsPerExperience, tenureBase, target)
    );

    const relevantRequirementScored = jdAnalysis.requirements
      .map((req) => {
        if (req.category === "technology" && req.canonicalTerm) {
          const hasIt = exp.technologies.some((t) => skillKey(t.name) === skillKey(req.canonicalTerm as string));
          return { req, score: hasIt ? req.priority : 0 };
        }
        const overlap = keywordOverlapScore(
          req.text,
          exp.facts.map((f) => f.text)
        );
        return { req, score: overlap > 0 ? req.priority * overlap : 0 };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((s) => s.req.id);

    const allowedEvidenceIds = [
      ...exp.facts.map((f) => f.id),
      ...exp.facts.flatMap((f) => (f.metrics ?? []).map((m) => m.id)),
    ];

    const relevantSkillIds = exp.technologies
      .map((t) => candidatesByKey.get(skillKey(t.name))?.id)
      .filter((id): id is string => Boolean(id));

    return {
      experienceId: exp.id,
      targetBulletCount,
      priorityRequirementIds: relevantRequirementScored,
      allowedEvidenceIds,
      relevantSkillIds,
    };
  });
}

/** Stage 6 — deterministic planning. No prose is written here; only what to write and from what evidence. */
export function createTailoringPlan(
  profile: CandidateProfile,
  jdAnalysis: JDAnalysis,
  roleArchetype: RoleArchetypeDetection,
  resolvedCandidates: SkillCandidate[],
  budget: BulletBudgetConfig = DEFAULT_BULLET_BUDGET
): TailoringPlan {
  const candidatesByKey = new Map(resolvedCandidates.map((c) => [skillKey(c.canonicalName), c]));

  const allFacts = profile.experiences.flatMap((e) => e.facts.map((f) => ({ id: f.id, text: f.text })));
  const requirementMatches = buildRequirementMatches(jdAnalysis, candidatesByKey, allFacts);
  const experiencePlans = buildExperiencePlans(profile, jdAnalysis, roleArchetype, candidatesByKey, budget);

  const supportedStatuses = new Set(["direct", "entailed", "declared", "project_only"]);
  const supportedSkills = resolvedCandidates.filter((c) => supportedStatuses.has(c.evidenceStatus));
  const roleRelevantSupportedSkills = supportedSkills.filter(
    (c) => c.roleImportance === "core" || c.roleImportance === "strong"
  );
  const ecosystemRelevantSupportedSkills = supportedSkills.filter(
    (c) => c.roleImportance === "adjacent" || c.sources.includes("ecosystem")
  );
  const marketRelevantSupportedSkills = supportedSkills.filter((c) => c.sources.includes("market_popularity"));
  const unsupportedHighValueSkills = resolvedCandidates
    .filter((c) => c.evidenceStatus === "unsupported" && (c.roleImportance === "core" || c.roleImportance === "strong"))
    .sort((a, b) => b.relevanceScore - a.relevanceScore);

  const topExperienceIds = new Set(
    experiencePlans
      .slice()
      .sort((a, b) => b.targetBulletCount - a.targetBulletCount)
      .slice(0, 2)
      .map((p) => p.experienceId)
  );
  const summaryEvidenceIds = [
    ...profile.experiences
      .filter((e) => topExperienceIds.has(e.id))
      .flatMap((e) =>
        e.facts.filter((f) => f.factType === "achievement" || f.factType === "leadership" || f.factType === "architecture")
      )
      .slice(0, 6)
      .map((f) => f.id),
    ...roleRelevantSupportedSkills.slice(0, 6).map((s) => s.id),
  ];

  return {
    requirementMatches,
    experiencePlans,
    summaryEvidenceIds,
    supportedSkills,
    roleRelevantSupportedSkills,
    ecosystemRelevantSupportedSkills,
    marketRelevantSupportedSkills,
    unsupportedHighValueSkills,
  };
}
