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
} from "@/lib/tailoring/catalog-merge";
import { reloadBuiltinCatalogFromParsed } from "@/lib/tailoring/catalog-reload";
import { verifyCatalogJsonContents, verifyCatalogProposal } from "@/lib/tailoring/catalog-verify";

export interface CatalogApplyResult {
  applied: boolean;
  version: string;
  filesWritten: string[];
  backupDir: string;
  summary: MergeSummary;
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
