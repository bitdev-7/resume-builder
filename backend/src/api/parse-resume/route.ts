import { NextRequest, NextResponse } from "next/server";
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import { AuthError, requireAuthClient } from "@/lib/supabase/server-client";
import { parseResumeText } from "@/lib/resume-import";
import { sanitizePromptOverrides } from "@/lib/prompts/prompt-overrides";

/** Parsing runs one AI call after PDF text extraction; allow generous time. */
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    await requireAuthClient(request);

    const { pdfBase64, useOpenRouter: useOpenRouterBody, promptOverrides: promptOverridesBody } =
      await request.json();

    if (!pdfBase64 || typeof pdfBase64 !== "string") {
      return NextResponse.json({ error: "pdfBase64 is required" }, { status: 400 });
    }

    const buffer = Buffer.from(pdfBase64, "base64");
    if (buffer.length === 0) {
      return NextResponse.json({ error: "Invalid PDF data" }, { status: 400 });
    }

    let resumeText: string;
    try {
      const result = await pdfParse(buffer);
      resumeText = (result.text || "").trim();
    } catch (err) {
      console.error("PDF text extraction failed:", err);
      return NextResponse.json(
        { error: "Could not read this PDF. Make sure it is a valid, non-corrupted PDF file." },
        { status: 422 }
      );
    }

    if (resumeText.length < 30) {
      return NextResponse.json(
        {
          error:
            "No readable text found in this PDF. It may be a scanned image; please use a text-based resume PDF or fill the profile manually.",
        },
        { status: 422 }
      );
    }

    const { parsed, costUsd } = await parseResumeText(resumeText, {
      useOpenRouter: typeof useOpenRouterBody === "boolean" ? useOpenRouterBody : true,
      promptOverrides: sanitizePromptOverrides(promptOverridesBody),
    });

    return NextResponse.json({ profile: parsed, parseCostUsd: costUsd });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error parsing resume:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to parse resume" },
      { status: 500 }
    );
  }
}
