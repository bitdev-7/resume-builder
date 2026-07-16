"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { listAiUsageLogs } from "@/lib/supabase/services/ai-usage-logs";
import { listResumeProfiles } from "@/lib/supabase/services/resume-profiles";
import { computeAiUsageStats, type AiUsageBucket } from "@/lib/ai-usage-stats";
import { formatCostUsd } from "@/lib/ai-usage";
import type { AiUsageLog, ResumeProfile } from "@/lib/supabase/database.types";

const SOURCE_LABELS: Record<string, string> = {
  resume_generation: "Resume generation",
  ats_check: "ATS check",
  cover_letter: "Cover letter",
  answer_questions: "Interview answers",
  resume_import: "Resume import",
  job_extract: "Job extraction",
};

function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatCard({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "danger";
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900/40">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </div>
      <div
        className={
          tone === "danger"
            ? "mt-1 text-2xl font-semibold text-rose-600 dark:text-rose-400"
            : "mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-50"
        }
      >
        {value}
      </div>
      {sub ? (
        <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{sub}</div>
      ) : null}
    </div>
  );
}

function BucketTable({
  title,
  buckets,
  labeler = (k) => k,
}: {
  title: string;
  buckets: AiUsageBucket[];
  labeler?: (key: string) => string;
}) {
  if (buckets.length === 0) return null;
  return (
    <section>
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</h3>
      <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
        <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
          <thead className="bg-slate-50 dark:bg-slate-900/40">
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 text-right font-medium">Calls</th>
              <th className="px-3 py-2 text-right font-medium">Tokens</th>
              <th className="px-3 py-2 text-right font-medium">Cost</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
            {buckets.map((b) => (
              <tr key={b.key}>
                <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{labeler(b.key)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-700 dark:text-slate-200">
                  {b.calls}
                  {b.failedCalls > 0 ? (
                    <span className="ml-1 text-xs text-rose-500">({b.failedCalls} failed)</span>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-500 dark:text-slate-400">
                  {b.totalTokens.toLocaleString()}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-700 dark:text-slate-200">
                  {formatCostUsd(b.costUsd)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function StatisticsPage() {
  const { user, loading: authLoading } = useAuth();
  const [logs, setLogs] = useState<AiUsageLog[]>([]);
  const [profiles, setProfiles] = useState<ResumeProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadUsage = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const [usageRows, profileRows] = await Promise.all([
        listAiUsageLogs(user.id),
        listResumeProfiles(user.id),
      ]);
      setLogs(usageRows);
      setProfiles(profileRows);
    } catch (err) {
      console.error("Failed to load AI usage stats:", err);
      setError(
        "Failed to load AI usage. If this is a new database, run the ai_usage_logs migration (supabase/migrations/008_ai_usage_logs.sql)."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && user) {
      void loadUsage();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user]);

  const stats = useMemo(() => computeAiUsageStats(logs), [logs]);

  const profileLabeler = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of profiles) map.set(p.id, p.label);
    return (key: string) => (key === "—" ? "No profile" : map.get(key) ?? key);
  }, [profiles]);

  if (authLoading || !user) {
    return (
      <div className="flex flex-1 items-center justify-center py-20">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="glass-panel overflow-hidden">
      <div className="page-header">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
            AI usage
          </h2>
          <button
            type="button"
            onClick={() => void loadUsage()}
            disabled={loading}
            className="btn-soft"
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
        <p className="page-subtitle">
          Every LLM call is logged with its token usage and estimated cost. Totals
          and breakdowns cover up to the most recent 1,000 calls per account.
        </p>
      </div>

      <div className="space-y-6 p-6">
        {error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
          </div>
        ) : logs.length === 0 && !error ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
            No AI usage recorded yet. Generate a resume, run an ATS check, or write
            a cover letter to start populating this page.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard
                label="Total cost"
                value={formatCostUsd(stats.costUsd)}
                sub="across all calls"
              />
              <StatCard
                label="Total calls"
                value={stats.totalCalls.toLocaleString()}
                sub={`${stats.successfulCalls} succeeded`}
              />
              <StatCard
                label="Total tokens"
                value={stats.totalTokens.toLocaleString()}
                sub={`${stats.promptTokens.toLocaleString()} in / ${stats.completionTokens.toLocaleString()} out`}
              />
              <StatCard
                label="Failed calls"
                value={stats.failedCalls.toLocaleString()}
                tone={stats.failedCalls > 0 ? "danger" : "default"}
                sub={stats.failedCalls > 0 ? "retried or errored" : "all healthy"}
              />
            </div>

            <BucketTable title="By feature" buckets={stats.bySource} labeler={sourceLabel} />
            <BucketTable title="By stage" buckets={stats.byStage} />
            <BucketTable title="By model" buckets={stats.byModel} />
            <BucketTable title="By profile" buckets={stats.byProfile} labeler={profileLabeler} />

            <section>
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Recent calls
              </h3>
              <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
                  <thead className="bg-slate-50 dark:bg-slate-900/40">
                    <tr className="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      <th className="px-3 py-2 font-medium">When</th>
                      <th className="px-3 py-2 font-medium">Feature</th>
                      <th className="px-3 py-2 font-medium">Stage</th>
                      <th className="px-3 py-2 font-medium">Model</th>
                      <th className="px-3 py-2 text-right font-medium">Tokens</th>
                      <th className="px-3 py-2 text-right font-medium">Cost</th>
                      <th className="px-3 py-2 text-right font-medium">Time</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {stats.recent.map((log) => (
                      <tr key={log.id}>
                        <td className="whitespace-nowrap px-3 py-2 text-slate-500 dark:text-slate-400">
                          {formatDateTime(log.created_at)}
                        </td>
                        <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                          {sourceLabel(log.source)}
                        </td>
                        <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                          {log.stage}
                        </td>
                        <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                          {log.model}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-500 dark:text-slate-400">
                          {log.total_tokens.toLocaleString()}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-700 dark:text-slate-200">
                          {formatCostUsd(Number(log.cost_usd))}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-500 dark:text-slate-400">
                          {log.duration_ms != null ? `${log.duration_ms}ms` : "—"}
                        </td>
                        <td className="px-3 py-2">
                          {log.success ? (
                            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                              ok
                            </span>
                          ) : (
                            <span
                              className="text-xs font-medium text-rose-600 dark:text-rose-400"
                              title={log.error ?? undefined}
                            >
                              failed
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
