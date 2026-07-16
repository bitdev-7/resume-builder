import type { CatalogFileName } from "@/lib/tailoring/catalog-io";
import { CATALOG_FILE_NAMES } from "@/lib/tailoring/catalog-io";
import type { CatalogPatch } from "@/lib/tailoring/catalog-schemas";
import {
  alternativeGroupsSchema,
  catalogVersionSchema,
  roleSkillCatalogSchema,
  skillAliasesSchema,
  skillRelationshipsSchema,
} from "@/lib/tailoring/catalog-schemas";
import type { AlternativeGroup, SkillRelationship } from "@/lib/tailoring/skill-ontology";
import type { RoleSkillCatalogEntry } from "@/lib/types/tailoring";

export interface ParsedCatalog {
  version: string;
  skillAliases: Record<string, string[]>;
  relationships: SkillRelationship[];
  alternativeGroups: AlternativeGroup[];
  roleSkillCatalog: Record<string, RoleSkillCatalogEntry>;
}

export interface MergeSummary {
  aliasesAdded: number;
  relationshipsAdded: number;
  alternativeGroupsTouched: number;
  archetypeAction: "create" | "merge";
  archetypeId: string;
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = String(value || "").trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function unionAliases(
  existing: string[] | undefined,
  incoming: string[]
): { merged: string[]; added: number } {
  const merged = [...(existing ?? [])];
  const seen = new Set(merged.map((a) => a.toLowerCase()));
  let added = 0;
  for (const alias of incoming) {
    const trimmed = String(alias || "").trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(trimmed);
    added += 1;
  }
  return { merged, added };
}

function relationshipKey(rel: SkillRelationship): string {
  return `${rel.from}\0${rel.to}\0${rel.type}`;
}

export function parseCatalogFromFiles(
  files: Record<CatalogFileName, string>
): ParsedCatalog {
  const version = catalogVersionSchema.parse(
    JSON.parse(files["catalog-version.json"])
  ).version;
  const skillAliases = skillAliasesSchema.parse(
    JSON.parse(files["skill-aliases.json"])
  );
  const relationships = skillRelationshipsSchema.parse(
    JSON.parse(files["skill-relationships.json"])
  ) as SkillRelationship[];
  const alternativeGroups = alternativeGroupsSchema.parse(
    JSON.parse(files["alternative-groups.json"])
  ) as AlternativeGroup[];
  const roleSkillCatalog = roleSkillCatalogSchema.parse(
    JSON.parse(files["role-skill-catalog.json"])
  ) as Record<string, RoleSkillCatalogEntry>;

  return {
    version,
    skillAliases,
    relationships,
    alternativeGroups,
    roleSkillCatalog,
  };
}

export function bumpCatalogVersion(current: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const match = current.match(/^(\d{4}-\d{2}-\d{2})\.(\d+)$/);
  if (match && match[1] === today) {
    return `${today}.${Number(match[2]) + 1}`;
  }
  return `${today}.1`;
}

export function mergeCatalogPatch(
  current: ParsedCatalog,
  patch: CatalogPatch
): { merged: ParsedCatalog; summary: MergeSummary } {
  const skillAliases = { ...current.skillAliases };
  let aliasesAdded = 0;

  for (const [canonical, incomingAliases] of Object.entries(patch.skillAliases)) {
    const name = String(canonical || "").trim();
    if (!name) continue;
    const existingKey =
      Object.keys(skillAliases).find((k) => k.toLowerCase() === name.toLowerCase()) ?? name;
    const { merged, added } = unionAliases(skillAliases[existingKey], incomingAliases);
    skillAliases[existingKey] = merged;
    aliasesAdded += added;
  }

  const relationships = [...current.relationships];
  let relationshipsAdded = 0;
  const relKeys = new Set(relationships.map(relationshipKey));
  for (const rel of patch.relationships) {
    const key = relationshipKey(rel);
    if (relKeys.has(key)) continue;
    relKeys.add(key);
    relationships.push(rel);
    relationshipsAdded += 1;
  }

  const alternativeGroups = current.alternativeGroups.map((g) => ({
    ...g,
    skills: [...g.skills],
  }));
  let alternativeGroupsTouched = 0;
  for (const incoming of patch.alternativeGroups) {
    const idx = alternativeGroups.findIndex((g) => g.group === incoming.group);
    if (idx >= 0) {
      const before = alternativeGroups[idx].skills.length;
      alternativeGroups[idx] = {
        ...alternativeGroups[idx],
        skills: dedupeStrings([...alternativeGroups[idx].skills, ...incoming.skills]),
      };
      if (alternativeGroups[idx].skills.length !== before) alternativeGroupsTouched += 1;
    } else {
      alternativeGroups.push({
        group: incoming.group,
        relationship: "alternatives",
        skills: dedupeStrings(incoming.skills),
      });
      alternativeGroupsTouched += 1;
    }
  }

  const roleSkillCatalog = { ...current.roleSkillCatalog };
  const { archetype } = patch;
  const patchEntry: RoleSkillCatalogEntry = {
    id: archetype.targetId,
    label: archetype.label,
    titleKeywords: dedupeStrings(archetype.titleKeywords),
    core: dedupeStrings(archetype.core),
    ecosystem: Object.fromEntries(
      Object.entries(archetype.ecosystem).map(([k, v]) => [k, dedupeStrings(v)])
    ),
    marketRelevant: dedupeStrings(archetype.marketRelevant),
    skillCategoryHints: dedupeStrings(archetype.skillCategoryHints),
  };

  if (archetype.action === "create") {
    roleSkillCatalog[archetype.targetId] = patchEntry;
  } else {
    const existing = roleSkillCatalog[archetype.targetId];
    if (!existing) {
      roleSkillCatalog[archetype.targetId] = patchEntry;
    } else {
      const ecosystem = { ...existing.ecosystem };
      for (const [group, skills] of Object.entries(patchEntry.ecosystem)) {
        ecosystem[group] = dedupeStrings([...(ecosystem[group] ?? []), ...skills]);
      }
      roleSkillCatalog[archetype.targetId] = {
        id: archetype.targetId,
        label: patchEntry.label || existing.label,
        titleKeywords: dedupeStrings([...existing.titleKeywords, ...patchEntry.titleKeywords]),
        core: dedupeStrings([...existing.core, ...patchEntry.core]),
        ecosystem,
        marketRelevant: dedupeStrings([...existing.marketRelevant, ...patchEntry.marketRelevant]),
        skillCategoryHints: dedupeStrings([
          ...existing.skillCategoryHints,
          ...patchEntry.skillCategoryHints,
        ]),
      };
    }
  }

  return {
    merged: {
      ...current,
      skillAliases,
      relationships,
      alternativeGroups,
      roleSkillCatalog,
    },
    summary: {
      aliasesAdded,
      relationshipsAdded,
      alternativeGroupsTouched,
      archetypeAction: archetype.action,
      archetypeId: archetype.targetId,
    },
  };
}

export function serializeCatalog(catalog: ParsedCatalog): Record<CatalogFileName, string> {
  const files = {
    "catalog-version.json": JSON.stringify({ version: catalog.version }, null, 2) + "\n",
    "skill-aliases.json": JSON.stringify(catalog.skillAliases, null, 2) + "\n",
    "skill-relationships.json": JSON.stringify(catalog.relationships, null, 2) + "\n",
    "alternative-groups.json": JSON.stringify(catalog.alternativeGroups, null, 2) + "\n",
    "role-skill-catalog.json": JSON.stringify(catalog.roleSkillCatalog, null, 2) + "\n",
  } satisfies Record<CatalogFileName, string>;

  for (const name of CATALOG_FILE_NAMES) {
    if (!files[name]) throw new Error(`Missing serialized file: ${name}`);
  }
  return files;
}
