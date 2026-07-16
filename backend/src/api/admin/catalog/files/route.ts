import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AuthError } from "@/lib/supabase/server-client";
import { ForbiddenError, requireAdmin } from "@/lib/supabase/require-admin";
import { CATALOG_FILE_NAMES, readAllCatalogFilesRaw } from "@/lib/tailoring/catalog-io";

/** GET /api/admin/catalog/files — read-only JSON catalog files from disk. */
export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const raw = await readAllCatalogFilesRaw();
    return NextResponse.json({
      version: raw["catalog-version.json"],
      files: CATALOG_FILE_NAMES.map((name) => ({
        name,
        content: raw[name],
      })),
    });
  } catch (error) {
    if (error instanceof AuthError || error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("GET /api/admin/catalog/files", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "An error occurred" },
      { status: 500 }
    );
  }
}
