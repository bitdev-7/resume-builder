import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AuthError } from "@/lib/supabase/server-client";
import { ForbiddenError, requireAdmin } from "@/lib/supabase/require-admin";
import { applyCatalogFiles, applyCatalogPatch } from "@/lib/tailoring/catalog-apply";
import { catalogPatchSchema } from "@/lib/tailoring/catalog-schemas";
import { CATALOG_FILE_NAMES } from "@/lib/tailoring/catalog-io";

/** POST /api/admin/catalog/apply — apply a single proposal OR a full Update All snapshot. */
export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);
    const body = await request.json();

    if (body.files && typeof body.files === "object") {
      const files = body.files as Record<string, string>;
      for (const name of CATALOG_FILE_NAMES) {
        if (typeof files[name] !== "string") {
          return NextResponse.json(
            { error: `Missing or invalid catalog file: ${name}` },
            { status: 400 }
          );
        }
      }
      const result = await applyCatalogFiles(files);
      return NextResponse.json(result);
    }

    const parsed = catalogPatchSchema.safeParse(body.proposal);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid proposal — provide proposal or files", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const result = await applyCatalogPatch(parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AuthError || error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("POST /api/admin/catalog/apply", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "An error occurred" },
      { status: 500 }
    );
  }
}
