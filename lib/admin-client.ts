import { apiUrl } from "@/lib/api-config";
import type {
  AdminUserSummary,
  AiUsageLog,
  InterviewRecord,
  ResumeRecord,
} from "@/lib/supabase/database.types";

async function adminFetch<T>(accessToken: string, path: string): Promise<T> {
  const response = await fetch(apiUrl(path), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(
      typeof err.error === "string" && err.error.trim()
        ? err.error
        : `HTTP ${response.status}`
    );
  }
  return (await response.json()) as T;
}

export async function listAdminUsers(
  accessToken: string,
  options?: { stats?: boolean }
): Promise<AdminUserSummary[]> {
  const path = options?.stats ? "/api/admin/users?stats=1" : "/api/admin/users";
  const data = await adminFetch<{ users: AdminUserSummary[] }>(accessToken, path);
  return data.users;
}

export async function fetchAdminBidsActivity(
  accessToken: string,
  userId: string
): Promise<{ resumes: ResumeRecord[]; interviews: InterviewRecord[] }> {
  const data = await adminFetch<{
    tab: "bids";
    resumes: ResumeRecord[];
    interviews: InterviewRecord[];
  }>(accessToken, `/api/admin/users/${encodeURIComponent(userId)}/activity?tab=bids`);
  return { resumes: data.resumes, interviews: data.interviews };
}

export async function fetchAdminAiActivity(
  accessToken: string,
  userId: string
): Promise<{ usageLogs: AiUsageLog[] }> {
  const data = await adminFetch<{ tab: "ai"; usageLogs: AiUsageLog[] }>(
    accessToken,
    `/api/admin/users/${encodeURIComponent(userId)}/activity?tab=ai`
  );
  return { usageLogs: data.usageLogs };
}
