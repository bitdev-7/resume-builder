import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createFetchWithTimeout } from "@/lib/proxy-fetch";
import { SUPABASE_FETCH_TIMEOUT_MS } from "@/lib/supabase/network";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const serverFetch = createFetchWithTimeout(SUPABASE_FETCH_TIMEOUT_MS);

/** Minimal request shape for auth (Next.js, Express adapter, etc.) */
export type AuthRequest = {
  headers: {
    get(name: string): string | null;
  };
};

export function getAccessTokenFromRequest(request: AuthRequest): string | null {
  const auth = request.headers.get("Authorization");
  if (auth?.startsWith("Bearer ")) {
    return auth.slice(7).trim() || null;
  }
  return null;
}

/** Supabase client scoped to the user's JWT (respects RLS). */
export function createServerSupabaseClient(accessToken: string): SupabaseClient {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing Supabase environment variables");
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      fetch: serverFetch,
    },
  });
}

export async function requireAuthClient(
  request: AuthRequest
): Promise<{ client: SupabaseClient; accessToken: string; userId: string }> {
  const accessToken = getAccessTokenFromRequest(request);
  if (!accessToken) {
    throw new AuthError("Missing authorization token", 401);
  }

  const client = createServerSupabaseClient(accessToken);
  const {
    data: { user },
    error,
  } = await client.auth.getUser();

  if (error || !user) {
    throw new AuthError("Invalid or expired session", 401);
  }

  return { client, accessToken, userId: user.id };
}

export class AuthError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
