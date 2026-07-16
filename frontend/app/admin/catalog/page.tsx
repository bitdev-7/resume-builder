"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ToastContainer, useToast } from "@/components/Toast";
import {
  applyAdminCatalog,
  fetchAdminCatalogFiles,
  researchAdminCatalog,
  verifyAdminCatalog,
  type AdminCatalogFile,
} from "@/lib/admin-catalog-client";
import type { CatalogPatch } from "@/lib/tailoring/catalog-schemas";
import type { CatalogVerifyIssue } from "@/lib/tailoring/catalog-verify";
import type { CatalogSeniority } from "@/lib/tailoring/catalog-research";
import type { MergeSummary } from "@/lib/tailoring/catalog-merge";

const FILE_TABS = [
  "catalog-version.json",
  "skill-aliases.json",
  "skill-relationships.json",
  "alternative-groups.json",
  "role-skill-catalog.json",
] as const;

const SENIORITY_OPTIONS: { value: CatalogSeniority | ""; label: string }[] = [
  { value: "", label: "Auto" },
  { value: "junior", label: "Junior" },
  { value: "mid", label: "Mid" },
  { value: "senior", label: "Senior" },
  { value: "staff", label: "Staff" },
];

export default function AdminCatalogPage() {
  const { toasts, showToast, dismissToast } = useToast();
  const [files, setFiles] = useState<AdminCatalogFile[]>([]);
  const [activeTab, setActiveTab] = useState<string>(FILE_TABS[0]);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [researching, setResearching] = useState(false);
  const [applying, setApplying] = useState(false);
  const [verifyIssues, setVerifyIssues] = useState<CatalogVerifyIssue[] | null>(null);
  const [researchTitle, setResearchTitle] = useState("");
  const [seniority, setSeniority] = useState<CatalogSeniority | "">("");
  const [proposal, setProposal] = useState<CatalogPatch | null>(null);
  const [researchMeta, setResearchMeta] = useState<{ model: string; costUsd?: number } | null>(
    null
  );
  const [dryRunSummary, setDryRunSummary] = useState<MergeSummary | null>(null);
  const [proposalVerified, setProposalVerified] = useState(false);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Not signed in");
      const response = await fetchAdminCatalogFiles(token);
      setFiles(response.files);
      if (!proposal) setVerifyIssues(null);
    } catch (error) {
      console.error("Failed to load catalog files:", error);
      showToast("error", error instanceof Error ? error.message : "Failed to load catalog");
    } finally {
      setLoading(false);
    }
  }, [proposal, showToast]);

  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);

  const activeContent = useMemo(
    () => files.find((f) => f.name === activeTab)?.content ?? "",
    [files, activeTab]
  );

  const getToken = async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Not signed in");
    return token;
  };

  const handleVerify = async (targetProposal?: CatalogPatch | null) => {
    setVerifying(true);
    try {
      const token = await getToken();
      const result = await verifyAdminCatalog(token, targetProposal ?? undefined);
      setVerifyIssues(result.issues);
      setDryRunSummary(result.dryRunMerge ?? null);
      if (targetProposal) {
        setProposalVerified(result.valid);
      }
      if (result.valid) {
        showToast(
          "success",
          targetProposal ? "Proposal passed verification." : "All catalog JSON files are valid."
        );
      } else {
        showToast("warning", `${result.issues.length} validation issue(s) found.`);
      }
    } catch (error) {
      console.error("Verify failed:", error);
      showToast("error", error instanceof Error ? error.message : "Verify failed");
    } finally {
      setVerifying(false);
    }
  };

  const handleResearch = async () => {
    const title = researchTitle.trim();
    if (!title) {
      showToast("warning", "Enter a job title to research.");
      return;
    }
    setResearching(true);
    setProposal(null);
    setProposalVerified(false);
    setDryRunSummary(null);
    setVerifyIssues(null);
    try {
      const token = await getToken();
      const result = await researchAdminCatalog(token, {
        title,
        ...(seniority ? { seniority } : {}),
      });
      setProposal(result.proposal);
      setResearchMeta({ model: result.model, costUsd: result.costUsd });
      showToast("success", `Research complete (${result.model}).`);
      await handleVerify(result.proposal);
    } catch (error) {
      console.error("Research failed:", error);
      showToast("error", error instanceof Error ? error.message : "Research failed");
    } finally {
      setResearching(false);
    }
  };

  const handleApply = async () => {
    if (!proposal) {
      showToast("warning", "Run research first to get a proposal.");
      return;
    }
    if (!proposalVerified) {
      showToast("warning", "Verify the proposal before applying.");
      return;
    }
    setApplying(true);
    try {
      const token = await getToken();
      const result = await applyAdminCatalog(token, proposal);
      showToast("success", `Catalog updated to version ${result.version}.`);
      setProposal(null);
      setProposalVerified(false);
      setDryRunSummary(null);
      setVerifyIssues(null);
      setResearchMeta(null);
      await loadFiles();
    } catch (error) {
      console.error("Apply failed:", error);
      showToast("error", error instanceof Error ? error.message : "Apply failed");
    } finally {
      setApplying(false);
    }
  };

  return (
    <>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold">Skill catalog</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Built-in catalog JSON is read-only here. Use LLM research to propose updates, verify,
            then apply — manual editing is disabled.
          </p>
        </div>

        <div className="glass-panel space-y-4 p-4">
          <h3 className="font-medium">LLM research</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Enter a job title to research market skills and propose catalog updates.
          </p>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <label className="flex-1">
              <span className="filter-label">Job title</span>
              <input
                className="filter-control mt-1 w-full"
                placeholder="e.g. Senior Backend Engineer"
                value={researchTitle}
                onChange={(e) => setResearchTitle(e.target.value)}
                disabled={researching || applying}
              />
            </label>
            <label className="w-full lg:w-40">
              <span className="filter-label">Seniority</span>
              <select
                className="filter-control mt-1 w-full"
                value={seniority}
                onChange={(e) => setSeniority(e.target.value as CatalogSeniority | "")}
                disabled={researching || applying}
              >
                {SENIORITY_OPTIONS.map((opt) => (
                  <option key={opt.label} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="btn-primary"
              onClick={() => void handleResearch()}
              disabled={researching || applying || !researchTitle.trim()}
            >
              {researching ? "Researching…" : "Research"}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => void handleApply()}
              disabled={applying || researching || !proposal || !proposalVerified}
            >
              {applying ? "Applying…" : "Apply"}
            </button>
          </div>

          {proposal ? (
            <div className="rounded-lg border border-slate-200/80 bg-slate-50/50 p-3 text-sm dark:border-slate-700/80 dark:bg-slate-900/30">
              <p className="font-medium">Proposal preview</p>
              {researchMeta ? (
                <p className="mt-1 text-xs text-slate-500">
                  Model: {researchMeta.model}
                  {researchMeta.costUsd != null ? ` · ~$${researchMeta.costUsd.toFixed(4)}` : null}
                </p>
              ) : null}
              <p className="mt-2">
                Archetype: <span className="font-mono">{proposal.archetype.action}</span> →{" "}
                <span className="font-mono">{proposal.archetype.targetId}</span> ({proposal.archetype.label})
              </p>
              {proposal.archetype.mergeReason ? (
                <p className="mt-1 text-slate-600 dark:text-slate-400">
                  Merge reason: {proposal.archetype.mergeReason}
                </p>
              ) : null}
              <p className="mt-1 text-slate-600 dark:text-slate-400">
                +{Object.keys(proposal.skillAliases).length} skill alias entries · +
                {proposal.relationships.length} relationships · +{proposal.alternativeGroups.length}{" "}
                alternative groups
              </p>
              {dryRunSummary ? (
                <p className="mt-1 text-xs text-slate-500">
                  Dry-run: +{dryRunSummary.aliasesAdded} aliases, +{dryRunSummary.relationshipsAdded}{" "}
                  relationships, {dryRunSummary.alternativeGroupsTouched} group(s) touched
                </p>
              ) : null}
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-slate-500">Raw proposal JSON</summary>
                <pre className="mt-2 max-h-48 overflow-auto rounded bg-slate-900/5 p-2 font-mono text-xs dark:bg-black/20">
                  {JSON.stringify(proposal, null, 2)}
                </pre>
              </details>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="btn-primary"
            onClick={() => void handleVerify(proposal)}
            disabled={verifying || loading}
          >
            {verifying ? "Verifying…" : proposal ? "Verify proposal" : "Verify JSON"}
          </button>
          <button type="button" className="btn-secondary" onClick={() => void loadFiles()} disabled={loading}>
            Reload
          </button>
        </div>

        {verifyIssues && verifyIssues.length > 0 ? (
          <div className="glass-panel border-amber-200/60 p-4 dark:border-amber-900/60">
            <h3 className="font-medium text-amber-800 dark:text-amber-200">Validation issues</h3>
            <ul className="mt-2 space-y-1 text-sm">
              {verifyIssues.map((issue, index) => (
                <li key={`${issue.file}-${issue.path ?? ""}-${index}`}>
                  <span className="font-mono text-xs">{issue.file}</span>
                  {issue.path ? <span className="text-slate-500"> → {issue.path}</span> : null}
                  {" — "}
                  <span
                    className={
                      issue.kind === "json_syntax"
                        ? "text-rose-600"
                        : issue.kind === "cross_check"
                          ? "text-orange-700"
                          : "text-amber-700"
                    }
                  >
                    [{issue.kind}] {issue.message}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : verifyIssues && verifyIssues.length === 0 ? (
          <p className="text-sm text-emerald-600 dark:text-emerald-400">
            {proposal ? "Proposal passed verification." : "All files passed verification."}
          </p>
        ) : null}

        <div className="glass-panel overflow-hidden">
          <div className="flex flex-wrap gap-1 border-b border-slate-200/80 p-2 dark:border-slate-700/80">
            {FILE_TABS.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => setActiveTab(name)}
                className={
                  activeTab === name
                    ? "tab-pill tab-pill-active px-3 py-1.5 text-xs font-medium"
                    : "tab-pill px-3 py-1.5 text-xs font-medium"
                }
              >
                {name}
              </button>
            ))}
          </div>
          {loading ? (
            <p className="p-4 text-sm text-slate-500">Loading catalog files…</p>
          ) : (
            <textarea
              className="min-h-[420px] w-full resize-y border-0 bg-transparent p-4 font-mono text-xs leading-relaxed focus:outline-none"
              readOnly
              disabled
              value={activeContent}
              spellCheck={false}
            />
          )}
        </div>
      </div>
    </>
  );
}
