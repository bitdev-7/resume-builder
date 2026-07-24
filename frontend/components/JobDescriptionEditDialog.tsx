"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface JobDescriptionEditDialogProps {
  open: boolean;
  jobUrl: string;
  initialJobDescription: string;
  saving: boolean;
  onCancel: () => void;
  onSave: (jobDescription: string) => void;
}

export default function JobDescriptionEditDialog({
  open,
  jobUrl,
  initialJobDescription,
  saving,
  onCancel,
  onSave,
}: JobDescriptionEditDialogProps) {
  const [mounted, setMounted] = useState(false);
  const [draft, setDraft] = useState(initialJobDescription);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) setDraft(initialJobDescription);
  }, [open, initialJobDescription]);

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

  const hasExisting = initialJobDescription.trim().length > 0;

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm"
      onClick={() => {
        if (!saving) onCancel();
      }}
    >
      <div
        className="glass-panel flex max-h-[min(90vh,720px)] w-full max-w-2xl flex-col overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="job-description-edit-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex-shrink-0 border-b border-slate-200/80 px-6 py-4 dark:border-slate-600/50">
          <h3 id="job-description-edit-title" className="page-title text-xl">
            Job description
          </h3>
          <p className="page-subtitle mt-1 truncate" title={jobUrl}>
            {jobUrl}
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <label htmlFor="job-description-edit-textarea" className="sr-only">
            Job description
          </label>
          <textarea
            id="job-description-edit-textarea"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={
              hasExisting
                ? "Edit the job description"
                : "Paste the job description here"
            }
            rows={14}
            className="input-shell min-h-[16rem] w-full resize-y"
            disabled={saving}
            autoFocus
          />
        </div>

        <div className="flex flex-shrink-0 justify-end gap-2 border-t border-slate-200/80 px-6 py-4 dark:border-slate-600/50">
          <button
            type="button"
            onClick={onCancel}
            className="btn-soft"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSave(draft)}
            className="btn-primary inline-flex items-center gap-1.5"
            disabled={saving || draft.trim() === initialJobDescription.trim()}
          >
            {saving ? (
              <>
                <span
                  className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-200 border-t-white dark:border-blue-900/50 dark:border-t-blue-100"
                  aria-hidden
                />
                Saving…
              </>
            ) : hasExisting ? (
              "Update"
            ) : (
              "Save"
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
