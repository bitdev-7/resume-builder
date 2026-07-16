import { NextRequest, NextResponse } from "next/server";
import { extractJobFromPageContent } from "@/lib/extract-job-page";
import { AuthError, requireAuthClient } from "@/lib/supabase/server-client";
import { runWithAiUsageContextAsync } from "@/lib/ai-usage-context";
import { sanitizePromptOverrides } from "@/lib/prompts/prompt-overrides";

export async function POST(request: NextRequest) {
  try {
    const { userId, client } = await requireAuthClient(request);

    const { pageContent, useOpenRouter: useOpenRouterBody, promptOverrides: promptOverridesBody } =
      await request.json();
    if (!pageContent || typeof pageContent !== "string") {
      return NextResponse.json(
        { error: "Job page content is required" },
        { status: 400 }
      );
    }

    const { extracted, extractCostUsd } = await runWithAiUsageContextAsync(
      { userId, source: "job_extract", client },
      () =>
        extractJobFromPageContent(pageContent, {
          useOpenRouter: useOpenRouterBody,
          promptOverrides: sanitizePromptOverrides(promptOverridesBody),
        })
    );
    return NextResponse.json({ ...extracted, extractCostUsd });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error extracting job info:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to extract job information",
      },
      { status: 500 }
    );
  }
}
