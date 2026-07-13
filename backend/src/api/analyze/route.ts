import { NextRequest, NextResponse } from "next/server";
import { requireAIConfigured, resolveAIRequest } from "@/lib/ai-api";
import {
  DEFAULT_RESUME_TEMPLATE,
  isValidResumeTemplate,
} from "@/lib/resume-templates";
import { generateResumePdfBase64 } from "@/lib/generate-resume-pdf";
import { extractJobFromPageContent } from "@/lib/extract-job-page";
import { AuthError, requireAuthClient } from "@/lib/supabase/server-client";
import { loadResumePromptPreferences } from "@/lib/supabase/services/resume-prompt-settings";
import { buildResumeExtraInstructions, enforceSeniorFraming } from "@/lib/resume-prompt-settings";
import { runTailoringPipeline } from "@/lib/tailoring/pipeline";
import { sanitizePromptOverrides } from "@/lib/prompts/prompt-overrides";
import type { LegacyAnalyzeProfile } from "@/lib/mappers/profile-to-resume";
import type { UpdatedResume } from "@/lib/types/resume";

/** Resume + PDF generation can take several minutes. */
export const maxDuration = 300;

/**
 * The tailoring pipeline needs at least one work experience to build an
 * evidence profile from — this is the shape the frontend always sends
 * (lib/mappers/profile-to-resume.ts: profileBundleToLegacyAnalyzeProfile).
 */
function hasUsableProfileData(profileData: unknown): profileData is LegacyAnalyzeProfile {
  if (!profileData || typeof profileData !== "object") return false;
  const p = profileData as LegacyAnalyzeProfile;
  return Boolean(p.company_1 || p.company_2 || p.company_3 || p.company_4 || p.company_5);
}

