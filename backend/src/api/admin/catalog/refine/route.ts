import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { runWithAiUsageContextAsync } from "@/lib/ai-usage-context";
import { AuthError } from "@/lib/supabase/server-client";
import { ForbiddenError, requireAdmin } from "@/lib/supabase/require-admin";
import { catalogPatchSchema } from "@/lib/tailoring/catalog-schemas";
import {
  refineCatalogPatch,
  type CatalogSeniority,
} from "@/lib/tailoring/catalog-research";
import type { CatalogVerifyIssue } from "@/lib/tailoring/catalog-verify";

const SENIORITIES = new Set<CatalogSeniority>(["junior", "mid", "senior", "staff"]);

function parseIssues(raw: unknown): CatalogVerifyIssue[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is CatalogVerifyIssue =>
      item &&
      typeof item === "object" &&
      typeof (item as CatalogVerifyIssue).message === "string" &&
      typeof (item as CatalogVerifyIssue).kind === "string"
  );
}

/** POST /api/admin/catalog/refine — LLM fix for a failed catalog proposal. */
export async function POST(request: NextRequest) {
  try {
    const { userId, adminClient } = await requireAdmin(request);
    const body = await request.json();

    const parsed = catalogPatchSchema.safeParse(body.proposal);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid proposal" }, { status: 400 });
    }

    const issues = parseIssues(body.issues);
    if (issues.length === 0) {
      return NextResponse.json({ error: "Validation issues are required" }, { status: 400 });
    }

    const title = typeof body.title === "string" ? body.title.trim() : undefined;
    const seniorityRaw = typeof body.seniority === "string" ? body.seniority : undefined;
    const seniority =
      seniorityRaw && SENIORITIES.has(seniorityRaw as CatalogSeniority)
        ? (seniorityRaw as CatalogSeniority)
        : undefined;

    const result = await runWithAiUsageContextAsync(
      { userId, source: "catalog_refine", client: adminClient },
      () =>
        refineCatalogPatch({
          proposal: parsed.data,
          issues,
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
    console.error("POST /api/admin/catalog/refine", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "An error occurred" },
      { status: 500 }
    );
  }
}
