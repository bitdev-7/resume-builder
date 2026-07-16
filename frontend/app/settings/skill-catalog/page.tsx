"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";
import { ToastContainer, useToast } from "@/components/Toast";
import {
  CatalogConflictError,
  fetchSkillCatalog,
  saveArchetypeAddition,
  saveSkillAddition,
  deleteArchetypeAddition,
  deleteSkillAddition,
  type ArchetypeAddition,
  type EffectiveCatalog,
  type SkillAddition,
} from "@/lib/skill-catalog-client";

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Parse an ecosystem text block ("group: a, b\ngroup2: c") into a map. */
function parseEcosystem(text: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const line of text.split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const group = line.slice(0, idx).trim();
    if (!group) continue;
    out[group] = splitList(line.slice(idx + 1));
  }
  return out;
}

function ecosystemToText(ecosystem: Record<string, string[]>): string {
  return Object.entries(ecosystem)
    .map(([group, skills]) => `${group}: ${skills.join(", ")}`)
    .join("\n");
}

interface SkillDraft {
  id?: string;
  canonicalName: string;
  aliases: string; // comma-separated
  version?: number;
}

interface ArchetypeDraft {
  id: string;
  label: string;
  titleKeywords: string;
  core: string;
  ecosystem: string;
  marketRelevant: string;
  skillCategoryHints: string;
  version?: number;
}

function emptySkillDraft(): SkillDraft {
  return { canonicalName: "", aliases: "" };
}

function emptyArchetypeDraft(): ArchetypeDraft {
  return {
    id: "",
    label: "",
    titleKeywords: "",
    core: "",
    ecosystem: "",
    marketRelevant: "",
    skillCategoryHints: "",
  };
}

