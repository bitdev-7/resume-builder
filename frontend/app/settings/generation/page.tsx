"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { ToastContainer, useToast } from "@/components/Toast";
import {
  DEFAULT_WORKFLOW_SETTINGS,
  GENERATION_MODE_OPTIONS,
  type GenerationMode,
  type WorkflowSettings,
} from "@/lib/workflow-settings";
import {
  loadWorkflowSettings,
  saveWorkflowSettings,
} from "@/lib/supabase/services/workflow-settings";
import { notifySettingsUpdated } from "@/lib/generator-workspace-storage";

const MODE_DETAILS: Record<
  GenerationMode,
  { calls: string; repair: string }
> = {
  fast: {
    calls: "~2-3 LLM calls",
    repair: "No repair round",
  },
  balanced: {
    calls: "~3-5 LLM calls",
    repair: "Repairs only real correctness issues",
  },
  accurate: {
    calls: "~3-5 LLM calls (repairs more often)",
    repair: "Repairs any issue, including stylistic polish",
  },
  thorough: {
    calls: "~7-18 LLM calls",
    repair: "One call per work experience + up to 2 repair rounds on any issue",
  },
};

export default function GenerationSettingsPage() {
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<WorkflowSettings>(DEFAULT_WORKFLOW_SETTINGS);
  const { toasts, showToast, dismissToast } = useToast();

  useEffect(() => {
    if (!authLoading && user) {
      void loadSettings();
    }
  }, [authLoading, user]);

  const loadSettings = async () => {
    if (!user) return;
    setLoading(true);
    try {
      setSettings(await loadWorkflowSettings(user.id));
    } catch (err) {
      console.error("Failed to load generation settings:", err);
      showToast("error", "Failed to load generation settings.");
      setSettings(DEFAULT_WORKFLOW_SETTINGS);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => setSettings(DEFAULT_WORKFLOW_SETTINGS);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      const saved = await saveWorkflowSettings(user.id, settings);
      setSettings(saved);
      showToast("success", "Generation settings saved.");
      notifySettingsUpdated();
    } catch (err) {
      console.error("Failed to save generation settings:", err);
      showToast("error", "Failed to save generation settings.");
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || !user) {
    return (
      <div className="flex flex-1 items-center justify-center py-20">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      <div className="glass-panel overflow-hidden">
        <div className="page-header">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
            Resume generation mode
          </h2>
          <p className="page-subtitle">
            Choose how the AI builds your resume. Faster modes skip optional
            repair rounds; the resume is always valid and ATS-ready regardless of
            mode. Evidence rules apply in every mode, so nothing is invented in
            your work history.
          </p>
        </div>

        <form onSubmit={handleSave} className="space-y-6 p-6">
          {loading ? (
            <div className="flex justify-center py-16">
              <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
            </div>
          ) : (
            <>
              <section>
                <label className="field-label">Mode</label>
                <div className="flex flex-wrap gap-2">
                  {GENERATION_MODE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() =>
                        setSettings((s) => ({ ...s, mode: opt.value as GenerationMode }))
                      }
                      className={
                        settings.mode === opt.value
                          ? "tab-pill tab-pill-active px-4 py-2 text-sm"
                          : "tab-pill px-4 py-2 text-sm"
                      }
                      title={opt.hint}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {GENERATION_MODE_OPTIONS.find((o) => o.value === settings.mode)?.hint}
                </p>
              </section>

              <section className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-700 dark:bg-slate-900/40">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  What this mode does
                </h3>
                <dl className="mt-3 space-y-2">
                  <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
                    <dt className="sm:w-32 shrink-0 text-slate-500 dark:text-slate-400">
                      LLM calls
                    </dt>
                    <dd className="text-slate-700 dark:text-slate-200">
                      {MODE_DETAILS[settings.mode].calls}
                    </dd>
                  </div>
                  <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
                    <dt className="sm:w-32 shrink-0 text-slate-500 dark:text-slate-400">
                      Repair
                    </dt>
                    <dd className="text-slate-700 dark:text-slate-200">
                      {MODE_DETAILS[settings.mode].repair}
                    </dd>
                  </div>
                </dl>
                <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                  Every mode runs the same core steps: analyze the job
                  description, write experience bullets, and compose the summary
                  and skills. The mode changes whether bullets are written in a
                  single call or one call per work experience, and whether a
                  follow-up repair round re-checks the result with the AI. Hard
                  correctness problems (e.g. a bullet citing evidence that
                  isn&apos;t yours) are always fixed automatically by a
                  deterministic pass, with or without a repair round.
                </p>
              </section>

              <div className="flex flex-wrap justify-end gap-3">
                <button type="button" onClick={handleReset} disabled={saving} className="btn-soft">
                  Reset to defaults
                </button>
                <button type="submit" disabled={saving} className="btn-primary">
                  {saving ? "Saving…" : "Save settings"}
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </>
  );
}
