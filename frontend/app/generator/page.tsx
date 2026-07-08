"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";
import OpenRouterModelSelect from "@/components/OpenRouterModelSelect";
import DirectProviderModelSelect from "@/components/DirectProviderModelSelect";
import AnalysisResultCard, {
  type AnalysisSessionView,
} from "@/components/AnalysisResultCard";
import AnswerQuestionsDialog from "@/components/AnswerQuestionsDialog";
import ApplyAlertDialog from "@/components/ApplyAlertDialog";
import { ToastContainer, useToast } from "@/components/Toast";
import {
  DEFAULT_JOBSITE,
  JOBSITES,
  type JobsiteId,
} from "@/lib/jobsites";
import {
  DEFAULT_OPENROUTER_MODEL,
  getModelProvider,
} from "@/lib/openrouter-shared";
import type { JobWorkType } from "@/lib/prompts/job-page-extract";
import { extractedJobIsHybridOrOnsite } from "@/lib/job-work-type";
import type { AnalysisResult } from "@/lib/types/resume";
import type { LegacyAnalyzeProfile } from "@/lib/mappers/profile-to-resume";
import { loadProfileForApp } from "@/lib/supabase/load-profile-for-app";
import { loadApplyAlertSettings } from "@/lib/supabase/services/apply-alert-settings";
import { listResumes } from "@/lib/supabase/services/resumes";
import { createResumeWithArtifacts } from "@/lib/supabase/services/resumes";
import {
  findDuplicateCompanyApplications,
  type DuplicateApplicationMatch,
} from "@/lib/apply-alerts";
import {
  DEFAULT_APPLY_ALERT_SETTINGS,
  type ApplyAlertSettings,
} from "@/lib/apply-alert-settings";
import {
  DEFAULT_RESUME_TEMPLATE,
  resolveResumeTemplate,
  type ResumeTemplateId,
} from "@/lib/resume-templates";
import { formatPdfSaveMessage, saveGeneratedResumeToDownloads } from "@/lib/pdf-download";
import type { ExtractedJobInfo } from "@/lib/extract-job-page";
import {
  DEFAULT_DIRECT_MODELS,
  isDirectAIProvider,
  type DirectAIProvider,
  type DirectProviderModels,
  type DirectAiModelsResponse,
} from "@/lib/direct-ai-shared";
import type { AtsMatchResult } from "@/lib/types/ats-match";
import { fetchAtsMatch } from "@/lib/check-ats-client";
import { DEFAULT_AI_SETTINGS } from "@/lib/ai-settings";
import { loadAiSettings } from "@/lib/supabase/services/ai-settings";
import { apiUrl } from "@/lib/api-config";
import {
  loadGeneratorWorkspace,
  normalizeSessionForStorage,
  restoreSessionFromStorage,
  saveGeneratorWorkspace,
  SETTINGS_UPDATED_EVENT,
} from "@/lib/generator-workspace-storage";

interface AnalysisResponse {
  resume: AnalysisResult;
  providerUsed?: string;
  modelUsed?: string;
  jobTitle?: string;
  companyName?: string;
  jobDescription?: string;
  generationCostUsd?: number;
}

interface AnalysisSession {
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
  aiProvider: string;
  aiModel: string;
  useOpenRouter: boolean;
  jobsite: JobsiteId;
  generating: boolean;
  generateError: string | null;
  result: AnalysisResult | null;
  downloading?: boolean;
  downloadError?: string | null;
  resumeId?: string;
  resumeTemplate?: string;
  providerUsed?: string;
  modelUsed?: string;
  extractMs?: number;
  analyzeMs?: number;
  pdfMs?: number;
  atsLoading?: boolean;
  atsResult?: AtsMatchResult | null;
  atsError?: string | null;
  extractCostUsd?: number;
  generationCostUsd?: number;
  atsCostUsd?: number;
}

let sessionCounter = 0;

async function fetchDirectModels(): Promise<DirectProviderModels> {
  const response = await fetch(apiUrl("/api/direct-ai-models"));
  if (!response.ok) throw new Error("Failed to load direct AI models");
  const data = (await response.json()) as DirectAiModelsResponse;
  return data.models;
}

function createSessionId(): string {
  sessionCounter += 1;
  return `analysis-${Date.now()}-${sessionCounter}`;
}

