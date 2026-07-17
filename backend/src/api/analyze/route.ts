import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAIConfigured, resolveAIRequest, type ResolvedAIRequest } from "@/lib/ai-api";
import {
  DEFAULT_RESUME_TEMPLATE,
  isValidResumeTemplate,
} from "@/lib/resume-templates";
import { generateResumePdfBase64 } from "@/lib/generate-resume-pdf";
import { extractJobFromPageContent } from "@/lib/extract-job-page";
import { AuthError, requireAuthClient } from "@/lib/supabase/server-client";
import { loadResumePromptPreferences } from "@/lib/supabase/services/resume-prompt-settings";
import { loadWorkflowSettings } from "@/lib/supabase/services/workflow-settings";
import { workflowSettingsToPipelineOptions } from "@/lib/workflow-settings";
import {
  ensureDefaultResumeProfile,
  listResumeProfiles,
} from "@/lib/supabase/services/resume-profiles";
import { loadProfileBundleById } from "@/lib/supabase/load-profile-bundle";
import { profileBundleToLegacyAnalyzeProfile } from "@/lib/mappers/profile-to-resume";
import { buildResumeExtraInstructions, enforceSeniorFraming } from "@/lib/resume-prompt-settings";
import { runTailoringPipeline } from "@/lib/tailoring/pipeline";
import { ensureSkillRegistryLoaded } from "@/lib/tailoring/skill-registry";
import { sanitizePromptOverrides } from "@/lib/prompts/prompt-overrides";
import { runWithAiUsageContextAsync } from "@/lib/ai-usage-context";
import type { LegacyAnalyzeProfile } from "@/lib/mappers/profile-to-resume";
import type { ResumeProfile } from "@/lib/supabase/database.types";
import type { UpdatedResume } from "@/lib/types/resume";
import type { AnalyzeJobResult } from "./job-store";
import {
  createAnalyzeJob,
  completeAnalyzeJob,
  failAnalyzeJob,
} from "./job-store";

/** Resume + PDF generation can take several minutes. */
export const maxDuration = 300;

/**
 * The tailoring pipeline needs at least one work experience to build an
 * evidence profile from — this is the shape produced by
 * lib/mappers/profile-to-resume.ts: profileBundleToLegacyAnalyzeProfile.
 */
function hasUsableProfileData(profileData: unknown): profileData is LegacyAnalyzeProfile {
  if (!profileData || typeof profileData !== "object") return false;
  const p = profileData as LegacyAnalyzeProfile;
  return Boolean(p.company_1 || p.company_2 || p.company_3 || p.company_4 || p.company_5);
}

/**
 * Loads the resume profile server-side from Supabase (the source of truth),
 * mirroring the frontend's loadProfileForApp logic. The client now sends only
 * the profileId, not the full resume content.
 */
async function loadProfileForGeneration(
  userId: string,
  email: string | null,
  profileId: unknown,
  client: SupabaseClient
): Promise<{
  profileData: LegacyAnalyzeProfile;
  promptOverrides: ReturnType<typeof sanitizePromptOverrides>;
  resolvedProfileId: string;
}> {
  let profiles = await listResumeProfiles(userId, client);
  if (profiles.length === 0) {
    profiles = [await ensureDefaultResumeProfile(userId, client)];
  }

  const activeProfile: ResumeProfile =
    (typeof profileId === "string" ? profiles.find((p) => p.id === profileId) : undefined) ??
    profiles.find((p) => p.is_default) ??
    profiles[0];

  const bundle = await loadProfileBundleById(userId, activeProfile, client);
  return {
    profileData: profileBundleToLegacyAnalyzeProfile(bundle, email),
    promptOverrides: sanitizePromptOverrides(activeProfile.prompt_overrides),
    resolvedProfileId: activeProfile.id,
  };
}

