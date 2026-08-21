import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAuthClient } from "@/lib/supabase/server-client";

/**
 * Disk saves on the server are disabled — resumes download on the client only.
 */
export async function POST(request: NextRequest) {
  try {
    await requireAuthClient(request);
    return NextResponse.json(
      {
        error:
          "Server disk saves are disabled. Resumes download on the client only (Settings → download folder).",
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
