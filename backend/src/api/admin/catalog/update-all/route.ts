import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { runWithAiUsageContextAsync } from "@/lib/ai-usage-context";
import { AuthError } from "@/lib/supabase/server-client";
import { ForbiddenError, requireAdmin } from "@/lib/supabase/require-admin";
import { updateAllCatalog } from "@/lib/tailoring/catalog-update-all";

/** POST /api/admin/catalog/update-all — re-research every archetype; returns pending files for Apply. */
export async function POST(request: NextRequest) {
  try {
    const { userId, adminClient } = await requireAdmin(request);
    const body = await request.json().catch(() => ({}));

    const result = await runWithAiUsageContextAsync(
      { userId, source: "catalog_update_all", client: adminClient },
      () =>
        updateAllCatalog({
          useOpenRouter: body.useOpenRouter,
        })
    );

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AuthError || error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("POST /api/admin/catalog/update-all", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "An error occurred" },
      { status: 500 }
    );
  }
}
