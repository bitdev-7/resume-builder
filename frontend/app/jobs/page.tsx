"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ApplyAlertDialog from "@/components/ApplyAlertDialog";
import { useAuth } from "@/components/AuthProvider";
import JobDescriptionEditDialog from "@/components/JobDescriptionEditDialog";
import JobsBatchPanel from "@/components/JobsBatchPanel";
import JobsGeneratePanel from "@/components/JobsGeneratePanel";
import ResumePreviewDialog from "@/components/ResumePreviewDialog";
import { ToastContainer, useToast } from "@/components/Toast";
import { DEFAULT_AI_SETTINGS } from "@/lib/ai-settings";
import {
  DEFAULT_APPLY_ALERT_SETTINGS,
  type ApplyAlertSettings,
} from "@/lib/apply-alert-settings";
import {
  findDuplicateCompanyApplications,
  type DuplicateApplicationMatch,
} from "@/lib/apply-alerts";
import { bidStatusRowClass, bidStatusSelectClass } from "@/lib/bid-status-colors";
import { copyText } from "@/lib/clipboard";
import { notifyCompletion } from "@/lib/desktop-notify";
import { extractedJobIsHybridOrOnsite } from "@/lib/job-work-type";
import { toggleJobSelection } from "@/lib/jobs-batch-state";
import {
  extractJobForOneClickGenerate,
  JOBS_ONE_CLICK_FIXED_AI_MODEL,
  JOBS_ONE_CLICK_FIXED_USE_OPENROUTER,
  runJobsOneClickGenerate,
  type OneClickExtractedContext,
} from "@/lib/jobs-one-click-generate";
import {
  filterJobs,
  getExternalJobUrl,
  jobsInPipeline,
  JOBS_PIPELINE_STATUSES,
  JOBS_ROW_STATUSES,
  paginateJobs,
} from "@/lib/jobs-page-state";
import { DEFAULT_JOBSITE, type JobsiteId } from "@/lib/jobsites";
import {
  formatPdfSaveMessage,
  renderResumePdfBase64,
  savePdfToDownloadsFolder,
} from "@/lib/pdf-download";
import {
  DEFAULT_RESUME_TEMPLATE,
  resolveResumeTemplate,
  type ResumeTemplateId,
} from "@/lib/resume-templates";
import type { AnalysisResult } from "@/lib/types/resume";
import { supabase } from "@/lib/supabase";
import {
  type BidStatus,
  type UserJobListItem,
} from "@/lib/supabase/database.types";
import { loadProfileForApp } from "@/lib/supabase/load-profile-for-app";
import { loadAiSettings } from "@/lib/supabase/services/ai-settings";
import { loadApplyAlertSettings } from "@/lib/supabase/services/apply-alert-settings";
import {
  addJobForUser,
  ignoreJobForUser,
  listJobsForUser,
  openJobForUser,
  removeMyJob,
  setJobStatusForUser,
  updateJobDescriptionForUser,
} from "@/lib/supabase/services/jobs";
import { listResumes } from "@/lib/supabase/services/resumes";

