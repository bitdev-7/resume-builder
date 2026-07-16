import {
  backupCatalogDir,
  readAllCatalogFilesRaw,
  writeCatalogFilesAtomic,
} from "@/lib/tailoring/catalog-io";
import type { CatalogPatch } from "@/lib/tailoring/catalog-schemas";
import {
  bumpCatalogVersion,
  mergeCatalogPatch,
  parseCatalogFromFiles,
  serializeCatalog,
  type MergeSummary,
  type ParsedCatalog,
} from "@/lib/tailoring/catalog-merge";
import { reloadBuiltinCatalogFromParsed } from "@/lib/tailoring/catalog-reload";
import { verifyCatalogJsonContents, verifyCatalogProposal } from "@/lib/tailoring/catalog-verify";

export interface CatalogApplyResult {
  applied: boolean;
  version: string;
  filesWritten: string[];
  backupDir: string;
  summary?: MergeSummary;
}

export async function applyParsedCatalog(
  catalog: ParsedCatalog,
  options?: { skipVerify?: boolean }
): Promise<CatalogApplyResult> {
  const serialized = serializeCatalog(catalog);

  if (!options?.skipVerify) {
    const verifyResult = verifyCatalogJsonContents(serialized);
    if (!verifyResult.valid) {
      throw new Error(
        verifyResult.issues.map((i) => `${i.file}: ${i.message}`).join("; ") ||
          "Catalog failed verification"
      );
    }
  }

  const backupDir = await backupCatalogDir();
  await writeCatalogFilesAtomic(serialized);
  reloadBuiltinCatalogFromParsed(catalog);

  return {
    applied: true,
    version: catalog.version,
    filesWritten: Object.keys(serialized),
    backupDir,
  };
}

/** Write a full verified catalog snapshot (e.g. from Update All) to disk. */
export async function applyCatalogFiles(
  files: Record<string, string>
): Promise<CatalogApplyResult> {
  const verifyResult = verifyCatalogJsonContents(files as Parameters<typeof verifyCatalogJsonContents>[0]);
  if (!verifyResult.valid) {
    throw new Error(
      verifyResult.issues.map((i) => `${i.file}: ${i.message}`).join("; ") ||
        "Catalog files failed verification"
    );
  }

  const catalog = parseCatalogFromFiles(files as Parameters<typeof parseCatalogFromFiles>[0]);
  return applyParsedCatalog(catalog, { skipVerify: true });
}

export async function applyCatalogPatch(proposal: CatalogPatch): Promise<CatalogApplyResult> {
  const dryRun = await verifyCatalogProposal(proposal);
  if (!dryRun.valid) {
    throw new Error(
      dryRun.issues.map((i) => `${i.file}: ${i.message}`).join("; ") || "Proposal failed verification"
    );
  }

  const raw = await readAllCatalogFilesRaw();
  const current = parseCatalogFromFiles(raw);
  const { merged, summary } = mergeCatalogPatch(current, proposal);
  merged.version = bumpCatalogVersion(current.version);

  const serialized = serializeCatalog(merged);
  const verifyResult = verifyCatalogJsonContents(serialized);
  if (!verifyResult.valid) {
    throw new Error(
      verifyResult.issues.map((i) => `${i.file}: ${i.message}`).join("; ") ||
        "Merged catalog failed verification"
    );
  }

  const backupDir = await backupCatalogDir();
  await writeCatalogFilesAtomic(serialized);
  reloadBuiltinCatalogFromParsed(merged);

  return {
    applied: true,
    version: merged.version,
    filesWritten: Object.keys(serialized),
    backupDir,
    summary,
  };
}