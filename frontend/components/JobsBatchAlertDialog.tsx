"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { BatchAlertSummary } from "@/lib/jobs-batch-alerts";
import { getExternalJobUrl } from "@/lib/jobs-page-state";

interface JobsBatchAlertDialogProps {
  open: boolean;
  cards: Array<{
    jobId: string;
    url: string;
    jobTitle: string;
    companyName: string;
  }>;
  summary: BatchAlertSummary | null;
  duplicateMonths: number;
  onCancel: () => void;
  onContinue: () => void;
}

export default function JobsBatchAlertDialog({
  open,
  cards,
  summary,
  duplicateMonths,
  onCancel,
  onContinue,
}: JobsBatchAlertDialogProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onCancel]);

  if (!mounted || !open || !summary) return null;

  const alertCards = cards.filter(
    (card) =>
      summary.hybridJobIds.includes(card.jobId) ||
      (summary.duplicateByJobId[card.jobId]?.length ?? 0) > 0
  );
  const period =
    duplicateMonths === 1 ? "the last month" : `the last ${duplicateMonths} months`;

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="glass-panel flex max-h-[min(90vh,760px)] w-full max-w-2xl flex-col overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="batch-alert-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-red-200/80 bg-red-50/90 px-6 py-4 dark:border-red-900/40 dark:bg-red-950/40">
          <h3 id="batch-alert-title" className="page-title text-xl text-red-800 dark:text-red-200">
            Batch application alerts
          </h3>
          <p className="mt-1 text-sm text-red-700/90 dark:text-red-300/90">
            Review these jobs before starting all resume generations.
          </p>
        </div>

        <ul className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-5">
          {alertCards.map((card) => {
            const duplicateMatches = summary.duplicateByJobId[card.jobId] ?? [];
            const hybrid = summary.hybridJobIds.includes(card.jobId);
            return (
              <li key={card.jobId} className="card-soft p-4">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                  {[card.jobTitle, card.companyName].filter(Boolean).join(" @ ") ||
                    "Job"}
                </p>
                <a
                  href={getExternalJobUrl(card.url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 block truncate text-xs text-blue-600 hover:underline dark:text-blue-400"
                  title={card.url}
                >
                  {card.url}
                </a>
                {hybrid ? (
                  <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
                    This description mentions hybrid or onsite work.
                  </p>
                ) : null}
                {duplicateMatches.length > 0 ? (
                  <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 dark:border-red-900/40 dark:bg-red-950/30">
                    <p className="text-sm text-red-800 dark:text-red-200">
                      Previous applications to this company within {period}:
                    </p>
                    <ul className="mt-2 space-y-1">
                      {duplicateMatches.map((match, index) => (
                        <li
                          key={`${match.date}-${match.role}-${index}`}
                          className="text-xs text-slate-700 dark:text-slate-300"
                        >
                          {match.date} — {match.company} — {match.role}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>

        <div className="flex justify-end gap-2 border-t border-slate-200/80 px-6 py-4 dark:border-slate-600/50">
          <button type="button" onClick={onCancel} className="btn-soft">
            Cancel
          </button>
          <button type="button" onClick={onContinue} className="btn-primary">
            Continue and generate
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
