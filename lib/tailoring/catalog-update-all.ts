import { readAllCatalogFilesRaw } from "@/lib/tailoring/catalog-io";
import type { CatalogFileName } from "@/lib/tailoring/catalog-io";
import {
  bumpCatalogVersion,
  mergeCatalogPatch,
  parseCatalogFromFiles,
  serializeCatalog,
} from "@/lib/tailoring/catalog-merge";
import { researchCatalogPatch } from "@/lib/tailoring/catalog-research";
import { verifyCatalogJsonContents } from "@/lib/tailoring/catalog-verify";
import type { CatalogVerifyIssue } from "@/lib/tailoring/catalog-verify";
import { parseUseOpenRouter } from "@/lib/ai-api";

export interface UpdateAllArchetypeProgress {
  archetypeId: string;
  label: string;
  status: "ok" | "failed" | "skipped";
  error?: string;
  costUsd?: number;
}

export interface UpdateAllCatalogInput {
  useOpenRouter?: boolean;
}

export interface UpdateAllCatalogResult {
  archetypesTotal: number;
  archetypesSucceeded: number;
  archetypesFailed: number;
  progress: UpdateAllArchetypeProgress[];
  /** True when merged result passed verification and can be Applied. */
  readyToApply: boolean;
  version?: string;
  /** Serialized catalog files — pass to Apply when readyToApply. */
  files?: Record<CatalogFileName, string>;
  totalCostUsd?: number;
  verifyIssues: CatalogVerifyIssue[];
}

/**
 * Re-research every archetype and merge into a pending catalog snapshot.
 * Does NOT write to disk — caller must Apply the returned `files`.
 */
export async function updateAllCatalog(
  input: UpdateAllCatalogInput = {}
): Promise<UpdateAllCatalogResult> {
  const useOpenRouter = parseUseOpenRouter(input.useOpenRouter, true);

  const raw = await readAllCatalogFilesRaw();
  const base = parseCatalogFromFiles(raw);
  let catalog = base;

  const entries = Object.values(base.roleSkillCatalog).sort((a, b) => a.id.localeCompare(b.id));

  const progress: UpdateAllArchetypeProgress[] = [];
  let totalCostUsd = 0;

  for (const entry of entries) {
    try {
      const result = await researchCatalogPatch({
        title: entry.label,
        targetArchetypeId: entry.id,
        useOpenRouter,
      });

      catalog = mergeCatalogPatch(catalog, result.proposal).merged;
      if (result.costUsd) totalCostUsd += result.costUsd;

      progress.push({
        archetypeId: entry.id,
        label: entry.label,
        status: "ok",
        costUsd: result.costUsd,
      });
    } catch (error) {
      progress.push({
        archetypeId: entry.id,
        label: entry.label,
        status: "failed",
        error: error instanceof Error ? error.message : "Research failed",
      });
    }
  }

  const archetypesSucceeded = progress.filter((p) => p.status === "ok").length;
  const archetypesFailed = progress.filter((p) => p.status === "failed").length;

  if (archetypesSucceeded === 0) {
    return {
      archetypesTotal: entries.length,
      archetypesSucceeded,
      archetypesFailed,
      progress,
      readyToApply: false,
      totalCostUsd: totalCostUsd || undefined,
      verifyIssues: [
        {
          file: "(unknown)",
          kind: "cross_check",
          message: "No archetype research calls succeeded",
        },
      ],
    };
  }

  catalog = { ...catalog, version: bumpCatalogVersion(base.version) };
  const files = serializeCatalog(catalog);
  const verifyResult = verifyCatalogJsonContents(files);

  if (!verifyResult.valid) {
    return {
      archetypesTotal: entries.length,
      archetypesSucceeded,
      archetypesFailed,
      progress,
      readyToApply: false,
      version: catalog.version,
      totalCostUsd: totalCostUsd || undefined,
      verifyIssues: verifyResult.issues,
    };
  }

  return {
    archetypesTotal: entries.length,
    archetypesSucceeded,
    archetypesFailed,
    progress,
    readyToApply: true,
    version: catalog.version,
    files,
    totalCostUsd: totalCostUsd || undefined,
    verifyIssues: [],
  };
}