interface GenerationJobParams {
  jobId: string;
  userId: string;
  profileId: string;
  client: SupabaseClient;
  profileData: LegacyAnalyzeProfile;
  promptOverridesBody: ReturnType<typeof sanitizePromptOverrides>;
  requestJd: string;
  pageContent: string;
  requestJobTitle: string;
  requestCompanyName: string;
  requestedTemplate: string;
  aiRequest: ResolvedAIRequest;
  promptTweak: { tone?: string; emphasis?: string } | undefined;
  headlineOverride: unknown;
}

/**
 * Runs the slow AI tailoring pipeline in the background and writes the result to the
 * in-memory job store. Never throws — failures are recorded on the job so the polling
 * client can surface them. This is what makes /api/analyze asynchronous: POST returns
 * a jobId immediately and this runs detached from the request lifecycle.
 */
async function runGenerationJob(params: GenerationJobParams): Promise<void> {
  // Bind usage context inside the async job (not a sync fire-and-forget wrap around
  // void job()). That way AsyncLocalStorage stays active for the whole pipeline even
  // after Express has already returned the 202 response.
  await runWithAiUsageContextAsync(
    {
      userId: params.userId,
      profileId: params.profileId,
      source: "resume_generation",
      client: params.client,
    },
    () => runGenerationJobWithContext(params)
  );
}

