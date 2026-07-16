import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AuthError } from "@/lib/supabase/server-client";
import {
  ForbiddenError,
  parseAdminActivityTab,
  requireAdmin,
} from "@/lib/supabase/require-admin";
import { listResumes } from "@/lib/supabase/services/resumes";
import { listInterviews } from "@/lib/supabase/services/interviews";
import { listAiUsageLogs } from "@/lib/supabase/services/ai-usage-logs";

function extractUserId(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  const usersIdx = parts.indexOf("users");
  if (usersIdx < 0 || !parts[usersIdx + 1] || parts[usersIdx + 2] !== "activity") {
    return null;
  }
  return parts[usersIdx + 1] ?? null;
}

export async function GET(request: NextRequest) {
  try {
    const { adminClient } = await requireAdmin(request);
    const url = new URL(request.url);
    const userId = extractUserId(url.pathname);
    if (!userId) {
      return NextResponse.json({ error: "Missing user id" }, { status: 400 });
    }

    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const tab = parseAdminActivityTab(url.searchParams.get("tab"));

    if (tab === "ai") {
      const usageLogs = await listAiUsageLogs(userId, adminClient);
      return NextResponse.json({ tab, usageLogs });
    }

    const [resumes, interviews] = await Promise.all([
      listResumes(userId, adminClient),
      listInterviews(userId, adminClient),
    ]);
    return NextResponse.json({ tab: "bids", resumes, interviews });
  } catch (error) {
    if (error instanceof AuthError || error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("GET /api/admin/users/:userId/activity", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "An error occurred" },
      { status: 500 }
    );
  }
}
