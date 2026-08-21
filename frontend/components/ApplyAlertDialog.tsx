"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { DuplicateApplicationMatch } from "@/lib/apply-alerts";

interface ApplyAlertDialogProps {
  open: boolean;
  duplicateMatches: DuplicateApplicationMatch[];
  duplicateMonths: number;
  showHybridOnsite: boolean;
  onCancel: () => void;
  onContinue: () => void;
}

export default function ApplyAlertDialog({
  open,
  duplicateMatches,
  duplicateMonths,
  showHybridOnsite,
  onCancel,
  onContinue,
}: ApplyAlertDialogProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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

  if (!mounted || !open) return null;

  const period =
    duplicateMonths === 1 ? "the last month" : `the last ${duplicateMonths} months`;

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="glass-panel flex max-h-[min(90vh,720px)] w-full max-w-lg flex-col overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="apply-alert-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex-shrink-0 border-b border-red-200/80 bg-red-50/90 px-6 py-4 dark:border-red-900/40 dark:bg-red-950/40">
          <h3 id="apply-alert-title" className="page-title text-xl text-red-800 dark:text-red-200">
            Application alert
          </h3>
          <p className="mt-1 text-sm text-red-700/90 dark:text-red-300/90">
            Review the following before generating this resume.
            {showHybridOnsite && duplicateMatches.length > 0 && (
              <span className="mt-1 block text-xs font-medium text-red-600 dark:text-red-400">
                {2} alerts apply to this application.
              </span>
            )}
          </p>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
          {showHybridOnsite && (
            <div className="rounded-xl border border-red-200 bg-red-50/90 p-4 dark:border-red-900/40 dark:bg-red-950/30">
              <p className="text-sm font-semibold text-red-900 dark:text-red-200">
                Hybrid or onsite role
              </p>
              <p className="mt-1 text-sm text-red-800 dark:text-red-300/90">
                This job description mentions hybrid or onsite work. Review the
                location requirements before applying.
              </p>
            </div>
          )}

          {duplicateMatches.length > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50/90 p-4 dark:border-red-900/40 dark:bg-red-950/30">
              <p className="text-sm font-semibold text-red-900 dark:text-red-200">
                Duplicate company application
              </p>
              <p className="mt-1 text-sm text-red-800 dark:text-red-300/90">
                You already applied to this company within {period}:
              </p>
              <ul className="mt-3 max-h-48 space-y-2 overflow-y-auto pr-1">
                {duplicateMatches.map((item, index) => (
                  <li
                    key={`${item.date}-${item.role}-${index}`}
                    className="rounded-lg border border-red-200/80 bg-white/80 px-3 py-2 text-sm dark:border-red-900/30 dark:bg-slate-800/80"
                  >
                    <span className="font-medium text-slate-900 dark:text-slate-50">
                      {item.date}
                    </span>
                    <span className="text-slate-600 dark:text-slate-300">
                      {" "}
                      — {item.company} — {item.role}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex flex-shrink-0 justify-end gap-2 border-t border-slate-200/80 px-6 py-4 dark:border-slate-600/50">
          <button type="button" onClick={onCancel} className="btn-soft">
            Cancel
          </button>
          <button type="button" onClick={onContinue} className="btn-primary">
            Continue anyway
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