async function runGenerationJobWithContext(params: GenerationJobParams): Promise<void> {
  const {
    jobId,
    userId,
    client,
    profileData,
    promptOverridesBody,
    requestJd,
    pageContent,
    requestJobTitle,
    requestCompanyName,
    requestedTemplate,
    aiRequest,
    promptTweak,
    headlineOverride,
  } = params;

  let pipelineResume: UpdatedResume | undefined;
  try {
    let jd = requestJd.trim();
    let jobTitle = requestJobTitle.trim();
    let companyName = requestCompanyName.trim();

    if (!jd) {
      const source = pageContent.trim();
      if (!source) {
        throw new Error("Job page content or job description is required");
      }
      const extracted = await extractJobFromPageContent(source, {
        useOpenRouter: aiRequest.useOpenRouter,
      });
      jd = extracted.extracted.jobDescription;
      jobTitle = jobTitle || extracted.extracted.jobTitle;
      companyName = companyName || extracted.extracted.companyName;
    }

    if (!jd) {
      throw new Error("Could not determine job description for resume generation");
    }

    const promptPrefs = await loadResumePromptPreferences(userId, client);
    const workflowSettings = await loadWorkflowSettings(userId, client);
    const workflowOptions = workflowSettingsToPipelineOptions(workflowSettings);
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
    // Layer any user-supplied skill/archetype additions (global, from Supabase) onto
    // the built-in defaults before tailoring, so custom skills/archetypes are
    // recognized by archetype detection, skill expansion, and mention detection.
    await ensureSkillRegistryLoaded(client);
    const pipelineResult = await runTailoringPipeline({
      jd,
      profileData,
      aiRequest,
      customPromptOverride: extraInstructions || undefined,
      promptOverrides: promptOverridesBody,
      bulletBudget: workflowOptions.bulletBudget,
      hardIssuesOnly: workflowOptions.hardIssuesOnly,
      experienceMode: workflowOptions.experienceMode,
    });
    console.log(
      `Tailoring pipeline finished in ${Date.now() - pipelineStarted}ms (provider=${pipelineResult.providerUsed}, model=${pipelineResult.modelUsed}, cost=$${pipelineResult.generationCostUsd.toFixed(4)}, archetype=${pipelineResult.roleArchetype.primaryRoleArchetype}, mode=${workflowSettings.mode})`
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

    const result: AnalyzeJobResult = {
      resume: pipelineResume,
      providerUsed: pipelineResult.providerUsed,
      modelUsed: pipelineResult.modelUsed,
      jobTitle,
      companyName,
      jobDescription: jd,
      generationCostUsd: pipelineResult.generationCostUsd,
      normalizedJobTitle: pipelineResult.jobTitle,
      roleArchetype: pipelineResult.roleArchetype,
      enrichmentRecommendations: pipelineResult.enrichmentRecommendations,
      clearance: pipelineResult.clearance,
      ...(pipelineResult.remainingValidationIssues.length > 0
        ? { validationIssues: pipelineResult.remainingValidationIssues }
        : {}),
      ...(pdfBase64 && { pdfBase64 }),
      ...(pdfError && { pdfError }),
    };
    completeAnalyzeJob(jobId, result);
  } catch (error) {
    console.error("Error in generation job:", error);
    // If the pipeline produced a resume before a later step failed, still return it.
    if (typeof pipelineResume !== "undefined") {
      console.warn("Completing job with resume despite error:", error);
      completeAnalyzeJob(jobId, {
        resume: pipelineResume,
        providerUsed: "",
        modelUsed: "",
        jobTitle: requestJobTitle.trim(),
        companyName: requestCompanyName.trim(),
        jobDescription: requestJd.trim(),
        generationCostUsd: 0,
        normalizedJobTitle: "",
        roleArchetype: { primaryRoleArchetype: "unknown", secondaryRoleArchetypes: [], confidence: 0 },
        enrichmentRecommendations: [],
        clearance: {
          clearanceRequired: false,
          clearanceType: null,
          clearanceStatus: null,
          clearanceRequirementText: null,
        },
        pdfError: error instanceof Error ? error.message : "An error occurred",
      });
      return;
    }
    failAnalyzeJob(
      jobId,
      error instanceof Error ? error.message : "An error occurred while generating the resume"
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId, client, email } = await requireAuthClient(request);

    const {
      jd: requestJd,
      pageContent,
      jobTitle: requestJobTitle,
      companyName: requestCompanyName,
      profileId,
      template: requestedTemplate,
      apiModel,
      apiProvider,
      useOpenRouter: useOpenRouterBody,
      promptTweak,
      headlineOverride,
    } = await request.json();

    // Fast (non-AI) validation up front so input errors return immediately rather
    // than surfacing as a failed job after polling.
    const hasInput =
      (typeof requestJd === "string" && requestJd.trim()) ||
      (typeof pageContent === "string" && pageContent.trim());
    if (!hasInput) {
      return NextResponse.json(
        { error: "Job page content or job description is required" },
        { status: 400 }
      );
    }

    const aiRequest = resolveAIRequest({
      useOpenRouter: useOpenRouterBody,
      apiModel,
      apiProvider,
    });
    requireAIConfigured(aiRequest.useOpenRouter, aiRequest.provider);

    // Profile content is loaded server-side from Supabase (the source of truth)
    // using the profileId — the client no longer sends the full resume content.
    const {
      profileData,
      promptOverrides: promptOverridesBody,
      resolvedProfileId,
    } = await loadProfileForGeneration(userId, email, profileId, client);

    if (!hasUsableProfileData(profileData)) {
      return NextResponse.json(
        {
          error:
            "Profile data with at least one work experience is required. Add a company under Profile first.",
        },
        { status: 400 }
      );
    }

    // Kick off the slow AI pipeline in the background and return a jobId immediately.
    // The client polls GET /api/analyze/status/:jobId until it completes.
    // Usage context is bound inside runGenerationJob so logging survives the 202 return.
    const job = createAnalyzeJob(userId);
    void runGenerationJob({
      jobId: job.id,
      userId,
      profileId: resolvedProfileId,
      client,
      profileData,
      promptOverridesBody,
      requestJd: typeof requestJd === "string" ? requestJd : "",
      pageContent: typeof pageContent === "string" ? pageContent : "",
      requestJobTitle: typeof requestJobTitle === "string" ? requestJobTitle : "",
      requestCompanyName: typeof requestCompanyName === "string" ? requestCompanyName : "",
      requestedTemplate: typeof requestedTemplate === "string" ? requestedTemplate : "",
      aiRequest,
      promptTweak,
      headlineOverride,
    });

    return NextResponse.json({ jobId: job.id }, { status: 202 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error starting analyze job:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "An error occurred while starting resume generation",
      },
      {
        status:
          error instanceof Error && /timed out|timeout/i.test(error.message) ? 504 : 500,
      }
    );
  }
}
