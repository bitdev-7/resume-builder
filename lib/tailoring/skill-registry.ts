import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  RoleArchetypeAddition,
  SkillCatalogAddition,
} from "@/lib/supabase/database.types";
import type { RoleSkillCatalogEntry } from "@/lib/types/tailoring";
import {
  registerSkillAlias,
  registerRelationship,
  resetMentionMatchersCache,
  unregisterSkillAlias,
  getBuiltinSkillAliasesSnapshot,
  type SkillRelationship,
} from "@/lib/tailoring/skill-ontology";
import {
  ROLE_SKILL_CATALOG_VERSION,
  isBuiltinArchetypeId,
  registerArchetype,
  unregisterArchetype,
  getBuiltinRoleCatalog,
} from "@/lib/tailoring/role-skill-catalog";

/**
 * Central registry that layers user-supplied "additions" (custom skills/aliases
 * and custom archetypes, stored in Supabase) on top of the built-in defaults.
 *
 * The merged result lives in the skill-ontology and role-skill-catalog module
 * state (mutated via the register/unregister mutators). Because additions are a
 * single shared global set, mutating module state is safe across concurrent
 * requests — every request converges on the same merged catalog.
 */

export interface SkillAdditionPayload {
  id: string;
  canonicalName: string;
  aliases: string[];
  version: number;
}

export interface ArchetypeAdditionPayload {
  id: string;
  label: string;
  titleKeywords: string[];
  core: string[];
  ecosystem: Record<string, string[]>;
  marketRelevant: string[];
  skillCategoryHints: string[];
  version: number;
}

export interface EffectiveCatalog {
  version: string;
  defaults: {
    skills: { canonicalName: string; aliases: string[] }[];
    archetypes: RoleSkillCatalogEntry[];
  };
  additions: {
    skills: SkillAdditionPayload[];
    archetypes: ArchetypeAdditionPayload[];
  };
}

interface RegistryCache {
  /** ISO timestamp of the newest updated_at across both tables when loaded. */
  stamp: string;
  skills: SkillAdditionPayload[];
  archetypes: ArchetypeAdditionPayload[];
}

let cache: RegistryCache | null = null;
/** Canonical skill names currently applied to module state (so deletions can be reversed). */
const appliedSkillNames = new Set<string>();
/** Custom archetype ids currently applied to module state. */
const appliedArchetypeIds = new Set<string>();

function rowToSkill(row: SkillCatalogAddition): SkillAdditionPayload {
  return {
    id: row.id,
    canonicalName: row.canonical_name,
    aliases: row.aliases ?? [],
    version: row.version,
  };
}

function rowToArchetype(row: RoleArchetypeAddition): ArchetypeAdditionPayload {
  return {
    id: row.id,
    label: row.label,
    titleKeywords: row.title_keywords ?? [],
    core: row.core ?? [],
    ecosystem: row.ecosystem ?? {},
    marketRelevant: row.market_relevant ?? [],
    skillCategoryHints: row.skill_category_hints ?? [],
    version: row.version,
  };
}

function archetypePayloadToEntry(p: ArchetypeAdditionPayload): RoleSkillCatalogEntry {
  return {
    id: p.id,
    label: p.label,
    titleKeywords: p.titleKeywords,
    core: p.core,
    ecosystem: p.ecosystem,
    marketRelevant: p.marketRelevant,
    skillCategoryHints: p.skillCategoryHints,
  };
}

/** Convert a custom archetype's ecosystem/core into `requires` relationships for the ontology. */
function relationshipsForArchetype(p: ArchetypeAdditionPayload): SkillRelationship[] {
  const rels: SkillRelationship[] = [];
  // Custom frameworks in core/ecosystem that imply Python? We can't assume a
  // target language for arbitrary custom archetypes, so we register no
  // auto-entailment edges here. (Relationships can be added explicitly later
  // via a dedicated skill-relationship editor if needed.)
  return rels;
}

