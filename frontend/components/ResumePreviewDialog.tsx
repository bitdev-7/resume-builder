"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { RESUME_TEMPLATES, type ResumeTemplateId } from "@/lib/resume-templates";

interface ResumePreviewDialogProps {
  open: boolean;
  onClose: () => void;
  pdfBase64?: string;
  previewLoading?: boolean;
  regenerating?: boolean;
  template: ResumeTemplateId;
  jobTitle?: string;
  companyName?: string;
  onTemplateChange: (template: ResumeTemplateId) => void;
  onRegenerate: (tweak: { tone?: string; emphasis?: string }) => void;
  onDownload: () => void;
}

function base64ToBlobUrl(base64: string): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
}

export default function ResumePreviewDialog({
  open,
  onClose,
  pdfBase64,
  previewLoading,
  regenerating,
  template,
  jobTitle,
  companyName,
  onTemplateChange,
  onRegenerate,
  onDownload,
}: ResumePreviewDialogProps) {
  const [tone, setTone] = useState("");
  const [emphasis, setEmphasis] = useState("");

  const blobUrl = useMemo(() => (pdfBase64 ? base64ToBlobUrl(pdfBase64) : ""), [pdfBase64]);

  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const busy = Boolean(previewLoading || regenerating);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3" onClick={onClose}>
      <div
        className="flex h-full max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Preview pane */}
        <div className="relative flex min-w-0 flex-1 flex-col bg-slate-100 dark:bg-slate-800">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5 dark:border-slate-700">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold text-slate-900 dark:text-slate-50">
                Resume preview
              </h3>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                {[jobTitle, companyName].filter(Boolean).join(" · ")}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1 text-lg leading-none text-slate-400 hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-slate-700"
              aria-label="Close preview"
            >
              ×
            </button>
          </div>
          <div className="relative min-h-0 flex-1">
            {blobUrl ? (
              <iframe title="Resume PDF preview" src={blobUrl} className="h-full w-full" />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">
                No preview available.
              </div>
            )}
            {busy ? (
              <div className="absolute inset-0 flex items-center justify-center bg-white/60 dark:bg-slate-900/60">
                <div className="flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm shadow dark:bg-slate-800">
                  <span className="h-4 w-4 animate-spin rounded-full border-b-2 border-blue-600" />
                  {regenerating ? "Regenerating…" : "Rendering…"}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* Controls pane */}
        <div className="flex w-64 shrink-0 flex-col gap-4 overflow-y-auto border-l border-slate-200 p-4 dark:border-slate-700">
          <div>
            <label className="field-label">Template</label>
            <select
              value={template}
              disabled={busy}
              onChange={(e) => onTemplateChange(e.target.value as ResumeTemplateId)}
              className="w-full rounded border bg-white dark:bg-slate-800 px-3 py-2 text-sm disabled:opacity-50"
            >
              {RESUME_TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Switching re-renders instantly (no AI cost).
            </p>
          </div>

          <button
            type="button"
            onClick={onDownload}
            disabled={busy || !pdfBase64}
            className="btn-primary w-full py-2.5"
          >
            Download PDF
          </button>

          <div className="border-t border-slate-200 pt-4 dark:border-slate-700">
            <label className="field-label">Regenerate content</label>
            <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
              Re-runs the AI for fresh wording (costs one AI call).
            </p>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Tone</label>
            <select
              value={tone}
              disabled={busy}
              onChange={(e) => setTone(e.target.value)}
              className="mb-2 w-full rounded border bg-white dark:bg-slate-800 px-3 py-2 text-sm disabled:opacity-50"
            >
              <option value="">Use saved preference</option>
              <option value="concise">Concise</option>
              <option value="balanced">Balanced</option>
              <option value="detailed">Detailed</option>
            </select>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
              Emphasis (optional)
            </label>
            <textarea
              value={emphasis}
              disabled={busy}
              onChange={(e) => setEmphasis(e.target.value)}
              rows={3}
              placeholder="e.g. emphasize leadership"
              className="mb-2 w-full rounded border bg-white dark:bg-slate-800 px-3 py-2 text-sm disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => onRegenerate({ tone: tone || undefined, emphasis: emphasis.trim() || undefined })}
              disabled={busy}
              className="btn-soft w-full py-2"
            >
              {regenerating ? "Regenerating…" : "Regenerate"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
