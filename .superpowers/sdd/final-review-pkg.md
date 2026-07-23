Base: 7147ea5994c621c826cf3361952ca5549ff62f49
Head: 8c9762a13245d88b71b7bad1df2ebbfa9f683b03

## Commits
8c9762a feat: lock resume skill headings to seven canonical categories
c92f44e feat: normalize composer skill categories to canonical set
c44d584 feat: add canonical skill category normalizer

## Stat
 lib/prompts/composer-prompt.ts         |  6 +--
 lib/tailoring/composer.test.ts         | 82 +++++++++++++++++++++++++++++---
 lib/tailoring/composer.ts              | 31 +++++++-----
 lib/tailoring/pipeline.ts              | 19 +++++---
 lib/tailoring/skill-categories.test.ts | 86 +++++++++++++++++++++++++++++++++
 lib/tailoring/skill-categories.ts      | 87 ++++++++++++++++++++++++++++++++++
 6 files changed, 282 insertions(+), 29 deletions(-)

## Diff
diff --git a/lib/prompts/composer-prompt.ts b/lib/prompts/composer-prompt.ts
index a4ea775..9bbb2fc 100644
--- a/lib/prompts/composer-prompt.ts
+++ b/lib/prompts/composer-prompt.ts
@@ -18,30 +18,30 @@ Summary rules:
 - You may introduce technologies and metrics that strengthen the JD match when they fit the role and seniority.
 - Avoid generic filler phrases such as: results-driven, passionate, dynamic, highly motivated, seasoned professional, proven track record.
 
 Final skills policy:
 - Start from "allowedSkills" as the candidate skill pool, but you may OMIT skills that are clearly unrelated to the job description and its required skills (targetSkills). Prefer a focused, JD-aligned skills section over a complete dump of the profile.
 - Always include every "targetSkills" entry (JD-required technologies) when they are technologies/tools ΓÇö do not omit those.
 - Also ADD other relevant skills dynamically when they strengthen the JD match: role/ecosystem skills and technologies that fit the candidate's trajectory and seniority ΓÇö even if they are not in the profile skill list or "allowedSkills".
 - Prefer concrete, role-appropriate technologies over generic soft labels. Deduplicate near-aliases (e.g. do not list both "JS" and "JavaScript").
