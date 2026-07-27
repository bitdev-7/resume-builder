Base: c32b5ed32d9ee191dad8bb414e7f1db741689777
Head: 0985b3ac88d8e4ab86f9948eee155db577e1aef5

## Commits
0985b3a feat: enforce 60% main-skill coverage in experience bullets

## Diff
diff --git a/lib/prompts/experience-writer-prompt.ts b/lib/prompts/experience-writer-prompt.ts
index 1169373..ff91602 100644
--- a/lib/prompts/experience-writer-prompt.ts
+++ b/lib/prompts/experience-writer-prompt.ts
@@ -44,16 +44,19 @@ Reference material policy:
 Experience skill policy:
 - Incorporate as many targetSkills as possible within this experience.
 - Every targetSkill that is historically compatible with the employment period should appear naturally as hands-on work in one or more bullets.
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
 - Quantify impact only when supported by evidence or when using conservative, realistic estimates that do not materially misrepresent the experience.
 - Never fabricate awards, promotions, patents, certifications, leadership titles, customers, revenue figures, compliance claims, security clearances, or major business outcomes.
 - Never alter the experience title, company, or employment dates.
@@ -141,16 +144,18 @@ export interface ExperienceWriterInput {
   title: string;
   company: string;
   startDate: string;
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
 
 export function buildExperienceWriterUserPrompt(input: ExperienceWriterInput): string {
   const payload = {
     experienceId: input.experienceId,
@@ -163,16 +168,17 @@ export function buildExperienceWriterUserPrompt(input: ExperienceWriterInput): s
     referenceEvidence: input.allowedEvidence.map((f) => ({
       id: f.id,
       text: f.text,
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
     ? `\n\nADDITIONAL USER-CONFIGURED INSTRUCTIONS (apply unless they conflict with producing a strong JD-aligned resume):\n${input.extraInstructions.trim()}`
     : "";
 
@@ -192,16 +198,17 @@ export function buildExperienceWriterBatchedUserPrompt(inputs: ExperienceWriterI
     referenceEvidence: input.allowedEvidence.map((f) => ({
       id: f.id,
       text: f.text,
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
 
   const sharedExtra = inputs.every((i) => i.extraInstructions?.trim()) &&
     new Set(inputs.map((i) => i.extraInstructions?.trim())).size === 1
     ? `\n\nADDITIONAL USER-CONFIGURED INSTRUCTIONS (apply to every experience, unless they conflict with producing a strong JD-aligned resume):\n${inputs[0].extraInstructions!.trim()}`
diff --git a/lib/tailoring/pipeline.ts b/lib/tailoring/pipeline.ts
index 0aa170a..1a2deba 100644
--- a/lib/tailoring/pipeline.ts
+++ b/lib/tailoring/pipeline.ts
@@ -25,16 +25,20 @@ import {
   DEFAULT_SKILL_BUDGET,
 } from "@/lib/tailoring/composer";
 import type { ComposerInput } from "@/lib/prompts/composer-prompt";
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
   jd: string;
   profileData: LegacyAnalyzeProfile;
   aiRequest: ResolvedAIRequest;
@@ -253,16 +257,19 @@ export async function runTailoringPipeline(
         .filter(Boolean)
         .map((n) => [skillKey(n), n] as const)
     ).values()
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
 
     const allowedSkills = expPlan.relevantSkillIds
       .map((id) => candidateById.get(id)?.canonicalName)
       .filter((name): name is string => Boolean(name));
@@ -276,16 +283,17 @@ export async function runTailoringPipeline(
       experienceId: exp.id,
       title: exp.title,
       company: exp.company,
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
 
   const buildFallback = buildFallbackFactory(experiencesById);
 
@@ -371,19 +379,19 @@ export async function runTailoringPipeline(
     experienceMode,
     buildFallback,
     promptOverrides,
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
   for (const r of coveredExperienceResults) {
     for (const b of r.bullets) {
       for (const mention of detectSkillMentions(b.text)) introducedSkillNames.add(mention);
