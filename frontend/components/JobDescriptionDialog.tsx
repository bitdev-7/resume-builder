"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { copyText } from "@/lib/clipboard";

interface JobDescriptionDialogProps {
  open: boolean;
  onClose: () => void;
  jobTitle?: string;
  companyName?: string;
  jobDescription: string;
}

export default function JobDescriptionDialog({
  open,
  onClose,
  jobTitle,
  companyName,
  jobDescription,
}: JobDescriptionDialogProps) {
  const [mounted, setMounted] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) setCopied(false);
  }, [open]);

  const handleCopy = async () => {
    if (await copyText(jobDescription)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!mounted || !open) return null;

  const title = [jobTitle, companyName].filter(Boolean).join(" · ") || "Extracted job description";

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close dialog"
      />
      <div className="relative z-10 flex max-h-[min(90vh,720px)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-600/60 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-600/50">
          <h2 className="min-w-0 truncate text-base font-semibold text-slate-900 dark:text-slate-50">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-700 dark:text-slate-200">
            {jobDescription}
          </pre>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4 dark:border-slate-600/50">
          <button type="button" onClick={handleCopy} className="btn-soft text-xs">
            {copied ? "Copied" : "Copy JD"}
          </button>
          <button type="button" onClick={onClose} className="btn-primary text-xs">
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
