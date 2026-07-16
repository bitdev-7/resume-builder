import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAuthClient } from "@/lib/supabase/server-client";
import {
  upsertArchetypeAddition,
  CatalogConflictError,
} from "@/lib/supabase/services/skill-catalog";

/**
 * POST /api/skill-catalog/archetypes
 * Body: { id, label, titleKeywords, core, ecosystem, marketRelevant, skillCategoryHints, version? }
 *  - No version => insert. 409 "duplicate" if id exists; 409 "reserved_id" if id shadows a built-in.
 *  - version    => update; version must match. 409 "stale_version" if it changed.
 */
function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
}

function asEcosystem(v: unknown): Record<string, string[]> {
  if (!v || typeof v !== "object") return {};
  const out: Record<string, string[]> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (Array.isArray(val)) out[k] = val.filter((x) => typeof x === "string");
  }
  return out;
}

export async function POST(request: NextRequest) {
  try {
    const { client, userId } = await requireAuthClient(request);
    const body = await request.json();

    const id = typeof body.id === "string" ? body.id : "";
    const label = typeof body.label === "string" ? body.label : "";
    if (!id.trim() || !label.trim()) {
      return NextResponse.json({ error: "id and label are required" }, { status: 400 });
    }

    const version = typeof body.version === "number" ? body.version : undefined;

    const row = await upsertArchetypeAddition(client, {
      id,
      label,
      titleKeywords: asStringArray(body.titleKeywords),
      core: asStringArray(body.core),
      ecosystem: asEcosystem(body.ecosystem),
      marketRelevant: asStringArray(body.marketRelevant),
      skillCategoryHints: asStringArray(body.skillCategoryHints),
      version,
      createdBy: userId,
    });
    return NextResponse.json({ archetype: row });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof CatalogConflictError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
    }
    console.error("Failed to save archetype addition:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save archetype" },
      { status: 500 }
    );
  }
}
