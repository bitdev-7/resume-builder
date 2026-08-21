import type { AnalysisResult } from "@/lib/types/resume";
import { pollAnalyzeJob } from "@/lib/analyze-job-client";
import { apiUrl } from "@/lib/api-config";
import type { ExtractedJobInfo } from "@/lib/extract-job-page";
import { normalizeJobUrl } from "@/lib/job-url";
import { DEFAULT_JOBSITE, type JobsiteId } from "@/lib/jobsites";
import {
  DEFAULT_OPENROUTER_MODEL,
  getModelProvider,
} from "@/lib/openrouter-shared";
import {
  renderResumePdfBase64,
  savePdfToDownloadsFolder,
} from "@/lib/pdf-download";
import type { ClientDownloadMode } from "@/lib/download-settings";
import type { PromptOverrides } from "@/lib/prompts/prompt-overrides";
import type { BidStatus } from "@/lib/supabase/database.types";
import { createResumeWithArtifacts } from "@/lib/supabase/services/resumes";

const FIXED_USE_OPENROUTER = true;
const FIXED_AI_MODEL = DEFAULT_OPENROUTER_MODEL;
const FIXED_AI_PROVIDER = getModelProvider(FIXED_AI_MODEL);

export type OneClickGenerateInput = {
  accessToken: string;
  userId: string;
  jobId: string;
  jobUrl: string;
  jobDescription: string;
  bidStatus: BidStatus;
  profileId: string;
  resumeTemplate: string;
  promptOverrides?: PromptOverrides;
  useOpenRouter: boolean;
  apiModel: string;
  showPdfPreview: boolean;
  downloadBaseDir?: string;
  headlineOverride?: string;
  jobsite?: JobsiteId;
};

export type OneClickGenerateResult = {
  savedPath: string;
  downloadMode?: ClientDownloadMode;
  previewPdfBase64?: string;
  jobTitle: string;
  companyName: string;
  resume: AnalysisResult;
};

export type OneClickExtractedContext = ExtractedJobInfo & {
  pageContent: string;
};

function emptyExtractedFallback(pageContent: string): OneClickExtractedContext {
  return {
    jobTitle: "",
    companyName: "",
    jobDescription: pageContent.trim(),
    jobType: "remote",
    jobTypes: [],
    requiresTravel: false,
    salary: "",
    postedDate: "",
    pageContent,
  };
}

export async function extractJobForOneClickGenerate(input: {
  accessToken: string;
  jobDescription: string;
  useOpenRouter: boolean;
  promptOverrides?: PromptOverrides;
  fetchImpl?: typeof fetch;
}): Promise<OneClickExtractedContext> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const pageContent = input.jobDescription.trim();
  if (!pageContent) {
    return emptyExtractedFallback(pageContent);
  }

  try {
    const response = await fetchImpl(apiUrl("/api/extract-job"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.accessToken}`,
      },
      body: JSON.stringify({
        pageContent,
        useOpenRouter: input.useOpenRouter,
        ...(input.promptOverrides ? { promptOverrides: input.promptOverrides } : {}),
      }),
    });

    if (!response.ok) {
      throw new Error("extract-job failed");
    }

    const payload = (await response.json()) as ExtractedJobInfo;
    return {
      ...payload,
      jobDescription: payload.jobDescription?.trim() || pageContent,
      pageContent,
    };
  } catch {
    return emptyExtractedFallback(pageContent);
  }
}

export async function runJobsOneClickGenerate(
  input: OneClickGenerateInput,
  options: {
    extracted?: OneClickExtractedContext;
    fetchImpl?: typeof fetch;
  } = {}
): Promise<OneClickGenerateResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const extracted =
    options.extracted ??
    (await extractJobForOneClickGenerate({
      accessToken: input.accessToken,
      jobDescription: input.jobDescription,
      useOpenRouter: input.useOpenRouter,
      promptOverrides: input.promptOverrides,
      fetchImpl,
    }));

  const jd = extracted.jobDescription.trim() || input.jobDescription.trim();
  const jobTitle = extracted.jobTitle.trim();
  const companyName = extracted.companyName.trim();
  const normalizedJobUrl = normalizeJobUrl(input.jobUrl);
  const jobsite = input.jobsite ?? DEFAULT_JOBSITE;
  const apiModel = input.apiModel || FIXED_AI_MODEL;
  const apiProvider = getModelProvider(apiModel);

  const submitResponse = await fetchImpl(apiUrl("/api/analyze"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.accessToken}`,
    },
    body: JSON.stringify({
      jd,
      jobTitle,
      companyName,
      pageContent: extracted.pageContent,
      profileId: input.profileId,
      template: input.resumeTemplate,
      ...(input.headlineOverride?.trim()
        ? { headlineOverride: input.headlineOverride.trim() }
        : {}),
      apiModel,
      apiProvider,
      useOpenRouter: input.useOpenRouter,
    }),
  });

  if (!submitResponse.ok) {
    let errorMessage = "Failed to generate resume";
    try {
      const errorData = await submitResponse.json();
      errorMessage =
        typeof errorData.error === "string" && errorData.error.trim()
          ? errorData.error
          : errorMessage;
    } catch {
      errorMessage = `HTTP ${submitResponse.status}: ${submitResponse.statusText}`;
    }
    throw new Error(errorMessage);
  }

  const { jobId: analyzeJobId } = (await submitResponse.json()) as { jobId?: string };
  if (!analyzeJobId) {
    throw new Error("Generation started but no job id was returned");
  }

  const data = await pollAnalyzeJob(analyzeJobId, input.accessToken, {
    fetchImpl,
  });
  const resume = data.resume;
  const finalJobTitle = data.jobTitle?.trim() || jobTitle;
  const finalCompanyName = data.companyName?.trim() || companyName;
  const finalJd = data.jobDescription?.trim() || jd;

  const previewPdfBase64 = await renderResumePdfBase64(
    resume,
    input.resumeTemplate,
    input.accessToken
  );

  await createResumeWithArtifacts({
    userId: input.userId,
    profileId: input.profileId || null,
    jd: finalJd,
    resume,
    aiType: data.providerUsed ?? apiProvider,
    model: data.modelUsed ?? apiModel,
    jobSite: jobsite,
    jobId: input.jobId,
    jobLink: normalizedJobUrl,
    jobTitle: finalJobTitle || null,
    jobCompany: finalCompanyName || null,
    bidStatus: input.bidStatus,
  });

  if (input.showPdfPreview) {
    return {
      savedPath: "",
      previewPdfBase64,
      jobTitle: finalJobTitle,
      companyName: finalCompanyName,
      resume,
    };
  }

  const { savedPath, mode } = await savePdfToDownloadsFolder(previewPdfBase64, {
    companyName: finalCompanyName,
    jobRole: finalJobTitle,
    personName: resume.name || "resume",
    userId: input.userId,
    downloadBasePath: input.downloadBaseDir,
  });

  return {
    savedPath,
    downloadMode: mode,
    jobTitle: finalJobTitle,
    companyName: finalCompanyName,
    resume,
  };
}

export const JOBS_ONE_CLICK_FIXED_USE_OPENROUTER = FIXED_USE_OPENROUTER;
export const JOBS_ONE_CLICK_FIXED_AI_MODEL = FIXED_AI_MODEL;
export const JOBS_ONE_CLICK_FIXED_AI_PROVIDER = FIXED_AI_PROVIDER;