export async function POST(request: NextRequest) {
  let pipelineResume: UpdatedResume | undefined;

  try {
    const { userId, client } = await requireAuthClient(request);

    const {
      jd: requestJd,
      pageContent,
      jobTitle: requestJobTitle,
      companyName: requestCompanyName,
      profileData,
      template: requestedTemplate,
      apiModel,
      apiProvider,
      useOpenRouter: useOpenRouterBody,
      promptTweak,
      headlineOverride,
      promptOverrides: promptOverridesBody,
    } = await request.json();

    if (!hasUsableProfileData(profileData)) {
      return NextResponse.json(
        {
          error:
            "Profile data with at least one work experience is required. Add a company under Profile first.",
        },
        { status: 400 }
      );
    }

    const aiRequest = resolveAIRequest({
      useOpenRouter: useOpenRouterBody,
      apiModel,
      apiProvider,
    });
    requireAIConfigured(aiRequest.useOpenRouter, aiRequest.provider);

    let jd = typeof requestJd === "string" ? requestJd.trim() : "";
    let jobTitle = typeof requestJobTitle === "string" ? requestJobTitle.trim() : "";
    let companyName = typeof requestCompanyName === "string" ? requestCompanyName.trim() : "";

    if (!jd) {
      const source = typeof pageContent === "string" && pageContent.trim() ? pageContent : "";
      if (!source) {
        return NextResponse.json(
          { error: "Job page content or job description is required" },
          { status: 400 }
        );
      }
      const extracted = await extractJobFromPageContent(source, {
        useOpenRouter: aiRequest.useOpenRouter,
      });
      jd = extracted.extracted.jobDescription;
      jobTitle = jobTitle || extracted.extracted.jobTitle;
      companyName = companyName || extracted.extracted.companyName;
    }

    if (!jd) {
      return NextResponse.json(
        { error: "Could not determine job description for resume generation" },
        { status: 400 }
      );
    }

    const promptPrefs = await loadResumePromptPreferences(userId, client);
    // Per-generation tone/emphasis tweak from the preview's Regenerate panel,
    // layered on top of the saved preferences (does not persist).
    const tweakTone =
      promptTweak?.tone === "concise" || promptTweak?.tone === "balanced" || promptTweak?.tone === "detailed"
        ? promptTweak.tone
        : promptPrefs.tone;
    const tweakEmphasis = typeof promptTweak?.emphasis === "string" ? promptTweak.emphasis.trim() : "";
    const extraInstructions = buildResumeExtraInstructions({
      ...promptPrefs,
      tone: tweakTone,
      additionalInstructions: [promptPrefs.additionalInstructions, tweakEmphasis]
        .filter(Boolean)
        .join("\n"),
    });

    const pipelineStarted = Date.now();
    const pipelineResult = await runTailoringPipeline({
      jd,
      profileData,
      aiRequest,
      customPromptOverride: extraInstructions || undefined,
      promptOverrides: sanitizePromptOverrides(promptOverridesBody),
    });
    console.log(
      `Tailoring pipeline finished in ${Date.now() - pipelineStarted}ms (provider=${pipelineResult.providerUsed}, model=${pipelineResult.modelUsed}, cost=$${pipelineResult.generationCostUsd.toFixed(4)}, archetype=${pipelineResult.roleArchetype.primaryRoleArchetype})`
    );

    pipelineResume = pipelineResult.resume;

    // Backstop: with senior framing active, guarantee no junior/mid-level labels
    // survive in the generated summary even if the model slips.
    if (promptPrefs.seniority === "senior" && pipelineResume.summary) {
      pipelineResume.summary = enforceSeniorFraming(pipelineResume.summary);
    }

    // Per-generation headline/title override from the Generator's Title field.
    // Identity is deterministic (never AI-generated), so overriding it post-pipeline
    // is safe and does not affect evidence grounding.
    const titleOverride =
      typeof headlineOverride === "string" ? headlineOverride.trim() : "";
    if (titleOverride) {
      pipelineResume.headline = titleOverride;
    }

    const template = isValidResumeTemplate(requestedTemplate || "")
      ? requestedTemplate
      : DEFAULT_RESUME_TEMPLATE;

    // PDF is slow (Puppeteer cold start). Skip here by default; client generates in background.
    const generatePdfInline = process.env.ANALYZE_GENERATE_PDF === "true";

    let pdfBase64: string | undefined;
    let pdfError: string | undefined;
    if (generatePdfInline) {
      try {
        pdfBase64 =
          (await generateResumePdfBase64(pipelineResume as Record<string, unknown>, template)) ??
          undefined;
      } catch (pdfErr: unknown) {
        console.error("PDF generation failed after resume generation:", pdfErr);
        pdfError =
          pdfErr instanceof Error
            ? pdfErr.message
            : "PDF generation failed. Ensure Puppeteer/Chromium is installed (e.g. npm install puppeteer).";
      }
    }

    return NextResponse.json({
      resume: pipelineResume,
      providerUsed: pipelineResult.providerUsed,
      modelUsed: pipelineResult.modelUsed,
      jobTitle,
      companyName,
      jobDescription: jd,
      generationCostUsd: pipelineResult.generationCostUsd,
      // Additive fields — existing UI ignores unknown response keys.
      normalizedJobTitle: pipelineResult.jobTitle,
      roleArchetype: pipelineResult.roleArchetype,
      enrichmentRecommendations: pipelineResult.enrichmentRecommendations,
      ...(pipelineResult.remainingValidationIssues.length > 0
        ? { validationIssues: pipelineResult.remainingValidationIssues }
        : {}),
      ...(pdfBase64 && { pdfBase64 }),
      ...(pdfError && { pdfError }),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error analyzing resume:", error);
    // If the pipeline already produced a resume before a later step failed, still return it.
    if (typeof pipelineResume !== "undefined") {
      console.warn("Returning resume despite error:", error);
      return NextResponse.json({
        resume: pipelineResume,
        pdfError: error instanceof Error ? error.message : "An error occurred",
      });
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "An error occurred while analyzing the resume",
      },
      {
        status:
          error instanceof Error && /timed out|timeout/i.test(error.message) ? 504 : 500,
      }
    );
  }
}
