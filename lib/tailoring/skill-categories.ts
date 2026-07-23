import { skillKey } from "@/lib/tailoring/skill-ontology";

export const CANONICAL_SKILL_CATEGORIES = [
  "Languages",
  "AI & Generative AI",
  "Data Engineering",
  "Backend",
  "Frontend",
  "Mobile Development",
  "Machine Learning",
  "APIs & Protocols",
  "Databases",
  "Cloud & DevOps",
  "Security & Compliance",
  "Testing",
] as const;

export type CanonicalSkillCategory = (typeof CANONICAL_SKILL_CATEGORIES)[number];

export const FALLBACK_SKILL_CATEGORY: CanonicalSkillCategory = "APIs & Protocols";

const CATEGORY_ALIASES: Record<string, CanonicalSkillCategory> = {
  languages: "Languages",
  "ai & generative ai": "AI & Generative AI",
  ai: "AI & Generative AI",
  "generative ai": "AI & Generative AI",
  "data engineering": "Data Engineering",
  data: "Data Engineering",
  backend: "Backend",
  frontend: "Frontend",
  "mobile development": "Mobile Development",
  mobile: "Mobile Development",
  "machine learning": "Machine Learning",
  ml: "Machine Learning",
  "apis & protocols": "APIs & Protocols",
  apis: "APIs & Protocols",
  "api & protocols": "APIs & Protocols",
  "tools & protocols": "APIs & Protocols",
  "tools & technologies": "APIs & Protocols",
  tools: "APIs & Protocols",
  databases: "Databases",
  database: "Databases",
  "cloud & devops": "Cloud & DevOps",
  "cloud and devops": "Cloud & DevOps",
  cloud: "Cloud & DevOps",
  devops: "Cloud & DevOps",
  "security & compliance": "Security & Compliance",
  security: "Security & Compliance",
  compliance: "Security & Compliance",
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

export function normalizeSkillCategories(
  skillCategories: Record<string, string[]>
): Record<string, string[]> {
  const buckets = Object.fromEntries(
    CANONICAL_SKILL_CATEGORIES.map((label) => [label, [] as string[]])
  ) as Record<CanonicalSkillCategory, string[]>;

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
