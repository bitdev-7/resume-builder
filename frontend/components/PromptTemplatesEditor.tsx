"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  listResumeProfiles,
  updateResumeProfile,
} from "@/lib/supabase/services/resume-profiles";
import type { ResumeProfile } from "@/lib/supabase/database.types";
import { PROMPT_DEFINITIONS } from "@/lib/prompts/prompt-registry";
import type { PromptKey } from "@/lib/prompts/prompt-overrides";

type Overrides = Partial<Record<PromptKey, string>>;

interface Props {
  userId: string;
  showToast: (type: "success" | "error" | "warning", message: string) => void;
}

/**
 * Advanced editor: per-resume-profile custom prompt guidance. Each prompt's fixed
 * JSON/output contract stays server-side and is never editable here — only the
 * guidance/wording is. Blank or default-equal entries are not persisted.
 */
export default function PromptTemplatesEditor({ userId, showToast }: Props) {
  const [profiles, setProfiles] = useState<ResumeProfile[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [overrides, setOverrides] = useState<Overrides>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const list = await listResumeProfiles(userId);
        if (cancelled) return;
        setProfiles(list);
        const initial = list.find((p) => p.is_default) ?? list[0];
        if (initial) {
          setSelectedId(initial.id);
          setOverrides((initial.prompt_overrides as Overrides) ?? {});
        }
      } catch (err) {
        console.error("Failed to load resume profiles for prompt editor:", err);
        showToast("error", "Failed to load profiles for prompt editing.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, showToast]);

  const selectProfile = (id: string) => {
    setSelectedId(id);
    const profile = profiles.find((p) => p.id === id);
    setOverrides((profile?.prompt_overrides as Overrides) ?? {});
  };

  const handleSave = async () => {
    if (!selectedId) return;
    setSaving(true);
    try {
      // Persist only edits that differ from the default and are non-empty.
      const cleaned: Overrides = {};
      for (const def of PROMPT_DEFINITIONS) {
        const value = overrides[def.key];
        if (typeof value === "string" && value.trim() && value !== def.defaultGuidance) {
          cleaned[def.key] = value;
        }
      }
      const updated = await updateResumeProfile(selectedId, {
        prompt_overrides: cleaned as Record<string, string>,
      });
      setProfiles((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      setOverrides((updated.prompt_overrides as Overrides) ?? {});
      showToast("success", "Prompt templates saved for this profile.");
    } catch (err) {
      console.error("Failed to save prompt templates:", err);
      showToast("error", "Failed to save prompt templates.");
    } finally {
      setSaving(false);
    }
  };

  const customizedCount = PROMPT_DEFINITIONS.filter(
    (d) => typeof overrides[d.key] === "string" && overrides[d.key] !== d.defaultGuidance
  ).length;

  return (
    <div className="glass-panel mt-6 overflow-hidden">
      <div className="page-header">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
          Custom prompt templates <span className="font-normal text-slate-400">(advanced)</span>
        </h2>
        <p className="page-subtitle">
          Edit the wording of each AI prompt for a specific resume profile. The JSON output format and
          safety rules are fixed and cannot be edited here, so generation will not break. Leave a box
          unchanged to use the built-in default. Use{" "}
          <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">{"{{STRONG_ACTION_VERBS}}"}</code>{" "}
          and{" "}
          <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">{"{{FORBIDDEN_OPENING_VERBS}}"}</code>{" "}
          where noted to reference the enforced verb lists.
        </p>
      </div>

      <div className="space-y-6 p-6">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
          </div>
        ) : profiles.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No resume profiles found. Create one under Profile first.
          </p>
        ) : (
          <>
            <section>
              <label htmlFor="prompt-profile" className="field-label">
                Resume profile
              </label>
              <select
                id="prompt-profile"
                value={selectedId}
                disabled={saving}
                onChange={(e) => selectProfile(e.target.value)}
                className="select-shell max-w-sm"
              >
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                    {p.is_default ? " (default)" : ""}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {customizedCount > 0
                  ? `${customizedCount} prompt${customizedCount === 1 ? "" : "s"} customized for this profile.`
                  : "All prompts use the built-in defaults for this profile."}
              </p>
            </section>

            {PROMPT_DEFINITIONS.map((def) => {
              const value = overrides[def.key] ?? def.defaultGuidance;
              const isCustomized =
                typeof overrides[def.key] === "string" && overrides[def.key] !== def.defaultGuidance;
              return (
                <section key={def.key} className="rounded-xl border border-slate-200/80 p-4 dark:border-slate-700/60">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                        {def.label}
                      </span>
                      {isCustomized ? (
                        <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                          Customized
                        </span>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      disabled={saving || !isCustomized}
                      onClick={() =>
                        setOverrides((prev) => {
                          const next = { ...prev };
                          delete next[def.key];
                          return next;
                        })
                      }
                      className="btn-soft px-3 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Reset to default
                    </button>
                  </div>
                  <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">{def.description}</p>
                  <textarea
                    value={value}
                    disabled={saving}
                    onChange={(e) => setOverrides((prev) => ({ ...prev, [def.key]: e.target.value }))}
                    rows={10}
                    spellCheck={false}
                    className="input-shell font-mono text-xs leading-relaxed"
                  />
                </section>
              );
            })}

            <div className="flex justify-end">
              <button type="button" onClick={() => void handleSave()} disabled={saving} className="btn-primary">
                {saving ? "Saving…" : "Save prompt templates"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
