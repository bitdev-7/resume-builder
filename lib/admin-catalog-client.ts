import { apiUrl } from "@/lib/api-config";
import type { CatalogPatch } from "@/lib/tailoring/catalog-schemas";
import type { MergeSummary } from "@/lib/tailoring/catalog-merge";
import type { CatalogVerifyResult } from "@/lib/tailoring/catalog-verify";
import type { CatalogSeniority } from "@/lib/tailoring/catalog-research";

export interface AdminCatalogFile {
  name: string;
  content: string;
}

export interface AdminCatalogFilesResponse {
  version: string;
  files: AdminCatalogFile[];
}

export interface AdminCatalogResearchResponse {
  proposal: CatalogPatch;
  model: string;
  costUsd?: number;
}

export interface AdminCatalogApplyResponse {
  applied: boolean;
  version: string;
  filesWritten: string[];
  backupDir: string;
  summary: MergeSummary;
}

async function adminFetch<T>(
  path: string,
  accessToken: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(apiUrl(path), {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((body as { error?: string }).error || `Request failed (${response.status})`);
  }
  return body as T;
}

export function fetchAdminCatalogFiles(accessToken: string): Promise<AdminCatalogFilesResponse> {
  return adminFetch<AdminCatalogFilesResponse>("/api/admin/catalog/files", accessToken);
}

export function verifyAdminCatalog(
  accessToken: string,
  proposal?: CatalogPatch
): Promise<CatalogVerifyResult> {
  return adminFetch<CatalogVerifyResult>("/api/admin/catalog/verify", accessToken, {
    method: "POST",
    body: JSON.stringify(proposal ? { proposal } : {}),
  });
}

export function researchAdminCatalog(
  accessToken: string,
  input: { title: string; seniority?: CatalogSeniority }
): Promise<AdminCatalogResearchResponse> {
  return adminFetch<AdminCatalogResearchResponse>("/api/admin/catalog/research", accessToken, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function applyAdminCatalog(
  accessToken: string,
  proposal: CatalogPatch
): Promise<AdminCatalogApplyResponse> {
  return adminFetch<AdminCatalogApplyResponse>("/api/admin/catalog/apply", accessToken, {
    method: "POST",
    body: JSON.stringify({ proposal }),
  });
}
