"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { ToastContainer, useToast } from "@/components/Toast";
import {
  DEFAULT_APPLY_ALERT_SETTINGS,
  DEFAULT_DUPLICATE_APPLY_MONTHS,
  type ApplyAlertSettings,
} from "@/lib/apply-alert-settings";
import { DEFAULT_AI_SETTINGS, type AiSettings } from "@/lib/ai-settings";
import {
  clearLinkedDownloadFolder,
  hasLinkedDownloadFolder,
  isClientFolderPickerSupported,
  isSecureDownloadContext,
  linkDownloadFolder,
} from "@/lib/client-folder-download";
import {
  clearLinkedDownloadPathMemory,
  DEFAULT_DOWNLOAD_BASE_PATH,
  isDownloadPathOutOfSyncWithLink,
  readLinkedDownloadPath,
  rememberLinkedDownloadPath,
} from "@/lib/download-settings";
import {
  loadGeneralSettings,
  saveGeneralSettings,
} from "@/lib/supabase/services/general-settings";
import { notifySettingsUpdated } from "@/lib/generator-workspace-storage";

export default function SettingsPage() {
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [linkingFolder, setLinkingFolder] = useState(false);
  const [fullName, setFullName] = useState("");
  const [downloadBasePath, setDownloadBasePath] = useState(DEFAULT_DOWNLOAD_BASE_PATH);
  const [folderLinked, setFolderLinked] = useState(false);
  const [settings, setSettings] = useState<ApplyAlertSettings>(DEFAULT_APPLY_ALERT_SETTINGS);
  const [aiSettings, setAiSettings] = useState<AiSettings>(DEFAULT_AI_SETTINGS);
  const { toasts, showToast, dismissToast } = useToast();
  const secureContext = isSecureDownloadContext();
  const folderPickerSupported = isClientFolderPickerSupported();
  const pathOutOfSync = folderLinked && isDownloadPathOutOfSyncWithLink(downloadBasePath);

  useEffect(() => {
    if (!authLoading && user) {
      void loadSettings();
    }
  }, [authLoading, user]);

  const refreshFolderLink = async (userId: string) => {
    setFolderLinked(await hasLinkedDownloadFolder(userId));
  };

  const loadSettings = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const loaded = await loadGeneralSettings(user.id);
      setFullName(loaded.fullName);
      setSettings(loaded.alerts);
      setAiSettings(loaded.ai);
      setDownloadBasePath(loaded.downloadBasePath);
      await refreshFolderLink(user.id);
      // Older links may lack path memory — bind to the current Settings path.
      if (
        (await hasLinkedDownloadFolder(user.id)) &&
        !readLinkedDownloadPath()
      ) {
        rememberLinkedDownloadPath(loaded.downloadBasePath);
      }
    } catch (err) {
      console.error("Failed to load settings:", err);
      showToast("error", "Failed to load settings.");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setSaving(true);

    try {
      const pathChanged = isDownloadPathOutOfSyncWithLink(downloadBasePath);
      const saved = await saveGeneralSettings(
        user.id,
        settings,
        aiSettings,
        fullName,
        downloadBasePath
      );
      setFullName(saved.fullName);
      setSettings(saved.alerts);
      setAiSettings(saved.ai);
      setDownloadBasePath(saved.downloadBasePath);

      if (pathChanged && folderLinked) {
        await clearLinkedDownloadFolder(user.id);
        clearLinkedDownloadPathMemory();
        setFolderLinked(false);
        showToast(
          "success",
          "Settings saved. Download path changed — re-link the folder to save into subfolders."
        );
      } else {
        showToast("success", "Settings saved.");
      }
      notifySettingsUpdated();
    } catch (err) {
      console.error("Failed to save settings:", err);
      showToast("error", "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  };

  const handleLinkFolder = async () => {
    if (!user) return;
    setLinkingFolder(true);
    try {
      const folderName = await linkDownloadFolder(user.id);
      rememberLinkedDownloadPath(downloadBasePath);
      setFolderLinked(true);
      showToast(
        "success",
        `Linked folder “${folderName}”. Resumes will save into Company_Role subfolders there.`
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return;
      }
      console.error("Failed to link download folder:", err);
      showToast(
        "error",
        err instanceof Error ? err.message : "Failed to link download folder"
      );
    } finally {
      setLinkingFolder(false);
    }
  };

  const handleUnlinkFolder = async () => {
    if (!user) return;
    try {
      await clearLinkedDownloadFolder(user.id);
      clearLinkedDownloadPathMemory();
      setFolderLinked(false);
      showToast("success", "Folder unlinked. Downloads will use the browser download bar.");
    } catch (err) {
      console.error("Failed to unlink folder:", err);
      showToast("error", "Failed to unlink folder");
    }
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
            General
          </h2>
          <p className="page-subtitle">
            Account details, download folder, application alerts, and AI provider preferences.
          </p>
        </div>

        <form onSubmit={handleSave} className="space-y-6 p-6">
          {loading ? (
            <div className="flex justify-center py-10">
              <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
            </div>
          ) : (
            <>
              <section className="card space-y-4 p-5">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                    Account
                  </h3>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-300">
                    Your display name for this account (shown in admin and account lists).
                  </p>
                </div>

                <div className="max-w-md">
                  <label htmlFor="full-name" className="field-label">
                    Full name
                  </label>
                  <input
                    id="full-name"
                    type="text"
                    autoComplete="name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Jane Doe"
                    className="input-shell"
                  />
                </div>
              </section>

              <section className="card space-y-4 p-5">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                    Resume download folder
                  </h3>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-300">
                    Files are never saved on the server. Set your preferred client path
                    (shown when a folder is linked), then link that folder so Chrome/Edge
                    can create <code className="text-xs">Company_Role</code> subfolders.
                    Without a link, files use the browser download bar and the toast shows
                    the real filename.
                  </p>
                </div>

                <div className="max-w-xl">
                  <label htmlFor="download-base-path" className="field-label">
                    Default download path
                  </label>
                  <input
                    id="download-base-path"
                    type="text"
                    value={downloadBasePath}
                    onChange={(e) => setDownloadBasePath(e.target.value)}
                    placeholder="e.g. C:\Users\You\Downloads"
                    className="input-shell font-mono text-sm"
                    spellCheck={false}
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="btn-secondary btn-compact"
                    disabled={!folderPickerSupported || linkingFolder}
                    onClick={() => void handleLinkFolder()}
                  >
                    {linkingFolder
                      ? "Linking…"
                      : folderLinked
                        ? "Re-link folder"
                        : "Link folder"}
                  </button>
                  {folderLinked ? (
                    <button
                      type="button"
                      className="btn-compact text-red-600 dark:text-red-400"
                      onClick={() => void handleUnlinkFolder()}
                    >
                      Unlink
                    </button>
                  ) : null}
                  <span className="text-xs text-slate-500 dark:text-slate-300">
                    {!secureContext
                      ? "Folder linking needs HTTPS or localhost (not plain HTTP LAN). Until then, downloads use the browser download bar."
                      : folderPickerSupported
                        ? pathOutOfSync
                          ? "Path changed since link — save settings or re-link before subfolder saves work."
                          : folderLinked
                            ? "Folder linked — resumes save into subfolders on this PC."
                            : "Not linked yet — downloads use the browser download bar."
                        : "Folder linking needs Chrome or Edge on desktop."}
                  </span>
                </div>
              </section>

              <section className="card space-y-4 p-5">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                    AI provider
                  </h3>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-300">
                    Choose how resume generation connects to language models on the
                    Generator page.
                  </p>
                </div>

                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={aiSettings.use_openrouter}
                    onChange={(e) =>
                      setAiSettings((prev) => ({
                        ...prev,
                        use_openrouter: e.target.checked,
                      }))
                    }
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-slate-900 dark:text-slate-50">
                      Use OpenRouter
                    </span>
                    <span className="mt-1 block text-sm text-slate-500 dark:text-slate-300">
                      When enabled, pick any model via OpenRouter (single{" "}
                      <code className="text-xs">OPENROUTER_API_KEY</code>). When
                      disabled, use direct API keys for OpenAI, Anthropic (Claude), or
                      DeepSeek — configured in backend{" "}
                      <code className="text-xs">.env.local</code>.
                    </span>
                  </span>
                </label>

                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={aiSettings.auto_ats_after_resume}
                    onChange={(e) =>
                      setAiSettings((prev) => ({
                        ...prev,
                        auto_ats_after_resume: e.target.checked,
                      }))
                    }
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-slate-900 dark:text-slate-50">
                      Show ATS score after generating resume
                    </span>
                    <span className="mt-1 block text-sm text-slate-500 dark:text-slate-300">
                      Automatically checks ATS match when a resume finishes generating
                      and shows the score on each result card. You can still open the
                      full ATS report with Check ATS match.
                    </span>
                  </span>
                </label>

                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={aiSettings.show_pdf_preview_after_resume}
                    onChange={(e) =>
                      setAiSettings((prev) => ({
                        ...prev,
                        show_pdf_preview_after_resume: e.target.checked,
                      }))
                    }
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-slate-900 dark:text-slate-50">
                      Show PDF preview after generating resume
                    </span>
                    <span className="mt-1 block text-sm text-slate-500 dark:text-slate-300">
                      When enabled, opens the preview modal so you can review and
                      download. When disabled, downloads the PDF immediately without
                      asking. You can still open Preview from the result card.
                    </span>
                  </span>
                </label>
              </section>

              <section className="card space-y-4 p-5">
                <div>
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={settings.duplicate_apply_alert_enabled}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          duplicate_apply_alert_enabled: e.target.checked,
                        }))
                      }
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span>
                      <span className="block text-sm font-semibold text-slate-900 dark:text-slate-50">
                        Alert on duplicate company applications
                      </span>
                      <span className="mt-1 block text-sm text-slate-500 dark:text-slate-300">
                        Warn if you already applied to the same company within a
                        chosen period. Shows previous application date, company, and
                        role.
                      </span>
                    </span>
                  </label>
                </div>

                {settings.duplicate_apply_alert_enabled && (
                  <div className="ml-7 max-w-xs">
                    <label htmlFor="duplicate-months" className="field-label">
                      Look back period (months)
                    </label>
                    <input
                      id="duplicate-months"
                      type="number"
                      min={1}
                      max={24}
                      value={settings.duplicate_apply_months}
                      onChange={(e) => {
                        const value = Number(e.target.value);
                        setSettings((prev) => ({
                          ...prev,
                          duplicate_apply_months:
                            Number.isFinite(value) && value >= 1
                              ? Math.min(24, Math.round(value))
                              : DEFAULT_DUPLICATE_APPLY_MONTHS,
                        }));
                      }}
                      className="input-shell"
                    />
                  </div>
                )}
              </section>

              <section className="card space-y-4 p-5">
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={settings.hybrid_onsite_alert_enabled}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        hybrid_onsite_alert_enabled: e.target.checked,
                      }))
                    }
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-slate-900 dark:text-slate-50">
                      Alert on hybrid or onsite jobs
                    </span>
                    <span className="mt-1 block text-sm text-slate-500 dark:text-slate-300">
                      Warn when the job description mentions hybrid, onsite, in-office,
                      or similar work location terms.
                    </span>
                  </span>
                </label>
              </section>

              <div className="flex justify-end">
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
