import { skillKey } from "@/lib/tailoring/skill-ontology";

export type ProfileSkillsSource = {
  skills?: Record<string, string[]>;
  hardSkills?: Record<string, string[]>;
} | null | undefined;

function isSoftSkillsCategory(category: string): boolean {
  return /^soft\s*skills$/i.test(category.trim());
}

/**
 * Resume hard-skills map from Profile — category names and skill lists as stored.
 * Excludes Soft Skills. Does not remap to a canonical taxonomy.
 */
export function buildProfileHardSkills(
  defaultResume: ProfileSkillsSource
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (!defaultResume) return out;

  for (const record of [defaultResume.skills, defaultResume.hardSkills]) {
    if (!record) continue;
    for (const [rawCategory, list] of Object.entries(record)) {
      const category = String(rawCategory || "").trim();
      if (!category || isSoftSkillsCategory(category)) continue;

      const bucket = out[category] ?? [];
      const seen = new Set(bucket.map((s) => skillKey(s)).filter(Boolean));
      for (const raw of list || []) {
        const name = String(raw || "").trim();
        const key = skillKey(name);
        if (!name || !key || seen.has(key)) continue;
        seen.add(key);
        bucket.push(name);
      }
      if (bucket.length > 0) out[category] = bucket;
      else delete out[category];
    }
  }
  return out;
}