const PAGE_SIZE_OPTIONS = [30, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 30;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatStatus(status: BidStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export default function JobsPage() {
  const { user, loading: authLoading } = useAuth();
  const { toasts, showToast, dismissToast } = useToast();
  const [jobs, setJobs] = useState<UserJobListItem[]>([]);
  const [jobUrl, setJobUrl] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [statusFilter, setStatusFilter] = useState<BidStatus | "">("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [busyJobId, setBusyJobId] = useState<string | null>(null);
  const [analyseJobId, setAnalyseJobId] = useState<string | null>(null);
  const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(
    () => new Set()
  );
  const [batchJobs, setBatchJobs] = useState<UserJobListItem[] | null>(null);
  const [jdDialogJobId, setJdDialogJobId] = useState<string | null>(null);
  const [savingJd, setSavingJd] = useState(false);
  const [generatingJobId, setGeneratingJobId] = useState<string | null>(null);
  const [loadingGeneratePrefs, setLoadingGeneratePrefs] = useState(true);
  const [activeProfileId, setActiveProfileId] = useState("");
  const [resumeTemplate, setResumeTemplate] =
    useState<ResumeTemplateId>(DEFAULT_RESUME_TEMPLATE);
  const [promptOverrides, setPromptOverrides] = useState<
    Record<string, string> | undefined
  >(undefined);
  const [headlineOverride, setHeadlineOverride] = useState("");
  const [jobsite, setJobsite] = useState<JobsiteId>(DEFAULT_JOBSITE);
  const [showPdfPreviewAfterResume, setShowPdfPreviewAfterResume] = useState(
    DEFAULT_AI_SETTINGS.show_pdf_preview_after_resume
  );
  const [applyAlertSettings, setApplyAlertSettings] = useState<ApplyAlertSettings>(
    DEFAULT_APPLY_ALERT_SETTINGS
  );
  const [alertOpen, setAlertOpen] = useState(false);
  const [duplicateMatches, setDuplicateMatches] = useState<DuplicateApplicationMatch[]>(
    []
  );
  const [showHybridOnsiteAlert, setShowHybridOnsiteAlert] = useState(false);
  const [oneClickPreview, setOneClickPreview] = useState<{
    pdfBase64: string;
    jobTitle: string;
    companyName: string;
    template: ResumeTemplateId;
    job: UserJobListItem;
    resume: AnalysisResult;
    previewLoading: boolean;
  } | null>(null);
  const pendingGenerateRef = useRef<{
    job: UserJobListItem;
    extracted: OneClickExtractedContext;
  } | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user?.id) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    void listJobsForUser(user.id)
      .then((rows) => {
        if (!cancelled) setJobs(rows);
      })
      .catch((error) => {
        console.error("Failed to load jobs:", error);
        if (!cancelled) showToast("error", "Failed to load jobs");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authLoading, showToast, user?.id]);

  useEffect(() => {
    if (!user?.id) {
      setLoadingGeneratePrefs(false);
      return;
    }

    let cancelled = false;
    void Promise.all([
      loadProfileForApp(supabase, { email: user.email, userId: user.id }),
      loadAiSettings(user.id),
      loadApplyAlertSettings(user.id),
    ])
      .then(([loadedProfile, loadedAi, loadedAlerts]) => {
        if (cancelled) return;
        setActiveProfileId(loadedProfile.activeProfileId);
        setPromptOverrides(
          loadedProfile.profiles.find(
            (profile) => profile.id === loadedProfile.activeProfileId
          )?.prompt_overrides ?? undefined
        );
        setResumeTemplate(
          resolveResumeTemplate(
            loadedProfile.legacyAnalyzeProfile.default_resume?.resume_template
          )
        );
        setHeadlineOverride(
          loadedProfile.legacyAnalyzeProfile.default_resume?.headline?.trim() ?? ""
        );
        const defaultJobsite =
          loadedProfile.bundle.profile.default_settings?.default_jobsite;
        if (defaultJobsite) setJobsite(defaultJobsite);
        setShowPdfPreviewAfterResume(loadedAi.show_pdf_preview_after_resume);
        setApplyAlertSettings(loadedAlerts);
      })
      .catch((error) => {
        console.warn("Error loading generate preferences:", error);
      })
      .finally(() => {
        if (!cancelled) setLoadingGeneratePrefs(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user?.email, user?.id]);

  const pipelineJobs = useMemo(() => jobsInPipeline(jobs), [jobs]);
  const filteredJobs = useMemo(
    () => filterJobs(jobs, statusFilter),
    [jobs, statusFilter]
  );
  const totalPages = Math.max(1, Math.ceil(filteredJobs.length / pageSize));
  const visibleJobs = useMemo(
    () => paginateJobs(filteredJobs, page, pageSize),
    [filteredJobs, page, pageSize]
  );
  const selectedJobs = useMemo(
    () => visibleJobs.filter((job) => selectedJobIds.has(job.job_id)),
    [selectedJobIds, visibleJobs]
  );
  const allVisibleJobsSelected =
    visibleJobs.length > 0 && selectedJobs.length === visibleJobs.length;

  useEffect(() => {
    const pipelineJobIds = new Set(pipelineJobs.map((job) => job.job_id));
    setSelectedJobIds((current) => {
      const next = new Set(
        [...current].filter((jobId) => pipelineJobIds.has(jobId))
      );
      return next.size === current.size ? current : next;
    });
  }, [pipelineJobs]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const analyseJob = analyseJobId
    ? jobs.find((job) => job.job_id === analyseJobId) ?? null
    : null;

  useEffect(() => {
    if (!analyseJob) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAnalyseJobId(null);
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [analyseJob]);

  useEffect(() => {
    if (!batchJobs) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setBatchJobs(null);
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [batchJobs]);

  const handleToggleVisibleJobs = () => {
    setSelectedJobIds((current) => {
      const next = new Set(current);
      for (const job of visibleJobs) {
        if (allVisibleJobsSelected) next.delete(job.job_id);
        else next.add(job.job_id);
      }
      return next;
    });
  };

  const handleAdd = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user?.id || adding) return;
    if (!jobUrl.trim()) {
      showToast("warning", "Enter a job URL first");
      return;
    }

    setAdding(true);
    try {
      const result = await addJobForUser(user.id, jobUrl, jobDescription);
      setJobs((current) => {
        const withoutExisting = current.filter((job) => job.job_id !== result.item.job_id);
        return [result.item, ...withoutExisting];
      });
      setJobUrl("");
      setJobDescription("");
      setStatusFilter("");
      setPage(1);
      showToast(
        "success",
        result.createdCatalog
          ? "Job added to the shared catalog"
          : result.attached
            ? "Now tracking this job"
            : "Already tracking this job"
      );
    } catch (error) {
      console.error("Failed to add job:", error);
      showToast("error", error instanceof Error ? error.message : "Failed to add job");
    } finally {
      setAdding(false);
    }
  };

  const handleStatusChange = async (job: UserJobListItem, status: BidStatus) => {
    if (!user?.id || status === job.status) return;
    setBusyJobId(job.job_id);
    try {
      await setJobStatusForUser(user.id, [job.job_id], status);
      setJobs((current) =>
        current.map((item) =>
          item.job_id === job.job_id ? { ...item, status } : item
        )
      );
    } catch (error) {
      console.error("Failed to update job status:", error);
      showToast("error", "Failed to update status");
    } finally {
      setBusyJobId(null);
    }
  };

  const handleOpenExternal = async (job: UserJobListItem) => {
    if (!user?.id) return;

    const externalUrl = getExternalJobUrl(job.url);
    const newTab = window.open(externalUrl, "_blank");
    if (!newTab) {
      showToast("error", "Popup blocked — allow popups for this site");
      return;
    }
    newTab.opener = null;

    setBusyJobId(job.job_id);
    try {
      const updated = await openJobForUser(user.id, job.job_id);
      setJobs((current) =>
        current.map((item) => (item.job_id === updated.job_id ? updated : item))
      );
      const finalUrl = getExternalJobUrl(updated.url);
      if (finalUrl !== externalUrl) {
        newTab.location.href = finalUrl;
      }
    } catch (error) {
      console.error("Failed to open job:", error);
      showToast("error", "Failed to open job");
      newTab.close();
    } finally {
      setBusyJobId(null);
    }
  };

  const handleCopy = async (url: string) => {
    if (await copyText(url)) {
      showToast("success", "Job URL copied");
    } else {
      showToast("error", "Copy failed");
    }
  };

  const runPreflightBeforeOneClickGenerate = useCallback(
    async (extracted: OneClickExtractedContext): Promise<boolean> => {
      if (!user?.id) return false;

      let duplicates: DuplicateApplicationMatch[] = [];
      let hybridOnsite = false;

      if (
        applyAlertSettings.duplicate_apply_alert_enabled &&
        extracted.companyName.trim()
      ) {
        try {
          const records = await listResumes(user.id);
          duplicates = findDuplicateCompanyApplications(
            records,
            extracted.companyName,
            applyAlertSettings.duplicate_apply_months
          );
        } catch (error) {
          console.warn("Failed to check duplicate applications:", error);
        }
      }

      if (applyAlertSettings.hybrid_onsite_alert_enabled) {
        hybridOnsite = extractedJobIsHybridOrOnsite({
          jobType: extracted.jobType,
          jobTypes: extracted.jobTypes,
        });
      }

      if (duplicates.length > 0 || hybridOnsite) {
        setDuplicateMatches(duplicates);
        setShowHybridOnsiteAlert(hybridOnsite);
        setAlertOpen(true);
        return true;
      }

      return false;
    },
    [applyAlertSettings, user?.id]
  );

  const executeOneClickGenerate = useCallback(
    async (job: UserJobListItem, extracted: OneClickExtractedContext) => {
      if (!user?.id) return;

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("You must be signed in to generate a resume");

      const result = await runJobsOneClickGenerate(
        {
          accessToken: session.access_token,
          userId: user.id,
          jobId: job.job_id,
          jobUrl: job.url,
          jobDescription: job.job_description,
          bidStatus: job.status,
          profileId: activeProfileId,
          resumeTemplate,
          promptOverrides,
          useOpenRouter: JOBS_ONE_CLICK_FIXED_USE_OPENROUTER,
          apiModel: JOBS_ONE_CLICK_FIXED_AI_MODEL,
          showPdfPreview: showPdfPreviewAfterResume,
          headlineOverride,
          jobsite,
        },
        { extracted }
      );

      const resumeLabel =
        [result.jobTitle, result.companyName].filter(Boolean).join(" @ ") || "Resume";

      if (showPdfPreviewAfterResume && result.previewPdfBase64) {
        setOneClickPreview({
          pdfBase64: result.previewPdfBase64,
          jobTitle: result.jobTitle,
          companyName: result.companyName,
          template: resumeTemplate,
          job,
          resume: result.resume,
          previewLoading: false,
        });
        showToast(
          "success",
          `Generate complete — ${resumeLabel}. Preview and download when ready.`
        );
        void notifyCompletion(
          "Cubi — Generate complete",
          `${resumeLabel} is ready to preview and download.`
        );
      } else {
        showToast("success", formatPdfSaveMessage(result.savedPath, true));
        void notifyCompletion("Cubi — Generate complete", `${resumeLabel} downloaded.`);
      }
    },
    [
      activeProfileId,
      headlineOverride,
      jobsite,
      promptOverrides,
      resumeTemplate,
      showPdfPreviewAfterResume,
      showToast,
      user?.id,
    ]
  );

  const handleOneClickGenerate = async (job: UserJobListItem) => {
    if (!user?.id || generatingJobId !== null) return;
    if (!job.job_description.trim()) {
      showToast(
        "warning",
        "Add a job description when adding this job, or re-add the URL with the JD pasted."
      );
      return;
    }
    if (!activeProfileId) {
      showToast("warning", "No profile resume — go to Profile first.");
      return;
    }

    setGeneratingJobId(job.job_id);
    let blockedByAlert = false;
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("You must be signed in");

      const extracted = await extractJobForOneClickGenerate({
        accessToken: session.access_token,
        jobDescription: job.job_description,
        useOpenRouter: JOBS_ONE_CLICK_FIXED_USE_OPENROUTER,
        promptOverrides,
      });

      pendingGenerateRef.current = { job, extracted };
      blockedByAlert = await runPreflightBeforeOneClickGenerate(extracted);
      if (blockedByAlert) return;

      await executeOneClickGenerate(job, extracted);
      pendingGenerateRef.current = null;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Generate failed";
      showToast("error", `Generate failed: ${message}`);
      void notifyCompletion("Cubi — Generate failed", message);
      pendingGenerateRef.current = null;
    } finally {
      if (!blockedByAlert) {
        setGeneratingJobId(null);
      }
    }
  };

  const handleContinueOneClickAfterAlert = async () => {
    setAlertOpen(false);
    const pending = pendingGenerateRef.current;
    if (!pending || !user?.id) {
      setGeneratingJobId(null);
      pendingGenerateRef.current = null;
      return;
    }

    setGeneratingJobId(pending.job.job_id);
    try {
      await executeOneClickGenerate(pending.job, pending.extracted);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Generate failed";
      showToast("error", `Generate failed: ${message}`);
      void notifyCompletion("Cubi — Generate failed", message);
    } finally {
      setGeneratingJobId(null);
      pendingGenerateRef.current = null;
    }
  };

  const handleCancelOneClickAlert = () => {
    setAlertOpen(false);
    setGeneratingJobId(null);
    pendingGenerateRef.current = null;
  };

  const handleOneClickPreviewDownload = async () => {
    if (!oneClickPreview?.pdfBase64) return;
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const { savedPath } = await savePdfToDownloadsFolder(oneClickPreview.pdfBase64, {
        companyName: oneClickPreview.companyName,
        jobRole: oneClickPreview.jobTitle,
        personName: oneClickPreview.resume.name || "resume",
        accessToken: session?.access_token ?? null,
      });
      showToast("success", formatPdfSaveMessage(savedPath, true));
    } catch (error) {
      showToast(
        "error",
        error instanceof Error ? error.message : "Failed to download"
      );
    }
  };

  const handleOneClickPreviewTemplateChange = async (template: ResumeTemplateId) => {
    if (!oneClickPreview) return;
    setOneClickPreview((current) =>
      current ? { ...current, template, previewLoading: true } : current
    );
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("You must be signed in");
      const previewPdfBase64 = await renderResumePdfBase64(
        oneClickPreview.resume,
        template,
        session.access_token
      );
      setOneClickPreview((current) =>
        current
          ? { ...current, template, pdfBase64: previewPdfBase64, previewLoading: false }
          : current
      );
    } catch (error) {
      setOneClickPreview((current) =>
        current ? { ...current, previewLoading: false } : current
      );
      showToast(
        "error",
        error instanceof Error ? error.message : "Failed to render template"
      );
    }
  };

  const jdDialogJob = jdDialogJobId
    ? jobs.find((job) => job.job_id === jdDialogJobId) ?? null
    : null;

  const handleSaveJobDescription = async (nextJd: string) => {
    if (!user?.id || !jdDialogJob || savingJd) return;
    setSavingJd(true);
    try {
      const savedJd = await updateJobDescriptionForUser(
        user.id,
        jdDialogJob.job_id,
        nextJd
      );
      setJobs((current) =>
        current.map((item) =>
          item.job_id === jdDialogJob.job_id
            ? { ...item, job_description: savedJd }
            : item
        )
      );
      setJdDialogJobId(null);
      showToast("success", "Job description saved");
    } catch (error) {
      console.error("Failed to save job description:", error);
      showToast(
        "error",
        error instanceof Error ? error.message : "Failed to save job description"
      );
    } finally {
      setSavingJd(false);
    }
  };

  const handleIgnore = async (job: UserJobListItem) => {
    if (
      !user?.id ||
      !window.confirm(
        "Hide this job from your list? Other accounts will still see it. Re-add the URL later to bring it back."
      )
    ) {
      return;
    }
    setBusyJobId(job.job_id);
    try {
      await ignoreJobForUser(user.id, job.job_id);
      setJobs((current) =>
        current.map((item) =>
          item.job_id === job.job_id ? { ...item, status: "ignored" } : item
        )
      );
      if (analyseJobId === job.job_id) setAnalyseJobId(null);
      showToast("success", "Job ignored — hidden from your list only");
    } catch (error) {
      console.error("Failed to ignore job:", error);
      showToast("error", "Failed to ignore job");
    } finally {
      setBusyJobId(null);
    }
  };

  const handleRemove = async (job: UserJobListItem) => {
    if (
      !user?.id ||
      !window.confirm(
        "Clear your tracking status for this job? It will stay in the shared catalog."
      )
    ) {
      return;
    }
    setBusyJobId(job.job_id);
    try {
      await removeMyJob(user.id, job.job_id);
      setJobs((current) =>
        current.map((item) =>
          item.job_id === job.job_id ? { ...item, status: "unapplied" } : item
        )
      );
      if (analyseJobId === job.job_id) setAnalyseJobId(null);
      showToast("success", "Your status cleared — job remains in the shared catalog");
    } catch (error) {
      console.error("Failed to remove job:", error);
      showToast("error", "Failed to remove job");
    } finally {
      setBusyJobId(null);
    }
  };

  if (authLoading || !user) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <main className="page-shell">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      <ApplyAlertDialog
        open={alertOpen}
        duplicateMatches={duplicateMatches}
        duplicateMonths={applyAlertSettings.duplicate_apply_months}
        showHybridOnsite={showHybridOnsiteAlert}
        onCancel={handleCancelOneClickAlert}
        onContinue={() => void handleContinueOneClickAfterAlert()}
      />

      <JobDescriptionEditDialog
        open={jdDialogJob !== null}
        jobUrl={jdDialogJob?.url ?? ""}
        initialJobDescription={jdDialogJob?.job_description ?? ""}
        saving={savingJd}
        onCancel={() => {
          if (!savingJd) setJdDialogJobId(null);
        }}
        onSave={(nextJd) => void handleSaveJobDescription(nextJd)}
      />

      <ResumePreviewDialog
        open={oneClickPreview !== null}
        onClose={() => setOneClickPreview(null)}
        pdfBase64={oneClickPreview?.pdfBase64}
        previewLoading={oneClickPreview?.previewLoading}
        regenerating={generatingJobId === oneClickPreview?.job.job_id}
        template={resolveResumeTemplate(oneClickPreview?.template)}
        jobTitle={oneClickPreview?.jobTitle}
        companyName={oneClickPreview?.companyName}
        onTemplateChange={(template) => void handleOneClickPreviewTemplateChange(template)}
        onRegenerate={() => {
          if (oneClickPreview) void handleOneClickGenerate(oneClickPreview.job);
        }}
        onDownload={() => void handleOneClickPreviewDownload()}
      />

      <div className="mx-auto w-full max-w-7xl">
        <div className="glass-panel overflow-hidden">
          <div className="page-header">
            <h2 className="page-title">Jobs</h2>
            <p className="page-subtitle">
              Track job links and your application status
            </p>
          </div>

          <div className="space-y-4 p-4 sm:p-6">
            <form onSubmit={handleAdd} className="card-soft flex flex-col gap-2 p-3">
              <div className="flex flex-col gap-2 sm:flex-row">
                <label htmlFor="job-url" className="sr-only">
                  Job URL
                </label>
                <input
                  id="job-url"
                  type="text"
                  inputMode="url"
                  value={jobUrl}
                  onChange={(event) => setJobUrl(event.target.value)}
                  placeholder="Paste a job URL"
                  className="input-shell min-w-0 flex-1"
                  disabled={adding}
                />
                <button
                  type="submit"
                  className="btn-primary shrink-0 sm:min-w-24"
                  disabled={adding}
                >
                  {adding ? "Adding…" : "Add job"}
                </button>
              </div>
              <label htmlFor="job-description" className="sr-only">
                Job description
              </label>
              <textarea
                id="job-description"
                value={jobDescription}
                onChange={(event) => setJobDescription(event.target.value)}
                placeholder="Paste the job description (required for one-click Generate)"
                rows={4}
                className="input-shell min-w-0 w-full resize-y"
                disabled={adding}
              />
            </form>

            <div className="card-soft flex flex-wrap items-end justify-between gap-3 p-3">
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[11rem]">
                  <label htmlFor="jobs-status-filter" className="filter-label">
                    Status
                  </label>
                  <select
                    id="jobs-status-filter"
                    value={statusFilter}
                    onChange={(event) =>
                      setStatusFilter(event.target.value as BidStatus | "")
                    }
                    className="filter-select"
                  >
                    <option value="">All statuses</option>
                    {JOBS_PIPELINE_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {formatStatus(status)}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={selectedJobIds.size === 0}
                  onClick={() =>
                    setBatchJobs(
                      jobs.filter((job) => selectedJobIds.has(job.job_id))
                    )
                  }
                >
                  Batch prepare ({selectedJobIds.size})
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-300">
                <span>
                  {filteredJobs.length === 0
                    ? "No matching jobs"
                    : `Showing ${(page - 1) * pageSize + 1}–${Math.min(
                        page * pageSize,
                        filteredJobs.length
                      )} of ${filteredJobs.length}`}
                  {filteredJobs.length !== pipelineJobs.length
                    ? ` (${pipelineJobs.length} active)`
                    : ""}
                </span>
                <label className="flex items-center gap-1.5">
                  <span>Per page</span>
                  <select
                    value={pageSize}
                    onChange={(event) => setPageSize(Number(event.target.value))}
                    className="select-compact min-w-[4.5rem]"
                  >
                    {PAGE_SIZE_OPTIONS.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            {loading ? (
              <div className="flex justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
              </div>
            ) : jobs.length === 0 ? (
              <div className="empty-state py-12 text-center">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  No jobs in the shared catalog yet
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">
                  Add a job URL above — every account will see it.
                </p>
              </div>
            ) : pipelineJobs.length === 0 ? (
              <div className="empty-state py-12 text-center">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  No active jobs here
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">
                  Jobs marked Applied or Ignored are hidden here — Applied bids are in History;
                  re-add an ignored URL to show it again.
                </p>
              </div>
            ) : filteredJobs.length === 0 ? (
              <div className="empty-state py-12 text-center text-sm text-slate-500 dark:text-slate-300">
                No jobs match this status.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-600/60">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/90 dark:text-slate-300">
                    <tr>
                      <th className="w-12 px-4 py-3 font-semibold">
                        <input
                          type="checkbox"
                          checked={allVisibleJobsSelected}
                          onChange={handleToggleVisibleJobs}
                          aria-label="Select all jobs on this page"
                          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900"
                        />
                      </th>
                      <th className="px-4 py-3 font-semibold">URL</th>
                      <th className="w-44 px-4 py-3 font-semibold">Status</th>
                      <th className="w-36 px-4 py-3 font-semibold">Added</th>
                      <th className="w-56 px-4 py-3 text-right font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-600/60 dark:bg-slate-900/50">
                    {visibleJobs.map((job) => {
                      const busy = busyJobId === job.job_id;
                      const externalUrl = getExternalJobUrl(job.url);
                      return (
                        <tr
                          key={job.job_id}
                          className={`transition-colors ${bidStatusRowClass(job.status)}`}
                        >
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={selectedJobIds.has(job.job_id)}
                              onChange={() =>
                                setSelectedJobIds((current) =>
                                  toggleJobSelection(current, job.job_id)
                                )
                              }
                              aria-label={`Select ${job.url}`}
                              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900"
                            />
                          </td>
                          <td className="max-w-xl px-4 py-3">
                            <a
                              href={externalUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block truncate font-medium text-blue-600 hover:underline dark:text-blue-400"
                              title={job.url}
                              onClick={(event) => {
                                event.preventDefault();
                                if (busy) return;
                                void handleOpenExternal(job);
                              }}
                            >
                              {job.url}
                            </a>
                          </td>
                          <td className="px-4 py-3">
                            <select
                              value={job.status}
                              onChange={(event) =>
                                void handleStatusChange(
                                  job,
                                  event.target.value as BidStatus
                                )
                              }
                              disabled={busy}
                              className={`select-compact w-full min-w-[8.5rem] ${bidStatusSelectClass(job.status)}`}
                              aria-label={`Status for ${job.url}`}
                            >
                              {JOBS_ROW_STATUSES.map((status) => (
                                <option key={status} value={status}>
                                  {formatStatus(status)}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-slate-500 dark:text-slate-300">
                            {formatDate(job.created_at)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-1.5">
                              <button
                                type="button"
                                className="btn-secondary btn-compact inline-flex items-center gap-1.5"
                                disabled={
                                  !job.job_description.trim() ||
                                  generatingJobId !== null ||
                                  loadingGeneratePrefs ||
                                  busy
                                }
                                title={
                                  !job.job_description.trim()
                                    ? "Add a job description first"
                                    : "Generate resume and download"
                                }
                                onClick={() => void handleOneClickGenerate(job)}
                              >
                                {generatingJobId === job.job_id ? (
                                  <>
                                    <span
                                      className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600 dark:border-blue-900/50 dark:border-t-blue-400"
                                      aria-hidden
                                    />
                                    Generating…
                                  </>
                                ) : (
                                  "Generate"
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() => setJdDialogJobId(job.job_id)}
                                disabled={busy || generatingJobId === job.job_id}
                                className="btn-compact"
                                title={
                                  job.job_description.trim()
                                    ? "View or edit the job description"
                                    : "Paste the job description"
                                }
                              >
                                JD
                              </button>
                              <button
                                type="button"
                                onClick={() => setAnalyseJobId(job.job_id)}
                                disabled={busy || generatingJobId !== null}
                                className="btn-compact"
                              >
                                Analyze
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleIgnore(job)}
                                disabled={busy}
                                className="btn-compact"
                              >
                                Ignore
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleCopy(job.url)}
                                className="btn-compact"
                              >
                                Copy
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleRemove(job)}
                                disabled={busy}
                                className="btn-compact text-red-600 dark:text-red-400"
                              >
                                Clear status
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {filteredJobs.length > 0 && totalPages > 1 ? (
              <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-4 dark:border-slate-600/60">
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page === 1}
                  className="btn-soft text-xs disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="text-xs text-slate-500 dark:text-slate-300">
                  Page {page} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setPage((current) => Math.min(totalPages, current + 1))
                  }
                  disabled={page === totalPages}
                  className="btn-soft text-xs disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {analyseJob ? (
        <>
          <button
            type="button"
            className="jobs-analyse-backdrop"
            aria-label="Close analyse panel"
            onClick={() => setAnalyseJobId(null)}
          />
          <aside
            className="jobs-analyse-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Analyse job"
          >
            <JobsGeneratePanel
              jobId={analyseJob.job_id}
              jobUrl={analyseJob.url}
              bidStatus={analyseJob.status}
              onBack={() => setAnalyseJobId(null)}
            />
          </aside>
        </>
      ) : null}

      {batchJobs ? (
        <>
          <button
            type="button"
            className="jobs-analyse-backdrop"
            aria-label="Close batch prepare panel"
            onClick={() => setBatchJobs(null)}
          />
          <aside
            className="jobs-analyse-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Batch prepare"
          >
            <JobsBatchPanel jobs={batchJobs} onClose={() => setBatchJobs(null)} />
          </aside>
        </>
      ) : null}
    </main>
  );
}
