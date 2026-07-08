"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { AnalysisResult } from "@/lib/types/resume";
import type { JobWorkType } from "@/lib/prompts/job-page-extract";
import { formatJobWorkTypeLabel } from "@/lib/prompts/job-page-extract";
import { formatProviderLabel } from "@/lib/openrouter-shared";
import { jobWorkTypeBadgeClass } from "@/lib/job-work-type";
import { getJobsiteLabel, type JobsiteId } from "@/lib/jobsites";
import { formatDurationMs } from "@/lib/format-duration";
import { atsScoreTextClass, formatAtsScoreLabel } from "@/lib/check-ats-client";
import { formatAiCostBreakdown } from "@/lib/ai-usage";
import type { AtsMatchResult } from "@/lib/types/ats-match";
import JobDescriptionDialog from "@/components/JobDescriptionDialog";
import AtsMatchDialog from "@/components/AtsMatchDialog";

export interface AnalysisSessionView {
  id: string;
  jobTitle: string;
  companyName: string;
  jobDescription: string;
  jobType: JobWorkType;
  jobTypes: JobWorkType[];
  requiresTravel: boolean;
  salary: string;
  postedDate: string;
  aiProvider: string;
  aiModel: string;
  useOpenRouter: boolean;
  jobsite: JobsiteId;
  generating: boolean;
  generateError: string | null;
  result: AnalysisResult | null;
  downloading?: boolean;
  downloadError?: string | null;
  providerUsed?: string;
  modelUsed?: string;
  extractMs?: number;
  analyzeMs?: number;
  pdfMs?: number;
  atsLoading?: boolean;
  atsResult?: AtsMatchResult | null;
  atsError?: string | null;
  extractCostUsd?: number;
  generationCostUsd?: number;
  atsCostUsd?: number;
}

interface AnalysisResultCardProps {
  session: AnalysisSessionView;
  onGenerateResume: (id: string) => void;
  onGenerateAnswers: (id: string) => void;
  onClose: (id: string) => void;
  onError?: (message: string) => void;
}

type GeneratePhase = "analyze" | "pdf" | null;

function GenerationProgressBar({ phase }: { phase: GeneratePhase }) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!phase) {
      setProgress(0);
      return;
    }

    const floor = phase === "pdf" ? 68 : 0;
    const ceiling = phase === "pdf" ? 96 : 68;
    const tau = phase === "pdf" ? 12_000 : 90_000;
    const started = Date.now();

    setProgress(floor);

    const tick = window.setInterval(() => {
      const elapsed = Date.now() - started;
      const ratio = 1 - Math.exp(-elapsed / tau);
      setProgress(floor + (ceiling - floor) * ratio);
    }, 120);

    return () => window.clearInterval(tick);
  }, [phase]);

  if (!phase) return null;

  const label = phase === "pdf" ? "Building PDF…" : "Generating resume…";

  return (
    <div className="mt-2.5">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-blue-700 dark:text-blue-300">{label}</span>
        <span className="text-[11px] tabular-nums text-slate-400 dark:text-slate-500">
          {Math.round(progress)}%
        </span>
      </div>
      <div className="relative h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700/80">
        <div
          className="relative h-full rounded-full bg-gradient-to-r from-[#007fff] via-blue-500 to-cyan-400 transition-[width] duration-300 ease-out"
          style={{ width: `${progress}%` }}
        >
          <span className="absolute inset-0 animate-pulse bg-white/25" />
        </div>
      </div>
    </div>
  );
}

function MetaLine({ children }: { children: ReactNode }) {
  return (
    <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs leading-snug text-slate-600 dark:text-slate-300">
      {children}
    </p>
  );
}

function MetaSep() {
  return <span className="select-none text-slate-300 dark:text-slate-600">·</span>;
}

function MetaBit({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <span>
      <span className="font-medium text-slate-400 dark:text-slate-500">{label}</span>{" "}
      <span className="text-slate-700 dark:text-slate-200">{value}</span>
    </span>
  );
}

