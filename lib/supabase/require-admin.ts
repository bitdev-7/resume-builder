import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  AuthError,
  requireAuthClient,
  type AuthRequest,
} from "@/lib/supabase/server-client";
import type { AppRole } from "@/lib/supabase/database.types";

export class ForbiddenError extends Error {
  status = 403;
  constructor(message = "Admin access required") {
    super(message);
  }
}

export function parseAdminActivityTab(raw: string | null): "bids" | "ai" {
  return raw === "ai" ? "ai" : "bids";
}

export async function requireAdmin(request: AuthRequest): Promise<{
  userId: string;
  email: string | null;
  accessToken: string;
  adminClient: SupabaseClient;
}> {
  const { client, userId, email, accessToken } = await requireAuthClient(request);

  const { data, error } = await client
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;

  const role = (data?.role === "admin" ? "admin" : "user") as AppRole;
  if (role !== "admin") {
    throw new ForbiddenError();
  }

  const adminClient = getAdminSupabaseClient();
  if (!adminClient) {
    throw new Error("Admin data access is not configured (missing SUPABASE_SERVICE_ROLE_KEY)");
  }

  return { userId, email, accessToken, adminClient };
}
