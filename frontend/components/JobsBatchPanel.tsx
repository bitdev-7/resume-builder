"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { ToastContainer, useToast } from "@/components/Toast";
import { apiUrl } from "@/lib/api-config";
import type { ExtractedJobInfo } from "@/lib/extract-job-page";
import {
  countReadyBatchCards,
  createBatchCardsFromJobs,
  isBatchCardReady,
  openExternalUrls,
  type BatchCardStatus,
  type JobsBatchCard,
} from "@/lib/jobs-batch-state";
import { getExternalJobUrl } from "@/lib/jobs-page-state";
import { supabase } from "@/lib/supabase";
import type {
  ResumeProfile,
  UserJobListItem,
} from "@/lib/supabase/database.types";
import { loadProfileForApp } from "@/lib/supabase/load-profile-for-app";

const FIXED_USE_OPENROUTER = true;

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
  const [extractingJobIds, setExtractingJobIds] = useState<Set<string>>(
    () => new Set()
  );

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
    } catch {
      showToast("error", "Failed to switch profile.");
    } finally {
      setSwitchingProfile(false);
    }
  };

  const handlePageContentChange = (card: JobsBatchCard, pageContent: string) => {
    const preserveStatus = card.status === "generating" || card.status === "done";
    patchCard(card.jobId, {
      pageContent,
      error: null,
      status: preserveStatus ? card.status : pageContent.trim() ? "ready" : "empty",
    });
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

  const handleExtract = async (card: JobsBatchCard) => {
    if (!card.pageContent.trim() || extractingJobIds.has(card.jobId)) return;

    setExtractingJobIds((current) => new Set(current).add(card.jobId));
    patchCard(card.jobId, { error: null });

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
          pageContent: card.pageContent,
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
      patchCard(card.jobId, {
        jobTitle: extracted.jobTitle,
        companyName: extracted.companyName,
        jobDescription: extracted.jobDescription,
        status: "ready",
        error: null,
      });
      showToast(
        "success",
        `${extracted.jobTitle?.trim() || "Job"} extracted and ready`
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

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden p-4 lg:p-5">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

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
            disabled
            title="Batch generation will be enabled in the next step"
          >
            Generate all ready
          </button>
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
                  <button
                    type="button"
                    className="btn-primary text-xs"
                    disabled={!card.pageContent.trim() || extracting}
                    onClick={() => void handleExtract(card)}
                  >
                    {extracting ? "Extracting…" : "Extract"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
