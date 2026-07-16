import type { AiUsageLog } from "@/lib/supabase/database.types";
import {
  enumerateDateKeys,
  getLocalDateKey,
  type CountEntry,
} from "@/lib/dashboard-stats";

export interface AiUsageBucket {
  key: string;
  calls: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  failedCalls: number;
}

export interface AiUsageStats {
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  bySource: AiUsageBucket[];
  byStage: AiUsageBucket[];
  byModel: AiUsageBucket[];
  byProfile: AiUsageBucket[];
  /** ISO date (YYYY-MM-DD) -> bucket, oldest first. */
  byDay: AiUsageBucket[];
  recent: AiUsageLog[];
}

function emptyBucket(key: string): AiUsageBucket {
  return {
    key,
    calls: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    costUsd: 0,
    failedCalls: 0,
  };
}

function accumulate(bucket: AiUsageBucket, log: AiUsageLog): void {
  bucket.calls += 1;
  bucket.promptTokens += log.prompt_tokens || 0;
  bucket.completionTokens += log.completion_tokens || 0;
  bucket.totalTokens += log.total_tokens || 0;
  bucket.costUsd += Number(log.cost_usd) || 0;
  if (!log.success) bucket.failedCalls += 1;
}

function sortByCostDesc(buckets: AiUsageBucket[]): AiUsageBucket[] {
  return [...buckets].sort((a, b) => b.costUsd - a.costUsd || b.calls - a.calls);
}

function toDayKey(createdAt: string): string {
  // createdAt is an ISO timestamptz from Postgres; slice the date portion.
  return createdAt.slice(0, 10);
}

/**
 * Aggregates a user's raw AI usage rows into the shape the Statistics UI renders.
 * Pure function — no Supabase calls — so it can run in the browser.
 */
export function computeAiUsageStats(logs: AiUsageLog[]): AiUsageStats {
  const bySourceMap = new Map<string, AiUsageBucket>();
  const byStageMap = new Map<string, AiUsageBucket>();
  const byModelMap = new Map<string, AiUsageBucket>();
  const byProfileMap = new Map<string, AiUsageBucket>();
  const byDayMap = new Map<string, AiUsageBucket>();

  let totalCalls = 0;
  let successfulCalls = 0;
  let failedCalls = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  let costUsd = 0;

  for (const log of logs) {
    totalCalls += 1;
    promptTokens += log.prompt_tokens || 0;
    completionTokens += log.completion_tokens || 0;
    totalTokens += log.total_tokens || 0;
    costUsd += Number(log.cost_usd) || 0;
    if (log.success) successfulCalls += 1;
    else failedCalls += 1;

    const sourceBucket = bySourceMap.get(log.source) ?? emptyBucket(log.source);
    accumulate(sourceBucket, log);
    bySourceMap.set(log.source, sourceBucket);

    const stageBucket = byStageMap.get(log.stage) ?? emptyBucket(log.stage);
    accumulate(stageBucket, log);
    byStageMap.set(log.stage, stageBucket);

    const modelBucket = byModelMap.get(log.model) ?? emptyBucket(log.model);
    accumulate(modelBucket, log);
    byModelMap.set(log.model, modelBucket);

    const profileKey = log.profile_id ?? "—";
    const profileBucket = byProfileMap.get(profileKey) ?? emptyBucket(profileKey);
    accumulate(profileBucket, log);
    byProfileMap.set(profileKey, profileBucket);

    const dayKey = toDayKey(log.created_at);
    const dayBucket = byDayMap.get(dayKey) ?? emptyBucket(dayKey);
    accumulate(dayBucket, log);
    byDayMap.set(dayKey, dayBucket);
  }

  const byDay = [...byDayMap.entries()]
    .map(([key, bucket]) => ({ ...bucket, key }))
    .sort((a, b) => (a.key < b.key ? -1 : 1));

  return {
    totalCalls,
    successfulCalls,
    failedCalls,
    promptTokens,
    completionTokens,
    totalTokens,
    costUsd,
    bySource: sortByCostDesc([...bySourceMap.values()]),
    byStage: sortByCostDesc([...byStageMap.values()]),
    byModel: sortByCostDesc([...byModelMap.values()]),
    byProfile: sortByCostDesc([...byProfileMap.values()]),
    byDay,
    recent: logs.slice(0, 25),
  };
}

export interface DailyAiUsagePoint {
  date: string;
  calls: number;
  costUsd: number;
  totalTokens: number;
}

const SOURCE_DISPLAY_LABELS: Record<string, string> = {
  resume_generation: "Resume generation",
  ats_check: "ATS check",
  cover_letter: "Cover letter",
  answer_questions: "Interview answers",
  resume_import: "Resume import",
  job_extract: "Job extraction",
};

/** Human-friendly label for a usage source code (falls back to the raw code). */
export function aiUsageSourceLabel(source: string): string {
  return SOURCE_DISPLAY_LABELS[source] ?? source;
}

/** Filters usage rows to a [from, to] local-date range (inclusive). */
export function filterAiUsageLogsByDateRange(
  logs: AiUsageLog[],
  from: string,
  to: string
): AiUsageLog[] {
  if (!from || !to) return logs;
  return logs.filter((log) => {
    const key = getLocalDateKey(log.created_at);
    return key >= from && key <= to;
  });
}

/**
 * One point per day in [from, to] (zero-filled), mirroring
 * `computeDailyBidCounts` so the dashboard's daily AI usage chart aligns with
 * the bid chart's date axis.
 */
export function computeDailyAiUsagePoints(
  logs: AiUsageLog[],
  from: string,
  to: string
): DailyAiUsagePoint[] {
  const dates = enumerateDateKeys(from, to);
  const byDate = new Map<string, DailyAiUsagePoint>(
    dates.map((date) => [date, { date, calls: 0, costUsd: 0, totalTokens: 0 }])
  );

  for (const log of logs) {
    const key = getLocalDateKey(log.created_at);
    const point = byDate.get(key);
    if (!point) continue;
    point.calls += 1;
    point.costUsd += Number(log.cost_usd) || 0;
    point.totalTokens += log.total_tokens || 0;
  }

  return dates.map((date) => byDate.get(date)!);
}

/** Counts usage rows by a field, returning CountEntry[] for CountBarChart. */
export function countAiUsageByField(
  logs: AiUsageLog[],
  field: "source" | "model",
  fallback = "Unknown"
): CountEntry[] {
  const map = new Map<string, number>();
  for (const log of logs) {
    const raw = field === "source" ? log.source : log.model;
    const key =
      field === "source" ? aiUsageSourceLabel(raw?.trim() || fallback) : raw?.trim() || fallback;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function sumAiUsageCost(logs: AiUsageLog[]): number {
  return logs.reduce((sum, log) => sum + (Number(log.cost_usd) || 0), 0);
}
