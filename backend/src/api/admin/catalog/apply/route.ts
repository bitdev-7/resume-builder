import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AuthError } from "@/lib/supabase/server-client";
import { ForbiddenError, requireAdmin } from "@/lib/supabase/require-admin";
import { applyCatalogPatch } from "@/lib/tailoring/catalog-apply";
import { catalogPatchSchema } from "@/lib/tailoring/catalog-schemas";

/** POST /api/admin/catalog/apply — merge proposal into on-disk catalog JSON. */
export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);
    const body = await request.json();
    const parsed = catalogPatchSchema.safeParse(body.proposal);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid proposal", details: parsed.error.flatten() },
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