export default function SkillCatalogPage() {
  const { user, loading: authLoading } = useAuth();
  const { toasts, showToast, dismissToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [catalog, setCatalog] = useState<EffectiveCatalog | null>(null);
  const [showDefaults, setShowDefaults] = useState(false);

  const [skillDraft, setSkillDraft] = useState<SkillDraft>(emptySkillDraft());
  const [archetypeDraft, setArchetypeDraft] = useState<ArchetypeDraft>(emptyArchetypeDraft());
  const [savingSkill, setSavingSkill] = useState(false);
  const [savingArchetype, setSavingArchetype] = useState(false);

  const accessToken = useMemo(() => {
    let token: string | null = null;
    return async () => {
      if (!token) {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        token = session?.access_token ?? null;
      }
      return token;
    };
  }, []);

  const loadCatalog = async () => {
    setLoading(true);
    try {
      const getToken = accessToken();
      const token = await getToken;
      if (!token) return;
      setCatalog(await fetchSkillCatalog(token));
    } catch (err) {
      console.error("Failed to load skill catalog:", err);
      showToast("error", "Failed to load skill catalog.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && user) void loadCatalog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user]);

  const handleConflict = (err: unknown): boolean => {
    if (err instanceof CatalogConflictError) {
      if (err.code === "stale_version") {
        showToast("warning", "Another user changed this entry — refreshing.");
        void loadCatalog();
      } else {
        showToast("error", err.message);
      }
      return true;
    }
    return false;
  };

  const handleSaveSkill = async (e: React.FormEvent) => {
    e.preventDefault();
    const getToken = accessToken();
    const token = await getToken;
    if (!token) return;
    if (!skillDraft.canonicalName.trim()) {
      showToast("error", "Canonical name is required.");
      return;
    }
    setSavingSkill(true);
    try {
      const saved = await saveSkillAddition(token, {
        id: skillDraft.id,
        canonicalName: skillDraft.canonicalName.trim(),
        aliases: splitList(skillDraft.aliases),
        version: skillDraft.version,
      });
      setSkillDraft(emptySkillDraft());
      showToast("success", `Skill "${saved.canonicalName}" saved.`);
      void loadCatalog();
    } catch (err) {
      if (!handleConflict(err)) {
        showToast("error", err instanceof Error ? err.message : "Failed to save skill.");
      }
    } finally {
      setSavingSkill(false);
    }
  };

  const handleDeleteSkill = async (skill: SkillAddition) => {
    const getToken = accessToken();
    const token = await getToken;
    if (!token) return;
    if (!window.confirm(`Delete skill "${skill.canonicalName}"?`)) return;
    try {
      await deleteSkillAddition(token, skill.id, skill.version);
      showToast("success", "Skill deleted.");
      void loadCatalog();
    } catch (err) {
      if (!handleConflict(err)) {
        showToast("error", err instanceof Error ? err.message : "Failed to delete skill.");
      }
    }
  };

  const handleSaveArchetype = async (e: React.FormEvent) => {
    e.preventDefault();
    const getToken = accessToken();
    const token = await getToken;
    if (!token) return;
    if (!archetypeDraft.id.trim() || !archetypeDraft.label.trim()) {
      showToast("error", "id and label are required.");
      return;
    }
    setSavingArchetype(true);
    try {
      const saved = await saveArchetypeAddition(token, {
        id: archetypeDraft.id.trim(),
        label: archetypeDraft.label.trim(),
        titleKeywords: splitList(archetypeDraft.titleKeywords),
        core: splitList(archetypeDraft.core),
        ecosystem: parseEcosystem(archetypeDraft.ecosystem),
        marketRelevant: splitList(archetypeDraft.marketRelevant),
        skillCategoryHints: splitList(archetypeDraft.skillCategoryHints),
        version: archetypeDraft.version,
      });
      setArchetypeDraft(emptyArchetypeDraft());
      showToast("success", `Archetype "${saved.label}" saved.`);
      void loadCatalog();
    } catch (err) {
      if (!handleConflict(err)) {
        showToast("error", err instanceof Error ? err.message : "Failed to save archetype.");
      }
    } finally {
      setSavingArchetype(false);
    }
  };

  const handleDeleteArchetype = async (archetype: ArchetypeAddition) => {
    const getToken = accessToken();
    const token = await getToken;
    if (!token) return;
    if (!window.confirm(`Delete archetype "${archetype.label}"?`)) return;
    try {
      await deleteArchetypeAddition(token, archetype.id, archetype.version);
      showToast("success", "Archetype deleted.");
      void loadCatalog();
    } catch (err) {
      if (!handleConflict(err)) {
        showToast("error", err instanceof Error ? err.message : "Failed to delete archetype.");
      }
    }
  };

  const editSkill = (skill: SkillAddition) => {
    setSkillDraft({
      id: skill.id,
      canonicalName: skill.canonicalName,
      aliases: skill.aliases.join(", "),
      version: skill.version,
    });
  };

  const editArchetype = (archetype: ArchetypeAddition) => {
    setArchetypeDraft({
      id: archetype.id,
      label: archetype.label,
      titleKeywords: archetype.titleKeywords.join(", "),
      core: archetype.core.join(", "),
      ecosystem: ecosystemToText(archetype.ecosystem),
      marketRelevant: archetype.marketRelevant.join(", "),
      skillCategoryHints: archetype.skillCategoryHints.join(", "),
      version: archetype.version,
    });
  };

  if (authLoading || !user) {
    return (
      <div className="flex flex-1 items-center justify-center">
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
            Skill catalog
          </h2>
          <p className="page-subtitle">
            Add custom skills and role archetypes shared across all users. Built-in
            defaults are read-only; your additions layer on top and take effect on the
            next resume generation.
          </p>
        </div>

        <div className="space-y-6 p-6">
          {loading ? (
            <div className="flex justify-center py-10">
              <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
            </div>
          ) : (
            <>
              {/* Skills */}
              <section className="card space-y-4 p-5">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                  Custom skills
                </h3>

                <form onSubmit={handleSaveSkill} className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_2fr_auto]">
                  <input
                    className="input-shell"
                    placeholder="Canonical name (e.g. MyFramework)"
                    value={skillDraft.canonicalName}
                    onChange={(e) =>
                      setSkillDraft((prev) => ({ ...prev, canonicalName: e.target.value }))
                    }
                  />
                  <input
                    className="input-shell"
                    placeholder="Aliases (comma-separated)"
                    value={skillDraft.aliases}
                    onChange={(e) =>
                      setSkillDraft((prev) => ({ ...prev, aliases: e.target.value }))
                    }
                  />
                  <button type="submit" disabled={savingSkill} className="btn-primary">
                    {savingSkill ? "Saving…" : skillDraft.id ? "Update" : "Add"}
                  </button>
                </form>

                <ul className="divide-y divide-slate-200 dark:divide-slate-700">
                  {(catalog?.additions.skills ?? []).map((skill) => (
                    <li
                      key={skill.id}
                      className="flex items-center justify-between gap-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-50">
                          {skill.canonicalName}
                        </div>
                        <div className="truncate text-xs text-slate-500 dark:text-slate-300">
                          {skill.aliases.join(", ") || "(no aliases)"}
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => editSkill(skill)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => void handleDeleteSkill(skill)}
                        >
                          Delete
                        </button>
                      </div>
                    </li>
                  ))}
                  {(catalog?.additions.skills ?? []).length === 0 && (
                    <li className="py-2 text-sm text-slate-500 dark:text-slate-300">
                      No custom skills yet.
                    </li>
                  )}
                </ul>
              </section>

              {/* Archetypes */}
              <section className="card space-y-4 p-5">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                  Custom archetypes
                </h3>

                <form onSubmit={handleSaveArchetype} className="space-y-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <input
                      className="input-shell"
                      placeholder="id (lowercase, e.g. my_platform_engineer)"
                      value={archetypeDraft.id}
                      onChange={(e) =>
                        setArchetypeDraft((prev) => ({ ...prev, id: e.target.value }))
                      }
                      disabled={Boolean(archetypeDraft.version)}
                    />
                    <input
                      className="input-shell"
                      placeholder="Label (e.g. Platform Engineer)"
                      value={archetypeDraft.label}
                      onChange={(e) =>
                        setArchetypeDraft((prev) => ({ ...prev, label: e.target.value }))
                      }
                    />
                  </div>
                  <input
                    className="input-shell"
                    placeholder="Title keywords (comma-separated)"
                    value={archetypeDraft.titleKeywords}
                    onChange={(e) =>
                      setArchetypeDraft((prev) => ({ ...prev, titleKeywords: e.target.value }))
                    }
                  />
                  <input
                    className="input-shell"
                    placeholder="Core skills (comma-separated)"
                    value={archetypeDraft.core}
                    onChange={(e) =>
                      setArchetypeDraft((prev) => ({ ...prev, core: e.target.value }))
                    }
                  />
                  <textarea
                    className="input-shell min-h-[80px]"
                    placeholder={"Ecosystem (one group per line, e.g.):\ndelivery: Docker, CI/CD\ncloud: AWS, GCP"}
                    value={archetypeDraft.ecosystem}
                    onChange={(e) =>
                      setArchetypeDraft((prev) => ({ ...prev, ecosystem: e.target.value }))
                    }
                  />
                  <input
                    className="input-shell"
                    placeholder="Market-relevant skills (comma-separated)"
                    value={archetypeDraft.marketRelevant}
                    onChange={(e) =>
                      setArchetypeDraft((prev) => ({ ...prev, marketRelevant: e.target.value }))
                    }
                  />
                  <input
                    className="input-shell"
                    placeholder="Skill category hints (comma-separated)"
                    value={archetypeDraft.skillCategoryHints}
                    onChange={(e) =>
                      setArchetypeDraft((prev) => ({
                        ...prev,
                        skillCategoryHints: e.target.value,
                      }))
                    }
                  />
                  <div className="flex justify-end">
                    <button type="submit" disabled={savingArchetype} className="btn-primary">
                      {savingArchetype
                        ? "Saving…"
                        : archetypeDraft.version
                          ? "Update"
                          : "Add archetype"}
                    </button>
                  </div>
                </form>

                <ul className="divide-y divide-slate-200 dark:divide-slate-700">
                  {(catalog?.additions.archetypes ?? []).map((archetype) => (
                    <li
                      key={archetype.id}
                      className="flex items-center justify-between gap-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-50">
                          {archetype.label}
                        </div>
                        <div className="truncate text-xs text-slate-500 dark:text-slate-300">
                          {archetype.core.join(", ") || "(no core skills)"}
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => editArchetype(archetype)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => void handleDeleteArchetype(archetype)}
                        >
                          Delete
                        </button>
                      </div>
                    </li>
                  ))}
                  {(catalog?.additions.archetypes ?? []).length === 0 && (
                    <li className="py-2 text-sm text-slate-500 dark:text-slate-300">
                      No custom archetypes yet.
                    </li>
                  )}
                </ul>
              </section>

              {/* Defaults (read-only) */}
              <section className="card space-y-3 p-5">
                <button
                  type="button"
                  className="flex w-full items-center justify-between"
                  onClick={() => setShowDefaults((v) => !v)}
                >
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                    Built-in defaults (read-only)
                  </h3>
                  <span className="text-xs text-slate-500 dark:text-slate-300">
                    {showDefaults ? "Hide" : "Show"} ({catalog?.defaults.skills.length ?? 0} skills,{" "}
                    {catalog?.defaults.archetypes.length ?? 0} archetypes)
                  </span>
                </button>
                {showDefaults && (
                  <div className="space-y-4">
                    <div>
                      <div className="mb-1 text-xs font-semibold uppercase text-slate-500 dark:text-slate-300">
                        Skills
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {catalog?.defaults.skills.map((s) => (
                          <span
                            key={s.canonicalName}
                            className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                          >
                            {s.canonicalName}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="mb-1 text-xs font-semibold uppercase text-slate-500 dark:text-slate-300">
                        Archetypes
                      </div>
                      <ul className="text-sm text-slate-700 dark:text-slate-200">
                        {catalog?.defaults.archetypes.map((a) => (
                          <li key={a.id} className="py-0.5">
                            <span className="font-medium">{a.label}</span>{" "}
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              ({a.id})
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </>
  );
}
