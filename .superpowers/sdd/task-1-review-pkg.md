Base: 0da141056c3864c76fcccc4d0609e00fd1208067
Head: c32b5ed32d9ee191dad8bb414e7f1db741689777

## Commits
c32b5ed feat: add main-skill bullet coverage helpers

## Diff
diff --git a/lib/tailoring/main-skill-coverage.test.ts b/lib/tailoring/main-skill-coverage.test.ts
new file mode 100644
index 0000000..1465fcf
--- /dev/null
+++ b/lib/tailoring/main-skill-coverage.test.ts
@@ -0,0 +1,112 @@
+import { describe, expect, it } from "vitest";
+import type { JDAnalysis } from "@/lib/types/tailoring";
+import {
+  MAIN_SKILL_COVERAGE_RATIO,
+  bulletMentionsSkill,
+  ensureMainSkillBulletCoverage,
+  selectMainSkill,
+} from "@/lib/tailoring/main-skill-coverage";
+
+function jd(partial: Partial<JDAnalysis> & Pick<JDAnalysis, "requirements">): Pick<JDAnalysis, "requirements" | "atsTerms"> {
+  return { atsTerms: [], ...partial };
+}
+
+describe("selectMainSkill", () => {
+  it("picks highest-priority must_have technology by canonicalTerm", () => {
+    const skill = selectMainSkill(
+      jd({
+        requirements: [
+          { id: "r1", text: "Python", type: "must_have", category: "technology", canonicalTerm: "Python", priority: 5 },
+          { id: "r2", text: "Java", type: "must_have", category: "technology", canonicalTerm: "Java", priority: 9 },
+          { id: "r3", text: "Teamwork", type: "must_have", category: "soft_skill", canonicalTerm: null, priority: 10 },
+        ],
+      })
+    );
+    expect(skill).toBe("Java");
+  });
+
+  it("falls back to first known atsTerms skill when no must_have tech", () => {
+    const skill = selectMainSkill(
+      jd({
+        requirements: [
+          { id: "r1", text: "Communicate well", type: "must_have", category: "soft_skill", canonicalTerm: null, priority: 9 },
+        ],
+        atsTerms: ["Kubernetes", "Java"],
+      })
+    );
+    expect(skill).toBe("Kubernetes");
+  });
+
+  it("returns null when nothing usable", () => {
+    expect(selectMainSkill(jd({ requirements: [], atsTerms: [] }))).toBeNull();
+  });
+});
+
+describe("bulletMentionsSkill", () => {
+  it("matches word-boundary skill mentions", () => {
+    expect(bulletMentionsSkill("Built APIs in Java and Spring", "Java")).toBe(true);
+    expect(bulletMentionsSkill("Built JavaScript UIs", "Java")).toBe(false);
+  });
+});
+
+describe("ensureMainSkillBulletCoverage", () => {
+  it("is a no-op when mainSkill is null or already >= 60%", () => {
+    const results = [
+      {
+        experienceId: "e1",
+        bullets: [
+          { text: "Built services in Java", evidenceIds: ["f1"], requirementIds: [] },
+          { text: "Shipped Java APIs", evidenceIds: [], requirementIds: [] },
+          { text: "Mentored teammates", evidenceIds: [], requirementIds: [] },
+        ],
+      },
+    ];
+    // 2/3 >= 0.6
+    expect(ensureMainSkillBulletCoverage(results, "Java")).toEqual(results);
+    expect(ensureMainSkillBulletCoverage(results, null)).toEqual(results);
+  });
+
+  it("injects mainSkill into enough uncovered bullets to reach ceil(60%)", () => {
+    const results = [
+      {
+        experienceId: "e1",
+        bullets: [
+          { text: "Built payment APIs", evidenceIds: ["f1"], requirementIds: [] },
+          { text: "Improved latency", evidenceIds: [], requirementIds: [] },
+          { text: "Mentored teammates", evidenceIds: [], requirementIds: [] },
+          { text: "Owned on-call", evidenceIds: [], requirementIds: [] },
+          { text: "Documented runbooks", evidenceIds: [], requirementIds: [] },
+        ],
+      },
+    ];
+    // needed = ceil(0.6*5) = 3; currently 0 covered
+    const out = ensureMainSkillBulletCoverage(results, "Java");
+    const covered = out[0].bullets.filter((b) => bulletMentionsSkill(b.text, "Java")).length;
+    expect(covered).toBeGreaterThanOrEqual(Math.ceil(MAIN_SKILL_COVERAGE_RATIO * 5));
+    expect(out[0].bullets).toHaveLength(5); // prefer mutate, not append
+    expect(out[0].bullets[0].evidenceIds).toEqual(["f1"]);
+  });
+
+  it("prefers larger experiences when choosing bullets to rewrite", () => {
+    const results = [
+      {
+        experienceId: "small",
+        bullets: [{ text: "Did stuff", evidenceIds: [], requirementIds: [] }],
+      },
+      {
+        experienceId: "large",
+        bullets: [
+          { text: "Built APIs", evidenceIds: [], requirementIds: [] },
+          { text: "Shipped features", evidenceIds: [], requirementIds: [] },
+          { text: "Led reviews", evidenceIds: [], requirementIds: [] },
+        ],
+      },
+    ];
+    // total 4, needed = ceil(2.4)=3
+    const out = ensureMainSkillBulletCoverage(results, "Go");
+    const largeCovered = out.find((r) => r.experienceId === "large")!.bullets.filter((b) =>
+      bulletMentionsSkill(b.text, "Go")
+    ).length;
+    expect(largeCovered).toBeGreaterThanOrEqual(2);
+  });
+});
diff --git a/lib/tailoring/main-skill-coverage.ts b/lib/tailoring/main-skill-coverage.ts
new file mode 100644
index 0000000..69f7ecc
--- /dev/null
+++ b/lib/tailoring/main-skill-coverage.ts
@@ -0,0 +1,90 @@
+import type { ExperienceGenerationResult, JDAnalysis } from "@/lib/types/tailoring";
+import { normalizeSkillName } from "@/lib/tailoring/skill-ontology";
+
+export const MAIN_SKILL_COVERAGE_RATIO = 0.6;
+
+function escapeRegExp(value: string): string {
+  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
+}
+
+export function bulletMentionsSkill(text: string, skillName: string): boolean {
+  const canonical = normalizeSkillName(skillName) || skillName;
+  if (!canonical.trim()) return false;
+  const re = new RegExp(
+    `(^|[^a-z0-9+#.])${escapeRegExp(canonical.toLowerCase())}([^a-z0-9+#]|$)`,
+    "i"
+  );
+  return re.test(String(text || "").toLowerCase());
+}
+
+export function selectMainSkill(
+  jdAnalysis: Pick<JDAnalysis, "requirements" | "atsTerms">
+): string | null {
+  const mustTech = jdAnalysis.requirements
+    .filter(
+      (r) =>
+        r.type === "must_have" &&
+        (r.category === "technology" || Boolean(r.canonicalTerm))
+    )
+    .slice()
+    .sort((a, b) => b.priority - a.priority);
+
+  for (const r of mustTech) {
+    const raw = (r.canonicalTerm || r.text || "").trim();
+    const canonical = normalizeSkillName(raw);
+    if (canonical) return canonical;
+  }
+
+  for (const term of jdAnalysis.atsTerms ?? []) {
+    const canonical = normalizeSkillName(String(term || "").trim());
+    if (canonical) return canonical;
+  }
+  return null;
+}
+
+function injectSkillIntoBullet(text: string, skill: string): string {
+  const trimmed = text.trim().replace(/\.$/, "");
+  return `${trimmed} using ${skill}.`;
+}
+
+export function ensureMainSkillBulletCoverage(
+  results: ExperienceGenerationResult[],
+  mainSkill: string | null,
+  minRatio: number = MAIN_SKILL_COVERAGE_RATIO
+): ExperienceGenerationResult[] {
+  if (!mainSkill || results.length === 0) return results;
+
+  const total = results.reduce((n, r) => n + r.bullets.length, 0);
+  if (total === 0) return results;
+
+  const needed = Math.ceil(minRatio * total);
+
+  type Loc = { expIdx: number; bulletIdx: number; expSize: number };
+  const uncovered: Loc[] = [];
+  let covered = 0;
+
+  results.forEach((r, expIdx) => {
+    r.bullets.forEach((b, bulletIdx) => {
+      if (bulletMentionsSkill(b.text, mainSkill)) covered += 1;
+      else uncovered.push({ expIdx, bulletIdx, expSize: r.bullets.length });
+    });
+  });
+
+  if (covered >= needed) return results;
+
+  uncovered.sort((a, b) => b.expSize - a.expSize || a.bulletIdx - b.bulletIdx);
+
+  const next = results.map((r) => ({
+    ...r,
+    bullets: r.bullets.map((b) => ({ ...b })),
+  }));
+  let i = 0;
+  while (covered < needed && i < uncovered.length) {
+    const loc = uncovered[i++];
+    const bullet = next[loc.expIdx].bullets[loc.bulletIdx];
+    if (bulletMentionsSkill(bullet.text, mainSkill)) continue;
+    bullet.text = injectSkillIntoBullet(bullet.text, mainSkill);
+    covered += 1;
+  }
+  return next;
+}
