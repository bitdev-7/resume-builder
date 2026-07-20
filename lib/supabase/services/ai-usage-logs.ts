import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiUsageLog, AiUsageLogInsert } from "@/lib/supabase/database.types";

async function resolveClient(client?: SupabaseClient): Promise<SupabaseClient> {
  if (client) return client;
  return (await import("@/lib/supabase")).supabase;
}

/**
 * Inserts a single AI usage row. Fire-and-forget at call sites — never throws
 * (logs to console on failure so a logging error can't break generation).
 * If the insert fails because of an invalid profile_id FK, retries once with
 * profile_id cleared so a stale client id can't silently drop the whole row.
 */
export async function createAiUsageLog(
  entry: AiUsageLogInsert,
  client: SupabaseClient
): Promise<void> {
  const { error } = await client.from("ai_usage_logs").insert(entry);
  if (!error) return;

  const isProfileFk =
    Boolean(entry.profile_id) &&
    /profile_id|foreign key|violates foreign key/i.test(error.message);

  if (isProfileFk) {
    const { profile_id: _ignored, ...withoutProfile } = entry;
    const retry = await client.from("ai_usage_logs").insert(withoutProfile);
    if (!retry.error) {
      console.warn(
        "[ai-usage] insert succeeded after dropping invalid profile_id:",
        entry.profile_id
      );
      return;
    }
    console.error("[ai-usage] insert failed (retry without profile_id):", retry.error.message);
    return;
  }

  console.error("[ai-usage] insert failed:", error.message);
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
