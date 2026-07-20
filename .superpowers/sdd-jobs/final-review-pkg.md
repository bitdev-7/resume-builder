BASE f2d992e670a3af130322fa2d76084e292b214278 HEAD c9e7c0f6733cefb5db3e454881adedcd7fb8c309
c9e7c0f fix: support unapplied/opened statuses in history and stats
7b973b2 feat: fold resume generation into Jobs workflow
7ee5de8 fix: open job tabs synchronously to avoid popup blockers
aa0fc22 feat: add Jobs page with shared URLs and per-user status
3010f2a fix: harden jobs add race handling and ResumeRecord.job_id
18c9690 feat: add jobs service with per-user status sync
55e9656 feat: add jobs catalog and user_job_status schema
d34c972 feat: add job URL normalize and expand bid statuses

 .superpowers/sdd-jobs/task-3-report.md    |   41 ++
 .superpowers/sdd-jobs/task-5-report.md    |   13 +
 .superpowers/sdd-jobs/task-6-report.md    |   10 +
 frontend/app/generator/page.tsx           |  998 +--------------------------
 frontend/app/jobs/page.tsx                |  447 ++++++++++++
 frontend/components/AppNav.tsx            |    2 +-
 frontend/components/JobsGeneratePanel.tsx | 1049 +++++++++++++++++++++++++++++
 lib/dashboard-stats.test.ts               |   56 ++
 lib/dashboard-stats.ts                    |   11 +-
 lib/job-url.test.ts                       |   20 +
 lib/job-url.ts                            |    8 +
 lib/jobs-page-state.test.ts               |   41 ++
 lib/jobs-page-state.ts                    |   21 +
 lib/supabase/database.types.ts            |   18 +
 lib/supabase/services/index.ts            |    8 +
 lib/supabase/services/jobs.test.ts        |   86 +++
 lib/supabase/services/jobs.ts             |  221 ++++++
 lib/supabase/services/resumes.ts          |   23 +-
 supabase/migrations/007_jobs_tracker.sql  |   56 ++
 supabase/schema.sql                       |   57 ++
 20 files changed, 2191 insertions(+), 995 deletions(-)

## Name-only
.superpowers/sdd-jobs/task-3-report.md
.superpowers/sdd-jobs/task-5-report.md
.superpowers/sdd-jobs/task-6-report.md
frontend/app/generator/page.tsx
frontend/app/jobs/page.tsx
frontend/components/AppNav.tsx
frontend/components/JobsGeneratePanel.tsx
lib/dashboard-stats.test.ts
lib/dashboard-stats.ts
lib/job-url.test.ts
lib/job-url.ts
lib/jobs-page-state.test.ts
lib/jobs-page-state.ts
lib/supabase/database.types.ts
lib/supabase/services/index.ts
lib/supabase/services/jobs.test.ts
lib/supabase/services/jobs.ts
lib/supabase/services/resumes.ts
supabase/migrations/007_jobs_tracker.sql
supabase/schema.sql

