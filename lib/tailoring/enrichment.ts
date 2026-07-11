import type { EnrichmentRecommendation, SkillCandidate, SkillSource, TailoringPlan } from "@/lib/types/tailoring";

const REASON_BY_SOURCE: Record<SkillSource, string> = {
  explicit_jd: "Explicitly requested in the job description, but no supporting candidate evidence was found.",
  role_archetype: "Core skill for this target role, but no supporting candidate evidence was found.",
  ecosystem: "Commonly used in this role's ecosystem, but no supporting candidate evidence was found.",
  market_popularity: "Currently in high market demand for this role, but no supporting candidate evidence was found.",
  candidate_profile: "Relevant to the target role.",
};

function pickPrimarySource(candidate: SkillCandidate): SkillSource {
  const priority: SkillSource[] = ["explicit_jd", "role_archetype", "ecosystem", "market_popularity", "candidate_profile"];
  return priority.find((s) => candidate.sources.includes(s)) ?? candidate.sources[0] ?? "role_archetype";
}

/**
 * Stage 12 — relevant-but-unsupported high-value skills become enrichment
 * recommendations for the candidate to confirm, never inserted directly
 * into the resume.
 */
export function buildEnrichmentRecommendations(
  plan: TailoringPlan,
  limit = 8
): EnrichmentRecommendation[] {
  return plan.unsupportedHighValueSkills.slice(0, limit).map((candidate) => {
    const source = pickPrimarySource(candidate);
    return {
      skill: candidate.canonicalName,
      reason: REASON_BY_SOURCE[source],
      source,
      candidateEvidence: [],
      action: "ask_candidate",
    };
  });
}
