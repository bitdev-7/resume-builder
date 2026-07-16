import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAuthClient } from "@/lib/supabase/server-client";
import {
  upsertSkillAddition,
  CatalogConflictError,
} from "@/lib/supabase/services/skill-catalog";

/**
 * POST /api/skill-catalog/skills
 * Body: { id?, canonicalName, aliases, version? }
 *  - No id  => insert a new custom skill (version ignored). 409 "duplicate" if canonicalName exists.
 *  - id     => update; version must match the current row. 409 "stale_version" if it changed.
 */
export async function POST(request: NextRequest) {
  try {
    const { client, userId } = await requireAuthClient(request);
    const body = await request.json();
    const canonicalName = typeof body.canonicalName === "string" ? body.canonicalName : "";
    const aliases = Array.isArray(body.aliases) ? body.aliases.filter((a: unknown) => typeof a === "string") : [];
    const id = typeof body.id === "string" ? body.id : undefined;
    const version = typeof body.version === "number" ? body.version : undefined;

    if (!canonicalName.trim()) {
      return NextResponse.json({ error: "canonicalName is required" }, { status: 400 });
    }

    const row = await upsertSkillAddition(client, {
      id,
      canonicalName,
      aliases,
      version,
      createdBy: userId,
    });
    return NextResponse.json({ skill: row });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof CatalogConflictError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
    }
    console.error("Failed to save skill addition:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save skill" },
      { status: 500 }
    );
  }
}