async function loadAdditions(client: SupabaseClient): Promise<RegistryCache> {
  const [skillsRes, archetypesRes] = await Promise.all([
    client
      .from("skill_catalog_additions")
      .select("id, canonical_name, aliases, version, updated_at")
      .order("canonical_name", { ascending: true }),
    client
      .from("role_archetype_additions")
      .select(
        "id, label, title_keywords, core, ecosystem, market_relevant, skill_category_hints, version, updated_at"
      )
      .order("id", { ascending: true }),
  ]);

  if (skillsRes.error) throw new Error(`Failed to load skill additions: ${skillsRes.error.message}`);
  if (archetypesRes.error)
    throw new Error(`Failed to load archetype additions: ${archetypesRes.error.message}`);

  const skillRows = (skillsRes.data ?? []) as unknown as SkillCatalogAddition[];
  const archetypeRows = (archetypesRes.data ?? []) as unknown as RoleArchetypeAddition[];

  const skills = skillRows.map(rowToSkill);
  const archetypes = archetypeRows.map(rowToArchetype);

  const stamps = [
    ...skillRows.map((r) => r.updated_at ?? ""),
    ...archetypeRows.map((r) => r.updated_at ?? ""),
  ].filter(Boolean);
  const stamp = stamps.length ? stamps.sort().slice(-1)[0] : "empty";

  return { stamp, skills, archetypes };
}

/**
 * Reconciles module state to match `next`: registers additions that are new or
 * changed, and unregisters ones that were removed. Idempotent — calling with the
 * same `next` twice is a no-op on the second call.
 */
function reconcile(next: RegistryCache): void {
  // --- Skills ---
  const nextSkillNames = new Set(next.skills.map((s) => s.canonicalName));
  // Remove skills no longer present.
  for (const name of Array.from(appliedSkillNames)) {
    if (!nextSkillNames.has(name)) {
      unregisterSkillAlias(name);
      appliedSkillNames.delete(name);
    }
  }
  // Add/refresh skills.
  for (const skill of next.skills) {
    registerSkillAlias(skill.canonicalName, skill.aliases);
    appliedSkillNames.add(skill.canonicalName);
  }

  // --- Archetypes ---
  const nextArchetypeIds = new Set(next.archetypes.map((a) => a.id));
  // Remove archetypes no longer present (only custom ones — unregisterArchetype guards built-ins).
  for (const id of Array.from(appliedArchetypeIds)) {
    if (!nextArchetypeIds.has(id)) {
      unregisterArchetype(id);
      appliedArchetypeIds.delete(id);
    }
  }
  // Add/refresh archetypes.
  for (const archetype of next.archetypes) {
    if (isBuiltinArchetypeId(archetype.id)) continue; // never shadow a built-in
    registerArchetype(archetypePayloadToEntry(archetype));
    for (const rel of relationshipsForArchetype(archetype)) registerRelationship(rel);
    appliedArchetypeIds.add(archetype.id);
  }

  resetMentionMatchersCache();
}

/**
 * Ensures the registry (and pipeline module state) reflects the latest
 * additions from Supabase. Cheap when the cache is fresh (one count/aggregate
 * check); reloads + reconciles only when the data has changed. Safe to call
 * on every generation.
 */
export async function ensureSkillRegistryLoaded(client: SupabaseClient): Promise<void> {
  // Cheap freshness probe: max(updated_at) across both tables.
  const [skillMax, archMax] = await Promise.all([
    client
      .from("skill_catalog_additions")
      .select("updated_at")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    client
      .from("role_archetype_additions")
      .select("updated_at")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const latestStamp =
    [skillMax.data?.updated_at, archMax.data?.updated_at].filter(Boolean).sort().slice(-1)[0] ??
    "empty";

  if (cache && cache.stamp === latestStamp) return; // fresh

  const next = await loadAdditions(client);
  cache = next;
  reconcile(next);
}

/** Drop the cache so the next `ensureSkillRegistryLoaded` reloads. Call after any mutation. */
export function invalidateSkillRegistry(): void {
  cache = null;
}

/**
 * Returns the effective catalog (built-in defaults + user additions) for the
 * GET API. Does not mutate pipeline state.
 */
export function getEffectiveCatalog(): EffectiveCatalog {
  const skills = (cache?.skills ?? []).map((s) => ({
    id: s.id,
    canonicalName: s.canonicalName,
    aliases: s.aliases,
    version: s.version,
  }));
  const archetypes = (cache?.archetypes ?? []).map((a) => ({ ...a }));

  return {
    version: ROLE_SKILL_CATALOG_VERSION,
    defaults: {
      skills: Object.entries(getBuiltinSkillAliasesSnapshot()).map(([canonicalName, aliases]) => ({
        canonicalName,
        aliases,
      })),
      archetypes: Object.values(getBuiltinRoleCatalog()),
    },
    additions: { skills, archetypes },
  };
}
