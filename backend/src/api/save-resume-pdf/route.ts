import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAuthClient } from "@/lib/supabase/server-client";

export const maxDuration = 300;

/**
 * Disk saves on the server are disabled. Use /api/generate-pdf + client download.
 */
export async function POST(request: NextRequest) {
  try {
    await requireAuthClient(request);
    return NextResponse.json(
      {
        error:
          "Server disk saves are disabled. Generate the PDF on the client download path instead.",
      },
      { status: 410 }
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save PDF" },
      { status: 500 }
    );
  }
}
