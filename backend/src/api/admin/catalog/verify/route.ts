import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AuthError } from "@/lib/supabase/server-client";
import { ForbiddenError, requireAdmin } from "@/lib/supabase/require-admin";
import { catalogPatchSchema } from "@/lib/tailoring/catalog-schemas";
import { verifyCatalogOnDisk, verifyCatalogProposal } from "@/lib/tailoring/catalog-verify";

/** POST /api/admin/catalog/verify — JSON syntax + schema validation (on-disk or proposal dry-run). */
export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);
    const body = await request.json().catch(() => ({}));
    const proposalRaw = body?.proposal;

    if (proposalRaw !== undefined && proposalRaw !== null) {
      const parsed = catalogPatchSchema.safeParse(proposalRaw);
      if (!parsed.success) {
        return NextResponse.json({
          valid: false,
          issues: parsed.error.issues.map((issue) => ({
            file: "proposal" as const,
            kind: "schema" as const,
            path: issue.path.join("."),
            message: issue.message,
          })),
          checkedFiles: [],
        });
      }
      const result = await verifyCatalogProposal(parsed.data);
      return NextResponse.json(result);
    }

    const result = await verifyCatalogOnDisk();
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AuthError || error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("POST /api/admin/catalog/verify", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "An error occurred" },
      { status: 500 }
    );
  }
}
