import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAuthClient } from "@/lib/supabase/server-client";
import { getAnalyzeJob } from "../job-store";

/**
 * Polling endpoint for async resume generation. POST /api/analyze returns a jobId;
 * the client polls this until status is "completed" or "failed".
 *
 * Returns 202 while running, 200 with the result when completed, 200 with an error
 * when failed, and 404 if the job is unknown (e.g. lost to a backend restart) or
 * belongs to another user — we don't leak existence across users.
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = await requireAuthClient(request);

    const pathname = new URL(request.url).pathname;
    const jobId = pathname.split("/").filter(Boolean).pop();
    if (!jobId) {
      return NextResponse.json({ error: "Missing job id" }, { status: 400 });
    }

    const job = getAnalyzeJob(jobId);
    if (!job || job.userId !== userId) {
      return NextResponse.json(
        { error: "Job not found. It may have expired or the backend was restarted." },
        { status: 404 }
      );
    }

    if (job.status === "running") {
      return NextResponse.json({ status: "running" }, { status: 202 });
    }

    if (job.status === "failed") {
      return NextResponse.json({ status: "failed", error: job.error }, { status: 200 });
    }

    // completed
    return NextResponse.json({ status: "completed", ...job.result }, { status: 200 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error fetching analyze job status:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "An error occurred" },
      { status: 500 }
    );
  }
}
