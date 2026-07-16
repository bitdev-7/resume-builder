import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAuthClient } from "@/lib/supabase/server-client";
import {
  deleteArchetypeAddition,
  CatalogConflictError,
} from "@/lib/supabase/services/skill-catalog";

/**
 * POST /api/skill-catalog/archetypes/delete
 * Body: { id, version }. 409 "stale_version" on mismatch; 409 "reserved_id" if id is built-in.
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

    await deleteArchetypeAddition(client, { id, version });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof CatalogConflictError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
    }
    console.error("Failed to delete archetype addition:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete archetype" },
      { status: 500 }
    );
  }
}
