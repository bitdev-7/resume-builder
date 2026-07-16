import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { fetchWithTimeout } from "@/lib/supabase/network";

/**
 * Service-role Supabase client (bypasses RLS). Used to record AI usage logs from
 * background jobs where no user JWT is available, so logging never blocks or
 * drops entries due to token expiry mid-generation.
 *
 * Optional: only created when SUPABASE_SERVICE_ROLE_KEY is set. Callers must
 * handle a `null` return by falling back to a JWT-scoped client.
 */
let adminClient: SupabaseClient | null | undefined;

export function getAdminSupabaseClient(): SupabaseClient | null {
  if (adminClient !== undefined) return adminClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !serviceRoleKey) {
    adminClient = null;
    return adminClient;
  }

  adminClient = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: fetchWithTimeout },
  });
  return adminClient;
}
