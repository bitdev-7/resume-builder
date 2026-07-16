import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAuthClient } from "@/lib/supabase/server-client";
import {
  deleteSkillAddition,
  CatalogConflictError,
} from "@/lib/supabase/services/skill-catalog";

/**
 * POST /api/skill-catalog/skills/delete
 * Body: { id, version }. Optimistic lock: 409 "stale_version" if version mismatches.
 */
export async function POST(request: NextRequest) {
  try {
    const { client } = await requireAuthClient(request);
    const body = await request.json();
    const id = typeof body.id === "string" ? body.id : "";
    const version = typeof body.version === "number" ? body.version : undefined;

    if (!id || typeof version !== "number") {
      return NextResponse.json({ error: "id and version are required" }, { status: 400 });
    }

    await deleteSkillAddition(client, { id, version });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof CatalogConflictError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
    }
    console.error("Failed to delete skill addition:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete skill" },
      { status: 500 }
    );
  }
}
