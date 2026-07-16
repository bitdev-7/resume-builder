import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  RoleArchetypeAddition,
  RoleArchetypeAdditionInsert,
  RoleArchetypeAdditionUpdate,
  SkillCatalogAddition,
  SkillCatalogAdditionInsert,
  SkillCatalogAdditionUpdate,
} from "@/lib/supabase/database.types";
import { isBuiltinArchetypeId } from "@/lib/tailoring/role-skill-catalog";
import {
  ensureSkillRegistryLoaded,
  invalidateSkillRegistry,
} from "@/lib/tailoring/skill-registry";

/** Error with a machine-readable `code` the API maps to a 409. */
export class CatalogConflictError extends Error {
  code: "stale_version" | "duplicate" | "reserved_id";
  constructor(code: "stale_version" | "duplicate" | "reserved_id", message: string) {
    super(message);
    this.code = code;
  }
}

const ARCHETYPE_ID_RE = /^[a-z0-9_]+$/;

function isPostgresUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === "23505";
}

export interface SkillAdditionRow {
  id: string;
  canonicalName: string;
  aliases: string[];
  version: number;
}

export interface ArchetypeAdditionRow {
  id: string;
  label: string;
  titleKeywords: string[];
  core: string[];
  ecosystem: Record<string, string[]>;
  marketRelevant: string[];
  skillCategoryHints: string[];
  version: number;
}

function skillRow(r: SkillCatalogAddition): SkillAdditionRow {
  return {
    id: r.id,
    canonicalName: r.canonical_name,
    aliases: r.aliases ?? [],
    version: r.version,
  };
}

function archetypeRow(r: RoleArchetypeAddition): ArchetypeAdditionRow {
  return {
    id: r.id,
    label: r.label,
    titleKeywords: r.title_keywords ?? [],
    core: r.core ?? [],
    ecosystem: r.ecosystem ?? {},
    marketRelevant: r.market_relevant ?? [],
    skillCategoryHints: r.skill_category_hints ?? [],
    version: r.version,
  };
}

export async function listSkillAdditions(client: SupabaseClient): Promise<SkillAdditionRow[]> {
  const { data, error } = await client
    .from("skill_catalog_additions")
    .select("id, canonical_name, aliases, version")
    .order("canonical_name", { ascending: true });
  if (error) throw new Error(`Failed to load skill additions: ${error.message}`);
  return (data as unknown as SkillCatalogAddition[] | null ?? []).map(skillRow);
}

export async function listArchetypeAdditions(client: SupabaseClient): Promise<ArchetypeAdditionRow[]> {
  const { data, error } = await client
    .from("role_archetype_additions")
    .select(
      "id, label, title_keywords, core, ecosystem, market_relevant, skill_category_hints, version"
    )
    .order("id", { ascending: true });
  if (error) throw new Error(`Failed to load archetype additions: ${error.message}`);
  return (data as unknown as RoleArchetypeAddition[] | null ?? []).map(archetypeRow);
}

/**
 * Create or update a custom skill. When `id` is omitted a new row is inserted;
 * when provided, `version` must match the current row (optimistic lock).
 * Returns the resulting row.
 */
export async function upsertSkillAddition(
  client: SupabaseClient,
  input: {
    id?: string;
    canonicalName: string;
    aliases: string[];
    version?: number;
    createdBy?: string | null;
  }
): Promise<SkillAdditionRow> {
  const canonicalName = input.canonicalName.trim();
  if (!canonicalName) throw new Error("canonicalName is required");
  const aliases = (input.aliases ?? []).map((a) => a.trim()).filter(Boolean);

  if (input.id) {
    if (typeof input.version !== "number") {
      throw new CatalogConflictError("stale_version", "version is required for updates");
    }
    const { data, error } = await client
      .from("skill_catalog_additions")
      .update({
        canonical_name: canonicalName,
        aliases,
        version: input.version + 1,
      } as SkillCatalogAdditionUpdate)
      .eq("id", input.id)
      .eq("version", input.version)
      .select("id, canonical_name, aliases, version")
      .maybeSingle();

    if (error) throw new Error(`Failed to update skill: ${error.message}`);
    if (!data) throw new CatalogConflictError("stale_version", "Skill was modified by another user");
    invalidateSkillRegistry();
    return skillRow(data as unknown as SkillCatalogAddition);
  }

  const insert: SkillCatalogAdditionInsert = {
    canonical_name: canonicalName,
    aliases,
    ...(input.createdBy ? { created_by: input.createdBy } : {}),
  };
  const { data, error } = await client
    .from("skill_catalog_additions")
    .insert(insert)
    .select("id, canonical_name, aliases, version")
    .maybeSingle();

  if (error) {
    if (isPostgresUniqueViolation(error)) {
      throw new CatalogConflictError("duplicate", `Skill "${canonicalName}" already exists`);
    }
    throw new Error(`Failed to create skill: ${error.message}`);
  }
  if (!data) throw new Error("Failed to create skill");
  invalidateSkillRegistry();
  return skillRow(data as unknown as SkillCatalogAddition);
}