## Diff excluding JobsGeneratePanel body (see file in repo)
```
diff --git a/.superpowers/sdd-jobs/task-3-report.md b/.superpowers/sdd-jobs/task-3-report.md
new file mode 100644
index 0000000..99ae999
--- /dev/null
+++ b/.superpowers/sdd-jobs/task-3-report.md
@@ -0,0 +1,41 @@
+# Task 3 Report: Jobs Supabase service
+
+## Status
+
+**COMPLETE_WITH_CONCERNS**
+
+## Summary
+
+Added the Jobs catalog/per-user status service, including normalized race-safe catalog attachment, open-state promotion, bulk status updates, removal, and resume-history synchronization. Resume creation now accepts `jobId` and an optional `bidStatus`; resume status edits upsert the linked per-user job status.
+
+## Files
+
+- `lib/supabase/services/jobs.ts` ΓÇö Jobs service API and exported `nextStatusAfterOpen`.
+- `lib/supabase/services/jobs.test.ts` ΓÇö TDD coverage for open-state promotion and non-downgrade behavior.
+- `lib/supabase/services/resumes.ts` ΓÇö linked job fields on create and reverse status sync on update.
+- `lib/supabase/services/index.ts` ΓÇö Jobs API exports.
+
+## TDD Evidence
+
+- RED: `nextStatusAfterOpen("unapplied")` returned `"unapplied"` instead of `"opened"` (1 failed, 1 passed).
+- GREEN: `npm test -- lib/supabase/services/jobs.test.ts lib/job-url.test.ts` ΓÇö 2 files and 5 tests passed.
+
+## Verification
+
+- `npx tsc -p frontend/tsconfig.json --noEmit` ΓÇö passed.
+- Commit: `18c9690 feat: add jobs service with per-user status sync`
+
+## Concerns
+
+- Migration `supabase/migrations/007_jobs_tracker.sql` must be applied to the target Supabase project.
+- Database operations were type-checked but not exercised against a live Supabase instance.
+- Cross-table status synchronization is sequential, so a failure in the second write can require retrying the operation.
+
+## Important Review Fixes
+
+- Catalog creation is now reported only when this request's conflict-safe insert returns an inserted row.
+- Concurrent same-user attachment conflicts re-select the winning row and return `attached: false`.
+- `ResumeRecord` now includes `job_id: string | null`, removing the temporary intersection cast.
+- Regression tests: `npm test -- lib/supabase/services/jobs.test.ts lib/job-url.test.ts` ΓÇö 2 files and 7 tests passed.
+- TypeScript: `npx tsc -p frontend/tsconfig.json --noEmit` ΓÇö passed.
+- Commit: `fix: harden jobs add race handling and ResumeRecord.job_id`
diff --git a/.superpowers/sdd-jobs/task-5-report.md b/.superpowers/sdd-jobs/task-5-report.md
new file mode 100644
index 0000000..8109ea9
--- /dev/null
+++ b/.superpowers/sdd-jobs/task-5-report.md
@@ -0,0 +1,13 @@
+Status: Implemented; manual generateΓåÆHistory/Jobs verification pending
+Commit: 6fae350 feat: fold resume generation into Jobs workflow
+Changes:
+- Recovered old `frontend/app/generator/page.tsx` (git show aa0fc22^) into new `frontend/components/JobsGeneratePanel.tsx` (job-scoped: props `jobId`, `jobUrl`, `bidStatus`, `onBack`; workspace autosave now keyed by `${userId}:${jobId}`)
+- `frontend/app/jobs/page.tsx`: added "Generate" action per row; `generateJobId` state renders `JobsGeneratePanel` in place of the list, with a "ΓåÉ Back to Jobs" header showing the locked job URL
+- `createResumeWithArtifacts` now called with `jobId`, `jobLink: normalizeJobUrl(jobUrl)`, `bidStatus` (current per-user status, not forced `"applied"`)
+- `frontend/app/generator/page.tsx` untouched ΓÇö still redirects to `/jobs`
+Verify: `npm test` ΓÇö 21 files, 88 tests passed
+Verify: `npx tsc -p frontend/tsconfig.json --noEmit` ΓÇö passed
+Verify: `npx eslint app/jobs/page.tsx components/JobsGeneratePanel.tsx app/generator/page.tsx` ΓÇö clean; broader `eslint app components` shows only 6 pre-existing warnings unrelated to this change
+Concern: Step 3 (manual generate-once ΓåÆ History shows link/status, Jobs unchanged) not run ΓÇö no authenticated browser session available in this environment
+Concern: `next build` not run (Task 4 noted transient `.next` trace EPERM lock on Windows); relied on tsc+eslint+vitest instead
+Report: `.superpowers/sdd-jobs/task-5-report.md`
diff --git a/.superpowers/sdd-jobs/task-6-report.md b/.superpowers/sdd-jobs/task-6-report.md
new file mode 100644
index 0000000..6b2193a
--- /dev/null
+++ b/.superpowers/sdd-jobs/task-6-report.md
@@ -0,0 +1,10 @@
+Status: Implemented
+Changes:
+- Dashboard success rates now exclude `unapplied` and `opened` jobs from bid and interview-stage counts.
+- Added regression coverage confirming early statuses are neither advanced, rejected, nor succeeded.
+- History already resolves both statuses through `BID_STATUSES`; no change was required.
+- Interview auto-promotion remains unchanged and does not promote `unapplied` or `opened`.
+- Audited TypeScript status references; no stale hard-coded status union or exhaustive status switch was found.
+Verify: `npm test` ΓÇö 22 files, 91 tests passed.
+Verify: `git diff --check` ΓÇö passed.
+Report: `.superpowers/sdd-jobs/task-6-report.md`
diff --git a/frontend/app/generator/page.tsx b/frontend/app/generator/page.tsx
index e1c8c0d..d89a83b 100644
--- a/frontend/app/generator/page.tsx
+++ b/frontend/app/generator/page.tsx
@@ -1,999 +1,17 @@
 "use client";
 
-import { useCallback, useEffect, useRef, useState } from "react";
-import { supabase } from "@/lib/supabase";
-import { useAuth } from "@/components/AuthProvider";
-import OpenRouterModelSelect from "@/components/OpenRouterModelSelect";
-import DirectProviderModelSelect from "@/components/DirectProviderModelSelect";
-import AnalysisResultCard, {
-  type AnalysisSessionView,
-} from "@/components/AnalysisResultCard";
-import AnswerQuestionsDialog from "@/components/AnswerQuestionsDialog";
-import ApplyAlertDialog from "@/components/ApplyAlertDialog";
-import ResumePreviewDialog from "@/components/ResumePreviewDialog";
-import { ToastContainer, useToast } from "@/components/Toast";
-import {
-  DEFAULT_JOBSITE,
-  JOBSITES,
-  type JobsiteId,
-} from "@/lib/jobsites";
-import {
-  DEFAULT_OPENROUTER_MODEL,
-  getModelProvider,
-} from "@/lib/openrouter-shared";
-import type { JobWorkType } from "@/lib/prompts/job-page-extract";
-import { extractedJobIsHybridOrOnsite } from "@/lib/job-work-type";
-import type { AnalysisResult } from "@/lib/types/resume";
-import type { LegacyAnalyzeProfile } from "@/lib/mappers/profile-to-resume";
-import { loadProfileForApp } from "@/lib/supabase/load-profile-for-app";
-import type { ResumeProfile } from "@/lib/supabase/database.types";
-import { loadApplyAlertSettings } from "@/lib/supabase/services/apply-alert-settings";
-import { listResumes } from "@/lib/supabase/services/resumes";
-import { createResumeWithArtifacts } from "@/lib/supabase/services/resumes";
-import {
-  findDuplicateCompanyApplications,
-  type DuplicateApplicationMatch,
-} from "@/lib/apply-alerts";
-import {
-  DEFAULT_APPLY_ALERT_SETTINGS,
-  type ApplyAlertSettings,
-} from "@/lib/apply-alert-settings";
-import {
-  DEFAULT_RESUME_TEMPLATE,
-  resolveResumeTemplate,
-  type ResumeTemplateId,
-} from "@/lib/resume-templates";
-import {
-  formatPdfSaveMessage,
-  renderResumePdfBase64,
-  savePdfToDownloadsFolder,
-} from "@/lib/pdf-download";
-import type { ExtractedJobInfo } from "@/lib/extract-job-page";
-import {
-  DEFAULT_DIRECT_MODELS,
-  isDirectAIProvider,
-  type DirectAIProvider,
-  type DirectProviderModels,
-  type DirectAiModelsResponse,
-} from "@/lib/direct-ai-shared";
-import type { AtsMatchResult } from "@/lib/types/ats-match";
-import type { EnrichmentRecommendation } from "@/lib/types/tailoring";
-import { fetchAtsMatch } from "@/lib/check-ats-client";
-import { DEFAULT_AI_SETTINGS } from "@/lib/ai-settings";
-import { loadAiSettings } from "@/lib/supabase/services/ai-settings";
-import { apiUrl } from "@/lib/api-config";
-import {
-  loadGeneratorWorkspace,
-  normalizeSessionForStorage,
-  restoreSessionFromStorage,
-  saveGeneratorWorkspace,
-  SETTINGS_UPDATED_EVENT,
-} from "@/lib/generator-workspace-storage";
+import { useEffect } from "react";
+import { useRouter } from "next/navigation";
 
-interface AnalysisResponse {
-  resume: AnalysisResult;
-  providerUsed?: string;
-  modelUsed?: string;
-  jobTitle?: string;
-  companyName?: string;
-  jobDescription?: string;
-  generationCostUsd?: number;
-  enrichmentRecommendations?: EnrichmentRecommendation[];
-}
-
-interface AnalysisSession {
-  id: string;
-  createdAt: number;
-  pageContent: string;
-  jobTitle: string;
-  companyName: string;
-  jobDescription: string;
-  jobType: JobWorkType;
-  jobTypes: JobWorkType[];
-  requiresTravel: boolean;
-  salary: string;
-  postedDate: string;
-  desiredTitle: string;
-  aiProvider: string;
-  aiModel: string;
-  useOpenRouter: boolean;
-  jobsite: JobsiteId;
-  generating: boolean;
-  generateError: string | null;
-  result: AnalysisResult | null;
-  downloading?: boolean;
-  downloadError?: string | null;
-  resumeId?: string;
-  resumeTemplate?: string;
-  providerUsed?: string;
-  modelUsed?: string;
-  extractMs?: number;
-  analyzeMs?: number;
-  pdfMs?: number;
-  atsLoading?: boolean;
-  atsResult?: AtsMatchResult | null;
-  atsError?: string | null;
-  extractCostUsd?: number;
-  generationCostUsd?: number;
-  atsCostUsd?: number;
-  enrichment?: EnrichmentRecommendation[] | null;
-  previewPdfBase64?: string;
-  previewLoading?: boolean;
-}
-
-let sessionCounter = 0;
-
-async function fetchDirectModels(): Promise<DirectProviderModels> {
-  const response = await fetch(apiUrl("/api/direct-ai-models"));
-  if (!response.ok) throw new Error("Failed to load direct AI models");
-  const data = (await response.json()) as DirectAiModelsResponse;
-  return data.models;
-}
-
-function createSessionId(): string {
-  sessionCounter += 1;
-  return `analysis-${Date.now()}-${sessionCounter}`;
-}
-
-function toSessionView(session: AnalysisSession): AnalysisSessionView {
-  return {
-    id: session.id,
-    jobTitle: session.jobTitle,
-    companyName: session.companyName,
-    jobDescription: session.jobDescription,
-    jobType: session.jobType,
-    jobTypes: session.jobTypes,
-    requiresTravel: session.requiresTravel,
-    salary: session.salary,
-    postedDate: session.postedDate,
-    aiProvider: session.aiProvider,
-    aiModel: session.aiModel,
-    useOpenRouter: session.useOpenRouter,
-    jobsite: session.jobsite,
-    generating: session.generating,
-    generateError: session.generateError,
-    result: session.result,
-    downloading: session.downloading,
-    downloadError: session.downloadError,
-    providerUsed: session.providerUsed,
-    modelUsed: session.modelUsed,
-    extractMs: session.extractMs,
-    analyzeMs: session.analyzeMs,
-    pdfMs: session.pdfMs,
-    atsLoading: session.atsLoading,
-    atsResult: session.atsResult,
-    atsError: session.atsError,
-    extractCostUsd: session.extractCostUsd,
-    generationCostUsd: session.generationCostUsd,
-    atsCostUsd: session.atsCostUsd,
-    enrichment: session.enrichment,
-  };
-}
-
-export default function GeneratorPage() {
-  const { user } = useAuth();
-  const { toasts, showToast, dismissToast } = useToast();
-
-  const [useOpenRouter, setUseOpenRouter] = useState(DEFAULT_AI_SETTINGS.use_openrouter);
-  const [autoAtsAfterResume, setAutoAtsAfterResume] = useState(
-    DEFAULT_AI_SETTINGS.auto_ats_after_resume
-  );
-  const [directModels, setDirectModels] =
-    useState<DirectProviderModels>(DEFAULT_DIRECT_MODELS);
-  const [aiProvider, setAiProvider] = useState(getModelProvider(DEFAULT_OPENROUTER_MODEL));
-  const [aiModel, setAiModel] = useState(DEFAULT_OPENROUTER_MODEL);
-  const [jobsite, setJobsite] = useState<JobsiteId>(DEFAULT_JOBSITE);
-  const [desiredTitle, setDesiredTitle] = useState("");
-  const [pageContent, setPageContent] = useState("");
-  const [analysing, setAnalysing] = useState(false);
-
-  const [sessions, setSessions] = useState<AnalysisSession[]>([]);
-  const [answerDialogSessionId, setAnswerDialogSessionId] = useState<string | null>(null);
-
-  const [profileData, setProfileData] = useState<LegacyAnalyzeProfile | null>(null);
-  const [profiles, setProfiles] = useState<ResumeProfile[]>([]);
-  const [activeProfileId, setActiveProfileId] = useState<string>("");
-  const [promptOverrides, setPromptOverrides] = useState<Record<string, string> | undefined>(
-    undefined
-  );
-  const [switchingProfile, setSwitchingProfile] = useState(false);
-  const [previewSessionId, setPreviewSessionId] = useState<string | null>(null);
-  const [resumeContent, setResumeContent] = useState("");
-  const [resumeTemplate, setResumeTemplate] =
-    useState<ResumeTemplateId>(DEFAULT_RESUME_TEMPLATE);
-  const [loadingProfile, setLoadingProfile] = useState(true);
-  const [applyAlertSettings, setApplyAlertSettings] = useState<ApplyAlertSettings>(
-    DEFAULT_APPLY_ALERT_SETTINGS
-  );
-
-  const [alertOpen, setAlertOpen] = useState(false);
-  const [duplicateMatches, setDuplicateMatches] = useState<DuplicateApplicationMatch[]>([]);
-  const [showHybridOnsiteAlert, setShowHybridOnsiteAlert] = useState(false);
-  const [pendingGenerateSessionId, setPendingGenerateSessionId] = useState<string | null>(
-    null
-  );
-
-  const profileLoadedRef = useRef(false);
-  const hydratedUserIdRef = useRef<string | null>(null);
-
-  const reloadPreferences = useCallback(async () => {
-    if (!user?.id) return;
-
-    const [loadedAi, loadedAlerts] = await Promise.all([
-      loadAiSettings(user.id),
-      loadApplyAlertSettings(user.id),
-    ]);
-    setUseOpenRouter(loadedAi.use_openrouter);
-    setAutoAtsAfterResume(loadedAi.auto_ats_after_resume);
-    setApplyAlertSettings(loadedAlerts);
-
-    if (!loadedAi.use_openrouter) {
-      try {
-        const models = await fetchDirectModels();
-        setDirectModels(models);
-        setAiProvider((prev) => {
-          const provider: DirectAIProvider =
-            prev === "openai" || prev === "anthropic" || prev === "deepseek"
-              ? (prev as DirectAIProvider)
-              : "openai";
-          setAiModel(models[provider]);
-          return provider;
-        });
-      } catch (error) {
-        console.warn("Failed to reload direct AI models:", error);
-      }
-    }
-  }, [user?.id]);
-
-  const patchSession = useCallback((id: string, patch: Partial<AnalysisSession>) => {
-    setSessions((prev) =>
-      prev.map((session) => (session.id === id ? { ...session, ...patch } : session))
-    );
-  }, []);
-
-  const runAutoAtsCheck = useCallback(
-    async (
-      sessionId: string,
-      resume: AnalysisResult,
-      context: {
-        jobDescription: string;
-        aiModel: string;
-        aiProvider: string;
-        useOpenRouter: boolean;
-        accessToken: string;
-      }
-    ) => {
-      if (!context.jobDescription.trim()) return;
-
-      patchSession(sessionId, {
-        atsLoading: true,
-        atsResult: null,
-        atsError: null,
-      });
-
-      try {
-        const ats = await fetchAtsMatch({
-          resume,
-          jd: context.jobDescription,
-          apiModel: context.aiModel,
-          apiProvider: context.aiProvider,
-          useOpenRouter: context.useOpenRouter,
-          accessToken: context.accessToken,
-          promptOverrides,
-        });
-        patchSession(sessionId, {
-          atsLoading: false,
-          atsResult: ats.ats,
-          atsError: null,
-          atsCostUsd: ats.atsCostUsd,
-        });
-      } catch (err) {
-        const message = err instanceof Error ? err.message : "Failed to check ATS match";
-        patchSession(sessionId, { atsLoading: false, atsResult: null, atsError: message });
-        console.warn("Auto ATS check failed:", message);
-      }
-    },
-    [patchSession, promptOverrides]
-  );
-
-  useEffect(() => {
-    if (!user?.id || hydratedUserIdRef.current === user.id) return;
-
-    hydratedUserIdRef.current = user.id;
-    const saved = loadGeneratorWorkspace(user.id);
-    if (!saved) return;
-
-    setPageContent(saved.pageContent);
-    setJobsite(saved.jobsite);
-    setSessions(saved.sessions.map((session) => restoreSessionFromStorage(session)));
-    sessionCounter = Math.max(sessionCounter, saved.sessions.length);
-    setLoadingProfile(false);
-  }, [user?.id]);
-
-  useEffect(() => {
-    if (!user?.id) return;
-
-    const timer = window.setTimeout(() => {
-      saveGeneratorWorkspace(user.id, {
-        pageContent,
-        jobsite,
-        sessions: sessions.map((session) => normalizeSessionForStorage(session)),
-      });
-    }, 400);
-
-    return () => window.clearTimeout(timer);
-  }, [user?.id, pageContent, jobsite, sessions]);
-
-  useEffect(() => {
-    if (!user?.id) return;
-
-    const onSettingsUpdated = () => void reloadPreferences();
-    window.addEventListener(SETTINGS_UPDATED_EVENT, onSettingsUpdated);
-    return () => window.removeEventListener(SETTINGS_UPDATED_EVENT, onSettingsUpdated);
-  }, [user?.id, reloadPreferences]);
-
-  useEffect(() => {
-    if (!user?.id) return;
-
-    let cancelled = false;
-    (async () => {
-      try {
-        const {
-          data: { session },
-        } = await supabase.auth.getSession();
-        if (!session || cancelled) return;
-
-        const loaded = await loadProfileForApp(supabase, {
-          email: user.email,
-          userId: user.id,
-        });
-        if (cancelled) return;
-
-        setProfiles(loaded.profiles);
-        setActiveProfileId(loaded.activeProfileId);
-        setPromptOverrides(
-          loaded.profiles.find((p) => p.id === loaded.activeProfileId)?.prompt_overrides ?? undefined
-        );
-        setProfileData(loaded.legacyAnalyzeProfile);
-        setResumeContent(loaded.resumeText);
-        setResumeTemplate(
-          resolveResumeTemplate(loaded.legacyAnalyzeProfile.default_resume?.resume_template)
-        );
-        setDesiredTitle(loaded.legacyAnalyzeProfile.default_resume?.headline?.trim() ?? "");
-
-        const alertSettings = await loadApplyAlertSettings(user.id);
-        if (!cancelled) setApplyAlertSettings(alertSettings);
-
-        const loadedAi = await loadAiSettings(user.id);
-        if (!cancelled) {
-          setUseOpenRouter(loadedAi.use_openrouter);
-          setAutoAtsAfterResume(loadedAi.auto_ats_after_resume);
-          if (!loadedAi.use_openrouter) {
-            try {
-              const models = await fetchDirectModels();
-              if (cancelled) return;
-              setDirectModels(models);
-              setAiProvider("openai");
-              setAiModel(models.openai);
-            } catch (error) {
-              console.warn("Failed to load direct AI models:", error);
-              setAiProvider("openai");
-              setAiModel(DEFAULT_DIRECT_MODELS.openai);
-            }
-          }
-        }
-
-        if (!profileLoadedRef.current && loaded.resumeText.trim()) {
-          profileLoadedRef.current = true;
-        }
-      } catch (error) {
-        console.warn("Error loading profile:", error);
-      } finally {
-        if (!cancelled) setLoadingProfile(false);
-      }
-    })();
-
-    return () => {
-      cancelled = true;
-    };
-  }, [user?.id, user?.email]);
+export default function GeneratorRedirectPage() {
+  const router = useRouter();
 
   useEffect(() => {
-    if (useOpenRouter) return;
-    const provider: DirectAIProvider = isDirectAIProvider(aiProvider) ? aiProvider : "openai";
-    setAiModel(directModels[provider]);
-  }, [directModels, useOpenRouter, aiProvider]);
-
-  const dismissSession = useCallback((sessionId: string) => {
-    setSessions((prev) => prev.filter((session) => session.id !== sessionId));
-    setAnswerDialogSessionId((current) => (current === sessionId ? null : current));
-  }, []);
-
-  const addSessionFromExtracted = useCallback(
-    (
-      extracted: ExtractedJobInfo,
-      sourceContent: string,
-      extractMs?: number,
-      extractCostUsd?: number
-    ) => {
-      const provider = useOpenRouter ? getModelProvider(aiModel) : aiProvider;
-      const newSession: AnalysisSession = {
-        id: createSessionId(),
-        createdAt: Date.now(),
-        pageContent: sourceContent,
-        jobTitle: extracted.jobTitle,
-        companyName: extracted.companyName,
-        jobDescription: extracted.jobDescription,
-        jobType: extracted.jobType,
-        jobTypes: extracted.jobTypes,
-        requiresTravel: extracted.requiresTravel,
-        salary: extracted.salary,
-        postedDate: extracted.postedDate,
-        desiredTitle: desiredTitle.trim(),
-        aiProvider: provider,
-        aiModel,
-        useOpenRouter,
-        jobsite,
-        generating: false,
-        generateError: null,
-        result: null,
-        extractMs,
-        extractCostUsd,
-      };
-      setSessions((prev) => [newSession, ...prev]);
-      setPageContent("");
-      showToast("success", "Job analysed ΓÇö added to the list.");
-    },
-    [aiModel, aiProvider, jobsite, desiredTitle, showToast, useOpenRouter]
-  );
-
-  const runPreflightBeforeGenerate = useCallback(
-    async (sessionId: string): Promise<boolean> => {
-      const session = sessions.find((item) => item.id === sessionId);
-      if (!session || !user?.id) return false;
-
-      let duplicates: DuplicateApplicationMatch[] = [];
-      let hybridOnsite = false;
-
-      if (
-        applyAlertSettings.duplicate_apply_alert_enabled &&
-        session.companyName.trim()
-      ) {
-        try {
-          const records = await listResumes(user.id);
-          duplicates = findDuplicateCompanyApplications(
-            records,
-            session.companyName,
-            applyAlertSettings.duplicate_apply_months
-          );
-        } catch (error) {
-          console.warn("Failed to check duplicate applications:", error);
-        }
-      }
-
-      if (applyAlertSettings.hybrid_onsite_alert_enabled) {
-        hybridOnsite = extractedJobIsHybridOrOnsite({
-          jobType: session.jobType,
-          jobTypes: session.jobTypes,
-        });
-      }
-
-      if (duplicates.length > 0 || hybridOnsite) {
-        setPendingGenerateSessionId(sessionId);
-        setDuplicateMatches(duplicates);
-        setShowHybridOnsiteAlert(hybridOnsite);
-        setAlertOpen(true);
-        return true;
-      }
-
-      return false;
-    },
-    [sessions, user?.id, applyAlertSettings]
-  );
-
-  const handleAnalyse = async () => {
-    if (analysing || loadingProfile) return;
-    if (!pageContent.trim()) {
-      showToast("warning", "Paste the job posting page content first.");
-      return;
-    }
-    if (!user?.id) return;
-
-    setAnalysing(true);
-    const extractStarted = Date.now();
-    try {
-      const {
-        data: { session },
-      } = await supabase.auth.getSession();
-      if (!session) throw new Error("You must be signed in");
-
-      const response = await fetch(apiUrl("/api/extract-job"), {
-        method: "POST",
-        headers: {
-          "Content-Type": "application/json",
-          Authorization: `Bearer ${session.access_token}`,
-        },
-        body: JSON.stringify({
-          pageContent,
-          useOpenRouter,
-          ...(promptOverrides ? { promptOverrides } : {}),
-        }),
-      });
-
-      if (!response.ok) {
-        const errorData = await response.json().catch(() => ({}));
-        throw new Error(
-          typeof errorData.error === "string" ? errorData.error : "Failed to analyse job"
-        );
-      }
-
-      const payload = (await response.json()) as ExtractedJobInfo & {
-        extractCostUsd?: number;
-      };
-      const { extractCostUsd, ...extracted } = payload;
-      const extractMs = Date.now() - extractStarted;
-      addSessionFromExtracted(extracted, pageContent, extractMs, extractCostUsd);
-    } catch (error) {
-      showToast(
-        "error",
-        error instanceof Error ? error.message : "Failed to analyse job"
-      );
-    } finally {
-      setAnalysing(false);
-    }
-  };
-
-  const handleSwitchProfile = async (profileId: string) => {
-    if (!user || profileId === activeProfileId) return;
-    setSwitchingProfile(true);
-    try {
-      const loaded = await loadProfileForApp(supabase, {
-        email: user.email,
-        userId: user.id,
-        profileId,
-      });
-      setActiveProfileId(loaded.activeProfileId);
-      setPromptOverrides(
-        loaded.profiles.find((p) => p.id === loaded.activeProfileId)?.prompt_overrides ?? undefined
-      );
-      setProfileData(loaded.legacyAnalyzeProfile);
-      setResumeContent(loaded.resumeText);
-      setResumeTemplate(
-        resolveResumeTemplate(loaded.legacyAnalyzeProfile.default_resume?.resume_template)
-      );
-      setDesiredTitle(loaded.legacyAnalyzeProfile.default_resume?.headline?.trim() ?? "");
-    } catch {
-      showToast("error", "Failed to switch profile.");
-    } finally {
-      setSwitchingProfile(false);
-    }
-  };
-
-  const generateResumeForSession = useCallback(
-    async (sessionId: string, tweak?: { tone?: string; emphasis?: string }) => {
-      const session = sessions.find((s) => s.id === sessionId);
-      if (!session || session.generating || session.downloading) return;
-
-      if (!resumeContent.trim() || !profileData) {
-        showToast("warning", "No profile resume ΓÇö go to Profile first.");
-        return;
-      }
-      if (!user?.id) return;
-
-      const template = session.resumeTemplate || resumeTemplate;
-
-      patchSession(sessionId, {
-        generating: true,
-        downloading: false,
-        generateError: null,
-        downloadError: null,
-        result: null,
-        resumeId: undefined,
-        providerUsed: undefined,
-        modelUsed: undefined,
-        analyzeMs: undefined,
-        pdfMs: undefined,
-        generationCostUsd: undefined,
-        atsCostUsd: undefined,
-        atsLoading: false,
-        atsResult: null,
-        atsError: null,
-        enrichment: null,
-        previewPdfBase64: undefined,
-        resumeTemplate: template,
-      });
-
-      let pdfPhase = false;
-
-      try {
-        const {
-          data: { session: authSession },
-        } = await supabase.auth.getSession();
-        if (!authSession) throw new Error("You must be signed in to generate a resume");
-
-        const analyzeStarted = Date.now();
-        const response = await fetch(apiUrl("/api/analyze"), {
-          method: "POST",
-          headers: {
-            "Content-Type": "application/json",
-            Authorization: `Bearer ${authSession.access_token}`,
-          },
-          body: JSON.stringify({
-            jd: session.jobDescription,
-            jobTitle: session.jobTitle,
-            companyName: session.companyName,
-            pageContent: session.pageContent,
-            resumeContent,
-            template,
-            profileData,
-            ...(session.desiredTitle?.trim() ? { headlineOverride: session.desiredTitle.trim() } : {}),
-            ...(promptOverrides ? { promptOverrides } : {}),
-            apiModel: session.aiModel,
-            apiProvider: session.aiProvider,
-            useOpenRouter: session.useOpenRouter,
-            ...(tweak && (tweak.tone || tweak.emphasis) ? { promptTweak: tweak } : {}),
-          }),
-        });
-
-        if (!response.ok) {
-          let errorMessage = "Failed to generate resume";
-          try {
-            const errorData = await response.json();
-            errorMessage =
-              typeof errorData.error === "string" && errorData.error.trim()
-                ? errorData.error
-                : errorMessage;
-          } catch {
-            errorMessage = `HTTP ${response.status}: ${response.statusText}`;
-          }
-          throw new Error(errorMessage);
-        }
-
-        const data: AnalysisResponse = await response.json();
-        const resume = data.resume;
-        const analyzeMs = Date.now() - analyzeStarted;
-
-        patchSession(sessionId, {
-          result: resume,
-          generating: false,
-          downloading: true,
-          providerUsed: data.providerUsed,
-          modelUsed: data.modelUsed,
-          analyzeMs,
-          generationCostUsd: data.generationCostUsd,
-          enrichment: data.enrichmentRecommendations ?? null,
-          jobTitle: data.jobTitle?.trim() || session.jobTitle,
-          companyName: data.companyName?.trim() || session.companyName,
-          jobDescription: data.jobDescription?.trim() || session.jobDescription,
-        });
-
-        pdfPhase = true;
-        const pdfStarted = Date.now();
-
-        const [previewPdfBase64, record] = await Promise.all([
-          renderResumePdfBase64(resume, template, authSession.access_token),
-          createResumeWithArtifacts({
-            userId: user.id,
-            profileId: activeProfileId || null,
-            jd: session.jobDescription,
-            resume,
-            aiType: data.providerUsed ?? session.aiProvider,
-            model: data.modelUsed ?? session.aiModel,
-            jobSite: session.jobsite,
-            jobLink: null,
-            jobTitle: session.jobTitle.trim() || null,
-            jobCompany: session.companyName.trim() || null,
-          }),
-        ]);
-
-        patchSession(sessionId, {
-          resumeId: record.id,
-          downloading: false,
-          pdfMs: Date.now() - pdfStarted,
-          previewPdfBase64,
-        });
-        setPreviewSessionId(sessionId);
-        showToast("success", "Resume ready ΓÇö preview it, then download.");
-
-        if (autoAtsAfterResume) {
-          void runAutoAtsCheck(sessionId, resume, {
-            jobDescription: data.jobDescription?.trim() || session.jobDescription,
-            aiModel: session.aiModel,
-            aiProvider: session.aiProvider,
-            useOpenRouter: session.useOpenRouter,
-            accessToken: authSession.access_token,
-          });
-        }
-      } catch (err) {
-        const message =
-          err instanceof Error ? err.message : "An error occurred";
-        patchSession(sessionId, {
-          generating: false,
-          downloading: false,
-          ...(pdfPhase ? { downloadError: message } : { generateError: message }),
-        });
-        showToast("error", `Failed: ${message}`);
-      }
-    },
-    [sessions, resumeContent, profileData, resumeTemplate, activeProfileId, promptOverrides, patchSession, showToast, user?.id, autoAtsAfterResume, runAutoAtsCheck]
-  );
-
-  const handleGenerateResume = useCallback(
-    async (sessionId: string) => {
-      const blocked = await runPreflightBeforeGenerate(sessionId);
-      if (!blocked) {
-        await generateResumeForSession(sessionId);
-      }
-    },
-    [generateResumeForSession, runPreflightBeforeGenerate]
-  );
-
-  const handleChangePreviewTemplate = async (sessionId: string, template: ResumeTemplateId) => {
-    const session = sessions.find((s) => s.id === sessionId);
-    if (!session?.result || !user) return;
-    patchSession(sessionId, { resumeTemplate: template, previewLoading: true });
-    try {
-      const {
-        data: { session: authSession },
-      } = await supabase.auth.getSession();
-      if (!authSession) throw new Error("You must be signed in");
-      const previewPdfBase64 = await renderResumePdfBase64(
-        session.result,
-        template,
-        authSession.access_token
-      );
-      patchSession(sessionId, { previewPdfBase64, previewLoading: false });
-    } catch (err) {
-      patchSession(sessionId, { previewLoading: false });
-      showToast("error", err instanceof Error ? err.message : "Failed to render template");
-    }
-  };
-
-  const handleDownloadPreview = async (sessionId: string) => {
-    const session = sessions.find((s) => s.id === sessionId);
-    if (!session?.previewPdfBase64) return;
-    try {
-      const {
-        data: { session: authSession },
-      } = await supabase.auth.getSession();
-      const { savedPath } = await savePdfToDownloadsFolder(session.previewPdfBase64, {
-        companyName: session.companyName,
-        jobRole: session.jobTitle,
-        personName: session.result?.name || "resume",
-        accessToken: authSession?.access_token ?? null,
-      });
-      showToast("success", formatPdfSaveMessage(savedPath, true));
-    } catch (err) {
-      showToast("error", err instanceof Error ? err.message : "Failed to download");
-    }
-  };
-
-  const handleOpenPreview = (sessionId: string) => {
-    const session = sessions.find((s) => s.id === sessionId);
-    if (!session?.result) return;
-    setPreviewSessionId(sessionId);
-    // Preview PDFs are not persisted to storage; re-render if we don't have one.
-    if (!session.previewPdfBase64 && !session.previewLoading) {
-      void handleChangePreviewTemplate(sessionId, resolveResumeTemplate(session.resumeTemplate));
-    }
-  };
-
-  const previewSession = sessions.find((s) => s.id === previewSessionId) ?? null;
-  const answerDialogSession = sessions.find((s) => s.id === answerDialogSessionId) ?? null;
-
-  if (!user) return null;
+    router.replace("/jobs");
+  }, [router]);
 
   return (
-    <div className="flex min-h-0 flex-1 overflow-hidden p-4 lg:p-5">
-      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
-
-      <ApplyAlertDialog
-        open={alertOpen}
-        duplicateMatches={duplicateMatches}
-        duplicateMonths={applyAlertSettings.duplicate_apply_months}
-        showHybridOnsite={showHybridOnsiteAlert}
-        onCancel={() => {
-          setAlertOpen(false);
-          setPendingGenerateSessionId(null);
-        }}
-        onContinue={() => {
-          setAlertOpen(false);
-          const sessionId = pendingGenerateSessionId;
-          setPendingGenerateSessionId(null);
-          if (sessionId) {
-            void generateResumeForSession(sessionId);
-          }
-        }}
-      />
-
-      <AnswerQuestionsDialog
-        open={answerDialogSessionId !== null}
-        onClose={() => setAnswerDialogSessionId(null)}
-        result={answerDialogSession?.result ?? null}
-        apiModel={answerDialogSession?.aiModel ?? aiModel}
-        apiProvider={answerDialogSession?.aiProvider ?? aiProvider}
-        useOpenRouter={answerDialogSession?.useOpenRouter ?? useOpenRouter}
-        onError={(message) => showToast("error", message)}
-      />
-
-      <ResumePreviewDialog
-        open={previewSessionId !== null}
-        onClose={() => setPreviewSessionId(null)}
-        pdfBase64={previewSession?.previewPdfBase64}
-        previewLoading={previewSession?.previewLoading}
-        regenerating={Boolean(previewSession?.generating || previewSession?.downloading)}
-        template={resolveResumeTemplate(previewSession?.resumeTemplate)}
-        jobTitle={previewSession?.jobTitle}
-        companyName={previewSession?.companyName}
-        onTemplateChange={(t) => {
-          if (previewSessionId) void handleChangePreviewTemplate(previewSessionId, t);
-        }}
-        onRegenerate={(tweak) => {
-          if (previewSessionId) void generateResumeForSession(previewSessionId, tweak);
-        }}
-        onDownload={() => {
-          if (previewSessionId) void handleDownloadPreview(previewSessionId);
-        }}
-      />
-
-      <div className="flex min-h-0 flex-1 gap-4 overflow-hidden">
-        <div className="panel flex min-h-0 w-full max-w-md flex-col overflow-hidden lg:max-w-lg">
-          <p className="label-kicker mb-4 flex-shrink-0">Analyse job</p>
-
-          <div className="mb-4 flex-shrink-0 space-y-3">
-            <div className="grid grid-cols-2 gap-3">
-              {useOpenRouter ? (
-                <OpenRouterModelSelect
-                  aiProvider={aiProvider}
-                  aiModel={aiModel}
-                  disabled={analysing}
-                  onProviderChange={setAiProvider}
-                  onModelChange={(model) => {
-                    setAiModel(model);
-                    setAiProvider(getModelProvider(model));
-                  }}
-                />
-              ) : (
-                <DirectProviderModelSelect
-                  aiProvider={aiProvider as DirectAIProvider}
-                  aiModel={aiModel}
-                  directModels={directModels}
-                  disabled={analysing}
-                  onProviderChange={(provider) => {
-                    setAiProvider(provider);
-                  }}
-                  onModelChange={setAiModel}
-                />
-              )}
-            </div>
-            <div>
-              <label htmlFor="jobsite" className="label-kicker mb-2 block">
-                Jobsite
-              </label>
-              <select
-                id="jobsite"
-                value={jobsite}
-                disabled={analysing}
-                onChange={(e) => setJobsite(e.target.value as JobsiteId)}
-                className="select-shell w-full text-xs disabled:cursor-not-allowed disabled:opacity-50"
-              >
-                {JOBSITES.map((site) => (
-                  <option key={site.id} value={site.id}>
-                    {site.label}
-                  </option>
-                ))}
-              </select>
-            </div>
-            <div>
-              <label htmlFor="profile" className="label-kicker mb-2 block">
-                Profile{switchingProfile ? " (switchingΓÇª)" : ""}
-              </label>
-              <select
-                id="profile"
-                value={activeProfileId}
-                disabled={analysing || switchingProfile || profiles.length === 0}
-                onChange={(e) => void handleSwitchProfile(e.target.value)}
-                className="select-shell w-full text-xs disabled:cursor-not-allowed disabled:opacity-50"
-              >
-                {profiles.map((p) => (
-                  <option key={p.id} value={p.id}>
-                    {p.label}
-                    {p.is_default ? " (default)" : ""}
-                  </option>
-                ))}
-              </select>
-            </div>
-            <div>
-              <label htmlFor="desiredTitle" className="label-kicker mb-2 block">
-                Title
-              </label>
-              <input
-                id="desiredTitle"
-                type="text"
-                value={desiredTitle}
-                disabled={analysing}
-                onChange={(e) => setDesiredTitle(e.target.value)}
-                placeholder="e.g. Senior Software Engineer"
-                className="input-shell w-full text-xs disabled:cursor-not-allowed disabled:opacity-50"
-              />
-              <p className="mt-1 text-[11px] leading-snug text-slate-400 dark:text-slate-500">
-                Shown as your headline on the resume. Defaults to your profile title.
-              </p>
-            </div>
-          </div>
-
-          <div className="flex min-h-0 flex-1 flex-col">
-            <label htmlFor="pageContent" className="label-kicker mb-2 block flex-shrink-0">
-              Job page content
-            </label>
-            <textarea
-              id="pageContent"
-              value={pageContent}
-              onChange={(e) => setPageContent(e.target.value)}
-              placeholder="Paste the full job posting page (title, company, description)ΓÇª"
-              className="input-shell min-h-0 flex-1 resize-none"
-              disabled={analysing}
-            />
-          </div>
-
-          <button
-            type="button"
-            onClick={() => void handleAnalyse()}
-            disabled={analysing || loadingProfile}
-            className="btn-primary mt-4 w-full flex-shrink-0"
-          >
-            {analysing
-              ? "AnalysingΓÇª"
-              : loadingProfile
-                ? "Loading profileΓÇª"
-                : "Analyse"}
-          </button>
-        </div>
-
-        <div className="panel flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-4">
-          <div className="mb-3 flex flex-shrink-0 items-center justify-between gap-2">
-            <p className="label-kicker">Analysis results</p>
-            {sessions.length > 0 ? (
-              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-slate-600 dark:bg-slate-800 dark:text-slate-300">
-                {sessions.length}
-              </span>
-            ) : null}
-          </div>
-          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-0.5">
-            {sessions.length === 0 ? (
-              <div className="empty-state flex h-full min-h-[9rem] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200/90 bg-slate-50/50 px-4 py-6 dark:border-slate-600/60 dark:bg-slate-800/40">
-                <div className="empty-state-icon mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-slate-200/80 dark:bg-slate-800 dark:ring-slate-600/60">
-                  <svg className="h-5 w-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
-                    <path
-                      strokeLinecap="round"
-                      strokeLinejoin="round"
-                      strokeWidth={1.8}
-                      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
-                    />
-                  </svg>
-                </div>
-                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
-                  No analyses yet
-                </p>
-                <p className="mt-1 max-w-xs text-center text-xs leading-relaxed text-slate-500 dark:text-slate-400">
-                  Paste a job page on the left and click Analyse to start.
-                </p>
-              </div>
-            ) : (
-              sessions.map((session) => (
-                <AnalysisResultCard
-                  key={session.id}
-                  session={toSessionView(session)}
-                  onGenerateResume={handleGenerateResume}
-                  onGenerateAnswers={setAnswerDialogSessionId}
-                  onPreview={handleOpenPreview}
-                  onClose={dismissSession}
-                  onError={(message) => showToast("error", message)}
-                />
-              ))
-            )}
-          </div>
-        </div>
-      </div>
+    <div className="flex h-full items-center justify-center text-sm text-slate-500">
+      Redirecting to JobsΓÇª
     </div>
   );
diff --git a/frontend/app/jobs/page.tsx b/frontend/app/jobs/page.tsx
new file mode 100644
index 0000000..ea0d8ce
--- /dev/null
+++ b/frontend/app/jobs/page.tsx
@@ -0,0 +1,447 @@
+"use client";
+
+import { useEffect, useMemo, useState } from "react";
+import { useAuth } from "@/components/AuthProvider";
+import JobsGeneratePanel from "@/components/JobsGeneratePanel";
+import { ToastContainer, useToast } from "@/components/Toast";
+import { copyText } from "@/lib/clipboard";
+import { filterJobs, getExternalJobUrl, paginateJobs } from "@/lib/jobs-page-state";
+import {
+  BID_STATUSES,
+  type BidStatus,
+  type UserJobListItem,
+} from "@/lib/supabase/database.types";
+import {
+  addJobForUser,
+  listJobsForUser,
+  openJobForUser,
+  removeMyJob,
+  setJobStatusForUser,
+} from "@/lib/supabase/services/jobs";
+
+const PAGE_SIZE_OPTIONS = [30, 50, 100] as const;
+const DEFAULT_PAGE_SIZE = 30;
+
+function formatDate(iso: string): string {
+  return new Date(iso).toLocaleDateString(undefined, {
+    year: "numeric",
+    month: "short",
+    day: "numeric",
+  });
+}
+
+function formatStatus(status: BidStatus): string {
+  return status.charAt(0).toUpperCase() + status.slice(1);
+}
+
+export default function JobsPage() {
+  const { user, loading: authLoading } = useAuth();
+  const { toasts, showToast, dismissToast } = useToast();
+  const [jobs, setJobs] = useState<UserJobListItem[]>([]);
+  const [jobUrl, setJobUrl] = useState("");
+  const [statusFilter, setStatusFilter] = useState<BidStatus | "">("");
+  const [page, setPage] = useState(1);
+  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
+  const [loading, setLoading] = useState(true);
+  const [adding, setAdding] = useState(false);
+  const [busyJobId, setBusyJobId] = useState<string | null>(null);
+  const [generateJobId, setGenerateJobId] = useState<string | null>(null);
+
+  useEffect(() => {
+    if (authLoading) return;
+    if (!user?.id) {
+      setLoading(false);
+      return;
+    }
+
+    let cancelled = false;
+    setLoading(true);
+    void listJobsForUser(user.id)
+      .then((rows) => {
+        if (!cancelled) setJobs(rows);
+      })
+      .catch((error) => {
+        console.error("Failed to load jobs:", error);
+        if (!cancelled) showToast("error", "Failed to load jobs");
+      })
+      .finally(() => {
+        if (!cancelled) setLoading(false);
+      });
+
+    return () => {
+      cancelled = true;
+    };
+  }, [authLoading, showToast, user?.id]);
+
+  const filteredJobs = useMemo(
+    () => filterJobs(jobs, statusFilter),
+    [jobs, statusFilter]
+  );
+  const totalPages = Math.max(1, Math.ceil(filteredJobs.length / pageSize));
+  const visibleJobs = useMemo(
+    () => paginateJobs(filteredJobs, page, pageSize),
+    [filteredJobs, page, pageSize]
+  );
+
+  useEffect(() => {
+    setPage(1);
+  }, [statusFilter, pageSize]);
+
+  useEffect(() => {
+    if (page > totalPages) setPage(totalPages);
+  }, [page, totalPages]);
+
+  const handleAdd = async (event: React.FormEvent<HTMLFormElement>) => {
+    event.preventDefault();
+    if (!user?.id || adding) return;
+    if (!jobUrl.trim()) {
+      showToast("warning", "Enter a job URL first");
+      return;
+    }
+
+    setAdding(true);
+    try {
+      const result = await addJobForUser(user.id, jobUrl);
+      setJobs((current) => {
+        const withoutExisting = current.filter((job) => job.job_id !== result.item.job_id);
+        return [result.item, ...withoutExisting];
+      });
+      setJobUrl("");
+      setStatusFilter("");
+      setPage(1);
+      showToast(
+        "success",
+        result.attached ? "Job added" : "This job is already in your list"
+      );
+    } catch (error) {
+      console.error("Failed to add job:", error);
+      showToast("error", error instanceof Error ? error.message : "Failed to add job");
+    } finally {
+      setAdding(false);
+    }
+  };
+
+  const handleStatusChange = async (job: UserJobListItem, status: BidStatus) => {
+    if (!user?.id || status === job.status) return;
+    setBusyJobId(job.job_id);
+    try {
+      await setJobStatusForUser(user.id, [job.job_id], status);
+      setJobs((current) =>
+        current.map((item) =>
+          item.job_id === job.job_id ? { ...item, status } : item
+        )
+      );
+    } catch (error) {
+      console.error("Failed to update job status:", error);
+      showToast("error", "Failed to update status");
+    } finally {
+      setBusyJobId(null);
+    }
+  };
+
+  const handleOpen = async (job: UserJobListItem) => {
+    if (!user?.id) return;
+
+    const externalUrl = getExternalJobUrl(job.url);
+    const newTab = window.open(externalUrl, "_blank");
+    if (!newTab) {
+      showToast("error", "Popup blocked ΓÇö allow popups for this site");
+      return;
+    }
+    newTab.opener = null;
+
+    setBusyJobId(job.job_id);
+    try {
+      const updated = await openJobForUser(user.id, job.job_id);
+      setJobs((current) =>
+        current.map((item) => (item.job_id === updated.job_id ? updated : item))
+      );
+      const finalUrl = getExternalJobUrl(updated.url);
+      if (finalUrl !== externalUrl) {
+        newTab.location.href = finalUrl;
+      }
+    } catch (error) {
+      console.error("Failed to open job:", error);
+      showToast("error", "Failed to open job");
+      newTab.close();
+    } finally {
+      setBusyJobId(null);
+    }
+  };
+
+  const handleCopy = async (url: string) => {
+    if (await copyText(url)) {
+      showToast("success", "Job URL copied");
+    } else {
+      showToast("error", "Copy failed");
+    }
+  };
+
+  const handleRemove = async (job: UserJobListItem) => {
+    if (!user?.id || !window.confirm("Remove this job from your list?")) return;
+    setBusyJobId(job.job_id);
+    try {
+      await removeMyJob(user.id, job.job_id);
+      setJobs((current) => current.filter((item) => item.job_id !== job.job_id));
+      showToast("success", "Job removed from your list");
+    } catch (error) {
+      console.error("Failed to remove job:", error);
+      showToast("error", "Failed to remove job");
+    } finally {
+      setBusyJobId(null);
+    }
+  };
+
+  if (authLoading || !user) {
+    return (
+      <div className="flex flex-1 items-center justify-center">
+        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600" />
+      </div>
+    );
+  }
+
+  const generateJob = generateJobId
+    ? jobs.find((job) => job.job_id === generateJobId) ?? null
+    : null;
+
+  if (generateJob) {
+    return (
+      <JobsGeneratePanel
+        jobId={generateJob.job_id}
+        jobUrl={generateJob.url}
+        bidStatus={generateJob.status}
+        onBack={() => setGenerateJobId(null)}
+      />
+    );
+  }
+
+  return (
+    <main className="page-shell">
+      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
+      <div className="mx-auto w-full max-w-7xl">
+        <div className="glass-panel overflow-hidden">
+          <div className="page-header">
+            <h2 className="page-title">Jobs</h2>
+            <p className="page-subtitle">
+              Track job links and your application status
+            </p>
+          </div>
+
+          <div className="space-y-4 p-4 sm:p-6">
+            <form
+              onSubmit={handleAdd}
+              className="card-soft flex flex-col gap-2 p-3 sm:flex-row"
+            >
+              <label htmlFor="job-url" className="sr-only">
+                Job URL
+              </label>
+              <input
+                id="job-url"
+                type="text"
+                inputMode="url"
+                value={jobUrl}
+                onChange={(event) => setJobUrl(event.target.value)}
+                placeholder="Paste a job URL"
+                className="input-shell min-w-0 flex-1"
+                disabled={adding}
+              />
+              <button
+                type="submit"
+                className="btn-primary shrink-0 sm:min-w-24"
+                disabled={adding}
+              >
+                {adding ? "AddingΓÇª" : "Add job"}
+              </button>
+            </form>
+
+            <div className="card-soft flex flex-wrap items-end justify-between gap-3 p-3">
+              <div className="min-w-[11rem]">
+                <label htmlFor="jobs-status-filter" className="filter-label">
+                  Status
+                </label>
+                <select
+                  id="jobs-status-filter"
+                  value={statusFilter}
+                  onChange={(event) =>
+                    setStatusFilter(event.target.value as BidStatus | "")
+                  }
+                  className="filter-select"
+                >
+                  <option value="">All statuses</option>
+                  {BID_STATUSES.map((status) => (
+                    <option key={status} value={status}>
+                      {formatStatus(status)}
+                    </option>
+                  ))}
+                </select>
+              </div>
+
+              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-300">
+                <span>
+                  {filteredJobs.length === 0
+                    ? "No matching jobs"
+                    : `Showing ${(page - 1) * pageSize + 1}ΓÇô${Math.min(
+                        page * pageSize,
+                        filteredJobs.length
+                      )} of ${filteredJobs.length}`}
+                  {filteredJobs.length !== jobs.length ? ` (${jobs.length} total)` : ""}
+                </span>
+                <label className="flex items-center gap-1.5">
+                  <span>Per page</span>
+                  <select
+                    value={pageSize}
+                    onChange={(event) => setPageSize(Number(event.target.value))}
+                    className="select-compact min-w-[4.5rem]"
+                  >
+                    {PAGE_SIZE_OPTIONS.map((size) => (
+                      <option key={size} value={size}>
+                        {size}
+                      </option>
+                    ))}
+                  </select>
+                </label>
+              </div>
+            </div>
+
+            {loading ? (
+              <div className="flex justify-center py-12">
+                <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
+              </div>
+            ) : jobs.length === 0 ? (
+              <div className="empty-state py-12 text-center">
+                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
+                  No jobs yet
+                </p>
+                <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">
+                  Add a job URL above to start tracking it.
+                </p>
+              </div>
+            ) : filteredJobs.length === 0 ? (
+              <div className="empty-state py-12 text-center text-sm text-slate-500 dark:text-slate-300">
+                No jobs match this status.
+              </div>
+            ) : (
+              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-600/60">
+                <table className="w-full min-w-[760px] text-left text-sm">
+                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/90 dark:text-slate-300">
+                    <tr>
+                      <th className="px-4 py-3 font-semibold">URL</th>
+                      <th className="w-44 px-4 py-3 font-semibold">Status</th>
+                      <th className="w-36 px-4 py-3 font-semibold">Added</th>
+                      <th className="w-56 px-4 py-3 text-right font-semibold">Actions</th>
+                    </tr>
+                  </thead>
+                  <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-600/60 dark:bg-slate-900/50">
+                    {visibleJobs.map((job) => {
+                      const busy = busyJobId === job.job_id;
+                      const externalUrl = getExternalJobUrl(job.url);
+                      return (
+                        <tr key={job.job_id}>
+                          <td className="max-w-xl px-4 py-3">
+                            <a
+                              href={externalUrl}
+                              target="_blank"
+                              rel="noopener noreferrer"
+                              className="block truncate font-medium text-blue-600 hover:underline dark:text-blue-400"
+                              title={job.url}
+                            >
+                              {job.url}
+                            </a>
+                          </td>
+                          <td className="px-4 py-3">
+                            <select
+                              value={job.status}
+                              onChange={(event) =>
+                                void handleStatusChange(
+                                  job,
+                                  event.target.value as BidStatus
+                                )
+                              }
+                              disabled={busy}
+                              className="select-compact w-full min-w-[8.5rem]"
+                              aria-label={`Status for ${job.url}`}
+                            >
+                              {BID_STATUSES.map((status) => (
+                                <option key={status} value={status}>
+                                  {formatStatus(status)}
+                                </option>
+                              ))}
+                            </select>
+                          </td>
+                          <td className="whitespace-nowrap px-4 py-3 text-slate-500 dark:text-slate-300">
+                            {formatDate(job.created_at)}
+                          </td>
+                          <td className="px-4 py-3">
+                            <div className="flex justify-end gap-1.5">
+                              <button
+                                type="button"
+                                onClick={() => setGenerateJobId(job.job_id)}
+                                disabled={busy}
+                                className="btn-compact"
+                              >
+                                Generate
+                              </button>
+                              <button
+                                type="button"
+                                onClick={() => void handleOpen(job)}
+                                disabled={busy}
+                                className="btn-compact"
+                              >
+                                Open
+                              </button>
+                              <button
+                                type="button"
+                                onClick={() => void handleCopy(job.url)}
+                                className="btn-compact"
+                              >
+                                Copy
+                              </button>
+                              <button
+                                type="button"
+                                onClick={() => void handleRemove(job)}
+                                disabled={busy}
+                                className="btn-compact text-red-600 dark:text-red-400"
+                              >
+                                Remove
+                              </button>
+                            </div>
+                          </td>
+                        </tr>
+                      );
+                    })}
+                  </tbody>
+                </table>
+              </div>
+            )}
+
+            {filteredJobs.length > 0 && totalPages > 1 ? (
+              <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-4 dark:border-slate-600/60">
+                <button
+                  type="button"
+                  onClick={() => setPage((current) => Math.max(1, current - 1))}
+                  disabled={page === 1}
+                  className="btn-soft text-xs disabled:cursor-not-allowed disabled:opacity-50"
+                >
+                  Previous
+                </button>
+                <span className="text-xs text-slate-500 dark:text-slate-300">
+                  Page {page} of {totalPages}
+                </span>
+                <button
+                  type="button"
+                  onClick={() =>
+                    setPage((current) => Math.min(totalPages, current + 1))
+                  }
+                  disabled={page === totalPages}
+                  className="btn-soft text-xs disabled:cursor-not-allowed disabled:opacity-50"
+                >
+                  Next
+                </button>
+              </div>
+            ) : null}
+          </div>
+        </div>
+      </div>
+    </main>
+  );
+}
diff --git a/frontend/components/AppNav.tsx b/frontend/components/AppNav.tsx
index 8fcbdf4..43d7b54 100644
--- a/frontend/components/AppNav.tsx
+++ b/frontend/components/AppNav.tsx
@@ -11,5 +11,5 @@ import ThemeToggle from "@/components/ThemeToggle";
 const NAV_ITEMS = [
   { href: "/dashboard", label: "Dashboard" },
-  { href: "/generator", label: "Generator" },
+  { href: "/jobs", label: "Jobs" },
   { href: "/history", label: "History" },
   { href: "/statistics", label: "Statistics" },
diff --git a/lib/dashboard-stats.test.ts b/lib/dashboard-stats.test.ts
new file mode 100644
index 0000000..e41a3cb
--- /dev/null
+++ b/lib/dashboard-stats.test.ts
@@ -0,0 +1,56 @@
+import { describe, expect, it } from "vitest";
+import {
+  computeBidSuccessStats,
+  isBidAdvanced,
+  isBidRejected,
+  isBidSucceeded,
+} from "./dashboard-stats";
+import type { BidStatus, ResumeRecord } from "./supabase/database.types";
+
+function resume(id: string, bidStatus: BidStatus): ResumeRecord {
+  return {
+    id,
+    user_id: "user-1",
+    profile_id: null,
+    job_id: null,
+    ai_type: null,
+    model: null,
+    job_site: null,
+    job_link: null,
+    job_title: null,
+    job_company: null,
+    jd_file_path: null,
+    resume_file_path: null,
+    bid_status: bidStatus,
+    created_at: "2026-07-16T00:00:00.000Z",
+    updated_at: "2026-07-16T00:00:00.000Z",
+  };
+}
+
+describe("dashboard bid status compatibility", () => {
+  it.each(["unapplied", "opened"] as const)(
+    "does not treat %s as advanced, rejected, or succeeded",
+    (status) => {
+      const record = resume(status, status);
+
+      expect(isBidAdvanced(record, 0)).toBe(false);
+      expect(isBidRejected(status)).toBe(false);
+      expect(isBidSucceeded(status)).toBe(false);
+    }
+  );
+
+  it("excludes not-yet-applied jobs from success-rate counts", () => {
+    const records = [
+      resume("unapplied", "unapplied"),
+      resume("opened", "opened"),
+      resume("applied", "applied"),
+      resume("interviewing", "interviewing"),
+    ];
+
+    expect(computeBidSuccessStats(records, new Map())).toEqual({
+      bidCount: 2,
+      interviewBidCount: 1,
+      interviewRate: 50,
+    });
+  });
+});
diff --git a/lib/dashboard-stats.ts b/lib/dashboard-stats.ts
index 1c56d2d..8cdee5c 100644
--- a/lib/dashboard-stats.ts
+++ b/lib/dashboard-stats.ts
@@ -33,8 +33,14 @@ export function resolveBidStatusForStats(status: string | null | undefined): str
 }
 
+export function isBidApplied(status: string | null | undefined): boolean {
+  const resolved = resolveBidStatusForStats(status);
+  return resolved !== "unapplied" && resolved !== "opened";
+}
+
 export function isBidAdvanced(
   record: ResumeRecord,
   interviewCountForBid: number
 ): boolean {
+  if (!isBidApplied(record.bid_status)) return false;
   if (interviewCountForBid > 0) return true;
   return resolveBidStatusForStats(record.bid_status) !== DEFAULT_BID_STATUS;
@@ -59,6 +65,7 @@ export function computeBidSuccessStats(
 ): BidSuccessStats {
   let interviewBidCount = 0;
+  const appliedRecords = records.filter((record) => isBidApplied(record.bid_status));
 
-  for (const record of records) {
+  for (const record of appliedRecords) {
     const linked = interviewsByResume.get(record.id) ?? [];
     if (isBidAdvanced(record, linked.length)) {
@@ -67,5 +74,5 @@ export function computeBidSuccessStats(
   }
 
-  const bidCount = records.length;
+  const bidCount = appliedRecords.length;
   const interviewRate =
     bidCount > 0 ? Math.round((interviewBidCount / bidCount) * 1000) / 10 : 0;
diff --git a/lib/job-url.test.ts b/lib/job-url.test.ts
new file mode 100644
index 0000000..19afb89
--- /dev/null
+++ b/lib/job-url.test.ts
@@ -0,0 +1,20 @@
+import { describe, expect, it } from "vitest";
+import { normalizeJobUrl } from "./job-url";
+
+describe("normalizeJobUrl", () => {
+  it("strips query string", () => {
+    expect(normalizeJobUrl("https://jobs.example.com/x?utm_source=li&foo=1")).toBe(
+      "https://jobs.example.com/x"
+    );
+  });
+
+  it("trims and collapses whitespace", () => {
+    expect(normalizeJobUrl("  https://jobs.example.com/a   ")).toBe(
+      "https://jobs.example.com/a"
+    );
+  });
+
+  it("returns empty for blank input", () => {
+    expect(normalizeJobUrl("   ")).toBe("");
+  });
+});
diff --git a/lib/job-url.ts b/lib/job-url.ts
new file mode 100644
index 0000000..e559124
--- /dev/null
+++ b/lib/job-url.ts
@@ -0,0 +1,8 @@
+/** Strip UTM/query params; same rule as Windows Job Tracker. */
+export function normalizeJobUrl(url: string): string {
+  let s = String(url).trim().split(/\s+/).join(" ");
+  if (s.includes("?")) {
+    s = s.split("?", 2)[0] ?? s;
+  }
+  return s;
+}
diff --git a/lib/jobs-page-state.test.ts b/lib/jobs-page-state.test.ts
new file mode 100644
index 0000000..ad1d58f
--- /dev/null
+++ b/lib/jobs-page-state.test.ts
@@ -0,0 +1,41 @@
+import { describe, expect, it } from "vitest";
+import type { UserJobListItem } from "@/lib/supabase/database.types";
+import { filterJobs, getExternalJobUrl, paginateJobs } from "./jobs-page-state";
+
+const JOBS: UserJobListItem[] = [
+  {
+    job_id: "1",
+    url: "example.com/first",
+    created_at: "2026-07-16T00:00:00.000Z",
+    status: "unapplied",
+  },
+  {
+    job_id: "2",
+    url: "https://example.com/second",
+    created_at: "2026-07-15T00:00:00.000Z",
+    status: "applied",
+  },
+  {
+    job_id: "3",
+    url: "http://example.com/third",
+    created_at: "2026-07-14T00:00:00.000Z",
+    status: "applied",
+  },
+];
+
+describe("jobs page state", () => {
+  it("filters jobs by status", () => {
+    expect(filterJobs(JOBS, "applied").map((job) => job.job_id)).toEqual(["2", "3"]);
+    expect(filterJobs(JOBS, "")).toEqual(JOBS);
+  });
+
+  it("paginates filtered jobs", () => {
+    expect(paginateJobs(JOBS, 2, 2).map((job) => job.job_id)).toEqual(["3"]);
+  });
+
+  it("adds https only when a URL has no protocol", () => {
+    expect(getExternalJobUrl("example.com/job")).toBe("https://example.com/job");
+    expect(getExternalJobUrl("https://example.com/job")).toBe("https://example.com/job");
+    expect(getExternalJobUrl("http://example.com/job")).toBe("http://example.com/job");
+  });
+});
diff --git a/lib/jobs-page-state.ts b/lib/jobs-page-state.ts
new file mode 100644
index 0000000..cd09af5
--- /dev/null
+++ b/lib/jobs-page-state.ts
@@ -0,0 +1,21 @@
+import type { BidStatus, UserJobListItem } from "@/lib/supabase/database.types";
+
+export function filterJobs(
+  jobs: UserJobListItem[],
+  status: BidStatus | ""
+): UserJobListItem[] {
+  return status ? jobs.filter((job) => job.status === status) : jobs;
+}
+
+export function paginateJobs(
+  jobs: UserJobListItem[],
+  page: number,
+  pageSize: number
+): UserJobListItem[] {
+  const start = (page - 1) * pageSize;
+  return jobs.slice(start, start + pageSize);
+}
+
+export function getExternalJobUrl(url: string): string {
+  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
+}
diff --git a/lib/supabase/database.types.ts b/lib/supabase/database.types.ts
index d00ea46..08a386a 100644
--- a/lib/supabase/database.types.ts
+++ b/lib/supabase/database.types.ts
@@ -5,4 +5,6 @@ export type WorkType = "Remote" | "Hybrid" | "Onsite";
 
 export type BidStatus =
+  | "unapplied"
+  | "opened"
   | "applied"
   | "interviewing"
@@ -206,4 +208,5 @@ export interface ResumeRecord {
   user_id: string;
   profile_id: string | null;
+  job_id: string | null;
   ai_type: string | null;
   model: string | null;
@@ -252,4 +255,6 @@ export const DEFAULT_BID_STATUS: BidStatus = "applied";
 
 export const BID_STATUSES: BidStatus[] = [
+  "unapplied",
+  "opened",
   "applied",
   "interviewing",
@@ -259,4 +264,17 @@ export const BID_STATUSES: BidStatus[] = [
 ];
 
+export interface JobRecord {
+  id: string;
+  url: string;
+  created_at: string;
+}
+
+export interface UserJobListItem {
+  job_id: string;
+  url: string;
+  created_at: string;
+  status: BidStatus;
+}
+
 export const INTERVIEW_CALL_TYPES: InterviewCallType[] = [
   "intro",
diff --git a/lib/supabase/services/index.ts b/lib/supabase/services/index.ts
index 725a98b..8506f05 100644
--- a/lib/supabase/services/index.ts
+++ b/lib/supabase/services/index.ts
@@ -21,4 +21,12 @@ export {
   type CreateResumeParams,
 } from "@/lib/supabase/services/resumes";
+export {
+  nextStatusAfterOpen,
+  listJobsForUser,
+  addJobForUser,
+  openJobForUser,
+  setJobStatusForUser,
+  removeMyJob,
+} from "@/lib/supabase/services/jobs";
 export {
   listInterviews,
diff --git a/lib/supabase/services/jobs.test.ts b/lib/supabase/services/jobs.test.ts
new file mode 100644
index 0000000..61c941e
--- /dev/null
+++ b/lib/supabase/services/jobs.test.ts
@@ -0,0 +1,86 @@
+import type { SupabaseClient } from "@supabase/supabase-js";
+import { describe, expect, it } from "vitest";
+import { addJobForUser, nextStatusAfterOpen } from "./jobs";
+
+function scriptedClient(
+  responses: Array<{ data: unknown; error: unknown }>
+): SupabaseClient {
+  let query = 0;
+
+  return {
+    from() {
+      const response = responses[query++];
+      const builder = new Proxy(
+        {
+          then(
+            resolve: (value: { data: unknown; error: unknown }) => unknown
+          ) {
+            return Promise.resolve(response).then(resolve);
+          },
+        },
+        {
+          get(target, property) {
+            if (property === "then") return target.then;
+            return () => builder;
+          },
+        }
+      );
+      return builder;
+    },
+  } as unknown as SupabaseClient;
+}
+
+describe("nextStatusAfterOpen", () => {
+  it("promotes unapplied to opened", () => {
+    expect(nextStatusAfterOpen("unapplied")).toBe("opened");
+  });
+
+  it("leaves applied alone", () => {
+    expect(nextStatusAfterOpen("applied")).toBe("applied");
+  });
+});
+
+describe("addJobForUser", () => {
+  const job = {
+    id: "job-1",
+    url: "https://example.com/jobs/1",
+    created_at: "2026-07-16T00:00:00.000Z",
+  };
+
+  it("does not claim catalog creation when a concurrent insert wins", async () => {
+    const client = scriptedClient([
+      { data: null, error: null },
+      { data: null, error: null },
+      { data: job, error: null },
+      { data: { status: "opened" }, error: null },
+    ]);
+
+    const result = await addJobForUser(
+      "user-1",
+      "https://example.com/jobs/1",
+      client
+    );
+
+    expect(result.createdCatalog).toBe(false);
+  });
+
+  it("returns the existing attachment after a concurrent attach wins", async () => {
+    const duplicateKeyError = { code: "23505", message: "duplicate key" };
+    const client = scriptedClient([
+      { data: job, error: null },
+      { data: job, error: null },
+      { data: null, error: null },
+      { data: null, error: duplicateKeyError },
+      { data: { status: "opened" }, error: null },
+    ]);
+
+    const result = await addJobForUser(
+      "user-1",
+      "https://example.com/jobs/1",
+      client
+    );
+
+    expect(result.attached).toBe(false);
+    expect(result.item.status).toBe("opened");
+  });
+});
diff --git a/lib/supabase/services/jobs.ts b/lib/supabase/services/jobs.ts
new file mode 100644
index 0000000..b1c2336
--- /dev/null
+++ b/lib/supabase/services/jobs.ts
@@ -0,0 +1,221 @@
+import type { SupabaseClient } from "@supabase/supabase-js";
+import { normalizeJobUrl } from "@/lib/job-url";
+import type {
+  BidStatus,
+  JobRecord,
+  UserJobListItem,
+} from "@/lib/supabase/database.types";
+
+async function resolveClient(client?: SupabaseClient): Promise<SupabaseClient> {
+  if (client) return client;
+  return (await import("@/lib/supabase")).supabase;
+}
+
+export function nextStatusAfterOpen(status: BidStatus): BidStatus {
+  return status === "unapplied" ? "opened" : status;
+}
+
+interface UserJobStatusWithJob {
+  job_id: string;
+  status: BidStatus;
+  jobs: {
+    url: string;
+    created_at: string;
+  };
+}
+
+function toListItem(row: UserJobStatusWithJob): UserJobListItem {
+  return {
+    job_id: row.job_id,
+    url: row.jobs.url,
+    created_at: row.jobs.created_at,
+    status: row.status,
+  };
+}
+
+async function getUserJob(
+  userId: string,
+  jobId: string,
+  client: SupabaseClient
+): Promise<UserJobListItem> {
+  const { data, error } = await client
+    .from("user_job_status")
+    .select("job_id,status,jobs!inner(url,created_at)")
+    .eq("user_id", userId)
+    .eq("job_id", jobId)
+    .single();
+
+  if (error) throw error;
+  return toListItem(data as unknown as UserJobStatusWithJob);
+}
+
+export async function listJobsForUser(
+  userId: string,
+  client?: SupabaseClient
+): Promise<UserJobListItem[]> {
+  const db = await resolveClient(client);
+  const { data, error } = await db
+    .from("user_job_status")
+    .select("job_id,status,jobs!inner(url,created_at)")
+    .eq("user_id", userId)
+    .order("created_at", { referencedTable: "jobs", ascending: false });
+
+  if (error) throw error;
+  return ((data ?? []) as unknown as UserJobStatusWithJob[]).map(toListItem);
+}
+
+export async function addJobForUser(
+  userId: string,
+  rawUrl: string,
+  client?: SupabaseClient
+): Promise<{
+  item: UserJobListItem;
+  createdCatalog: boolean;
+  attached: boolean;
+}> {
+  const url = normalizeJobUrl(rawUrl);
+  if (!url) throw new Error("Job URL cannot be empty.");
+  const db = await resolveClient(client);
+
+  const { data: existingJob, error: selectError } = await db
+    .from("jobs")
+    .select("id,url,created_at")
+    .eq("url", url)
+    .maybeSingle();
+
+  if (selectError) throw selectError;
+
+  let createdCatalog = false;
+  if (!existingJob) {
+    const { data: insertedJob, error: insertError } = await db
+      .from("jobs")
+      .upsert({ url }, { onConflict: "url", ignoreDuplicates: true })
+      .select("id")
+      .maybeSingle();
+
+    if (insertError) throw insertError;
+    createdCatalog = Boolean(insertedJob);
+  }
+
+  const { data: job, error: jobError } = await db
+    .from("jobs")
+    .select("id,url,created_at")
+    .eq("url", url)
+    .single();
+
+  if (jobError) throw jobError;
+
+  const catalogJob = job as JobRecord;
+  let { data: existingStatus, error: statusError } = await db
+    .from("user_job_status")
+    .select("status")
+    .eq("user_id", userId)
+    .eq("job_id", catalogJob.id)
+    .maybeSingle();
+
+  if (statusError) throw statusError;
+
+  let attached = false;
+  if (!existingStatus) {
+    const { error: attachError } = await db.from("user_job_status").insert({
+      user_id: userId,
+      job_id: catalogJob.id,
+      status: "unapplied",
+    });
+
+    if (attachError?.code === "23505") {
+      const { data: concurrentStatus, error: concurrentStatusError } = await db
+        .from("user_job_status")
+        .select("status")
+        .eq("user_id", userId)
+        .eq("job_id", catalogJob.id)
+        .single();
+
+      if (concurrentStatusError) throw concurrentStatusError;
+      existingStatus = concurrentStatus;
+    } else if (attachError) {
+      throw attachError;
+    } else {
+      attached = true;
+    }
+  }
+
+  return {
+    item: {
+      job_id: catalogJob.id,
+      url: catalogJob.url,
+      created_at: catalogJob.created_at,
+      status: (existingStatus?.status as BidStatus | undefined) ?? "unapplied",
+    },
+    createdCatalog,
+    attached,
+  };
+}
+
+export async function openJobForUser(
+  userId: string,
+  jobId: string,
+  client?: SupabaseClient
+): Promise<UserJobListItem> {
+  const db = await resolveClient(client);
+  const item = await getUserJob(userId, jobId, db);
+  const nextStatus = nextStatusAfterOpen(item.status);
+
+  if (nextStatus !== item.status) {
+    const { error } = await db
+      .from("user_job_status")
+      .update({ status: nextStatus, updated_at: new Date().toISOString() })
+      .eq("user_id", userId)
+      .eq("job_id", jobId);
+
+    if (error) throw error;
+  }
+
+  return { ...item, status: nextStatus };
+}
+
+export async function setJobStatusForUser(
+  userId: string,
+  jobIds: string[],
+  status: BidStatus,
+  client?: SupabaseClient
+): Promise<void> {
+  if (jobIds.length === 0) return;
+
+  const db = await resolveClient(client);
+  const updatedAt = new Date().toISOString();
+  const { error: statusError } = await db.from("user_job_status").upsert(
+    jobIds.map((jobId) => ({
+      user_id: userId,
+      job_id: jobId,
+      status,
+      updated_at: updatedAt,
+    })),
+    { onConflict: "user_id,job_id" }
+  );
+
+  if (statusError) throw statusError;
+
+  const { error: resumeError } = await db
+    .from("resume_history")
+    .update({ bid_status: status, updated_at: updatedAt })
+    .eq("user_id", userId)
+    .in("job_id", jobIds);
+
+  if (resumeError) throw resumeError;
+}
+
+export async function removeMyJob(
+  userId: string,
+  jobId: string,
+  client?: SupabaseClient
+): Promise<void> {
+  const db = await resolveClient(client);
+  const { error } = await db
+    .from("user_job_status")
+    .delete()
+    .eq("user_id", userId)
+    .eq("job_id", jobId);
+
+  if (error) throw error;
+}
diff --git a/lib/supabase/services/resumes.ts b/lib/supabase/services/resumes.ts
index 9fe1973..0b76418 100644
--- a/lib/supabase/services/resumes.ts
+++ b/lib/supabase/services/resumes.ts
@@ -15,4 +15,6 @@ export interface CreateResumeParams {
   userId: string;
   profileId?: string | null;
+  jobId?: string | null;
+  bidStatus?: BidStatus;
   jd: string;
   resume: UpdatedResume;
@@ -45,4 +47,5 @@ export async function createResumeWithArtifacts(
       user_id: params.userId,
       profile_id: params.profileId ?? null,
+      job_id: params.jobId ?? null,
       ai_type: params.aiType ?? null,
       model: params.model ?? null,
@@ -53,5 +56,5 @@ export async function createResumeWithArtifacts(
       jd_file_path: jdFilePath,
       resume_file_path: resumeFilePath,
-      bid_status: "applied",
+      bid_status: params.bidStatus ?? "applied",
     })
     .select("*")
@@ -89,5 +92,21 @@ export async function updateResumeBidStatus(
 
   if (error) throw error;
-  return data as ResumeRecord;
+
+  const record = data as ResumeRecord;
+  if (record.job_id) {
+    const { error: statusError } = await client.from("user_job_status").upsert(
+      {
+        user_id: record.user_id,
+        job_id: record.job_id,
+        status: bidStatus,
+        updated_at: record.updated_at,
+      },
+      { onConflict: "user_id,job_id" }
+    );
+
+    if (statusError) throw statusError;
+  }
+
+  return record;
 }
 
diff --git a/supabase/migrations/007_jobs_tracker.sql b/supabase/migrations/007_jobs_tracker.sql
new file mode 100644
index 0000000..0f9a7ef
--- /dev/null
+++ b/supabase/migrations/007_jobs_tracker.sql
@@ -0,0 +1,56 @@
+-- Jobs tracker: global catalog + per-user status.
+-- Run in Supabase Dashboard -> SQL Editor. Safe to re-run.
+
+create table if not exists public.jobs (
+  id uuid primary key default gen_random_uuid(),
+  url text not null,
+  created_at timestamptz not null default now(),
+  constraint jobs_url_unique unique (url)
+);
+
+alter table public.jobs enable row level security;
+
+drop policy if exists "jobs_select_authenticated" on public.jobs;
+create policy "jobs_select_authenticated" on public.jobs
+  for select to authenticated using (true);
+
+drop policy if exists "jobs_insert_authenticated" on public.jobs;
+create policy "jobs_insert_authenticated" on public.jobs
+  for insert to authenticated with check (true);
+
+-- No update/delete policies for authenticated users in v1.
+create table if not exists public.user_job_status (
+  user_id uuid not null references public.profiles (id) on delete cascade,
+  job_id uuid not null references public.jobs (id) on delete cascade,
+  status text not null default 'unapplied'
+    check (status in (
+      'unapplied', 'opened', 'applied', 'interviewing',
+      'rejected', 'offer', 'accepted'
+    )),
+  updated_at timestamptz not null default now(),
+  primary key (user_id, job_id)
+);
+
+create index if not exists user_job_status_user_id_idx on public.user_job_status (user_id);
+
+alter table public.user_job_status enable row level security;
+
+drop policy if exists "user_job_status_all_own" on public.user_job_status;
+create policy "user_job_status_all_own" on public.user_job_status
+  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
+
+alter table public.resume_history
+  add column if not exists job_id uuid references public.jobs (id) on delete set null;
+
+create index if not exists resume_history_job_id_idx on public.resume_history (job_id);
+
+-- The inline CHECK in schema.sql is generated as resume_history_bid_status_check.
+alter table public.resume_history
+  drop constraint if exists resume_history_bid_status_check;
+
+alter table public.resume_history
+  add constraint resume_history_bid_status_check
+  check (bid_status in (
+    'unapplied', 'opened', 'applied', 'interviewing',
+    'rejected', 'offer', 'accepted'
+  ));
diff --git a/supabase/schema.sql b/supabase/schema.sql
index 793dd26..96b1eae 100644
--- a/supabase/schema.sql
+++ b/supabase/schema.sql
@@ -314,2 +314,59 @@ create index if not exists user_projects_profile_id_idx       on public.user_pro
 create index if not exists user_companies_profile_id_idx      on public.user_companies (profile_id);
 create index if not exists resume_history_profile_id_idx      on public.resume_history (profile_id);
+
+-- ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
+-- Jobs tracker ΓÇö shared URL catalog + per-user status
+-- ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
+create table if not exists public.jobs (
+  id uuid primary key default gen_random_uuid(),
+  url text not null,
+  created_at timestamptz not null default now(),
+  constraint jobs_url_unique unique (url)
+);
+
+alter table public.jobs enable row level security;
+
+drop policy if exists "jobs_select_authenticated" on public.jobs;
+create policy "jobs_select_authenticated" on public.jobs
+  for select to authenticated using (true);
+
+drop policy if exists "jobs_insert_authenticated" on public.jobs;
+create policy "jobs_insert_authenticated" on public.jobs
+  for insert to authenticated with check (true);
+
+-- No update/delete policies for authenticated users in v1.
+create table if not exists public.user_job_status (
+  user_id uuid not null references public.profiles (id) on delete cascade,
+  job_id uuid not null references public.jobs (id) on delete cascade,
+  status text not null default 'unapplied'
+    check (status in (
+      'unapplied', 'opened', 'applied', 'interviewing',
+      'rejected', 'offer', 'accepted'
+    )),
+  updated_at timestamptz not null default now(),
+  primary key (user_id, job_id)
+);
+
+create index if not exists user_job_status_user_id_idx on public.user_job_status (user_id);
+
+alter table public.user_job_status enable row level security;
+
+drop policy if exists "user_job_status_all_own" on public.user_job_status;
+create policy "user_job_status_all_own" on public.user_job_status
+  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
+
+alter table public.resume_history
+  add column if not exists job_id uuid references public.jobs (id) on delete set null;
+
+create index if not exists resume_history_job_id_idx on public.resume_history (job_id);
+
+-- Expand the generated inline CHECK constraint to the complete status set.
+alter table public.resume_history
+  drop constraint if exists resume_history_bid_status_check;
+
+alter table public.resume_history
+  add constraint resume_history_bid_status_check
+  check (bid_status in (
+    'unapplied', 'opened', 'applied', 'interviewing',
+    'rejected', 'offer', 'accepted'
+  ));

```
