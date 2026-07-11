import type { JDAnalysis, RoleArchetypeDetection } from "@/lib/types/tailoring";
import { ROLE_SKILL_CATALOG } from "@/lib/tailoring/role-skill-catalog";
import { skillKey } from "@/lib/tailoring/skill-ontology";

const DEFAULT_ARCHETYPE = "full_stack_engineer";

function archetypeSkillSet(entryId: string): Set<string> {
  const entry = ROLE_SKILL_CATALOG[entryId];
  const all = [...entry.core, ...Object.values(entry.ecosystem).flat()];
  return new Set(all.map(skillKey));
}

function scoreArchetype(
  entryId: string,
  normalizedTitleLower: string,
  jdTechKeys: Set<string>
): number {
  const entry = ROLE_SKILL_CATALOG[entryId];

  let titleScore = 0;
  for (const kw of entry.titleKeywords) {
    if (normalizedTitleLower.includes(kw)) {
      titleScore = 1;
      break;
    }
  }

  const roleSkills = archetypeSkillSet(entryId);
  let overlap = 0;
  for (const tech of jdTechKeys) {
    if (roleSkills.has(tech)) overlap++;
  }
  const denom = Math.max(1, Math.min(roleSkills.size, Math.max(3, jdTechKeys.size)));
  const techScore = Math.min(1, overlap / denom);

  return titleScore * 0.5 + techScore * 0.5;
}

/**
 * Deterministic, catalog-based archetype scoring. Kept rule-based (rather
 * than an extra AI call) so it's cheap, fast, and unit-testable without
 * live model calls; the JD analyzer already extracted canonical technology
 * terms and a normalized title, which is all this needs.
 */
export function detectRoleArchetype(jdAnalysis: JDAnalysis): RoleArchetypeDetection {
  const normalizedTitleLower = jdAnalysis.normalizedTitle.toLowerCase();
  const jdTechKeys = new Set(
    jdAnalysis.requirements
      .filter((r) => r.category === "technology" && r.canonicalTerm)
      .map((r) => skillKey(r.canonicalTerm as string))
  );

  const scored = Object.keys(ROLE_SKILL_CATALOG)
    .map((id) => ({ id, score: scoreArchetype(id, normalizedTitleLower, jdTechKeys) }))
    .sort((a, b) => b.score - a.score);

  const top = scored[0];
  if (!top || top.score <= 0) {
    return {
      primaryRoleArchetype: DEFAULT_ARCHETYPE,
      secondaryRoleArchetypes: [],
      confidence: 0.1,
    };
  }

  const secondary = scored
    .slice(1)
    .filter((s) => s.score > 0 && s.score >= top.score * 0.6)
    .slice(0, 2)
    .map((s) => s.id);

  return {
    primaryRoleArchetype: top.id,
    secondaryRoleArchetypes: secondary,
    confidence: Math.round(Math.min(1, top.score) * 100) / 100,
  };
}
