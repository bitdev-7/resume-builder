import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AuthError } from "@/lib/supabase/server-client";
import { ForbiddenError, requireAdmin } from "@/lib/supabase/require-admin";
import type { AdminUserSummary } from "@/lib/supabase/database.types";

export async function GET(request: NextRequest) {
  try {
    const { adminClient } = await requireAdmin(request);
    const { data, error } = await adminClient
      .from("profiles")
      .select("id, full_name, email, role")
      .order("full_name", { ascending: true, nullsFirst: false });

    if (error) throw error;

    const users: AdminUserSummary[] = (data ?? []).map((row) => ({
      id: row.id as string,
      full_name: (row.full_name as string | null) ?? null,
      email: (row.email as string | null) ?? null,
      role: row.role === "admin" ? "admin" : "user",
    }));

    return NextResponse.json({ users });
  } catch (error) {
    if (error instanceof AuthError || error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("GET /api/admin/users", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "An error occurred" },
      { status: 500 }
    );
  }
}