function toSessionView(session: AnalysisSession): AnalysisSessionView {
  return {
    id: session.id,
    jobTitle: session.jobTitle,
    companyName: session.companyName,
    jobDescription: session.jobDescription,
    jobType: session.jobType,
    jobTypes: session.jobTypes,
    requiresTravel: session.requiresTravel,
    salary: session.salary,
    postedDate: session.postedDate,
    aiProvider: session.aiProvider,
    aiModel: session.aiModel,
    useOpenRouter: session.useOpenRouter,
    jobsite: session.jobsite,
    generating: session.generating,
    generateError: session.generateError,
    result: session.result,
    downloading: session.downloading,
    downloadError: session.downloadError,
    providerUsed: session.providerUsed,
    modelUsed: session.modelUsed,
    extractMs: session.extractMs,
    analyzeMs: session.analyzeMs,
    pdfMs: session.pdfMs,
    atsLoading: session.atsLoading,
    atsResult: session.atsResult,
    atsError: session.atsError,
    extractCostUsd: session.extractCostUsd,
    generationCostUsd: session.generationCostUsd,
    atsCostUsd: session.atsCostUsd,
  };
}

export default function GeneratorPage() {
  const { user } = useAuth();
  const { toasts, showToast, dismissToast } = useToast();

  const [useOpenRouter, setUseOpenRouter] = useState(DEFAULT_AI_SETTINGS.use_openrouter);
  const [autoAtsAfterResume, setAutoAtsAfterResume] = useState(
    DEFAULT_AI_SETTINGS.auto_ats_after_resume
  );
  const [directModels, setDirectModels] =
    useState<DirectProviderModels>(DEFAULT_DIRECT_MODELS);
  const [aiProvider, setAiProvider] = useState(getModelProvider(DEFAULT_OPENROUTER_MODEL));
  const [aiModel, setAiModel] = useState(DEFAULT_OPENROUTER_MODEL);
  const [jobsite, setJobsite] = useState<JobsiteId>(DEFAULT_JOBSITE);
  const [pageContent, setPageContent] = useState("");
  const [analysing, setAnalysing] = useState(false);

  const [sessions, setSessions] = useState<AnalysisSession[]>([]);
  const [answerDialogSessionId, setAnswerDialogSessionId] = useState<string | null>(null);

  const [profileData, setProfileData] = useState<LegacyAnalyzeProfile | null>(null);
  const [resumeContent, setResumeContent] = useState("");
  const [resumeTemplate, setResumeTemplate] =
    useState<ResumeTemplateId>(DEFAULT_RESUME_TEMPLATE);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [applyAlertSettings, setApplyAlertSettings] = useState<ApplyAlertSettings>(
    DEFAULT_APPLY_ALERT_SETTINGS
  );

  const [alertOpen, setAlertOpen] = useState(false);
  const [duplicateMatches, setDuplicateMatches] = useState<DuplicateApplicationMatch[]>([]);
  const [showHybridOnsiteAlert, setShowHybridOnsiteAlert] = useState(false);
  const [pendingGenerateSessionId, setPendingGenerateSessionId] = useState<string | null>(
    null
  );

  const profileLoadedRef = useRef(false);
  const hydratedUserIdRef = useRef<string | null>(null);

  const reloadPreferences = useCallback(async () => {
    if (!user?.id) return;

    const [loadedAi, loadedAlerts] = await Promise.all([
      loadAiSettings(user.id),
      loadApplyAlertSettings(user.id),
    ]);
    setUseOpenRouter(loadedAi.use_openrouter);
    setAutoAtsAfterResume(loadedAi.auto_ats_after_resume);
    setApplyAlertSettings(loadedAlerts);

    if (!loadedAi.use_openrouter) {
      try {
        const models = await fetchDirectModels();
        setDirectModels(models);
        setAiProvider((prev) => {
          const provider: DirectAIProvider =
            prev === "openai" || prev === "anthropic" || prev === "deepseek"
              ? (prev as DirectAIProvider)
              : "openai";
          setAiModel(models[provider]);
          return provider;
        });
      } catch (error) {
        console.warn("Failed to reload direct AI models:", error);
      }
    }
  }, [user?.id]);

  const patchSession = useCallback((id: string, patch: Partial<AnalysisSession>) => {
    setSessions((prev) =>
      prev.map((session) => (session.id === id ? { ...session, ...patch } : session))
    );
  }, []);

  const runAutoAtsCheck = useCallback(
    async (
      sessionId: string,
      resume: AnalysisResult,
      context: {
        jobDescription: string;
        aiModel: string;
        aiProvider: string;
        useOpenRouter: boolean;
        accessToken: string;
      }
    ) => {
      if (!context.jobDescription.trim()) return;

      patchSession(sessionId, {
        atsLoading: true,
        atsResult: null,
        atsError: null,
      });

      try {
        const ats = await fetchAtsMatch({
          resume,
          jd: context.jobDescription,
          apiModel: context.aiModel,
          apiProvider: context.aiProvider,
          useOpenRouter: context.useOpenRouter,
          accessToken: context.accessToken,
        });
        patchSession(sessionId, {
          atsLoading: false,
          atsResult: ats.ats,
          atsError: null,
          atsCostUsd: ats.atsCostUsd,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to check ATS match";
        patchSession(sessionId, { atsLoading: false, atsResult: null, atsError: message });
        console.warn("Auto ATS check failed:", message);
      }
    },
    [patchSession]
  );

  useEffect(() => {
    if (!user?.id || hydratedUserIdRef.current === user.id) return;

    hydratedUserIdRef.current = user.id;
    const saved = loadGeneratorWorkspace(user.id);
    if (!saved) return;

    setPageContent(saved.pageContent);
    setJobsite(saved.jobsite);
    setSessions(saved.sessions.map((session) => restoreSessionFromStorage(session)));
    sessionCounter = Math.max(sessionCounter, saved.sessions.length);
    setLoadingProfile(false);
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;

    const timer = window.setTimeout(() => {
      saveGeneratorWorkspace(user.id, {
        pageContent,
        jobsite,
        sessions: sessions.map((session) => normalizeSessionForStorage(session)),
      });
    }, 400);

    return () => window.clearTimeout(timer);
  }, [user?.id, pageContent, jobsite, sessions]);

  useEffect(() => {
    if (!user?.id) return;

    const onSettingsUpdated = () => void reloadPreferences();
    window.addEventListener(SETTINGS_UPDATED_EVENT, onSettingsUpdated);
    return () => window.removeEventListener(SETTINGS_UPDATED_EVENT, onSettingsUpdated);
  }, [user?.id, reloadPreferences]);

  useEffect(() => {
    if (!user?.id) return;

    let cancelled = false;
    (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session || cancelled) return;

        const loaded = await loadProfileForApp(supabase, {
          email: user.email,
          userId: user.id,
        });
        if (cancelled) return;

        setProfileData(loaded.legacyAnalyzeProfile);
        setResumeContent(loaded.resumeText);
        setResumeTemplate(
          resolveResumeTemplate(loaded.legacyAnalyzeProfile.default_resume?.resume_template)
        );

        const alertSettings = await loadApplyAlertSettings(user.id);
        if (!cancelled) setApplyAlertSettings(alertSettings);

        const loadedAi = await loadAiSettings(user.id);
        if (!cancelled) {
          setUseOpenRouter(loadedAi.use_openrouter);
          setAutoAtsAfterResume(loadedAi.auto_ats_after_resume);
          if (!loadedAi.use_openrouter) {
            try {
              const models = await fetchDirectModels();
              if (cancelled) return;
              setDirectModels(models);
              setAiProvider("openai");
              setAiModel(models.openai);
            } catch (error) {
              console.warn("Failed to load direct AI models:", error);
              setAiProvider("openai");
              setAiModel(DEFAULT_DIRECT_MODELS.openai);
            }
          }
        }

        if (!profileLoadedRef.current && loaded.resumeText.trim()) {
          profileLoadedRef.current = true;
        }
      } catch (error) {
        console.warn("Error loading profile:", error);
      } finally {
        if (!cancelled) setLoadingProfile(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.email]);

  useEffect(() => {
    if (useOpenRouter) return;
    const provider: DirectAIProvider = isDirectAIProvider(aiProvider) ? aiProvider : "openai";
    setAiModel(directModels[provider]);
  }, [directModels, useOpenRouter, aiProvider]);

  const dismissSession = useCallback((sessionId: string) => {
    setSessions((prev) => prev.filter((session) => session.id !== sessionId));
    setAnswerDialogSessionId((current) => (current === sessionId ? null : current));
  }, []);

  const addSessionFromExtracted = useCallback(
    (
      extracted: ExtractedJobInfo,
      sourceContent: string,
      extractMs?: number,
      extractCostUsd?: number
    ) => {
      const provider = useOpenRouter ? getModelProvider(aiModel) : aiProvider;
      const newSession: AnalysisSession = {
        id: createSessionId(),
        createdAt: Date.now(),
        pageContent: sourceContent,
        jobTitle: extracted.jobTitle,
        companyName: extracted.companyName,
        jobDescription: extracted.jobDescription,
        jobType: extracted.jobType,
        jobTypes: extracted.jobTypes,
        requiresTravel: extracted.requiresTravel,
        salary: extracted.salary,
        postedDate: extracted.postedDate,
        aiProvider: provider,
        aiModel,
        useOpenRouter,
        jobsite,
        generating: false,
        generateError: null,
        result: null,
        extractMs,
        extractCostUsd,
      };
      setSessions((prev) => [newSession, ...prev]);
      setPageContent("");
      showToast("success", "Job analysed — added to the list.");
    },
    [aiModel, aiProvider, jobsite, showToast, useOpenRouter]
  );

  const runPreflightBeforeGenerate = useCallback(
    async (sessionId: string): Promise<boolean> => {
      const session = sessions.find((item) => item.id === sessionId);
      if (!session || !user?.id) return false;

      let duplicates: DuplicateApplicationMatch[] = [];
      let hybridOnsite = false;

      if (
        applyAlertSettings.duplicate_apply_alert_enabled &&
        session.companyName.trim()
      ) {
        try {
          const records = await listResumes(user.id);
          duplicates = findDuplicateCompanyApplications(
            records,
            session.companyName,
            applyAlertSettings.duplicate_apply_months
          );
        } catch (error) {
          console.warn("Failed to check duplicate applications:", error);
        }
      }

      if (applyAlertSettings.hybrid_onsite_alert_enabled) {
        hybridOnsite = extractedJobIsHybridOrOnsite({
          jobType: session.jobType,
          jobTypes: session.jobTypes,
        });
      }

      if (duplicates.length > 0 || hybridOnsite) {
        setPendingGenerateSessionId(sessionId);
        setDuplicateMatches(duplicates);
        setShowHybridOnsiteAlert(hybridOnsite);
        setAlertOpen(true);
        return true;
      }

      return false;
    },
    [sessions, user?.id, applyAlertSettings]
  );

  const handleAnalyse = async () => {
    if (analysing || loadingProfile) return;
    if (!pageContent.trim()) {
      showToast("warning", "Paste the job posting page content first.");
      return;
    }
    if (!user?.id) return;

    setAnalysing(true);
    const extractStarted = Date.now();
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("You must be signed in");

      const response = await fetch(apiUrl("/api/extract-job"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ pageContent, useOpenRouter }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          typeof errorData.error === "string" ? errorData.error : "Failed to analyse job"
        );
      }

      const payload = (await response.json()) as ExtractedJobInfo & {
        extractCostUsd?: number;
      };
      const { extractCostUsd, ...extracted } = payload;
      const extractMs = Date.now() - extractStarted;
      addSessionFromExtracted(extracted, pageContent, extractMs, extractCostUsd);
    } catch (error) {
      showToast(
        "error",
        error instanceof Error ? error.message : "Failed to analyse job"
      );
    } finally {
      setAnalysing(false);
    }
  };

  const generateResumeForSession = useCallback(
    async (sessionId: string) => {
      const session = sessions.find((s) => s.id === sessionId);
      if (!session || session.generating || session.downloading) return;

      if (!resumeContent.trim() || !profileData) {
        showToast("warning", "No profile resume — go to Profile first.");
        return;
      }
      if (!user?.id) return;

      patchSession(sessionId, {
        generating: true,
        downloading: false,
        generateError: null,
        downloadError: null,
        result: null,
        resumeId: undefined,
        providerUsed: undefined,
        modelUsed: undefined,
        analyzeMs: undefined,
        pdfMs: undefined,
        generationCostUsd: undefined,
        atsCostUsd: undefined,
        atsLoading: false,
        atsResult: null,
        atsError: null,
        resumeTemplate,
      });

      let pdfPhase = false;

      try {
        const {
          data: { session: authSession },
        } = await supabase.auth.getSession();
        if (!authSession) throw new Error("You must be signed in to generate a resume");

        const analyzeStarted = Date.now();
        const response = await fetch(apiUrl("/api/analyze"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authSession.access_token}`,
          },
          body: JSON.stringify({
            jd: session.jobDescription,
            jobTitle: session.jobTitle,
            companyName: session.companyName,
            pageContent: session.pageContent,
            resumeContent,
            template: resumeTemplate,
            profileData,
            apiModel: session.aiModel,
            apiProvider: session.aiProvider,
            useOpenRouter: session.useOpenRouter,
          }),
        });

        if (!response.ok) {
          let errorMessage = "Failed to generate resume";
          try {
            const errorData = await response.json();
            errorMessage =
              typeof errorData.error === "string" && errorData.error.trim()
                ? errorData.error
                : errorMessage;
          } catch {
            errorMessage = `HTTP ${response.status}: ${response.statusText}`;
          }
          throw new Error(errorMessage);
        }

        const data: AnalysisResponse = await response.json();
        const resume = data.resume;
        const analyzeMs = Date.now() - analyzeStarted;

        patchSession(sessionId, {
          result: resume,
          generating: false,
          downloading: true,
          providerUsed: data.providerUsed,
          modelUsed: data.modelUsed,
          analyzeMs,
          generationCostUsd: data.generationCostUsd,
          jobTitle: data.jobTitle?.trim() || session.jobTitle,
          companyName: data.companyName?.trim() || session.companyName,
          jobDescription: data.jobDescription?.trim() || session.jobDescription,
        });

        pdfPhase = true;
        const pdfStarted = Date.now();

        const [{ savedPath }, record] = await Promise.all([
          saveGeneratedResumeToDownloads(resume, undefined, {
            companyName: session.companyName,
            jobRole: session.jobTitle,
            personName: resume.name || "resume",
            template: resumeTemplate,
            accessToken: authSession.access_token,
          }),
          createResumeWithArtifacts({
            userId: user.id,
            jd: session.jobDescription,
            resume,
            aiType: data.providerUsed ?? session.aiProvider,
            model: data.modelUsed ?? session.aiModel,
            jobSite: session.jobsite,
            jobLink: null,
            jobTitle: session.jobTitle.trim() || null,
            jobCompany: session.companyName.trim() || null,
          }),
        ]);

        patchSession(sessionId, {
          resumeId: record.id,
          downloading: false,
          pdfMs: Date.now() - pdfStarted,
        });
        showToast("success", formatPdfSaveMessage(savedPath, true));

        if (autoAtsAfterResume) {
          void runAutoAtsCheck(sessionId, resume, {
            jobDescription: data.jobDescription?.trim() || session.jobDescription,
            aiModel: session.aiModel,
            aiProvider: session.aiProvider,
            useOpenRouter: session.useOpenRouter,
            accessToken: authSession.access_token,
          });
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "An error occurred";
        patchSession(sessionId, {
          generating: false,
          downloading: false,
          ...(pdfPhase ? { downloadError: message } : { generateError: message }),
        });
        showToast("error", `Failed: ${message}`);
      }
    },
    [sessions, resumeContent, profileData, resumeTemplate, patchSession, showToast, user?.id, autoAtsAfterResume, runAutoAtsCheck]
  );

  const handleGenerateResume = useCallback(
    async (sessionId: string) => {
      const blocked = await runPreflightBeforeGenerate(sessionId);
      if (!blocked) {
        await generateResumeForSession(sessionId);
      }
    },
    [generateResumeForSession, runPreflightBeforeGenerate]
  );

  const answerDialogSession = sessions.find((s) => s.id === answerDialogSessionId) ?? null;

  if (!user) return null;

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden p-4 lg:p-5">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      <ApplyAlertDialog
        open={alertOpen}
        duplicateMatches={duplicateMatches}
        duplicateMonths={applyAlertSettings.duplicate_apply_months}
        showHybridOnsite={showHybridOnsiteAlert}
        onCancel={() => {
          setAlertOpen(false);
          setPendingGenerateSessionId(null);
        }}
        onContinue={() => {
          setAlertOpen(false);
          const sessionId = pendingGenerateSessionId;
          setPendingGenerateSessionId(null);
          if (sessionId) {
            void generateResumeForSession(sessionId);
          }
        }}
      />

      <AnswerQuestionsDialog
        open={answerDialogSessionId !== null}
        onClose={() => setAnswerDialogSessionId(null)}
        result={answerDialogSession?.result ?? null}
        apiModel={answerDialogSession?.aiModel ?? aiModel}
        apiProvider={answerDialogSession?.aiProvider ?? aiProvider}
        useOpenRouter={answerDialogSession?.useOpenRouter ?? useOpenRouter}
        onError={(message) => showToast("error", message)}
      />

      <div className="flex min-h-0 flex-1 gap-4 overflow-hidden">
        <div className="panel flex min-h-0 w-full max-w-md flex-col overflow-hidden lg:max-w-lg">
          <p className="label-kicker mb-4 flex-shrink-0">Analyse job</p>

          <div className="mb-4 flex-shrink-0 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {useOpenRouter ? (
                <OpenRouterModelSelect
                  aiProvider={aiProvider}
                  aiModel={aiModel}
                  disabled={analysing}
                  onProviderChange={setAiProvider}
                  onModelChange={(model) => {
                    setAiModel(model);
                    setAiProvider(getModelProvider(model));
                  }}
                />
              ) : (
                <DirectProviderModelSelect
                  aiProvider={aiProvider as DirectAIProvider}
                  aiModel={aiModel}
                  directModels={directModels}
                  disabled={analysing}
                  onProviderChange={(provider) => {
                    setAiProvider(provider);
                  }}
                  onModelChange={setAiModel}
                />
              )}
            </div>
            <div>
              <label htmlFor="jobsite" className="label-kicker mb-2 block">
                Jobsite
              </label>
              <select
                id="jobsite"
                value={jobsite}
                disabled={analysing}
                onChange={(e) => setJobsite(e.target.value as JobsiteId)}
                className="select-shell w-full text-xs disabled:cursor-not-allowed disabled:opacity-50"
              >
                {JOBSITES.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col">
            <label htmlFor="pageContent" className="label-kicker mb-2 block flex-shrink-0">
              Job page content
            </label>
            <textarea
              id="pageContent"
              value={pageContent}
              onChange={(e) => setPageContent(e.target.value)}
              placeholder="Paste the full job posting page (title, company, description)…"
              className="input-shell min-h-0 flex-1 resize-none"
              disabled={analysing}
            />
          </div>

          <button
            type="button"
            onClick={() => void handleAnalyse()}
            disabled={analysing || loadingProfile}
            className="btn-primary mt-4 w-full flex-shrink-0"
          >
            {analysing
              ? "Analysing…"
              : loadingProfile
                ? "Loading profile…"
                : "Analyse"}
          </button>
        </div>

        <div className="panel flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-4">
          <div className="mb-3 flex flex-shrink-0 items-center justify-between gap-2">
            <p className="label-kicker">Analysis results</p>
            {sessions.length > 0 ? (
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {sessions.length}
              </span>
            ) : null}
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-0.5">
            {sessions.length === 0 ? (
              <div className="empty-state flex h-full min-h-[9rem] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200/90 bg-slate-50/50 px-4 py-6 dark:border-slate-600/60 dark:bg-slate-800/40">
                <div className="empty-state-icon mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-slate-200/80 dark:bg-slate-800 dark:ring-slate-600/60">
                  <svg className="h-5 w-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.8}
                      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                    />
                  </svg>
                </div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  No analyses yet
                </p>
                <p className="mt-1 max-w-xs text-center text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                  Paste a job page on the left and click Analyse to start.
                </p>
              </div>
            ) : (
              sessions.map((session) => (
                <AnalysisResultCard
                  key={session.id}
                  session={toSessionView(session)}
                  onGenerateResume={handleGenerateResume}
                  onGenerateAnswers={setAnswerDialogSessionId}
                  onClose={dismissSession}
                  onError={(message) => showToast("error", message)}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