export async function deleteSkillAddition(
  client: SupabaseClient,
  input: { id: string; version: number }
): Promise<void> {
  const { data, error } = await client
    .from("skill_catalog_additions")
    .delete()
    .eq("id", input.id)
    .eq("version", input.version)
    .select("id");
  if (error) throw new Error(`Failed to delete skill: ${error.message}`);
  if (!data || (data as unknown[]).length === 0) {
    throw new CatalogConflictError("stale_version", "Skill was modified or already deleted");
  }
  invalidateSkillRegistry();
}

/**
 * Create or update a custom archetype. Rejects ids that shadow a built-in archetype.
 */
export async function upsertArchetypeAddition(
  client: SupabaseClient,
  input: {
    id: string;
    label: string;
    titleKeywords: string[];
    core: string[];
    ecosystem: Record<string, string[]>;
    marketRelevant: string[];
    skillCategoryHints: string[];
    version?: number;
    createdBy?: string | null;
  }
): Promise<ArchetypeAdditionRow> {
  const id = input.id.trim();
  if (!id || !ARCHETYPE_ID_RE.test(id)) {
    throw new Error("id is required and must match /^[a-z0-9_]+$/");
  }
  if (isBuiltinArchetypeId(id)) {
    throw new CatalogConflictError("reserved_id", `Archetype id "${id}" is reserved`);
  }
  const label = input.label.trim();
  if (!label) throw new Error("label is required");

  const payload: RoleArchetypeAdditionInsert | RoleArchetypeAdditionUpdate = {
    label,
    title_keywords: input.titleKeywords ?? [],
    core: input.core ?? [],
    ecosystem: input.ecosystem ?? {},
    market_relevant: input.marketRelevant ?? [],
    skill_category_hints: input.skillCategoryHints ?? [],
  };

  if (typeof input.version === "number") {
    // Update existing custom archetype.
    const { data, error } = await client
      .from("role_archetype_additions")
      .update({ ...payload, version: input.version + 1 } as RoleArchetypeAdditionUpdate)
      .eq("id", id)
      .eq("version", input.version)
      .select(
        "id, label, title_keywords, core, ecosystem, market_relevant, skill_category_hints, version"
      )
      .maybeSingle();
    if (error) throw new Error(`Failed to update archetype: ${error.message}`);
    if (!data) throw new CatalogConflictError("stale_version", "Archetype was modified by another user");
    invalidateSkillRegistry();
    return archetypeRow(data as unknown as RoleArchetypeAddition);
  }

  // Insert new custom archetype.
  const insert: RoleArchetypeAdditionInsert = {
    id,
    label,
    title_keywords: input.titleKeywords ?? [],
    core: input.core ?? [],
    ecosystem: input.ecosystem ?? {},
    market_relevant: input.marketRelevant ?? [],
    skill_category_hints: input.skillCategoryHints ?? [],
    ...(input.createdBy ? { created_by: input.createdBy } : {}),
  };
  const { data, error } = await client
    .from("role_archetype_additions")
    .insert(insert)
    .select("id, label, title_keywords, core, ecosystem, market_relevant, skill_category_hints, version")
    .maybeSingle();
  if (error) {
    if (isPostgresUniqueViolation(error)) {
      throw new CatalogConflictError("duplicate", `Archetype "${id}" already exists`);
    }
    throw new Error(`Failed to create archetype: ${error.message}`);
  }
  if (!data) throw new Error("Failed to create archetype");
  invalidateSkillRegistry();
  return archetypeRow(data as unknown as RoleArchetypeAddition);
}

export async function deleteArchetypeAddition(
  client: SupabaseClient,
  input: { id: string; version: number }
): Promise<void> {
  if (isBuiltinArchetypeId(input.id)) {
    throw new CatalogConflictError("reserved_id", "Cannot delete a built-in archetype");
  }
  const { data, error } = await client
    .from("role_archetype_additions")
    .delete()
    .eq("id", input.id)
    .eq("version", input.version)
    .select("id");
  if (error) throw new Error(`Failed to delete archetype: ${error.message}`);
  if (!data || (data as unknown[]).length === 0) {
    throw new CatalogConflictError("stale_version", "Archetype was modified or already deleted");
  }
  invalidateSkillRegistry();
}

/** Ensure the registry is loaded (used by the GET route so additions are populated). */
export async function refreshRegistry(client: SupabaseClient): Promise<void> {
  await ensureSkillRegistryLoaded(client);
}
