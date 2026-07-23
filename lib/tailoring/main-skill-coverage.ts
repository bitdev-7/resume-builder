import type { ExperienceGenerationResult, JDAnalysis } from "@/lib/types/tailoring";
import { isKnownSkillName, normalizeSkillName } from "@/lib/tailoring/skill-ontology";

export const MAIN_SKILL_COVERAGE_RATIO = 0.6;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function bulletMentionsSkill(text: string, skillName: string): boolean {
  const canonical = normalizeSkillName(skillName) || skillName;
  if (!canonical.trim()) return false;
  const re = new RegExp(
    `(^|[^a-z0-9+#.])${escapeRegExp(canonical.toLowerCase())}([^a-z0-9+#]|$)`,
    "i"
  );
  return re.test(String(text || "").toLowerCase());
}

export function selectMainSkill(
  jdAnalysis: Pick<JDAnalysis, "requirements" | "atsTerms">
): string | null {
  const mustTech = jdAnalysis.requirements
    .filter(
      (r) =>
        r.type === "must_have" &&
        (r.category === "technology" || Boolean(r.canonicalTerm))
    )
    .slice()
    .sort((a, b) => b.priority - a.priority);

  for (const r of mustTech) {
    const raw = (r.canonicalTerm || r.text || "").trim();
    if (!isKnownSkillName(raw)) continue;
    const canonical = normalizeSkillName(raw);
    if (canonical) return canonical;
  }

  for (const term of jdAnalysis.atsTerms ?? []) {
    const raw = String(term || "").trim();
    if (!isKnownSkillName(raw)) continue;
    const canonical = normalizeSkillName(raw);
    if (canonical) return canonical;
  }
  return null;
}

function injectSkillIntoBullet(text: string, skill: string): string {
  const trimmed = text.trim().replace(/\.$/, "");
  return `${trimmed} using ${skill}.`;
}

export function ensureMainSkillBulletCoverage(
  results: ExperienceGenerationResult[],
  mainSkill: string | null,
  minRatio: number = MAIN_SKILL_COVERAGE_RATIO
): ExperienceGenerationResult[] {
  if (!mainSkill || results.length === 0) return results;

  const total = results.reduce((n, r) => n + r.bullets.length, 0);
  if (total === 0) return results;

  const needed = Math.ceil(minRatio * total);

  type Loc = { expIdx: number; bulletIdx: number; expSize: number };
  const uncovered: Loc[] = [];
  let covered = 0;

  results.forEach((r, expIdx) => {
    r.bullets.forEach((b, bulletIdx) => {
      if (bulletMentionsSkill(b.text, mainSkill)) covered += 1;
      else uncovered.push({ expIdx, bulletIdx, expSize: r.bullets.length });
    });
  });

  if (covered >= needed) return results;

  uncovered.sort((a, b) => b.expSize - a.expSize || a.bulletIdx - b.bulletIdx);

  const next = results.map((r) => ({
    ...r,
    bullets: r.bullets.map((b) => ({ ...b })),
  }));
  let i = 0;
  while (covered < needed && i < uncovered.length) {
    const loc = uncovered[i++];
    const bullet = next[loc.expIdx].bullets[loc.bulletIdx];
    if (bulletMentionsSkill(bullet.text, mainSkill)) continue;
    bullet.text = injectSkillIntoBullet(bullet.text, mainSkill);
    covered += 1;
  }
  return next;
}
