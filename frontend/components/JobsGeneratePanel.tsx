"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";
import AnalysisResultCard, {
  type AnalysisSessionView,
} from "@/components/AnalysisResultCard";
import AnswerQuestionsDialog from "@/components/AnswerQuestionsDialog";
import ApplyAlertDialog from "@/components/ApplyAlertDialog";
import ResumePreviewDialog from "@/components/ResumePreviewDialog";
import { ToastContainer, useToast } from "@/components/Toast";
import { getExternalJobUrl } from "@/lib/jobs-page-state";
import { normalizeJobUrl } from "@/lib/job-url";
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
import type { BidStatus, ResumeProfile } from "@/lib/supabase/database.types";
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
import {
  formatPdfSaveMessage,
  renderResumePdfBase64,
  savePdfToDownloadsFolder,
} from "@/lib/pdf-download";
import type { ExtractedJobInfo } from "@/lib/extract-job-page";
import type { AtsMatchResult } from "@/lib/types/ats-match";
import type { EnrichmentRecommendation } from "@/lib/types/tailoring";
import {
  formatClearanceToastMessage,
  NO_CLEARANCE,
  type ClearanceAnalysis,
} from "@/lib/clearance-warning";
import { fetchAtsMatch } from "@/lib/check-ats-client";
import { DEFAULT_AI_SETTINGS } from "@/lib/ai-settings";
import { loadAiSettings } from "@/lib/supabase/services/ai-settings";
import { apiUrl } from "@/lib/api-config";
import {
  pollAnalyzeJob,
  type AnalysisResponse,
} from "@/lib/analyze-job-client";
import { notifyCompletion } from "@/lib/desktop-notify";
import {
  loadGeneratorWorkspace,
  normalizeSessionForStorage,
  restoreSessionFromStorage,
  saveGeneratorWorkspace,
  SETTINGS_UPDATED_EVENT,
} from "@/lib/generator-workspace-storage";

/** Jobs Analyse always uses OpenRouter OpenAI GPT-4.1 Mini — no model picker. */
const FIXED_USE_OPENROUTER = true;
const FIXED_AI_MODEL = DEFAULT_OPENROUTER_MODEL;
const FIXED_AI_PROVIDER = getModelProvider(FIXED_AI_MODEL);

export interface JobsGeneratePanelProps {
  jobId: string;
  jobUrl: string;
  bidStatus: BidStatus;
  onBack: () => void;
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
  desiredTitle: string;
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
  enrichment?: EnrichmentRecommendation[] | null;
  clearance?: ClearanceAnalysis | null;
  previewPdfBase64?: string;
  previewLoading?: boolean;
}

let sessionCounter = 0;

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
    enrichment: session.enrichment,
    clearance: session.clearance,
  };
}

