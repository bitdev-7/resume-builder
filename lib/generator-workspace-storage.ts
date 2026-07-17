import { DEFAULT_JOBSITE, type JobsiteId } from "@/lib/jobsites";
import type { JobWorkType } from "@/lib/prompts/job-page-extract";
import type { AnalysisResult } from "@/lib/types/resume";
import type { AtsMatchResult } from "@/lib/types/ats-match";
import type { EnrichmentRecommendation } from "@/lib/types/tailoring";
import type { ClearanceAnalysis } from "@/lib/clearance-warning";

export interface StoredAnalysisSession {
  id: string;
  createdAt: number;
  pageContent: string;
  jobTitle: string;
  companyName: string;
  jobDescription: string;
  jobType: JobWorkType;
  jobTypes: JobWorkType[];
  requiresTravel: boolean;
  salary: string;
  postedDate: string;
  desiredTitle: string;
  aiProvider: string;
  aiModel: string;
  useOpenRouter: boolean;
  jobsite: JobsiteId;
  generateError: string | null;
  result: AnalysisResult | null;
  downloadError?: string | null;
  resumeId?: string;
  resumeTemplate?: string;
  providerUsed?: string;
  modelUsed?: string;
  extractMs?: number;
  analyzeMs?: number;
  pdfMs?: number;
  atsResult?: AtsMatchResult | null;
  atsError?: string | null;
  extractCostUsd?: number;
  generationCostUsd?: number;
  atsCostUsd?: number;
  enrichment?: EnrichmentRecommendation[] | null;
  clearance?: ClearanceAnalysis | null;
}

export interface GeneratorWorkspaceSnapshot {
  pageContent: string;
  jobsite: JobsiteId;
  sessions: StoredAnalysisSession[];
  savedAt: number;
}

const STORAGE_PREFIX = "resume-generator-workspace:";

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

export function loadGeneratorWorkspace(
  userId: string
): GeneratorWorkspaceSnapshot | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = sessionStorage.getItem(storageKey(userId));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as GeneratorWorkspaceSnapshot;
    if (!parsed || typeof parsed !== "object") return null;
    if (!Array.isArray(parsed.sessions)) return null;

    return {
      pageContent: typeof parsed.pageContent === "string" ? parsed.pageContent : "",
      jobsite: parsed.jobsite ?? DEFAULT_JOBSITE,
      sessions: parsed.sessions,
      savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

export function saveGeneratorWorkspace(
  userId: string,
  snapshot: Omit<GeneratorWorkspaceSnapshot, "savedAt">
): void {
  if (typeof window === "undefined") return;

  try {
    const payload: GeneratorWorkspaceSnapshot = {
      ...snapshot,
      savedAt: Date.now(),
    };
    sessionStorage.setItem(storageKey(userId), JSON.stringify(payload));
  } catch (error) {
    console.warn("Could not persist generator workspace:", error);
  }
}

export function clearGeneratorWorkspace(userId: string): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(storageKey(userId));
}

export function normalizeSessionForStorage(
  session: StoredAnalysisSession & {
    generating?: boolean;
    downloading?: boolean;
    atsLoading?: boolean;
    previewPdfBase64?: string;
    previewLoading?: boolean;
  }
): StoredAnalysisSession {
  // Drop transient flags and the (large) preview PDF so sessionStorage stays small.
  const {
    generating: _g,
    downloading: _d,
    atsLoading: _a,
    previewPdfBase64: _p,
    previewLoading: _pl,
    ...rest
  } = session;
  return rest;
}

export function restoreSessionFromStorage(
  session: StoredAnalysisSession
): StoredAnalysisSession & {
  generating: false;
  downloading: false;
  atsLoading: false;
} {
  return {
    ...session,
    generating: false,
    downloading: false,
    atsLoading: false,
  };
}

export const SETTINGS_UPDATED_EVENT = "resume-settings-updated";

export function notifySettingsUpdated(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SETTINGS_UPDATED_EVENT));
}
