import { AsyncLocalStorage } from "node:async_hooks";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Request-scoped context carried into every `callAI` invocation so the usage
 * recorder knows which user/profile/feature a call belongs to — without
 * threading those values through every pipeline stage by hand.
 *
 * Prefer `runWithAiUsageContextAsync` and enter the store *inside* the async
 * work (especially for fire-and-forget jobs like /api/analyze). Binding only in
 * a sync wrapper around `void job()` is brittle once the HTTP handler returns.
 */
export interface AiUsageContext {
  userId: string;
  profileId?: string | null;
  /** High-level feature tag: "resume_generation" | "ats_check" | "cover_letter" | ... */
  source: string;
  /** JWT-scoped client used as a recording fallback when no service-role client is configured. */
  client?: SupabaseClient;
}

const aiUsageAls = new AsyncLocalStorage<AiUsageContext>();

export function runWithAiUsageContext<T>(ctx: AiUsageContext, fn: () => T): T {
  return aiUsageAls.run(ctx, fn);
}

export function runWithAiUsageContextAsync<T>(
  ctx: AiUsageContext,
  fn: () => Promise<T>
): Promise<T> {
  return aiUsageAls.run(ctx, fn);
}

export function getAiUsageContext(): AiUsageContext | undefined {
  return aiUsageAls.getStore();
}
