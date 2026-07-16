import { readAllCatalogFilesRaw } from "@/lib/tailoring/catalog-io";
import { parseCatalogFromFiles } from "@/lib/tailoring/catalog-merge";
import type { ParsedCatalog } from "@/lib/tailoring/catalog-merge";
import { reloadBuiltinRoleSkillCatalog } from "@/lib/tailoring/role-skill-catalog";
import { reloadBuiltinSkillOntology } from "@/lib/tailoring/skill-ontology";
import { invalidateSkillRegistry } from "@/lib/tailoring/skill-registry";

export function reloadBuiltinCatalogFromParsed(catalog: ParsedCatalog): void {
  reloadBuiltinSkillOntology(
    catalog.skillAliases,
    catalog.relationships,
    catalog.alternativeGroups
  );
  reloadBuiltinRoleSkillCatalog(catalog.version, catalog.roleSkillCatalog);
  invalidateSkillRegistry();
}

export async function reloadBuiltinCatalogFromDisk(): Promise<void> {
  const files = await readAllCatalogFilesRaw();
  const catalog = parseCatalogFromFiles(files);
  reloadBuiltinCatalogFromParsed(catalog);
}
