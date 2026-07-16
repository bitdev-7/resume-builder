"use client";

import { useMemo, useState } from "react";
import DailyAiUsageChart from "@/components/dashboard/DailyAiUsageChart";
import CountBarChart from "@/components/dashboard/CountBarChart";
import { formatCostUsd } from "@/lib/ai-usage";
import {
  computeAiUsageStats,
  computeDailyAiUsagePoints,
  countAiUsageByField,
  filterAiUsageLogsByDateRange,
  sumAiUsageCost,
  type AiUsageBucket,
} from "@/lib/ai-usage-stats";
import {
  formatDisplayDate,
  getMonthStartKey,
  getTodayKey,
} from "@/lib/dashboard-stats";
import type { AiUsageLog } from "@/lib/supabase/database.types";

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
                <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                  {labeler(b.key)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-700 dark:text-slate-200">
                  {b.calls}
                  {b.failedCalls > 0 ? (
                    <span className="ml-1 text-xs text-rose-500">
                      ({b.failedCalls} failed)
                    </span>
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

export default function AdminAiActivity({
  usageLogs,
  loading,
}: {
  usageLogs: AiUsageLog[];
  loading: boolean;
}) {
  const [rangeStart] = useState(getMonthStartKey);
  const [rangeEnd] = useState(getTodayKey);

  const stats = useMemo(() => computeAiUsageStats(usageLogs), [usageLogs]);
  const rangeUsageLogs = useMemo(
    () => filterAiUsageLogsByDateRange(usageLogs, rangeStart, rangeEnd),
    [usageLogs, rangeStart, rangeEnd]
  );
  const dailyUsagePoints = useMemo(
    () => computeDailyAiUsagePoints(rangeUsageLogs, rangeStart, rangeEnd),
    [rangeUsageLogs, rangeStart, rangeEnd]
  );
  const usageBySource = useMemo(
    () => countAiUsageByField(rangeUsageLogs, "source"),
    [rangeUsageLogs]
  );
  const usageByModel = useMemo(
    () => countAiUsageByField(rangeUsageLogs, "model"),
    [rangeUsageLogs]
  );
  const rangeUsageCalls = rangeUsageLogs.length;
  const rangeUsageCost = useMemo(() => sumAiUsageCost(rangeUsageLogs), [rangeUsageLogs]);
  const rangeLabel = `${formatDisplayDate(rangeStart)} – ${formatDisplayDate(rangeEnd)}`;

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
      </div>
    );
  }

  if (usageLogs.length === 0) {
    return (
      <div className="glass-panel overflow-hidden">
        <div className="page-header">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
            AI usage
          </h2>
        </div>
        <div className="p-6">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
            No AI usage recorded yet for this user.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-panel overflow-hidden">
      <div className="page-header">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
          AI usage
        </h2>
        <p className="page-subtitle">
          Every LLM call is logged with token usage and estimated cost (up to 1,000
          recent calls).
        </p>
      </div>

      <div className="space-y-6 p-6">
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

        <div className="analytics-group">
          <div className="analytics-group-header">
            <h3 className="analytics-group-title">This month</h3>
            <p className="analytics-group-subtitle">
              {rangeUsageCalls} LLM call{rangeUsageCalls === 1 ? "" : "s"} ·{" "}
              {formatCostUsd(rangeUsageCost)} · {rangeLabel}
            </p>
          </div>
          <DailyAiUsageChart compact points={dailyUsagePoints} />
          <div className="grid gap-3 md:grid-cols-2">
            <CountBarChart
              compact
              title="By feature"
              entries={usageBySource}
              emptyMessage="No AI calls in range."
              maxItems={6}
            />
            <CountBarChart
              compact
              title="By model"
              entries={usageByModel}
              emptyMessage="No AI calls in range."
              maxItems={6}
            />
          </div>
        </div>

        <BucketTable title="By feature" buckets={stats.bySource} labeler={sourceLabel} />
        <BucketTable title="By stage" buckets={stats.byStage} />
        <BucketTable title="By model" buckets={stats.byModel} />

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
                      {formatCostUsd(log.cost_usd)}
                    </td>
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                      {log.success ? "ok" : "failed"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
