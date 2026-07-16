import { createHash } from "node:crypto";
import type { JdAnalyzerResult } from "@/lib/tailoring/jd-analyzer";

/**
 * In-process LRU cache for JD analysis (Stage 1). Keyed by a hash of the raw JD
 * text plus the analyzer system prompt, so re-generating a resume against the same
 * job description (with the same analyzer guidance) skips the Stage 1 LLM call.
 *
 * Lost on backend restart — acceptable, and matches the in-process job-store pattern.
 * Capped with simple oldest-insertion eviction.
 */
const MAX_ENTRIES = 32;
const cache = new Map<string, JdAnalyzerResult>();

/** Build a stable cache key from the JD text and the analyzer system prompt. */
export function buildJdAnalysisCacheKey(jd: string, analyzerSystemPrompt: string): string {
  const hash = createHash("sha256");
  hash.update(jd);
  hash.update("\u0000");
  hash.update(analyzerSystemPrompt);
  return hash.digest("hex");
}

export function getCachedJdAnalysis(key: string): JdAnalyzerResult | undefined {
  const hit = cache.get(key);
  if (hit === undefined) return undefined;
  // Refresh insertion order so the LRU eviction keeps recently-used entries.
  cache.delete(key);
  cache.set(key, hit);
  return hit;
}

export function setCachedJdAnalysis(key: string, result: JdAnalyzerResult): void {
  if (cache.size >= MAX_ENTRIES) {
    // evict oldest insertion
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }
  cache.set(key, result);
}

/** Test-only helper. */
export function clearJdAnalysisCache(): void {
  cache.clear();
}