function JobTypeBadges({
  jobTypes,
  requiresTravel,
}: {
  jobTypes: JobWorkType[];
  requiresTravel: boolean;
}) {
  const visibleTypes =
    jobTypes.filter((type) => type !== "unknown").length > 0
      ? jobTypes.filter((type) => type !== "unknown")
      : ["unknown" as JobWorkType];

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
      {visibleTypes.map((type) => (
        <span
          key={type}
          className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium leading-tight ring-1 ring-inset ring-black/5 dark:ring-white/10 ${jobWorkTypeBadgeClass(type)}`}
        >
          {formatJobWorkTypeLabel(type)}
        </span>
      ))}
      {requiresTravel ? (
        <span className="inline-flex rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium leading-tight text-violet-800 ring-1 ring-inset ring-violet-200/80 dark:bg-violet-950/50 dark:text-violet-300 dark:ring-violet-800/50">
          Travel
        </span>
      ) : null}
    </div>
  );
}

export default function AnalysisResultCard({
  session,
  onGenerateResume,
  onGenerateAnswers,
  onClose,
  onError,
}: AnalysisResultCardProps) {
  const [jdOpen, setJdOpen] = useState(false);
  const [atsOpen, setAtsOpen] = useState(false);
  const hasResume = Boolean(session.result);
  const busy = session.generating || session.downloading;
  const atsBusy = Boolean(session.atsLoading);
  const hasJobDescription = Boolean(session.jobDescription.trim());
  const generatePhase: GeneratePhase = session.generating
    ? "analyze"
    : session.downloading
      ? "pdf"
      : null;

  const generatedWith =
    session.providerUsed && session.result
      ? `${formatProviderLabel(session.providerUsed)}${session.modelUsed ? ` · ${session.modelUsed}` : ""}`
      : "";

  const showStatsLine =
    Boolean(generatedWith) ||
    session.extractMs != null ||
    session.analyzeMs != null ||
    session.pdfMs != null ||
    session.atsLoading ||
    session.atsResult ||
    session.atsError ||
    session.extractCostUsd != null ||
    session.generationCostUsd != null ||
    session.atsCostUsd != null;

  const aiCostLabel = formatAiCostBreakdown({
    extractCostUsd: session.extractCostUsd,
    generationCostUsd: session.generationCostUsd,
    atsCostUsd: session.atsCostUsd,
  });

  return (
    <>
      <JobDescriptionDialog
        open={jdOpen}
        onClose={() => setJdOpen(false)}
        jobTitle={session.jobTitle}
        companyName={session.companyName}
        jobDescription={session.jobDescription}
      />
      <AtsMatchDialog
        open={atsOpen}
        onClose={() => setAtsOpen(false)}
        resume={session.result}
        jobDescription={session.jobDescription}
        jobTitle={session.jobTitle}
        companyName={session.companyName}
        apiModel={session.aiModel}
        apiProvider={session.aiProvider}
        useOpenRouter={session.useOpenRouter}
        initialAts={session.atsResult ?? undefined}
        onError={(message) => onError?.(message)}
      />
      <article
        className={`group relative overflow-hidden rounded-xl border bg-gradient-to-br from-white via-white to-slate-50/90 shadow-sm transition-shadow duration-200 dark:from-slate-800 dark:via-slate-800 dark:to-slate-900/40 ${
          busy
            ? "border-blue-200/80 shadow-[0_8px_28px_-14px_rgba(0,127,255,0.45)] dark:border-blue-500/30"
            : "border-slate-200/90 hover:shadow-md dark:border-slate-600/80 dark:hover:border-slate-500/50"
        }`}
      >
        <div
          className={`absolute inset-y-0 left-0 w-1 bg-gradient-to-b ${
            busy ? "from-[#007fff] via-blue-500 to-cyan-400" : "from-slate-300 to-slate-200 dark:from-slate-600 dark:to-slate-700"
          }`}
          aria-hidden
        />

        <div className="border-b border-slate-100/90 px-3 py-2.5 pl-3.5 dark:border-slate-600/40">
          <div className="flex items-start gap-2.5">
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <h3 className="truncate text-base font-semibold tracking-tight text-slate-900 dark:text-slate-50">
                  {session.jobTitle || "Untitled role"}
                </h3>
                {session.companyName ? (
                  <span className="truncate text-sm text-slate-500 dark:text-slate-400">
                    {session.companyName}
                  </span>
                ) : null}
              </div>

              <MetaLine>
                <MetaBit label="AI" value={formatProviderLabel(session.aiProvider)} />
                <MetaSep />
                <MetaBit label="Model" value={session.aiModel} />
                <MetaSep />
                <MetaBit label="Site" value={getJobsiteLabel(session.jobsite)} />
                {session.salary ? (
                  <>
                    <MetaSep />
                    <MetaBit label="Pay" value={session.salary} />
                  </>
                ) : null}
                {session.postedDate ? (
                  <>
                    <MetaSep />
                    <MetaBit label="Posted" value={session.postedDate} />
                  </>
                ) : null}
              </MetaLine>

              {showStatsLine ? (
                <MetaLine>
                  {generatedWith ? <MetaBit label="Generated" value={generatedWith} /> : null}
                  {session.extractMs != null ? (
                    <>
                      {generatedWith ? <MetaSep /> : null}
                      <MetaBit label="Analyse" value={formatDurationMs(session.extractMs)} />
                    </>
                  ) : null}
                  {session.analyzeMs != null ? (
                    <>
                      <MetaSep />
                      <MetaBit label="Resume" value={formatDurationMs(session.analyzeMs)} />
                    </>
                  ) : null}
                  {session.pdfMs != null ? (
                    <>
                      <MetaSep />
                      <MetaBit label="PDF" value={formatDurationMs(session.pdfMs)} />
                    </>
                  ) : null}
                  {session.atsLoading ? (
                    <>
                      <MetaSep />
                      <span className="text-slate-500 dark:text-slate-400">ATS checking…</span>
                    </>
                  ) : session.atsResult ? (
                    <>
                      <MetaSep />
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${atsScoreTextClass(session.atsResult.score)} bg-slate-100 dark:bg-slate-800/80`}
                      >
                        ATS {session.atsResult.score} · {formatAtsScoreLabel(session.atsResult.score)}
                      </span>
                    </>
                  ) : session.atsError ? (
                    <>
                      <MetaSep />
                      <span className="font-medium text-red-600 dark:text-red-400">ATS failed</span>
                    </>
                  ) : null}
                  {aiCostLabel ? (
                    <>
                      <MetaSep />
                      <MetaBit label="AI cost" value={aiCostLabel} />
                    </>
                  ) : null}
                </MetaLine>
              ) : null}

              <GenerationProgressBar phase={generatePhase} />
            </div>

            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <JobTypeBadges
                jobTypes={session.jobTypes}
                requiresTravel={session.requiresTravel}
              />
              <button
                type="button"
                onClick={() => onClose(session.id)}
                disabled={busy}
                className="rounded-lg p-1 text-lg leading-none text-slate-400 opacity-70 transition hover:bg-slate-100 hover:text-slate-600 hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                aria-label="Close analysis result"
              >
                ×
              </button>
            </div>
          </div>
        </div>

        {(session.generateError || session.downloadError) && (
          <div className="border-b border-red-100 bg-red-50/90 px-3 py-1.5 pl-3.5 text-xs leading-snug text-red-800 dark:border-red-900/30 dark:bg-red-950/40 dark:text-red-300">
            {session.generateError || session.downloadError}
          </div>
        )}

        <div className="flex flex-wrap gap-1.5 px-3 py-2 pl-3.5">
          <button
            type="button"
            onClick={() => onGenerateResume(session.id)}
            disabled={busy}
            className="btn-compact h-8 bg-[#007fff] px-3 text-xs font-semibold text-white shadow-sm hover:border-[#0066cc] hover:bg-[#0066cc] hover:text-white dark:hover:border-[#0066cc] dark:hover:bg-[#0066cc]"
          >
            {session.generating
              ? "Generating…"
              : session.downloading
                ? "PDF…"
                : hasResume
                  ? "Regenerate"
                  : "Generate resume"}
          </button>
          <button
            type="button"
            onClick={() => setJdOpen(true)}
            disabled={!hasJobDescription}
            className="btn-compact h-8 px-3 text-xs"
          >
            View JD
          </button>
          <button
            type="button"
            onClick={() => setAtsOpen(true)}
            disabled={!hasResume || !hasJobDescription || busy || atsBusy}
            className="btn-compact h-8 px-3 text-xs"
          >
            {atsBusy ? "ATS…" : "ATS match"}
          </button>
          <button
            type="button"
            onClick={() => onGenerateAnswers(session.id)}
            disabled={!hasResume || busy}
            className="btn-compact h-8 px-3 text-xs"
          >
            Answers
          </button>
        </div>
      </article>
    </>
  );
}
