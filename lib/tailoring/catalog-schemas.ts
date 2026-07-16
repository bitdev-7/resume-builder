import { z } from "zod";

export const catalogVersionSchema = z.object({
  version: z.string().min(1),
});

export const skillAliasesSchema = z.record(z.string(), z.array(z.string()));

const skillRelationshipSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  type: z.enum([
    "requires",
    "strongly_implies",
    "commonly_used_with",
    "alternative_to",
    "same_ecosystem",
    "market_adjacent",
  ]),
  confidence: z.number().min(0).max(1),
});

export const skillRelationshipsSchema = z.array(skillRelationshipSchema);

const alternativeGroupSchema = z.object({
  group: z.string().min(1),
  relationship: z.literal("alternatives"),
  skills: z.array(z.string().min(1)).min(1),
});

export const alternativeGroupsSchema = z.array(alternativeGroupSchema);

const roleSkillCatalogEntrySchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  label: z.string().min(1),
  titleKeywords: z.array(z.string()),
  core: z.array(z.string()),
  ecosystem: z.record(z.string(), z.array(z.string())),
  marketRelevant: z.array(z.string()),
  skillCategoryHints: z.array(z.string()),
});

export const roleSkillCatalogSchema = z.record(z.string(), roleSkillCatalogEntrySchema);

export const catalogFileSchemas = {
  "catalog-version.json": catalogVersionSchema,
  "skill-aliases.json": skillAliasesSchema,
  "skill-relationships.json": skillRelationshipsSchema,
  "alternative-groups.json": alternativeGroupsSchema,
  "role-skill-catalog.json": roleSkillCatalogSchema,
} as const;

export type CatalogFileSchemas = typeof catalogFileSchemas;

const catalogPatchArchetypeSchema = z.object({
  action: z.enum(["create", "merge"]),
  targetId: z.string().regex(/^[a-z0-9_]+$/),
  label: z.string().min(1),
  titleKeywords: z.array(z.string()),
  core: z.array(z.string()),
  ecosystem: z.record(z.string(), z.array(z.string())),
  marketRelevant: z.array(z.string()),
  skillCategoryHints: z.array(z.string()),
  mergeReason: z.string().optional(),
});

export const catalogPatchSchema = z.object({
  archetype: catalogPatchArchetypeSchema,
  skillAliases: skillAliasesSchema,
  relationships: skillRelationshipsSchema,
  alternativeGroups: alternativeGroupsSchema,
});

export type CatalogPatch = z.infer<typeof catalogPatchSchema>;
export type CatalogPatchArchetype = z.infer<typeof catalogPatchArchetypeSchema>;
