import type { CatalogFileName } from "@/lib/tailoring/catalog-io";
import { CATALOG_FILE_NAMES, readAllCatalogFilesRaw } from "@/lib/tailoring/catalog-io";
import { catalogFileSchemas, catalogPatchSchema, type CatalogPatch } from "@/lib/tailoring/catalog-schemas";
import {
  mergeCatalogPatch,
  parseCatalogFromFiles,
  serializeCatalog,
  type MergeSummary,
} from "@/lib/tailoring/catalog-merge";

export interface CatalogVerifyIssue {
  file: CatalogFileName | "(unknown)" | "proposal";
  path?: string;
  message: string;
  kind: "json_syntax" | "schema" | "cross_check";
}

export interface CatalogVerifyResult {
  valid: boolean;
  issues: CatalogVerifyIssue[];
  checkedFiles: CatalogFileName[];
  dryRunMerge?: MergeSummary;
}

function zodPath(path: (string | number)[]): string {
  if (path.length === 0) return "";
  return path.map((p) => (typeof p === "number" ? `[${p}]` : p)).join(".");
}

export function verifyCatalogJsonContents(
  files: Record<CatalogFileName, string>
): CatalogVerifyResult {
  const issues: CatalogVerifyIssue[] = [];
  const checkedFiles: CatalogFileName[] = [];

  for (const name of CATALOG_FILE_NAMES) {
    checkedFiles.push(name);
    const raw = files[name];
    if (raw === undefined) {
      issues.push({ file: name, kind: "schema", message: "File is missing from input" });
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      issues.push({
        file: name,
        kind: "json_syntax",
        message: error instanceof Error ? error.message : "Invalid JSON",
      });
      continue;
    }

    const schema = catalogFileSchemas[name];
    const result = schema.safeParse(parsed);
    if (!result.success) {
      for (const issue of result.error.issues) {
        issues.push({
          file: name,
          kind: "schema",
          path: zodPath(issue.path),
          message: issue.message,
        });
      }
    }
  }

  return { valid: issues.length === 0, issues, checkedFiles };
}

/** Read catalog files from disk and verify JSON syntax + schema. */
export async function verifyCatalogOnDisk(): Promise<CatalogVerifyResult> {
  const files = await readAllCatalogFilesRaw();
  return verifyCatalogJsonContents(files);
}

export function verifyCatalogPatch(proposal: unknown): CatalogVerifyResult {
  const issues: CatalogVerifyIssue[] = [];
  const parsed = catalogPatchSchema.safeParse(proposal);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      issues.push({
        file: "proposal",
        kind: "schema",
        path: zodPath(issue.path),
        message: issue.message,
      });
    }
    return { valid: false, issues, checkedFiles: [] };
  }
  return crossCheckCatalogPatch(parsed.data);
}

function crossCheckCatalogPatch(_patch: CatalogPatch): CatalogVerifyResult {
  return { valid: true, issues: [], checkedFiles: [] };
}

/** Dry-run merge of a proposal onto on-disk catalog, then verify merged JSON. */
export async function verifyCatalogProposal(proposal: CatalogPatch): Promise<CatalogVerifyResult> {
  const patchCheck = verifyCatalogPatch(proposal);
  if (!patchCheck.valid) return patchCheck;

  const raw = await readAllCatalogFilesRaw();
  const current = parseCatalogFromFiles(raw);
  const issues: CatalogVerifyIssue[] = [];

  if (proposal.archetype.action === "create" && current.roleSkillCatalog[proposal.archetype.targetId]) {
    issues.push({
      file: "proposal",
      kind: "cross_check",
      message: `Archetype id "${proposal.archetype.targetId}" already exists (use merge)`,
    });
  }
  if (proposal.archetype.action === "merge" && !current.roleSkillCatalog[proposal.archetype.targetId]) {
    issues.push({
      file: "proposal",
      kind: "cross_check",
      message: `Archetype id "${proposal.archetype.targetId}" does not exist (use create)`,
    });
  }

  const knownCanonicals = new Set(
    Object.keys(current.skillAliases).map((k) => k.toLowerCase())
  );
  for (const key of Object.keys(proposal.skillAliases)) {
    knownCanonicals.add(key.toLowerCase());
  }

  for (const rel of proposal.relationships) {
    if (!knownCanonicals.has(rel.from.toLowerCase())) {
      issues.push({
        file: "proposal",
        kind: "cross_check",
        message: `Relationship from "${rel.from}" is not a known canonical skill`,
      });
    }
    if (!knownCanonicals.has(rel.to.toLowerCase())) {
      issues.push({
        file: "proposal",
        kind: "cross_check",
        message: `Relationship to "${rel.to}" is not a known canonical skill`,
      });
    }
  }

  if (issues.length > 0) {
    return { valid: false, issues, checkedFiles: CATALOG_FILE_NAMES.slice() };
  }

  const { merged, summary } = mergeCatalogPatch(current, proposal);
  const serialized = serializeCatalog(merged);
  const fileCheck = verifyCatalogJsonContents(serialized);
  return {
    ...fileCheck,
    dryRunMerge: summary,
  };
}
