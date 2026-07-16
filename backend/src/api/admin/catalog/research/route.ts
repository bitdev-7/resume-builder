import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { runWithAiUsageContextAsync } from "@/lib/ai-usage-context";
import { AuthError } from "@/lib/supabase/server-client";
import { ForbiddenError, requireAdmin } from "@/lib/supabase/require-admin";
import {
  researchCatalogPatch,
  type CatalogSeniority,
} from "@/lib/tailoring/catalog-research";

const SENIORITIES = new Set<CatalogSeniority>(["junior", "mid", "senior", "staff"]);

/** POST /api/admin/catalog/research — LLM research for catalog patch proposal. */
export async function POST(request: NextRequest) {
  try {
    const { userId, adminClient } = await requireAdmin(request);
    const body = await request.json();
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) {
      return NextResponse.json({ error: "Job title is required" }, { status: 400 });
    }

    const seniorityRaw = typeof body.seniority === "string" ? body.seniority : undefined;
    const seniority =
      seniorityRaw && SENIORITIES.has(seniorityRaw as CatalogSeniority)
        ? (seniorityRaw as CatalogSeniority)
        : undefined;

    const result = await runWithAiUsageContextAsync(
      { userId, source: "catalog_research", client: adminClient },
      () =>
        researchCatalogPatch({
          title,
          seniority,
          useOpenRouter: body.useOpenRouter,
        })
    );

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AuthError || error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("POST /api/admin/catalog/research", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "An error occurred" },
      { status: 500 }
    );
  }
}
