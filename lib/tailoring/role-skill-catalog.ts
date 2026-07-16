import type { RoleSkillCatalogEntry } from "@/lib/types/tailoring";
import catalogVersion from "../../data/tailoring/catalog-version.json";
import roleCatalogJson from "../../data/tailoring/role-skill-catalog.json";

/**
 * Versioned role-skill catalog. Built-in defaults live in
 * data/tailoring/role-skill-catalog.json; DB additions are merged at runtime
 * via skill-registry.ts.
 */
export let ROLE_SKILL_CATALOG_VERSION = catalogVersion.version;

let builtinRoleCatalog = roleCatalogJson as Record<string, RoleSkillCatalogEntry>;

/** Mutable runtime catalog — cloned from JSON defaults, extended by DB additions. */
export const ROLE_SKILL_CATALOG: Record<string, RoleSkillCatalogEntry> = structuredClone(
  builtinRoleCatalog
);

export function getRoleCatalogEntry(archetypeId: string): RoleSkillCatalogEntry | undefined {
  return ROLE_SKILL_CATALOG[archetypeId];
}

export function listRoleArchetypeIds(): string[] {
  return Object.keys(ROLE_SKILL_CATALOG);
}

/** All skills mentioned in an archetype's core + ecosystem groups (not marketRelevant). */
export function getArchetypeRoleSkills(archetypeId: string): {
  core: string[];
  ecosystem: string[];
} {
  const entry = ROLE_SKILL_CATALOG[archetypeId];
  if (!entry) return { core: [], ecosystem: [] };
  const ecosystem = Object.values(entry.ecosystem).flat();
  return { core: entry.core, ecosystem };
}

/** Built-in archetype entries from JSON (before DB additions). */
export function getBuiltinRoleCatalog(): Record<string, RoleSkillCatalogEntry> {
  return structuredClone(builtinRoleCatalog);
}

/** Snapshot of the built-in archetype ids — updated when catalog is reloaded from disk. */
let BUILTIN_ARCHETYPE_IDS = new Set<string>(Object.keys(builtinRoleCatalog));

export function isBuiltinArchetypeId(id: string): boolean {
  return BUILTIN_ARCHETYPE_IDS.has(id);
}

export function registerArchetype(entry: RoleSkillCatalogEntry): boolean {
  if (!entry || !entry.id || BUILTIN_ARCHETYPE_IDS.has(entry.id)) return false;
  ROLE_SKILL_CATALOG[entry.id] = entry;
  return true;
}

export function unregisterArchetype(id: string): boolean {
  if (!id || BUILTIN_ARCHETYPE_IDS.has(id)) return false;
  return delete ROLE_SKILL_CATALOG[id];
}

/** Replace built-in role catalog from disk/catalog apply (DB additions re-applied separately). */
export function reloadBuiltinRoleSkillCatalog(
  version: string,
  catalog: Record<string, RoleSkillCatalogEntry>
): void {
  ROLE_SKILL_CATALOG_VERSION = version;
  builtinRoleCatalog = structuredClone(catalog);
  BUILTIN_ARCHETYPE_IDS = new Set(Object.keys(builtinRoleCatalog));

  for (const key of Object.keys(ROLE_SKILL_CATALOG)) delete ROLE_SKILL_CATALOG[key];
  Object.assign(ROLE_SKILL_CATALOG, structuredClone(catalog));
}
