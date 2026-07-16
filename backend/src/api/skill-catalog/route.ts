import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAuthClient } from "@/lib/supabase/server-client";
import {
  getEffectiveCatalog,
  ensureSkillRegistryLoaded,
} from "@/lib/tailoring/skill-registry";

/**
 * GET /api/skill-catalog
 * Returns the effective catalog: built-in defaults (read-only) + the user
 * additions currently in the registry, each row carrying its `version` for
 * optimistic concurrency on subsequent writes.
 */
export async function GET(request: NextRequest) {
  try {
    const { client } = await requireAuthClient(request);
    await ensureSkillRegistryLoaded(client);
    return NextResponse.json(getEffectiveCatalog());
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Failed to load skill catalog:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load skill catalog" },
      { status: 500 }
    );
  }
}
