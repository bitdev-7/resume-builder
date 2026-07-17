import { z } from "zod";

/** Zod schemas for validating structured LLM output at each AI-backed pipeline stage. */

// Tolerant of model variance: an unrecognized value falls back to a safe default
// rather than failing the whole pipeline (models sometimes swap type/category, e.g.
// putting "contextual" — a type — into the category field).
export const requirementTypeSchema = z
  .enum(["must_have", "preferred", "optional", "contextual"])
  .catch("contextual");

export const requirementCategorySchema = z
  .enum([
    "technology",
    "architecture",
    "responsibility",
    "methodology",
    "domain",
    "soft_skill",
    "education",
    "experience",
  ])
  .catch("responsibility");

export const jdRequirementSchema = z.object({
  text: z.string().min(1),
  type: requirementTypeSchema,
  category: requirementCategorySchema,
  canonicalTerm: z.string().nullable().optional().default(null),
});

/** Invalid values fail validation (unlike type/category which use .catch). */
export const clearanceStatusSchema = z
  .enum(["active_required", "obtain_required", "eligibility_required", "preferred"])
  .nullable()
  .optional()
  .default(null);

export const jdAnalysisAiOutputSchema = z.object({
  normalizedTitle: z.string().min(1),
  seniority: z.string().default("unspecified"),
  roleFamily: z.string().default("software_engineering"),
  domains: z.array(z.string()).default([]),
  requirements: z.array(jdRequirementSchema).default([]),
  responsibilityThemes: z.array(z.string()).default([]),
  atsTerms: z.array(z.string()).default([]),
  clearanceRequired: z.boolean().default(false),
  clearanceType: z.string().nullable().optional().default(null),
  clearanceStatus: clearanceStatusSchema,
  clearanceRequirementText: z.string().nullable().optional().default(null),
});

export type JDAnalysisAiOutput = z.infer<typeof jdAnalysisAiOutputSchema>;

export const generatedBulletSchema = z.object({
  text: z.string().min(1),
  evidenceIds: z.array(z.string()).default([]),
  requirementIds: z.array(z.string()).default([]),
});

export const experienceGenerationAiOutputSchema = z.object({
  experienceId: z.string().min(1),
  bullets: z.array(generatedBulletSchema).default([]),
});

export type ExperienceGenerationAiOutput = z.infer<typeof experienceGenerationAiOutputSchema>;

/** Batched variant: one LLM call returns bullets for every experience at once. */
export const batchedExperienceGenerationAiOutputSchema = z.object({
  experiences: z.array(experienceGenerationAiOutputSchema).default([]),
});

export type BatchedExperienceGenerationAiOutput = z.infer<
  typeof batchedExperienceGenerationAiOutputSchema
>;

export const composerAiOutputSchema = z.object({
  summary: z.string().min(1),
  skillCategories: z.record(z.array(z.string())).default({}),
  softSkills: z.array(z.string()).default([]),
  projects: z
    .array(
      z.object({
        id: z.string().min(1),
        description: z.string().default(""),
        technologies: z.array(z.string()).default([]),
      })
    )
    .default([]),
});

export type ComposerAiOutput = z.infer<typeof composerAiOutputSchema>;