export default function JobsGeneratePanel({
  jobId,
  jobUrl,
  bidStatus,
  onBack,
}: JobsGeneratePanelProps) {
  const { user } = useAuth();
  const { toasts, showToast, dismissToast } = useToast();

  const [autoAtsAfterResume, setAutoAtsAfterResume] = useState(
    DEFAULT_AI_SETTINGS.auto_ats_after_resume
  );
  const [showPdfPreviewAfterResume, setShowPdfPreviewAfterResume] = useState(
    DEFAULT_AI_SETTINGS.show_pdf_preview_after_resume
  );
  const [jobsite, setJobsite] = useState<JobsiteId>(DEFAULT_JOBSITE);
  const [desiredTitle, setDesiredTitle] = useState("");
  const [pageContent, setPageContent] = useState("");
  const [analysing, setAnalysing] = useState(false);

  const [sessions, setSessions] = useState<AnalysisSession[]>([]);
  const [answerDialogSessionId, setAnswerDialogSessionId] = useState<string | null>(null);

  const [profileData, setProfileData] = useState<LegacyAnalyzeProfile | null>(null);
  const [profiles, setProfiles] = useState<ResumeProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string>("");
  const [promptOverrides, setPromptOverrides] = useState<Record<string, string> | undefined>(
    undefined
  );
  const [switchingProfile, setSwitchingProfile] = useState(false);
  const [previewSessionId, setPreviewSessionId] = useState<string | null>(null);
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
  const hydratedWorkspaceKeyRef = useRef<string | null>(null);

  const normalizedJobUrl = normalizeJobUrl(jobUrl);
  const workspaceKey = user?.id ? `${user.id}:${jobId}` : null;

  const reloadPreferences = useCallback(async () => {
    if (!user?.id) return;

    const [loadedAi, loadedAlerts] = await Promise.all([
      loadAiSettings(user.id),
      loadApplyAlertSettings(user.id),
    ]);
    setAutoAtsAfterResume(loadedAi.auto_ats_after_resume);
    setShowPdfPreviewAfterResume(loadedAi.show_pdf_preview_after_resume);
    setApplyAlertSettings(loadedAlerts);
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
          promptOverrides,
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
    [patchSession, promptOverrides]
  );

  useEffect(() => {
    if (!workspaceKey || hydratedWorkspaceKeyRef.current === workspaceKey) return;

    hydratedWorkspaceKeyRef.current = workspaceKey;
    const saved = loadGeneratorWorkspace(workspaceKey);
    if (!saved) return;

    setPageContent(saved.pageContent);
    setJobsite(saved.jobsite);
    setSessions(saved.sessions.map((session) => restoreSessionFromStorage(session)));
    sessionCounter = Math.max(sessionCounter, saved.sessions.length);
    setLoadingProfile(false);
  }, [workspaceKey]);

  useEffect(() => {
    if (!workspaceKey) return;

    const timer = window.setTimeout(() => {
      saveGeneratorWorkspace(workspaceKey, {
        pageContent,
        jobsite,
        sessions: sessions.map((session) => normalizeSessionForStorage(session)),
      });
    }, 400);

    return () => window.clearTimeout(timer);
  }, [workspaceKey, pageContent, jobsite, sessions]);

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

        setProfiles(loaded.profiles);
        setActiveProfileId(loaded.activeProfileId);
        setPromptOverrides(
          loaded.profiles.find((p) => p.id === loaded.activeProfileId)?.prompt_overrides ?? undefined
        );
        setProfileData(loaded.legacyAnalyzeProfile);
        setResumeContent(loaded.resumeText);
        setResumeTemplate(
          resolveResumeTemplate(loaded.legacyAnalyzeProfile.default_resume?.resume_template)
        );
        setDesiredTitle(loaded.legacyAnalyzeProfile.default_resume?.headline?.trim() ?? "");

        const alertSettings = await loadApplyAlertSettings(user.id);
        if (!cancelled) setApplyAlertSettings(alertSettings);

        const loadedAi = await loadAiSettings(user.id);
        if (!cancelled) {
          setAutoAtsAfterResume(loadedAi.auto_ats_after_resume);
          setShowPdfPreviewAfterResume(loadedAi.show_pdf_preview_after_resume);
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
        desiredTitle: desiredTitle.trim(),
        aiProvider: FIXED_AI_PROVIDER,
        aiModel: FIXED_AI_MODEL,
        useOpenRouter: FIXED_USE_OPENROUTER,
        jobsite,
        generating: false,
        generateError: null,
        result: null,
        extractMs,
        extractCostUsd,
      };
      setSessions((prev) => [newSession, ...prev]);
      setPageContent("");
      const title = extracted.jobTitle?.trim() || "Job";
      const company = extracted.companyName?.trim();
      const label = company ? `${title} @ ${company}` : title;
      showToast(
        "success",
        `Analyze complete — ${label}. Click Generate resume when ready.`
      );
      void notifyCompletion("Cubi — Analyze complete", `${label} is ready. Click Generate resume.`);
    },
    [jobsite, desiredTitle, showToast]
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
        body: JSON.stringify({
          pageContent,
          useOpenRouter: FIXED_USE_OPENROUTER,
          ...(promptOverrides ? { promptOverrides } : {}),
        }),
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

  const handleSwitchProfile = async (profileId: string) => {
    if (!user || profileId === activeProfileId) return;
    setSwitchingProfile(true);
    try {
      const loaded = await loadProfileForApp(supabase, {
        email: user.email,
        userId: user.id,
        profileId,
      });
      setActiveProfileId(loaded.activeProfileId);
      setPromptOverrides(
        loaded.profiles.find((p) => p.id === loaded.activeProfileId)?.prompt_overrides ?? undefined
      );
      setProfileData(loaded.legacyAnalyzeProfile);
      setResumeContent(loaded.resumeText);
      setResumeTemplate(
        resolveResumeTemplate(loaded.legacyAnalyzeProfile.default_resume?.resume_template)
      );
      setDesiredTitle(loaded.legacyAnalyzeProfile.default_resume?.headline?.trim() ?? "");
    } catch {
      showToast("error", "Failed to switch profile.");
    } finally {
      setSwitchingProfile(false);
    }
  };

  const generateResumeForSession = useCallback(
    async (sessionId: string, tweak?: { tone?: string; emphasis?: string }) => {
      const session = sessions.find((s) => s.id === sessionId);
      if (!session || session.generating || session.downloading) return;

      if (!activeProfileId) {
        showToast("warning", "No profile resume — go to Profile first.");
        return;
      }
      if (!user?.id) return;

      const template = session.resumeTemplate || resumeTemplate;

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
        enrichment: null,
        clearance: null,
        previewPdfBase64: undefined,
        resumeTemplate: template,
      });

      let pdfPhase = false;

      try {
        const {
          data: { session: authSession },
        } = await supabase.auth.getSession();
        if (!authSession) throw new Error("You must be signed in to generate a resume");

        const analyzeStarted = Date.now();
        const submitResponse = await fetch(apiUrl("/api/analyze"), {
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
            profileId: activeProfileId,
            template,
            ...(session.desiredTitle?.trim() ? { headlineOverride: session.desiredTitle.trim() } : {}),
            apiModel: FIXED_AI_MODEL,
            apiProvider: FIXED_AI_PROVIDER,
            useOpenRouter: FIXED_USE_OPENROUTER,
            ...(tweak && (tweak.tone || tweak.emphasis) ? { promptTweak: tweak } : {}),
          }),
        });

        if (!submitResponse.ok) {
          let errorMessage = "Failed to generate resume";
          try {
            const errorData = await submitResponse.json();
            errorMessage =
              typeof errorData.error === "string" && errorData.error.trim()
                ? errorData.error
                : errorMessage;
          } catch {
            errorMessage = `HTTP ${submitResponse.status}: ${submitResponse.statusText}`;
          }
          throw new Error(errorMessage);
        }

        const { jobId: analyzeJobId } = (await submitResponse.json()) as { jobId: string };
        if (!analyzeJobId) throw new Error("Generation started but no job id was returned");

        // Backend runs the AI pipeline in the background; poll until it finishes.
        const data: AnalysisResponse = await pollAnalyzeJob(
          analyzeJobId,
          authSession.access_token
        );
        const resume = data.resume;
        const analyzeMs = Date.now() - analyzeStarted;
        const clearance = data.clearance ?? NO_CLEARANCE;

        patchSession(sessionId, {
          result: resume,
          generating: false,
          downloading: true,
          providerUsed: data.providerUsed,
          modelUsed: data.modelUsed,
          analyzeMs,
          generationCostUsd: data.generationCostUsd,
          enrichment: data.enrichmentRecommendations ?? null,
          clearance,
          jobTitle: data.jobTitle?.trim() || session.jobTitle,
          companyName: data.companyName?.trim() || session.companyName,
          jobDescription: data.jobDescription?.trim() || session.jobDescription,
        });

        pdfPhase = true;
        const pdfStarted = Date.now();

        const [previewPdfBase64, record] = await Promise.all([
          renderResumePdfBase64(resume, template, authSession.access_token),
          createResumeWithArtifacts({
            userId: user.id,
            profileId: activeProfileId || null,
            jd: session.jobDescription,
            resume,
            aiType: data.providerUsed ?? session.aiProvider,
            model: data.modelUsed ?? session.aiModel,
            jobSite: session.jobsite,
            jobId,
            jobLink: normalizedJobUrl,
            jobTitle: session.jobTitle.trim() || null,
            jobCompany: session.companyName.trim() || null,
            bidStatus,
          }),
        ]);

        patchSession(sessionId, {
          resumeId: record.id,
          downloading: false,
          pdfMs: Date.now() - pdfStarted,
          previewPdfBase64,
        });

        const resumeLabel =
          [data.jobTitle?.trim() || session.jobTitle, data.companyName?.trim() || session.companyName]
            .filter(Boolean)
            .join(" @ ") || "Resume";

        if (showPdfPreviewAfterResume) {
          setPreviewSessionId(sessionId);
          showToast(
            "success",
            `Generate complete — ${resumeLabel}. Preview and download when ready.`
          );
          void notifyCompletion(
            "Cubi — Generate complete",
            `${resumeLabel} is ready to preview and download.`
          );
        } else {
          try {
            const { savedPath } = await savePdfToDownloadsFolder(previewPdfBase64, {
              companyName: data.companyName?.trim() || session.companyName,
              jobRole: data.jobTitle?.trim() || session.jobTitle,
              personName: resume.name || "resume",
              accessToken: authSession.access_token,
            });
            showToast("success", formatPdfSaveMessage(savedPath, true));
            void notifyCompletion(
              "Cubi — Generate complete",
              `${resumeLabel} downloaded.`
            );
          } catch (downloadErr) {
            // PDF was rendered; keep it on the session so Preview still works.
            setPreviewSessionId(sessionId);
            showToast(
              "error",
              downloadErr instanceof Error
                ? downloadErr.message
                : "Generated, but automatic download failed — use Preview to save."
            );
          }
        }

        const clearanceToast = formatClearanceToastMessage(clearance);
        if (clearanceToast) {
          showToast("warning", clearanceToast);
        }

        if (autoAtsAfterResume) {
          void runAutoAtsCheck(sessionId, resume, {
            jobDescription: data.jobDescription?.trim() || session.jobDescription,
            aiModel: FIXED_AI_MODEL,
            aiProvider: FIXED_AI_PROVIDER,
            useOpenRouter: FIXED_USE_OPENROUTER,
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
        showToast("error", `Generate failed: ${message}`);
        void notifyCompletion("Cubi — Generate failed", message);
      }
    },
    [
      sessions,
      resumeTemplate,
      activeProfileId,
      patchSession,
      showToast,
      user?.id,
      autoAtsAfterResume,
      showPdfPreviewAfterResume,
      runAutoAtsCheck,
      jobId,
      normalizedJobUrl,
      bidStatus,
    ]
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

  const handleChangePreviewTemplate = async (sessionId: string, template: ResumeTemplateId) => {
    const session = sessions.find((s) => s.id === sessionId);
    if (!session?.result || !user) return;
    patchSession(sessionId, { resumeTemplate: template, previewLoading: true });
    try {
      const {
        data: { session: authSession },
      } = await supabase.auth.getSession();
      if (!authSession) throw new Error("You must be signed in");
      const previewPdfBase64 = await renderResumePdfBase64(
        session.result,
        template,
        authSession.access_token
      );
      patchSession(sessionId, { previewPdfBase64, previewLoading: false });
    } catch (err) {
      patchSession(sessionId, { previewLoading: false });
      showToast("error", err instanceof Error ? err.message : "Failed to render template");
    }
  };

  const handleDownloadPreview = async (sessionId: string) => {
    const session = sessions.find((s) => s.id === sessionId);
    if (!session?.previewPdfBase64) return;
    try {
      const {
        data: { session: authSession },
      } = await supabase.auth.getSession();
      const { savedPath } = await savePdfToDownloadsFolder(session.previewPdfBase64, {
        companyName: session.companyName,
        jobRole: session.jobTitle,
        personName: session.result?.name || "resume",
        accessToken: authSession?.access_token ?? null,
      });
      showToast("success", formatPdfSaveMessage(savedPath, true));
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Failed to download");
    }
  };

  const handleOpenPreview = (sessionId: string) => {
    const session = sessions.find((s) => s.id === sessionId);
    if (!session?.result) return;
    setPreviewSessionId(sessionId);
    // Preview PDFs are not persisted to storage; re-render if we don't have one.
    if (!session.previewPdfBase64 && !session.previewLoading) {
      void handleChangePreviewTemplate(sessionId, resolveResumeTemplate(session.resumeTemplate));
    }
  };

  const previewSession = sessions.find((s) => s.id === previewSessionId) ?? null;
  const answerDialogSession = sessions.find((s) => s.id === answerDialogSessionId) ?? null;

  if (!user) return null;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden p-4 lg:p-5">
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
        apiModel={answerDialogSession?.aiModel ?? FIXED_AI_MODEL}
        apiProvider={answerDialogSession?.aiProvider ?? FIXED_AI_PROVIDER}
        useOpenRouter={answerDialogSession?.useOpenRouter ?? FIXED_USE_OPENROUTER}
        onError={(message) => showToast("error", message)}
      />

      <ResumePreviewDialog
        open={previewSessionId !== null}
        onClose={() => setPreviewSessionId(null)}
        pdfBase64={previewSession?.previewPdfBase64}
        previewLoading={previewSession?.previewLoading}
        regenerating={Boolean(previewSession?.generating || previewSession?.downloading)}
        template={resolveResumeTemplate(previewSession?.resumeTemplate)}
        jobTitle={previewSession?.jobTitle}
        companyName={previewSession?.companyName}
        onTemplateChange={(t) => {
          if (previewSessionId) void handleChangePreviewTemplate(previewSessionId, t);
        }}
        onRegenerate={(tweak) => {
          if (previewSessionId) void generateResumeForSession(previewSessionId, tweak);
        }}
        onDownload={() => {
          if (previewSessionId) void handleDownloadPreview(previewSessionId);
        }}
      />

      <div className="mb-4 flex flex-shrink-0 flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={onBack} className="btn-soft text-xs">
          ← Close
        </button>
        <a
          href={getExternalJobUrl(normalizedJobUrl)}
          target="_blank"
          rel="noopener noreferrer"
          className="max-w-md truncate text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
          title={normalizedJobUrl}
        >
          {normalizedJobUrl}
        </a>
      </div>

      <div className="flex min-h-0 flex-1 gap-4 overflow-hidden">
        <div className="panel flex min-h-0 w-full max-w-md flex-col overflow-hidden lg:max-w-lg">
          <p className="label-kicker mb-4 flex-shrink-0">Analyse job</p>

          <div className="mb-4 flex-shrink-0 space-y-3">
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
            <div>
              <label htmlFor="profile" className="label-kicker mb-2 block">
                Profile{switchingProfile ? " (switching…)" : ""}
              </label>
              <select
                id="profile"
                value={activeProfileId}
                disabled={analysing || switchingProfile || profiles.length === 0}
                onChange={(e) => void handleSwitchProfile(e.target.value)}
                className="select-shell w-full text-xs disabled:cursor-not-allowed disabled:opacity-50"
              >
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                    {p.is_default ? " (default)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="desiredTitle" className="label-kicker mb-2 block">
                Title
              </label>
              <input
                id="desiredTitle"
                type="text"
                value={desiredTitle}
                disabled={analysing}
                onChange={(e) => setDesiredTitle(e.target.value)}
                placeholder="e.g. Senior Software Engineer"
                className="input-shell w-full text-xs disabled:cursor-not-allowed disabled:opacity-50"
              />
              <p className="mt-1 text-[11px] leading-snug text-slate-400 dark:text-slate-500">
                Shown as your headline on the resume. Defaults to your profile title.
              </p>
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
                  Paste this job&apos;s posting on the left and click Analyse to start.
                </p>
              </div>
            ) : (
              sessions.map((session) => (
                <AnalysisResultCard
                  key={session.id}
                  session={toSessionView(session)}
                  onGenerateResume={handleGenerateResume}
                  onGenerateAnswers={setAnswerDialogSessionId}
                  onPreview={handleOpenPreview}
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
