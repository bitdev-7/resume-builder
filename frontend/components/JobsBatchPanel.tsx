"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import JobsBatchAlertDialog from "@/components/JobsBatchAlertDialog";
import { ToastContainer, useToast } from "@/components/Toast";
import { pollAnalyzeJob } from "@/lib/analyze-job-client";
import { apiUrl } from "@/lib/api-config";
import { notifyCompletion } from "@/lib/desktop-notify";
import type { ExtractedJobInfo } from "@/lib/extract-job-page";
import {
  buildBatchAlertSummary,
  type BatchAlertSummary,
} from "@/lib/jobs-batch-alerts";
import {
  applyBatchPageContentChange,
  countReadyBatchCards,
  createBatchCardsFromJobs,
  getCardsNeedingAlertExtraction,
  isBatchCardReady,
  openExternalUrls,
  type BatchCardStatus,
  type JobsBatchCard,
} from "@/lib/jobs-batch-state";
import { getExternalJobUrl } from "@/lib/jobs-page-state";
import {
  DEFAULT_OPENROUTER_MODEL,
  getModelProvider,
} from "@/lib/openrouter-shared";
import {
  DEFAULT_RESUME_TEMPLATE,
  resolveResumeTemplate,
  type ResumeTemplateId,
} from "@/lib/resume-templates";
import { supabase } from "@/lib/supabase";
import type {
  ResumeProfile,
  UserJobListItem,
} from "@/lib/supabase/database.types";
import { loadProfileForApp } from "@/lib/supabase/load-profile-for-app";
import { loadApplyAlertSettings } from "@/lib/supabase/services/apply-alert-settings";
import {
  createResumeWithArtifacts,
  listResumes,
} from "@/lib/supabase/services/resumes";

const FIXED_USE_OPENROUTER = true;
const FIXED_AI_MODEL = DEFAULT_OPENROUTER_MODEL;
const FIXED_AI_PROVIDER = getModelProvider(FIXED_AI_MODEL);

interface JobsBatchPanelProps {
  jobs: UserJobListItem[];
  onClose: () => void;
}

const STATUS_STYLES: Record<BatchCardStatus, string> = {
  empty: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  ready: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-200",
  generating:
    "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-200",
  done: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-200",
  failed: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-200",
};

