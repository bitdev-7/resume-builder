import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiUsageLog, AiUsageLogInsert } from "@/lib/supabase/database.types";

async function resolveClient(client?: SupabaseClient): Promise<SupabaseClient> {
  if (client) return client;
  return (await import("@/lib/supabase")).supabase;
}

/**
 * Inserts a single AI usage row. Fire-and-forget at call sites — never throws
 * (logs to console on failure so a logging error can't break generation).
 */
export async function createAiUsageLog(
  entry: AiUsageLogInsert,
  client: SupabaseClient
): Promise<void> {
  const { error } = await client.from("ai_usage_logs").insert(entry);
  if (error) {
    console.error("[ai-usage] insert failed:", error.message);
  }
}

/**
 * Lists a user's AI usage rows, newest first. `limitRows` caps the result so
 * the client can aggregate without pulling an unbounded history.
 */
export async function listAiUsageLogs(
  userId: string,
  client?: SupabaseClient,
  limitRows = 1000
): Promise<AiUsageLog[]> {
  const supabase = await resolveClient(client);
  const { data, error } = await supabase
    .from("ai_usage_logs")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limitRows);

  if (error) throw error;
  return (data ?? []) as AiUsageLog[];
}
