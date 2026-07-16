import { describe, expect, it } from "vitest";
import { computeAiUsageStats } from "@/lib/ai-usage-stats";
import type { AiUsageLog } from "@/lib/supabase/database.types";

function log(partial: Partial<AiUsageLog> & { created_at: string }): AiUsageLog {
  return {
    id: partial.id ?? "id-" + Math.random(),
    user_id: "user-1",
    profile_id: partial.profile_id ?? null,
    source: partial.source ?? "resume_generation",
    stage: partial.stage ?? "jd-analyzer",
    provider: partial.provider ?? "openrouter",
    model: partial.model ?? "openai/gpt-4.1-mini",
    prompt_tokens: partial.prompt_tokens ?? 100,
    completion_tokens: partial.completion_tokens ?? 50,
    total_tokens: partial.total_tokens ?? 150,
    cost_usd: partial.cost_usd ?? 0.002,
    cost_source: partial.cost_source ?? "estimated",
    duration_ms: partial.duration_ms ?? 1200,
    success: partial.success ?? true,
    error: partial.error ?? null,
    created_at: partial.created_at,
  };
}

describe("computeAiUsageStats", () => {
  it("aggregates totals, buckets, and recent calls", () => {
    const stats = computeAiUsageStats([
      log({ id: "a", created_at: "2026-07-16T10:00:00Z", source: "resume_generation", stage: "jd-analyzer", cost_usd: 0.001, profile_id: "p1" }),
      log({ id: "b", created_at: "2026-07-16T11:00:00Z", source: "resume_generation", stage: "composer", cost_usd: 0.003, profile_id: "p1" }),
      log({ id: "c", created_at: "2026-07-15T09:00:00Z", source: "ats_check", stage: "ats-check", cost_usd: 0.01, success: false, error: "boom" }),
    ]);

    expect(stats.totalCalls).toBe(3);
    expect(stats.successfulCalls).toBe(2);
    expect(stats.failedCalls).toBe(1);
    expect(stats.costUsd).toBeCloseTo(0.014, 5);
    expect(stats.totalTokens).toBe(450);

    // newest first → a, b, c
    expect(stats.recent.map((r) => r.id)).toEqual(["a", "b", "c"]);

    // bySource sorted by cost desc → ats_check (0.01) > resume_generation (0.004)
    expect(stats.bySource.map((b) => b.key)).toEqual(["ats_check", "resume_generation"]);
    expect(stats.bySource[0].failedCalls).toBe(1);

    // byDay oldest first
    expect(stats.byDay.map((b) => b.key)).toEqual(["2026-07-15", "2026-07-16"]);

    // byProfile maps profile ids; "—" (no profile) holds the priciest ats call
    expect(stats.byProfile.map((b) => b.key)).toEqual(["—", "p1"]);
  });

  it("returns zeroed totals for empty input", () => {
    const stats = computeAiUsageStats([]);
    expect(stats.totalCalls).toBe(0);
    expect(stats.costUsd).toBe(0);
    expect(stats.recent).toEqual([]);
    expect(stats.bySource).toEqual([]);
  });
});

import {
  computeDailyAiUsagePoints,
  countAiUsageByField,
  filterAiUsageLogsByDateRange,
} from "@/lib/ai-usage-stats";

describe("daily / range helpers", () => {
  it("zero-fills every day in the range", () => {
    const logs = [
      log({ id: "a", created_at: "2026-07-16T10:00:00Z", cost_usd: 0.01, total_tokens: 150 }),
      log({ id: "b", created_at: "2026-07-14T10:00:00Z", cost_usd: 0.02, total_tokens: 300 }),
    ];
    const points = computeDailyAiUsagePoints(logs, "2026-07-14", "2026-07-16");
    expect(points.map((p) => p.date)).toEqual(["2026-07-14", "2026-07-15", "2026-07-16"]);
    expect(points[0].calls).toBe(1);
    expect(points[0].costUsd).toBeCloseTo(0.02, 5);
    expect(points[1].calls).toBe(0);
    expect(points[2].calls).toBe(1);
  });

  it("filters logs to the date range inclusive", () => {
    const logs = [
      log({ id: "a", created_at: "2026-07-13T10:00:00Z" }),
      log({ id: "b", created_at: "2026-07-14T10:00:00Z" }),
      log({ id: "c", created_at: "2026-07-16T10:00:00Z" }),
    ];
    const filtered = filterAiUsageLogsByDateRange(logs, "2026-07-14", "2026-07-16");
    expect(filtered.map((l) => l.id)).toEqual(["b", "c"]);
  });

  it("counts by source with display labels", () => {
    const logs = [
      log({ id: "a", created_at: "2026-07-16T10:00:00Z", source: "resume_generation" }),
      log({ id: "b", created_at: "2026-07-16T11:00:00Z", source: "resume_generation" }),
      log({ id: "c", created_at: "2026-07-16T12:00:00Z", source: "ats_check" }),
    ];
    const entries = countAiUsageByField(logs, "source");
    expect(entries).toEqual([
      { label: "Resume generation", count: 2 },
      { label: "ATS check", count: 1 },
    ]);
  });
});
