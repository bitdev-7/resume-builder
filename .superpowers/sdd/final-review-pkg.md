Base: 0da141056c3864c76fcccc4d0609e00fd1208067
Head: 0985b3ac88d8e4ab86f9948eee155db577e1aef5

## Commits
0985b3a feat: enforce 60% main-skill coverage in experience bullets
c32b5ed feat: add main-skill bullet coverage helpers

## Stat
 lib/prompts/experience-writer-prompt.ts   |   7 ++
 lib/tailoring/main-skill-coverage.test.ts | 112 ++++++++++++++++++++++++++++++
 lib/tailoring/main-skill-coverage.ts      |  90 ++++++++++++++++++++++++
 lib/tailoring/pipeline.ts                 |  14 +++-
 4 files changed, 220 insertions(+), 3 deletions(-)

## Diff
diff --git a/lib/prompts/experience-writer-prompt.ts b/lib/prompts/experience-writer-prompt.ts
index 1169373..ff91602 100644
--- a/lib/prompts/experience-writer-prompt.ts
+++ b/lib/prompts/experience-writer-prompt.ts
@@ -47,10 +47,13 @@ Experience skill policy:
 - Do not force historically incompatible targetSkills into this experience.
 - Prefer allowedSkills and targetSkills whenever appropriate.
 - You may introduce additional technologies only if they are historically accurate and consistent with the role.
 - Mention technologies explicitly instead of leaving them implied.
 - Group related technologies naturally within project-focused achievements.
+- mainSkill (when present) is the JD's top must-have technology. Across ALL experiences in this generation, at least ~60% of bullets overall must mention mainSkill by name when historically compatible with the employment dates.
+- Spread mainSkill mentions across roles rather than concentrating them in a single bullet when possible.
+- Do not force mainSkill into historically incompatible periods; leave those bullets for other skills and rely on compatible roles to meet the overall ratio.
 
 Creative writing rules:
 - Rewrite achievements instead of copying them verbatim.
 - Improve technical depth, ownership, business impact, and clarity.
 - Use believable implementation details that fit the role.
@@ -144,10 +147,12 @@ export interface ExperienceWriterInput {
   endDate: string;
   allowedEvidence: EvidenceFact[];
   allowedSkills: string[];
   /** JD-required skills to feature strongly in this role's bullets. */
   targetSkills: string[];
+  /** Top JD must-have technology to feature in ΓëÑ60% of bullets overall; null/omit if none. */
+  mainSkill?: string | null;
   priorityRequirements: Pick<JDRequirement, "id" | "text">[];
   targetBulletCount: number;
   extraInstructions?: string;
 }
 
@@ -166,10 +171,11 @@ export function buildExperienceWriterUserPrompt(input: ExperienceWriterInput): s
       factType: f.factType,
       metrics: f.metrics?.map((m) => ({ id: m.id, value: m.value })) ?? [],
     })),
     allowedSkills: input.allowedSkills,
     targetSkills: input.targetSkills,
+    mainSkill: input.mainSkill ?? null,
     priorityRequirements: input.priorityRequirements,
     targetBulletCount: input.targetBulletCount,
   };
 
   const extra = input.extraInstructions?.trim()
@@ -195,10 +201,11 @@ export function buildExperienceWriterBatchedUserPrompt(inputs: ExperienceWriterI
       factType: f.factType,
       metrics: f.metrics?.map((m) => ({ id: m.id, value: m.value })) ?? [],
     })),
     allowedSkills: input.allowedSkills,
     targetSkills: input.targetSkills,
+    mainSkill: input.mainSkill ?? null,
     priorityRequirements: input.priorityRequirements,
     targetBulletCount: input.targetBulletCount,
     extraInstructions: input.extraInstructions?.trim() || undefined,
   }));
 
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
diff --git a/lib/tailoring/pipeline.ts b/lib/tailoring/pipeline.ts
index 0aa170a..1a2deba 100644
--- a/lib/tailoring/pipeline.ts
+++ b/lib/tailoring/pipeline.ts
@@ -28,10 +28,14 @@ import type { ComposerInput } from "@/lib/prompts/composer-prompt";
 import type { ExperienceWriterInput } from "@/lib/prompts/experience-writer-prompt";
 import { repairTailoredResume } from "@/lib/tailoring/repair";
 import { assembleFinalResume } from "@/lib/tailoring/assemble";
 import { buildProfileHardSkills } from "@/lib/tailoring/profile-hard-skills";
 import { buildEnrichmentRecommendations } from "@/lib/tailoring/enrichment";
+import {
+  ensureMainSkillBulletCoverage,
+  selectMainSkill,
+} from "@/lib/tailoring/main-skill-coverage";
 import { skillKey, detectSkillMentions } from "@/lib/tailoring/skill-ontology";
 import type { ExperienceGenerationMode } from "@/lib/workflow-settings";
 import type { PromptOverrides } from "@/lib/prompts/prompt-overrides";
 
 export interface RunTailoringPipelineInput {
@@ -256,10 +260,13 @@ export async function runTailoringPipeline(
   ).slice(0, 20);
   console.log(
     `[tailoring] target skills to weave (${targetSkillNames.length}): ${targetSkillNames.join(", ") || "(none)"}`
   );
 
+  const mainSkill = selectMainSkill(jdAnalysis);
+  console.log(`[tailoring] main skill for 60% coverage: ${mainSkill ?? "(none)"}`);
+
   const experienceWriterInputsById = new Map<string, ExperienceWriterInput>();
   for (const expPlan of plan.experiencePlans) {
     const exp = experiencesById.get(expPlan.experienceId);
     if (!exp) continue;
 
@@ -279,10 +286,11 @@ export async function runTailoringPipeline(
       startDate: exp.startDate,
       endDate: exp.endDate,
       allowedEvidence: exp.facts,
       allowedSkills,
       targetSkills: targetSkillNames,
+      mainSkill,
       priorityRequirements,
       targetBulletCount: expPlan.targetBulletCount,
       extraInstructions: input.customPromptOverride ?? undefined,
     });
   }
@@ -374,13 +382,13 @@ export async function runTailoringPipeline(
   });
   totalCost += repairOutcome.costUsd;
 
   // Guarantee every JD-required target skill is shown as used in the experience bullets
   // (user policy: all target skills must appear in experiences, not just the skills list).
-  const coveredExperienceResults = ensureTargetSkillsInExperiences(
-    repairOutcome.experienceResults,
-    targetSkillNames
+  const coveredExperienceResults = ensureMainSkillBulletCoverage(
+    ensureTargetSkillsInExperiences(repairOutcome.experienceResults, targetSkillNames),
+    mainSkill
   );
 
   // Technologies the writer introduced in experience bullets ΓÇö used only to filter
   // enrichment recommendations.
   const introducedSkillNames = new Set<string>();
