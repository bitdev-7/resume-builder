"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { ToastContainer, useToast } from "@/components/Toast";
import {
  DEFAULT_RESUME_PROMPT_PREFERENCES,
  RESUME_SENIORITY_OPTIONS,
  RESUME_SPELLING_OPTIONS,
  RESUME_TONE_OPTIONS,
  type ResumePromptPreferences,
  type ResumeSeniority,
  type ResumeSpelling,
  type ResumeTone,
} from "@/lib/resume-prompt-settings";
import {
  loadResumePromptPreferences,
  saveResumePromptPreferences,
} from "@/lib/supabase/services/resume-prompt-settings";
import { notifySettingsUpdated } from "@/lib/generator-workspace-storage";

export default function PromptSettingsPage() {
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [prefs, setPrefs] = useState<ResumePromptPreferences>(DEFAULT_RESUME_PROMPT_PREFERENCES);
  const { toasts, showToast, dismissToast } = useToast();

  useEffect(() => {
    if (!authLoading && user) {
      void loadPrefs();
    }
  }, [authLoading, user]);

  const loadPrefs = async () => {
    if (!user) return;
    setLoading(true);
    try {
      setPrefs(await loadResumePromptPreferences(user.id));
    } catch (err) {
      console.error("Failed to load resume preferences:", err);
      showToast("error", "Failed to load resume preferences.");
      setPrefs(DEFAULT_RESUME_PROMPT_PREFERENCES);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => setPrefs(DEFAULT_RESUME_PROMPT_PREFERENCES);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      const saved = await saveResumePromptPreferences(user.id, prefs);
      setPrefs(saved);
      showToast("success", "Resume preferences saved.");
      notifySettingsUpdated();
    } catch (err) {
      console.error("Failed to save resume preferences:", err);
      showToast("error", "Failed to save resume preferences.");
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
            Resume generation preferences
          </h2>
          <p className="page-subtitle">
            Fine-tune how your resumes are written. These preferences shape style, emphasis, and
            language only. They are layered on top of the evidence rules and never override them, so
            nothing is invented in your work history.
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
                <label className="field-label">Tone</label>
                <div className="flex flex-wrap gap-2">
                  {RESUME_TONE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setPrefs((p) => ({ ...p, tone: opt.value as ResumeTone }))}
                      className={
                        prefs.tone === opt.value
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
                  {RESUME_TONE_OPTIONS.find((o) => o.value === prefs.tone)?.hint}
                </p>
              </section>

              <section>
                <label className="field-label">Spelling</label>
                <div className="flex flex-wrap gap-2">
                  {RESUME_SPELLING_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setPrefs((p) => ({ ...p, spelling: opt.value as ResumeSpelling }))}
                      className={
                        prefs.spelling === opt.value
                          ? "tab-pill tab-pill-active px-4 py-2 text-sm"
                          : "tab-pill px-4 py-2 text-sm"
                      }
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <label className="field-label">Seniority framing</label>
                <div className="flex flex-wrap gap-2">
                  {RESUME_SENIORITY_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setPrefs((p) => ({ ...p, seniority: opt.value as ResumeSeniority }))}
                      className={
                        prefs.seniority === opt.value
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
                  {RESUME_SENIORITY_OPTIONS.find((o) => o.value === prefs.seniority)?.hint}. Changes wording only,
                  never invented titles, employers, or dates.
                </p>
              </section>

              <section>
                <label htmlFor="resume-language" className="field-label">
                  Language
                </label>
                <input
                  id="resume-language"
                  type="text"
                  value={prefs.language}
                  onChange={(e) => setPrefs((p) => ({ ...p, language: e.target.value }))}
                  placeholder="English (leave blank for English)"
                  className="input-shell max-w-sm"
                />
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  The generated summary, bullets, and project text are written in this language. Contact
                  details, company names, and dates are kept as entered.
                </p>
              </section>

              <section>
                <label htmlFor="resume-extra" className="field-label">
                  Additional instructions <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <textarea
                  id="resume-extra"
                  value={prefs.additionalInstructions}
                  onChange={(e) => setPrefs((p) => ({ ...p, additionalInstructions: e.target.value }))}
                  rows={6}
                  className="input-shell"
                  placeholder={
                    "e.g.\n- Emphasize leadership and mentoring\n- Avoid the words 'synergy' and 'passionate'\n- Frame my experience for fintech even if the JD is generic"
                  }
                />
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Free-text guidance for tone, emphasis, wording, or domain framing. These are applied
                  only where they do not conflict with the evidence rules; they cannot add skills or
                  achievements you do not have.
                </p>
              </section>

              <div className="flex flex-wrap justify-end gap-3">
                <button type="button" onClick={handleReset} disabled={saving} className="btn-soft">
                  Reset to defaults
                </button>
                <button type="submit" disabled={saving} className="btn-primary">
                  {saving ? "Saving…" : "Save preferences"}
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </>
  );
}
