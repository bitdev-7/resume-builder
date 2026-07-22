import { skillKey } from "@/lib/tailoring/skill-ontology";

export const CANONICAL_SKILL_CATEGORIES = [
  "Languages",
  "Backend",
  "Frontend",
  "Database",
  "Cloud & DevOps",
  "Tools & Protocols",
  "Testing",
] as const;

export type CanonicalSkillCategory = (typeof CANONICAL_SKILL_CATEGORIES)[number];

export const FALLBACK_SKILL_CATEGORY: CanonicalSkillCategory = "Tools & Protocols";

/** Lowercase alias / exact label → canonical label */
const CATEGORY_ALIASES: Record<string, CanonicalSkillCategory> = {
  languages: "Languages",
  backend: "Backend",
  frontend: "Frontend",
  database: "Database",
  databases: "Database",
  data: "Database",
  "cloud & devops": "Cloud & DevOps",
  "cloud and devops": "Cloud & DevOps",
  cloud: "Cloud & DevOps",
  devops: "Cloud & DevOps",
  "tools & protocols": "Tools & Protocols",
  "tools & technologies": "Tools & Protocols",
  tools: "Tools & Protocols",
  testing: "Testing",
  "testing & tools": "Testing",
};

export function resolveCanonicalSkillCategory(
  raw: string | null | undefined
): CanonicalSkillCategory | null {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (!trimmed) return null;
  return CATEGORY_ALIASES[trimmed.toLowerCase()] ?? null;
}

/**
 * Remap known aliases, drop skills under unknown headings, dedupe by skill key
 * (earlier canonical category wins), emit only non-empty categories in fixed order.
 */
export function normalizeSkillCategories(
  skillCategories: Record<string, string[]>
): Record<string, string[]> {
  const buckets: Record<CanonicalSkillCategory, string[]> = {
    Languages: [],
    Backend: [],
    Frontend: [],
    Database: [],
    "Cloud & DevOps": [],
    "Tools & Protocols": [],
    Testing: [],
  };
  const seen = new Set<string>();

  const pending: { category: CanonicalSkillCategory; skill: string }[] = [];
  for (const [rawCategory, skills] of Object.entries(skillCategories)) {
    const canonical = resolveCanonicalSkillCategory(rawCategory);
    if (!canonical) continue;
    for (const skill of skills) {
      if (!skillKey(skill)) continue;
      pending.push({ category: canonical, skill });
    }
  }

  for (const label of CANONICAL_SKILL_CATEGORIES) {
    for (const item of pending) {
      if (item.category !== label) continue;
      const key = skillKey(item.skill);
      if (seen.has(key)) continue;
      seen.add(key);
      buckets[label].push(item.skill);
    }
  }

  const out: Record<string, string[]> = {};
  for (const label of CANONICAL_SKILL_CATEGORIES) {
    if (buckets[label].length > 0) out[label] = buckets[label];
  }
  return out;
}