function statusLabel(status: BatchCardStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export default function JobsBatchPanel({ jobs, onClose }: JobsBatchPanelProps) {
  const { user } = useAuth();
  const { toasts, showToast, dismissToast } = useToast();
  const [cards, setCards] = useState<JobsBatchCard[]>(() =>
    createBatchCardsFromJobs(jobs)
  );
  const [profiles, setProfiles] = useState<ResumeProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState("");
  const [promptOverrides, setPromptOverrides] = useState<
    Record<string, string> | undefined
  >(undefined);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [switchingProfile, setSwitchingProfile] = useState(false);
  const [resumeTemplate, setResumeTemplate] =
    useState<ResumeTemplateId>(DEFAULT_RESUME_TEMPLATE);
  const [alertSummary, setAlertSummary] = useState<BatchAlertSummary | null>(null);
  const [alertDuplicateMonths, setAlertDuplicateMonths] = useState(6);
  const [pendingReadyCards, setPendingReadyCards] = useState<JobsBatchCard[]>([]);
  const [extractingJobIds, setExtractingJobIds] = useState<Set<string>>(
    () => new Set()
  );
  const [batchGenerating, setBatchGenerating] = useState(false);
  const batchGeneratingRef = useRef(false);

  const readyCount = useMemo(() => countReadyBatchCards(cards), [cards]);

  const patchCard = useCallback((jobId: string, patch: Partial<JobsBatchCard>) => {
    setCards((current) =>
      current.map((card) => (card.jobId === jobId ? { ...card, ...patch } : card))
    );
  }, []);

  useEffect(() => {
    if (!user?.id) {
      setLoadingProfile(false);
      return;
    }

    let cancelled = false;
    void loadProfileForApp(supabase, {
      email: user.email,
      userId: user.id,
    })
      .then((loaded) => {
        if (cancelled) return;
        setProfiles(loaded.profiles);
        setActiveProfileId(loaded.activeProfileId);
        setPromptOverrides(
          loaded.profiles.find((profile) => profile.id === loaded.activeProfileId)
            ?.prompt_overrides ?? undefined
        );
        setResumeTemplate(
          resolveResumeTemplate(loaded.legacyAnalyzeProfile.default_resume?.resume_template)
        );
      })
      .catch((error) => {
        console.warn("Error loading batch profile:", error);
        if (!cancelled) showToast("error", "Failed to load profiles.");
      })
      .finally(() => {
        if (!cancelled) setLoadingProfile(false);
      });

    return () => {
      cancelled = true;
    };
  }, [showToast, user?.email, user?.id]);

  const handleSwitchProfile = async (profileId: string) => {
    if (!user || profileId === activeProfileId) return;
    setSwitchingProfile(true);
    try {
      const loaded = await loadProfileForApp(supabase, {
        email: user.email,
        userId: user.id,
        profileId,
      });
      setProfiles(loaded.profiles);
      setActiveProfileId(loaded.activeProfileId);
      setPromptOverrides(
        loaded.profiles.find((profile) => profile.id === loaded.activeProfileId)
          ?.prompt_overrides ?? undefined
      );
      setResumeTemplate(
        resolveResumeTemplate(loaded.legacyAnalyzeProfile.default_resume?.resume_template)
      );
    } catch {
      showToast("error", "Failed to switch profile.");
    } finally {
      setSwitchingProfile(false);
    }
  };

  const handlePageContentChange = (card: JobsBatchCard, pageContent: string) => {
    patchCard(card.jobId, applyBatchPageContentChange(card, pageContent));
  };

  const handleOpenAll = () => {
    const { opened, blocked } = openExternalUrls(cards.map((card) => card.url));
    if (blocked > 0) {
      showToast(
        "warning",
        `Opened ${opened}; ${blocked} blocked by popup settings`
      );
    } else {
      showToast("success", `Opened ${opened} job tabs`);
    }
  };

  const handleOpenCard = (url: string) => {
    const tab = window.open(getExternalJobUrl(url), "_blank");
    if (!tab) {
      showToast("warning", "Popup blocked — allow popups for this site");
      return;
    }
    tab.opener = null;
  };

  const extractCard = useCallback(
    async (card: JobsBatchCard, accessToken: string): Promise<JobsBatchCard> => {
      const response = await fetch(apiUrl("/api/extract-job"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          pageContent: card.pageContent || card.jobDescription,
          useOpenRouter: FIXED_USE_OPENROUTER,
          ...(promptOverrides ? { promptOverrides } : {}),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          typeof errorData.error === "string"
            ? errorData.error
            : "Failed to extract job"
        );
      }

      const extracted = (await response.json()) as ExtractedJobInfo;
      return {
        ...card,
        jobTitle: extracted.jobTitle,
        companyName: extracted.companyName,
        jobDescription: extracted.jobDescription,
      };
    },
    [promptOverrides]
  );

  const handleExtract = async (card: JobsBatchCard) => {
    if (!card.pageContent.trim() || extractingJobIds.has(card.jobId)) return;

    setExtractingJobIds((current) => new Set(current).add(card.jobId));
    patchCard(card.jobId, { error: null });

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("You must be signed in");

      const extractedCard = await extractCard(card, session.access_token);
      patchCard(card.jobId, {
        jobTitle: extractedCard.jobTitle,
        companyName: extractedCard.companyName,
        jobDescription: extractedCard.jobDescription,
        status: "ready",
        error: null,
      });
      showToast(
        "success",
        `${extractedCard.jobTitle.trim() || "Job"} extracted and ready`
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to extract job";
      patchCard(card.jobId, { status: "failed", error: message });
      showToast("error", message);
    } finally {
      setExtractingJobIds((current) => {
        const next = new Set(current);
        next.delete(card.jobId);
        return next;
      });
    }
  };

  const generateOneCard = useCallback(
    async (card: JobsBatchCard): Promise<boolean> => {
      patchCard(card.jobId, {
        status: "generating",
        error: null,
        resumeId: undefined,
      });

      try {
        if (!user?.id) throw new Error("You must be signed in");
        if (!activeProfileId) throw new Error("Select a resume profile first");

        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) throw new Error("You must be signed in");

        let generationCard = card;
        if (!generationCard.jobDescription.trim()) {
          generationCard = await extractCard(
            generationCard,
            session.access_token
          );
          patchCard(card.jobId, {
            jobTitle: generationCard.jobTitle,
            companyName: generationCard.companyName,
            jobDescription: generationCard.jobDescription,
          });
        }

        const submitResponse = await fetch(apiUrl("/api/analyze"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            jd: generationCard.jobDescription || generationCard.pageContent,
            jobTitle: generationCard.jobTitle,
            companyName: generationCard.companyName,
            pageContent: generationCard.pageContent,
            profileId: activeProfileId,
            template: resumeTemplate,
            apiModel: FIXED_AI_MODEL,
            apiProvider: FIXED_AI_PROVIDER,
            useOpenRouter: FIXED_USE_OPENROUTER,
          }),
        });
        if (!submitResponse.ok) {
          const errorData = await submitResponse.json().catch(() => ({}));
          throw new Error(
            typeof errorData.error === "string" && errorData.error.trim()
              ? errorData.error
              : "Failed to generate resume"
          );
        }

        const { jobId: analyzeJobId } = (await submitResponse.json()) as {
          jobId: string;
        };
        if (!analyzeJobId) {
          throw new Error("Generation started but no job id was returned");
        }

        const data = await pollAnalyzeJob(analyzeJobId, session.access_token);
        const jd =
          data.jobDescription?.trim() ||
          generationCard.jobDescription ||
          generationCard.pageContent;
        const record = await createResumeWithArtifacts({
          userId: user.id,
          profileId: activeProfileId,
          jd,
          resume: data.resume,
          aiType: data.providerUsed ?? FIXED_AI_PROVIDER,
          model: data.modelUsed ?? FIXED_AI_MODEL,
          jobId: card.jobId,
          jobLink: card.url,
          jobTitle: data.jobTitle?.trim() || generationCard.jobTitle.trim() || null,
          jobCompany:
            data.companyName?.trim() || generationCard.companyName.trim() || null,
          bidStatus: card.bidStatus,
        });

        patchCard(card.jobId, {
          status: "done",
          error: null,
          resumeId: record.id,
          jobTitle: data.jobTitle?.trim() || generationCard.jobTitle,
          companyName: data.companyName?.trim() || generationCard.companyName,
          jobDescription: jd,
        });
        return true;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to generate resume";
        patchCard(card.jobId, { status: "failed", error: message });
        return false;
      }
    },
    [
      activeProfileId,
      extractCard,
      patchCard,
      resumeTemplate,
      user?.id,
    ]
  );

  const generateAll = useCallback(
    async (readyCards: JobsBatchCard[]) => {
      const results = await Promise.allSettled(
        readyCards.map((card) => generateOneCard(card))
      );
      const generated = results.filter(
        (result) => result.status === "fulfilled" && result.value
      ).length;
      const message = `Generated ${generated} of ${readyCards.length}`;
      showToast(
        generated === readyCards.length ? "success" : "warning",
        message
      );
      void notifyCompletion("Cubi — Batch generation complete", message);
    },
    [generateOneCard, showToast]
  );

  const handleGenerateAll = async () => {
    if (batchGeneratingRef.current) return;
    const readyCards = cards.filter(isBatchCardReady);
    if (readyCards.length === 0) return;
    if (!user?.id || !activeProfileId) {
      showToast("warning", "Select a resume profile first.");
      return;
    }

    batchGeneratingRef.current = true;
    setBatchGenerating(true);
    let awaitingConfirmation = false;
    try {
      const [settings, resumes] = await Promise.all([
        loadApplyAlertSettings(user.id),
        listResumes(user.id),
      ]);
      let alertCards = readyCards;

      if (settings.duplicate_apply_alert_enabled) {
        const cardsToExtract = getCardsNeedingAlertExtraction(readyCards);
        if (cardsToExtract.length > 0) {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          if (!session) throw new Error("You must be signed in");

          const extractedResults = await Promise.allSettled(
            cardsToExtract.map((card) =>
              extractCard(card, session.access_token)
            )
          );
          const extractedByJobId = new Map<string, JobsBatchCard>();
          extractedResults.forEach((result, index) => {
            if (result.status === "fulfilled") {
              const extractedCard = result.value;
              extractedByJobId.set(extractedCard.jobId, extractedCard);
              patchCard(extractedCard.jobId, {
                jobTitle: extractedCard.jobTitle,
                companyName: extractedCard.companyName,
                jobDescription: extractedCard.jobDescription,
              });
            } else {
              console.warn(
                `Failed alert preflight extraction for ${cardsToExtract[index].jobId}:`,
                result.reason
              );
            }
          });
          alertCards = readyCards.map(
            (card) => extractedByJobId.get(card.jobId) ?? card
          );
        }
      }

      const summary = buildBatchAlertSummary({
        cards: alertCards,
        resumes,
        duplicateEnabled: settings.duplicate_apply_alert_enabled,
        duplicateMonths: settings.duplicate_apply_months,
        hybridEnabled: settings.hybrid_onsite_alert_enabled,
      });

      if (summary.hasAny) {
        awaitingConfirmation = true;
        setPendingReadyCards(alertCards);
        setAlertDuplicateMonths(settings.duplicate_apply_months);
        setAlertSummary(summary);
        return;
      }

      await generateAll(alertCards);
    } catch (error) {
      showToast(
        "error",
        error instanceof Error
          ? error.message
          : "Failed to check application alerts"
      );
    } finally {
      if (!awaitingConfirmation) {
        batchGeneratingRef.current = false;
        setBatchGenerating(false);
      }
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden p-4 lg:p-5">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      <JobsBatchAlertDialog
        open={alertSummary !== null}
        cards={pendingReadyCards}
        summary={alertSummary}
        duplicateMonths={alertDuplicateMonths}
        onCancel={() => {
          setAlertSummary(null);
          setPendingReadyCards([]);
          batchGeneratingRef.current = false;
          setBatchGenerating(false);
        }}
        onContinue={() => {
          const snapshot = pendingReadyCards;
          setAlertSummary(null);
          setPendingReadyCards([]);
          void generateAll(snapshot).finally(() => {
            batchGeneratingRef.current = false;
            setBatchGenerating(false);
          });
        }}
      />

      <header className="mb-4 flex flex-shrink-0 flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="section-title">Batch prepare</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {cards.length} {cards.length === 1 ? "job" : "jobs"} selected
          </p>
        </div>

        <div className="flex flex-wrap items-end justify-end gap-2">
          <div className="min-w-44">
            <label htmlFor="batch-profile" className="label-kicker mb-1 block">
              Profile{switchingProfile ? " (switching…)" : ""}
            </label>
            <select
              id="batch-profile"
              value={activeProfileId}
              disabled={
                loadingProfile || switchingProfile || profiles.length === 0
              }
              onChange={(event) => void handleSwitchProfile(event.target.value)}
              className="select-shell w-full text-xs disabled:cursor-not-allowed disabled:opacity-50"
            >
              {profiles.length === 0 ? (
                <option value="">
                  {loadingProfile ? "Loading profiles…" : "No profiles"}
                </option>
              ) : null}
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.label}
                  {profile.is_default ? " (default)" : ""}
                </option>
              ))}
            </select>
          </div>
          <button type="button" className="btn-soft text-xs" onClick={handleOpenAll}>
            Open all
          </button>
          <span className="rounded-full bg-blue-100 px-3 py-2 text-xs font-semibold text-blue-700 dark:bg-blue-900/50 dark:text-blue-200">
            {readyCount} / {cards.length} ready
          </span>
          <button
            type="button"
            className="btn-primary text-xs disabled:cursor-not-allowed disabled:opacity-50"
            disabled={readyCount === 0 || batchGenerating}
            onClick={() => void handleGenerateAll()}
          >
            {batchGenerating ? "Generating…" : "Generate all ready"}
          </button>
          {/* Closing only unmounts this panel; in-flight fetches intentionally continue. */}
          <button type="button" className="btn-soft text-xs" onClick={onClose}>
            ← Close
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <ul className="space-y-3">
          {cards.map((card) => {
            const extracting = extractingJobIds.has(card.jobId);
            const ready = isBatchCardReady(card);
            return (
              <li key={card.jobId} className="card-soft p-4">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    {card.jobTitle || card.companyName ? (
                      <p className="mb-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
                        {[card.jobTitle, card.companyName].filter(Boolean).join(" @ ")}
                      </p>
                    ) : null}
                    <a
                      href={getExternalJobUrl(card.url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block truncate text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                      title={card.url}
                    >
                      {card.url}
                    </a>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_STYLES[card.status]}`}
                      title={ready ? "Ready for generation" : undefined}
                    >
                      {statusLabel(card.status)}
                    </span>
                    <button
                      type="button"
                      className="btn-compact"
                      onClick={() => handleOpenCard(card.url)}
                    >
                      Open
                    </button>
                  </div>
                </div>

                <label
                  htmlFor={`batch-content-${card.jobId}`}
                  className="label-kicker mb-2 block"
                >
                  Job page content
                </label>
                <textarea
                  id={`batch-content-${card.jobId}`}
                  value={card.pageContent}
                  onChange={(event) =>
                    handlePageContentChange(card, event.target.value)
                  }
                  placeholder="Paste this job posting page content…"
                  className="input-shell min-h-36 w-full resize-y text-sm"
                  disabled={extracting || card.status === "generating"}
                />

                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    {card.error ? (
                      <p className="text-xs text-red-600 dark:text-red-400">
                        {card.error}
                      </p>
                    ) : card.jobDescription ? (
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                        Extracted description ready
                      </p>
                    ) : (
                      <p className="text-xs text-slate-400 dark:text-slate-500">
                        Paste content, then extract job details.
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {card.status === "failed" ? (
                      <button
                        type="button"
                        className="btn-primary text-xs"
                        disabled={!isBatchCardReady(card)}
                        onClick={() => void generateOneCard(card)}
                      >
                        Retry
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="btn-primary text-xs"
                      disabled={
                        !card.pageContent.trim() ||
                        extracting ||
                        card.status === "generating"
                      }
                      onClick={() => void handleExtract(card)}
                    >
                      {extracting ? "Extracting…" : "Extract"}
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
