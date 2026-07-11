import type { JDAnalysis, RoleArchetypeDetection, RoleImportance, SkillCandidate, SkillSource } from "@/lib/types/tailoring";
import { getArchetypeRoleSkills, getRoleCatalogEntry } from "@/lib/tailoring/role-skill-catalog";
import { getMarketSkillProvider } from "@/lib/tailoring/market-skill-provider";
import { normalizeSkillName, skillCandidateIdFor, skillKey } from "@/lib/tailoring/skill-ontology";

const TIER_RANK: Record<RoleImportance, number> = { core: 3, strong: 2, adjacent: 1, optional: 0 };
const TIER_WEIGHT: Record<RoleImportance, number> = { core: 1.0, strong: 0.75, adjacent: 0.5, optional: 0.3 };
const SOURCE_WEIGHT: Record<SkillSource, number> = {
  explicit_jd: 0.35,
  role_archetype: 0.3,
  ecosystem: 0.15,
  market_popularity: 0.1,
  candidate_profile: 0.1,
};

interface DraftCandidate {
  canonicalName: string;
  sources: Set<SkillSource>;
  tier: RoleImportance;
  matchedRequirementIds: Set<string>;
}

function upsert(
  pool: Map<string, DraftCandidate>,
  rawName: string,
  source: SkillSource,
  tier: RoleImportance,
  requirementId?: string
): void {
  const canonicalName = normalizeSkillName(rawName);
  if (!canonicalName) return;
  const key = skillKey(canonicalName);

  const existing = pool.get(key);
  if (!existing) {
    pool.set(key, {
      canonicalName,
      sources: new Set([source]),
      tier,
      matchedRequirementIds: new Set(requirementId ? [requirementId] : []),
    });
    return;
  }

  existing.sources.add(source);
  if (TIER_RANK[tier] > TIER_RANK[existing.tier]) existing.tier = tier;
  if (requirementId) existing.matchedRequirementIds.add(requirementId);
}

/**
 * Stage 3 — builds the broad SkillCandidate pool from all five sources.
 * Membership here means "relevant" — evidenceStatus is resolved separately
 * in skill-evidence-resolver.ts and is what actually gates possession.
 */
export async function expandRoleSkills(
  jdAnalysis: JDAnalysis,
  roleArchetype: RoleArchetypeDetection,
  candidatePossessedSkillNames: string[]
): Promise<SkillCandidate[]> {
  const pool = new Map<string, DraftCandidate>();

  // 1. explicit_jd
  for (const req of jdAnalysis.requirements) {
    if (req.category === "technology" && req.canonicalTerm) {
      upsert(pool, req.canonicalTerm, "explicit_jd", "core", req.id);
    }
  }

  // 2/3. role_archetype (primary): core -> "core" tier, ecosystem -> "strong" tier
  const primary = getArchetypeRoleSkills(roleArchetype.primaryRoleArchetype);
  for (const skill of primary.core) upsert(pool, skill, "role_archetype", "core");
  for (const skill of primary.ecosystem) upsert(pool, skill, "role_archetype", "strong");

  // 4. ecosystem (secondary archetypes): "adjacent" tier
  for (const secondaryId of roleArchetype.secondaryRoleArchetypes) {
    const secondary = getArchetypeRoleSkills(secondaryId);
    for (const skill of [...secondary.core, ...secondary.ecosystem]) {
      upsert(pool, skill, "ecosystem", "adjacent");
    }
  }

  // 5. market_popularity: "optional" tier unless already ranked higher
  const marketResult = await getMarketSkillProvider().getRelevantSkills({
    roleArchetype: roleArchetype.primaryRoleArchetype,
  });
  for (const skill of marketResult.skills) upsert(pool, skill, "market_popularity", "optional");

  // 6. candidate_profile: anything the candidate has that isn't already relevant,
  // added at low tier so it's still considered but won't outrank role-relevant skills.
  for (const skill of candidatePossessedSkillNames) {
    upsert(pool, skill, "candidate_profile", "optional");
  }

  const candidates: SkillCandidate[] = [];
  for (const draft of pool.values()) {
    const sourceScore = Array.from(draft.sources).reduce((sum, s) => sum + SOURCE_WEIGHT[s], 0);
    const relevanceScore = Math.max(0, Math.min(1, TIER_WEIGHT[draft.tier] * 0.6 + sourceScore * 0.4));

    candidates.push({
      id: skillCandidateIdFor(draft.canonicalName),
      canonicalName: draft.canonicalName,
      aliases: [],
      sources: Array.from(draft.sources),
      relevanceScore,
      roleImportance: draft.tier,
      evidenceStatus: "unsupported",
      evidenceIds: [],
      confidence: 0,
      matchedRequirementIds: Array.from(draft.matchedRequirementIds),
    });
  }

  return candidates.sort((a, b) => b.relevanceScore - a.relevanceScore);
}

export function getRoleCatalogEntryOrDefault(archetypeId: string) {
  return getRoleCatalogEntry(archetypeId) ?? getRoleCatalogEntry("full_stack_engineer")!;
}
