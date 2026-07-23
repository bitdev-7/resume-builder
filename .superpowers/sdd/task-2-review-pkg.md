Base: c44d584b6c82dfbce626f0101ccac4cb21e7c50b
Head: c92f44ea7f9a2eb10c8dbb305aa759e01e7edb0a

## Commits
c92f44e feat: normalize composer skill categories to canonical set

## Stat
 lib/tailoring/composer.test.ts | 68 ++++++++++++++++++++++++++++++++++++++----
 lib/tailoring/composer.ts      | 28 +++++++++--------
 2 files changed, 78 insertions(+), 18 deletions(-)

## Diff
diff --git a/lib/tailoring/composer.test.ts b/lib/tailoring/composer.test.ts
index 45dfce5..0210902 100644
--- a/lib/tailoring/composer.test.ts
+++ b/lib/tailoring/composer.test.ts
@@ -1,13 +1,14 @@
 import { describe, expect, it, vi } from "vitest";
 import type { ResolvedAIRequest } from "@/lib/ai-api";
 import type { ComposerInput } from "@/lib/prompts/composer-prompt";
+import { CANONICAL_SKILL_CATEGORIES } from "@/lib/tailoring/skill-categories";
 
 const callAIMock = vi.fn();
 
 vi.mock("@/lib/ai-provider", async (importOriginal) => {
   const actual = await importOriginal<typeof import("@/lib/ai-provider")>();
   return { ...actual, callAI: callAIMock };
 });
 
 const { composeResumeTopSection, ensureAllEligibleSkills, DEFAULT_SKILL_BUDGET } = await import(
   "@/lib/tailoring/composer"
@@ -46,40 +47,95 @@ describe("composer ΓÇö skill categories", () => {
       categoryHints: ["Backend"],
       projects: [],
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
diff --git a/lib/tailoring/composer.ts b/lib/tailoring/composer.ts
index 3193236..75f0bf0 100644
--- a/lib/tailoring/composer.ts
+++ b/lib/tailoring/composer.ts
@@ -3,20 +3,25 @@ import type { AIMessage } from "@/lib/ai-provider";
 import type { ResolvedAIRequest } from "@/lib/ai-api";
 import {
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
  * Last-resort fallback if the composer AI call fails outright (network/API
  * failure, unparseable output) ΓÇö keeps the pipeline from hard-failing the
@@ -26,38 +31,36 @@ export const DEFAULT_SKILL_BUDGET: SkillBudgetConfig = {
 export function buildDeterministicComposerFallback(input: {
   normalizedTitle: string;
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
   for (const skills of Object.values(composerResult.skillCategories)) {
     for (const s of skills) present.add(skillKey(s));
@@ -65,28 +68,29 @@ export function ensureAllEligibleSkills(
 
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
 
 /**
  * Stage 8 ΓÇö summary/skills/projects. Runs only after experience bullets exist.
@@ -159,17 +163,17 @@ export async function composeResumeTopSection(
       if (!key || seenKeys.has(key)) continue;
       seenKeys.add(key);
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