-- Group all final skills into role-appropriate categories drawn from the provided "categoryHints"; you may add a clearly-named category if some skills do not fit any hint. Every skill must land in exactly one category.
-- Soft skills: only include ones actually relevant to the role; it is fine to return an empty list.
+- Group hard skills ONLY into these exact category names (and only these): Languages, Backend, Frontend, Database, Cloud & DevOps, Tools & Protocols, Testing. Use the provided "categoryHints" list ΓÇö it is exactly those seven labels. Do NOT invent any other category heading. If a skill does not fit any of the seven, omit it from skillCategories. Every included hard skill must land in exactly one of those categories.
+- Soft skills: only include ones actually relevant to the role in softSkills; never put soft skills inside skillCategories. It is fine to return an empty softSkills list.
 
 Project rules:
 - For each project you are given, write a short tailored description and technology list.
 - Use project reference facts as a starting point, then strengthen and JD-align the description creatively.
 - Technologies: include the project's real technologies, and ALSO add the "targetSkills" (JD-required technologies) so that EVERY targetSkill appears somewhere in the projects section. Spread them across projects where they best fit.
 - You may omit a project if it is not relevant to the target role.`;
 
 /** FIXED output contract ΓÇö never user-editable. */
 const COMPOSER_CONTRACT = `Return ONLY valid JSON matching this exact shape, no markdown, no commentary:
 {
   "summary": string,
-  "skillCategories": { "<category name>": string[] },
+  "skillCategories": { "<one of: Languages|Backend|Frontend|Database|Cloud & DevOps|Tools & Protocols|Testing>": string[] },
   "softSkills": string[],
   "projects": [ { "id": string, "description": string, "technologies": string[] } ]
 }`;
 
 export function buildComposerSystemPrompt(
   _skillBudget: SkillBudgetConfig,
   overrides?: PromptOverrides
 ): string {
diff --git a/lib/tailoring/composer.test.ts b/lib/tailoring/composer.test.ts
index 45dfce5..bd1bd2a 100644
--- a/lib/tailoring/composer.test.ts
+++ b/lib/tailoring/composer.test.ts
@@ -1,11 +1,12 @@
 import { describe, expect, it, vi } from "vitest";
 import type { ResolvedAIRequest } from "@/lib/ai-api";
 import type { ComposerInput } from "@/lib/prompts/composer-prompt";
+import { CANONICAL_SKILL_CATEGORIES } from "@/lib/tailoring/skill-categories";
 
 const callAIMock = vi.fn();
 
 vi.mock("@/lib/ai-provider", async (importOriginal) => {
   const actual = await importOriginal<typeof import("@/lib/ai-provider")>();
   return { ...actual, callAI: callAIMock };
 });
 
@@ -48,41 +49,110 @@ describe("composer ΓÇö skill categories", () => {
     };
 
     const { result } = await composeResumeTopSection(input, aiRequest, { maxTotalSkills: 35, maxSkillsPerCategory: 10 });
 
     expect(result.skillCategories.Backend).toHaveLength(21); // 20 allowed + Kubernetes; Skill0 deduped
     expect(result.skillCategories.Backend).toContain("Kubernetes");
   });
 
+  it("normalizes composer skillCategories ΓÇö drops unknown headings", async () => {
+    callAIMock.mockResolvedValue({
+      providerUsed: "openai",
+      modelUsed: "gpt-4.1-mini",
+      text: "",
+      json: {
+        summary: "A".repeat(10),
+        skillCategories: {
+          Backend: ["Python"],
+          Streaming: ["Kafka"],
+        },
+        softSkills: [],
+        projects: [],
+      },
+      raw: {},
+      costUsd: 0,
+    });
+
+    const input: ComposerInput = {
+      normalizedTitle: "Backend Engineer",
+      seniority: "mid",
+      domains: [],
+      topRequirements: [],
+      summaryEvidence: [],
+      allowedSkills: ["Python"],
+      targetSkills: [],
+      categoryHints: [...CANONICAL_SKILL_CATEGORIES],
+      projects: [],
+    };
+
+    const { result } = await composeResumeTopSection(input, aiRequest);
+    expect(result.skillCategories).toEqual({ Backend: ["Python"] });
+  });
+
   it("uses the default skill budget when none is provided", () => {
     expect(DEFAULT_SKILL_BUDGET.maxSkillsPerCategory).toBeGreaterThan(0);
   });
 });
 
 describe("ensureAllEligibleSkills ΓÇö must-keep guarantee", () => {
-  it("appends must-keep skills the composer omitted, and leaves present ones untouched", () => {
+  it("appends must-keep skills under Tools & Protocols when category is unknown", () => {
     const composerResult = {
       summary: "s",
       skillCategories: { Backend: ["Python", "FastAPI"] },
       softSkills: [],
       projects: [],
     };
-    // Redis (declared) and Kafka (JD-required) were both eligible but dropped by the composer.
     const result = ensureAllEligibleSkills(composerResult, ["Python", "FastAPI", "Redis", "Kafka"]);
+    expect(result.skillCategories).toEqual({
+      Backend: ["Python", "FastAPI"],
+      "Tools & Protocols": ["Redis", "Kafka"],
+    });
+  });
 
-    const allSkills = Object.values(result.skillCategories).flat();
-    expect(allSkills).toEqual(expect.arrayContaining(["Python", "FastAPI", "Redis", "Kafka"]));
-    // Original category preserved.
-    expect(result.skillCategories.Backend).toEqual(["Python", "FastAPI"]);
+  it("aliases profile categories, maps unmappable profile cats to Tools & Protocols, drops unknown headings", () => {
+    const composerResult = {
+      summary: "s",
+      skillCategories: { Streaming: ["Kafka"], Backend: ["Python"] },
+      softSkills: [],
+      projects: [],
+    };
+    const categoryByKey = new Map<string, string>([
+      ["redis", "Databases"],
+      ["pinecone", "AI/ML"],
+    ]);
+    const result = ensureAllEligibleSkills(
+      composerResult,
+      ["Python", "Redis", "Pinecone"],
+      categoryByKey
+    );
+    expect(result.skillCategories).toEqual({
+      Backend: ["Python"],
+      Database: ["Redis"],
+      "Tools & Protocols": ["Pinecone"],
+    });
   });
 
   it("returns the input unchanged when every eligible skill is already present", () => {
     const composerResult = {
       summary: "s",
       skillCategories: { Backend: ["Python"] },
       softSkills: [],
       projects: [],
     };
     const result = ensureAllEligibleSkills(composerResult, ["Python"]);
     expect(result.skillCategories).toEqual({ Backend: ["Python"] });
   });
+
+  it("re-places eligible skills listed under non-canonical headings", () => {
+    const composerResult = {
+      summary: "s",
+      skillCategories: { Streaming: ["Kafka"], Backend: ["Python"] },
+      softSkills: [],
+      projects: [],
+    };
+    const result = ensureAllEligibleSkills(composerResult, ["Python", "Kafka"]);
+    expect(result.skillCategories).toEqual({
+      Backend: ["Python"],
+      "Tools & Protocols": ["Kafka"],
+    });
+  });
 });
diff --git a/lib/tailoring/composer.ts b/lib/tailoring/composer.ts
index 3193236..890d5ec 100644
--- a/lib/tailoring/composer.ts
+++ b/lib/tailoring/composer.ts
@@ -5,16 +5,21 @@ import {
   buildComposerSystemPrompt,
   buildComposerUserPrompt,
   type ComposerInput,
 } from "@/lib/prompts/composer-prompt";
 import { composerAiOutputSchema } from "@/lib/tailoring/schemas";
 import { cleanJsonText } from "@/lib/analyze-json";
 import type { ComposerResult, SkillBudgetConfig } from "@/lib/types/tailoring";
 import { skillKey } from "@/lib/tailoring/skill-ontology";
+import {
+  FALLBACK_SKILL_CATEGORY,
+  normalizeSkillCategories,
+  resolveCanonicalSkillCategory,
+} from "@/lib/tailoring/skill-categories";
 import type { PromptOverrides } from "@/lib/prompts/prompt-overrides";
 
 export const DEFAULT_SKILL_BUDGET: SkillBudgetConfig = {
   maxTotalSkills: 35,
   maxSkillsPerCategory: 10,
 };
 
 /**
@@ -28,63 +33,63 @@ export function buildDeterministicComposerFallback(input: {
   allowedSkills: string[];
   categoryHints: string[];
 }): ComposerResult {
   const topSkills = input.allowedSkills.slice(0, 20);
   const highlight = input.allowedSkills.slice(0, 3).join(", ");
   const summary = highlight
     ? `${input.normalizedTitle} with hands-on experience across ${highlight}. Focused on delivering well-tested, maintainable solutions aligned with team and business goals.`
     : `${input.normalizedTitle} with a track record of delivering well-tested, maintainable solutions aligned with team and business goals.`;
-  const category = input.categoryHints[0] || "Skills";
 
   return {
     summary,
-    skillCategories: topSkills.length > 0 ? { [category]: topSkills } : {},
+    skillCategories: normalizeSkillCategories(
+      topSkills.length > 0 ? { [FALLBACK_SKILL_CATEGORY]: topSkills } : {}
+    ),
     softSkills: [],
     projects: [],
   };
 }
 
-/** Fallback category for skills with no known category ΓÇö a real, resume-appropriate name (never an "Additional Skills" catch-all). */
-const FALLBACK_SKILL_CATEGORY = "Tools & Technologies";
-
 /**
  * Guarantees selected skills appear in the skills section: typically JD-required
  * target skills and technologies introduced in experience bullets. Any omitted
  * names are placed under their real category (profile category when known,
- * otherwise "Tools & Technologies"). Unrelated profile skills may be omitted
+ * otherwise "Tools & Protocols"). Unrelated profile skills may be omitted
  * by the composer and are intentionally not forced back here.
  */
 export function ensureAllEligibleSkills(
   composerResult: ComposerResult,
   eligibleSkillNames: string[],
   categoryByKey?: Map<string, string>
 ): ComposerResult {
   const present = new Set<string>();
-  for (const skills of Object.values(composerResult.skillCategories)) {
+  for (const [category, skills] of Object.entries(composerResult.skillCategories)) {
+    if (!resolveCanonicalSkillCategory(category)) continue;
     for (const s of skills) present.add(skillKey(s));
   }
 
   const missing: string[] = [];
   const seen = new Set<string>();
   for (const name of eligibleSkillNames) {
     const key = skillKey(name);
     if (present.has(key) || seen.has(key)) continue;
     seen.add(key);
     missing.push(name);
   }
 
-  if (missing.length === 0) return composerResult;
-
-  const skillCategories = { ...composerResult.skillCategories };
+  let skillCategories = { ...composerResult.skillCategories };
   for (const name of missing) {
-    const known = categoryByKey?.get(skillKey(name))?.trim();
-    const category = known || FALLBACK_SKILL_CATEGORY;
+    const knownRaw = categoryByKey?.get(skillKey(name))?.trim();
+    const category =
+      resolveCanonicalSkillCategory(knownRaw) ?? FALLBACK_SKILL_CATEGORY;
     skillCategories[category] = [...(skillCategories[category] ?? []), name];
   }
+
+  skillCategories = normalizeSkillCategories(skillCategories);
   return { ...composerResult, skillCategories };
 }
 
 export interface ComposerCallResult {
   result: ComposerResult;
   costUsd?: number;
 }
 
@@ -161,15 +166,15 @@ export async function composeResumeTopSection(
       unique.push(s);
     }
     if (unique.length > 0) skillCategories[category] = unique;
   }
 
   return {
     result: {
       summary: parsed.data.summary,
-      skillCategories,
+      skillCategories: normalizeSkillCategories(skillCategories),
       softSkills: parsed.data.softSkills,
       projects: parsed.data.projects,
     },
     costUsd: resp.costUsd,
   };
 }
diff --git a/lib/tailoring/pipeline.ts b/lib/tailoring/pipeline.ts
index bc13c0b..0850340 100644
--- a/lib/tailoring/pipeline.ts
+++ b/lib/tailoring/pipeline.ts
@@ -10,26 +10,30 @@ import type {
   RoleArchetypeDetection,
   SkillBudgetConfig,
   ValidationIssue,
 } from "@/lib/types/tailoring";
 
 import { analyzeJobDescription } from "@/lib/tailoring/jd-analyzer";
 import { detectRoleArchetype } from "@/lib/tailoring/role-archetype";
 import { buildCandidateEvidenceProfile, getPossessedSkillNames } from "@/lib/tailoring/candidate-evidence";
-import { expandRoleSkills, getRoleCatalogEntryOrDefault } from "@/lib/tailoring/role-skill-expansion";
+import { expandRoleSkills } from "@/lib/tailoring/role-skill-expansion";
 import { resolveSkillEvidence } from "@/lib/tailoring/skill-evidence-resolver";
 import { createTailoringPlan, DEFAULT_BULLET_BUDGET } from "@/lib/tailoring/tailoring-planner";
 import { generateExperiencesInParallel, generateExperiencesBatched } from "@/lib/tailoring/experience-generator";
 import {
   buildDeterministicComposerFallback,
   composeResumeTopSection,
   ensureAllEligibleSkills,
   DEFAULT_SKILL_BUDGET,
 } from "@/lib/tailoring/composer";
+import {
+  CANONICAL_SKILL_CATEGORIES,
+  normalizeSkillCategories,
+} from "@/lib/tailoring/skill-categories";
 import type { ComposerInput } from "@/lib/prompts/composer-prompt";
 import type { ExperienceWriterInput } from "@/lib/prompts/experience-writer-prompt";
 import { repairTailoredResume } from "@/lib/tailoring/repair";
 import { assembleFinalResume } from "@/lib/tailoring/assemble";
 import { buildEnrichmentRecommendations } from "@/lib/tailoring/enrichment";
 import { skillKey, detectSkillMentions } from "@/lib/tailoring/skill-ontology";
 import type { ExperienceGenerationMode } from "@/lib/workflow-settings";
 import type { PromptOverrides } from "@/lib/prompts/prompt-overrides";
@@ -197,22 +201,20 @@ export async function runTailoringPipeline(
     );
   }
   const possessedSkillNames = getPossessedSkillNames(candidateProfile);
 
   // The user's own skill categories (from their profile). Used to (a) hint the composer's
   // grouping so it mirrors how the candidate categorized their skills, and (b) place any
   // leftover/introduced skill under its real category instead of an "Additional Skills" bucket.
   const profileSkillCategoryByKey = new Map<string, string>();
-  const profileSkillCategoryOrder: string[] = [];
   for (const record of [input.profileData.default_resume?.skills, input.profileData.default_resume?.hardSkills]) {
     if (!record) continue;
     for (const [category, list] of Object.entries(record)) {
       if (!category || /soft/i.test(category)) continue;
-      if (!profileSkillCategoryOrder.includes(category)) profileSkillCategoryOrder.push(category);
       for (const raw of list || []) {
         const key = skillKey(String(raw));
         if (key && !profileSkillCategoryByKey.has(key)) profileSkillCategoryByKey.set(key, category);
       }
     }
   }
 
   // Stage 3 ΓÇö Role Skill Expansion (deterministic)
@@ -329,30 +331,29 @@ export async function runTailoringPipeline(
     .filter((s): s is string => Boolean(s));
 
   const topRequirements = jdAnalysis.requirements
     .filter((r) => r.type === "must_have" || r.priority >= 8)
     .sort((a, b) => b.priority - a.priority)
     .slice(0, 10)
     .map((r) => ({ id: r.id, text: r.text, priority: r.priority }));
 
-  const catalogEntry = getRoleCatalogEntryOrDefault(roleArchetype.primaryRoleArchetype);
+
   const composerInput: ComposerInput = {
     normalizedTitle: jdAnalysis.normalizedTitle,
     seniority: jdAnalysis.seniority,
     domains: jdAnalysis.domains,
     topRequirements,
     summaryEvidence: [
       ...summaryEvidence,
       ...jdRequiredMissingSkills.map((c) => `Required skill: ${c.canonicalName}`),
     ],
     allowedSkills: resumeEligibleSkills.map((c) => c.canonicalName),
     targetSkills: targetSkillNames,
-    // Prefer the candidate's own categories, then fall back to role-catalog hints.
-    categoryHints: Array.from(new Set([...profileSkillCategoryOrder, ...catalogEntry.skillCategoryHints])),
+    categoryHints: [...CANONICAL_SKILL_CATEGORIES],
     projects: candidateProfile.projects.map((p) => ({
       id: p.id,
       name: p.name,
       facts: p.facts.map((f) => f.text),
       technologies: p.technologies.map((t) => t.name),
     })),
     extraInstructions: input.customPromptOverride ?? undefined,
   };
@@ -404,21 +405,25 @@ export async function runTailoringPipeline(
   for (const r of coveredExperienceResults) {
     for (const b of r.bullets) {
       for (const mention of detectSkillMentions(b.text)) introducedSkillNames.add(mention);
     }
   }
 
   // Guarantee JD-required target skills and technologies used in experience bullets
   // appear in the skills section. Unrelated profile skills may stay omitted.
-  const finalComposerResult = ensureAllEligibleSkills(
+  const ensured = ensureAllEligibleSkills(
     repairOutcome.composerResult,
     [...targetSkillNames, ...introducedSkillNames],
     profileSkillCategoryByKey
   );
+  const finalComposerResult = {
+    ...ensured,
+    skillCategories: normalizeSkillCategories(ensured.skillCategories),
+  };
 
   // Stage 11 ΓÇö Final Resume Assembly
   const resume = assembleFinalResume(candidateProfile, coveredExperienceResults, finalComposerResult);
 
   // Guarantee every JD-required target skill also appears in the projects section.
   if (resume.projects && resume.projects.length > 0) {
     resume.projects = ensureTargetSkillsInProjects(resume.projects, targetSkillNames);
   }
diff --git a/lib/tailoring/skill-categories.test.ts b/lib/tailoring/skill-categories.test.ts
new file mode 100644
index 0000000..2a64be1
--- /dev/null
+++ b/lib/tailoring/skill-categories.test.ts
@@ -0,0 +1,86 @@
+import { describe, expect, it } from "vitest";
+import {
+  CANONICAL_SKILL_CATEGORIES,
+  FALLBACK_SKILL_CATEGORY,
+  normalizeSkillCategories,
+  resolveCanonicalSkillCategory,
+} from "@/lib/tailoring/skill-categories";
+
+describe("CANONICAL_SKILL_CATEGORIES", () => {
+  it("is exactly the seven approved labels in order", () => {
+    expect([...CANONICAL_SKILL_CATEGORIES]).toEqual([
+      "Languages",
+      "Backend",
+      "Frontend",
+      "Database",
+      "Cloud & DevOps",
+      "Tools & Protocols",
+      "Testing",
+    ]);
+  });
+
+  it("uses Tools & Protocols as the must-keep fallback label", () => {
+    expect(FALLBACK_SKILL_CATEGORY).toBe("Tools & Protocols");
+  });
+});
+
+describe("resolveCanonicalSkillCategory", () => {
+  it("returns exact canonical labels", () => {
+    expect(resolveCanonicalSkillCategory("Backend")).toBe("Backend");
+    expect(resolveCanonicalSkillCategory("cloud & devops")).toBe("Cloud & DevOps");
+  });
+
+  it("remaps known aliases", () => {
+    expect(resolveCanonicalSkillCategory("Cloud")).toBe("Cloud & DevOps");
+    expect(resolveCanonicalSkillCategory("DevOps")).toBe("Cloud & DevOps");
+    expect(resolveCanonicalSkillCategory("Cloud and DevOps")).toBe("Cloud & DevOps");
+    expect(resolveCanonicalSkillCategory("Testing & Tools")).toBe("Testing");
+    expect(resolveCanonicalSkillCategory("Data")).toBe("Database");
+    expect(resolveCanonicalSkillCategory("Databases")).toBe("Database");
+    expect(resolveCanonicalSkillCategory("Tools & Technologies")).toBe("Tools & Protocols");
+    expect(resolveCanonicalSkillCategory("Tools")).toBe("Tools & Protocols");
+  });
+
+  it("returns null for unknown or empty names", () => {
+    expect(resolveCanonicalSkillCategory("Streaming")).toBeNull();
+    expect(resolveCanonicalSkillCategory("AI/ML")).toBeNull();
+    expect(resolveCanonicalSkillCategory("")).toBeNull();
+    expect(resolveCanonicalSkillCategory(null)).toBeNull();
+    expect(resolveCanonicalSkillCategory(undefined)).toBeNull();
+    expect(resolveCanonicalSkillCategory("   ")).toBeNull();
+  });
+});
+
+describe("normalizeSkillCategories", () => {
+  it("remaps aliases, drops unknown buckets, orders, and omits empty", () => {
+    const out = normalizeSkillCategories({
+      Streaming: ["Kafka"],
+      Cloud: ["AWS", "Docker"],
+      Backend: ["Python"],
+      Frontend: [],
+      Data: ["PostgreSQL"],
+      "Tools & Technologies": ["Git"],
+    });
+    expect(Object.keys(out)).toEqual([
+      "Backend",
+      "Database",
+      "Cloud & DevOps",
+      "Tools & Protocols",
+    ]);
+    expect(out.Backend).toEqual(["Python"]);
+    expect(out.Database).toEqual(["PostgreSQL"]);
+    expect(out["Cloud & DevOps"]).toEqual(["AWS", "Docker"]);
+    expect(out["Tools & Protocols"]).toEqual(["Git"]);
+    expect(out).not.toHaveProperty("Streaming");
+    expect(out).not.toHaveProperty("Frontend");
+  });
+
+  it("dedupes the same skill across categories ΓÇö earlier canonical category wins", () => {
+    const out = normalizeSkillCategories({
+      Testing: ["Jest"],
+      Backend: ["Jest", "Python"],
+    });
+    expect(out.Backend).toEqual(["Jest", "Python"]);
+    expect(out).not.toHaveProperty("Testing");
+  });
+});
diff --git a/lib/tailoring/skill-categories.ts b/lib/tailoring/skill-categories.ts
new file mode 100644
index 0000000..6a0ebab
--- /dev/null
+++ b/lib/tailoring/skill-categories.ts
@@ -0,0 +1,87 @@
+import { skillKey } from "@/lib/tailoring/skill-ontology";
+
+export const CANONICAL_SKILL_CATEGORIES = [
+  "Languages",
+  "Backend",
+  "Frontend",
+  "Database",
+  "Cloud & DevOps",
+  "Tools & Protocols",
+  "Testing",
+] as const;
+
+export type CanonicalSkillCategory = (typeof CANONICAL_SKILL_CATEGORIES)[number];
+
+export const FALLBACK_SKILL_CATEGORY: CanonicalSkillCategory = "Tools & Protocols";
+
+/** Lowercase alias / exact label ΓåÆ canonical label */
+const CATEGORY_ALIASES: Record<string, CanonicalSkillCategory> = {
+  languages: "Languages",
+  backend: "Backend",
+  frontend: "Frontend",
+  database: "Database",
+  databases: "Database",
+  data: "Database",
+  "cloud & devops": "Cloud & DevOps",
+  "cloud and devops": "Cloud & DevOps",
+  cloud: "Cloud & DevOps",
+  devops: "Cloud & DevOps",
+  "tools & protocols": "Tools & Protocols",
+  "tools & technologies": "Tools & Protocols",
+  tools: "Tools & Protocols",
+  testing: "Testing",
+  "testing & tools": "Testing",
+};
+
+export function resolveCanonicalSkillCategory(
+  raw: string | null | undefined
+): CanonicalSkillCategory | null {
+  const trimmed = typeof raw === "string" ? raw.trim() : "";
+  if (!trimmed) return null;
+  return CATEGORY_ALIASES[trimmed.toLowerCase()] ?? null;
+}
+
+/**
+ * Remap known aliases, drop skills under unknown headings, dedupe by skill key
+ * (earlier canonical category wins), emit only non-empty categories in fixed order.
+ */
+export function normalizeSkillCategories(
+  skillCategories: Record<string, string[]>
+): Record<string, string[]> {
+  const buckets: Record<CanonicalSkillCategory, string[]> = {
+    Languages: [],
+    Backend: [],
+    Frontend: [],
+    Database: [],
+    "Cloud & DevOps": [],
+    "Tools & Protocols": [],
+    Testing: [],
+  };
+  const seen = new Set<string>();
+
+  const pending: { category: CanonicalSkillCategory; skill: string }[] = [];
+  for (const [rawCategory, skills] of Object.entries(skillCategories)) {
+    const canonical = resolveCanonicalSkillCategory(rawCategory);
+    if (!canonical) continue;
+    for (const skill of skills) {
+      if (!skillKey(skill)) continue;
+      pending.push({ category: canonical, skill });
+    }
+  }
+
+  for (const label of CANONICAL_SKILL_CATEGORIES) {
+    for (const item of pending) {
+      if (item.category !== label) continue;
+      const key = skillKey(item.skill);
+      if (seen.has(key)) continue;
+      seen.add(key);
+      buckets[label].push(item.skill);
+    }
+  }
+
+  const out: Record<string, string[]> = {};
+  for (const label of CANONICAL_SKILL_CATEGORIES) {
+    if (buckets[label].length > 0) out[label] = buckets[label];
+  }
+  return out;
+}
