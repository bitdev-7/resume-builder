import { z } from "zod";

/** Zod schemas for validating structured LLM output at each AI-backed pipeline stage. */

export const requirementTypeSchema = z.enum(["must_have", "preferred", "optional", "contextual"]);

export const requirementCategorySchema = z.enum([
  "technology",
  "architecture",
  "responsibility",
  "methodology",
  "domain",
  "soft_skill",
  "education",
  "experience",
]);

export const jdRequirementSchema = z.object({
  text: z.string().min(1),
  type: requirementTypeSchema,
  category: requirementCategorySchema,
  canonicalTerm: z.string().nullable().optional().default(null),
});

export const jdAnalysisAiOutputSchema = z.object({
  normalizedTitle: z.string().min(1),
  seniority: z.string().default("unspecified"),
  roleFamily: z.string().default("software_engineering"),
  domains: z.array(z.string()).default([]),
  requirements: z.array(jdRequirementSchema).default([]),
  responsibilityThemes: z.array(z.string()).default([]),
  atsTerms: z.array(z.string()).default([]),
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
