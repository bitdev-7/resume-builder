import {
  parseUseOpenRouter,
  requireAIConfigured,
  resolveExtractMaxTokens,
  resolveExtractModel,
  resolveExtractProvider,
} from "@/lib/ai-api";
import { callAI, extractFirstJson, formatAIProviderError } from "@/lib/ai-provider";
import { cleanJsonText } from "@/lib/analyze-json";
import { buildJobPageExtractPrompt } from "@/lib/prompts/job-page-extract";
import type { JobWorkType } from "@/lib/prompts/job-page-extract";
import type { PromptOverrides } from "@/lib/prompts/prompt-overrides";
import { analyzeJobWorkType } from "@/lib/job-work-type";
import {
  extractPostedDateFromText,
  normalizePostedDate,
} from "@/lib/job-posted-date";

export interface ExtractedJobInfo {
  jobTitle: string;
  companyName: string;
  jobDescription: string;
  jobType: JobWorkType;
  jobTypes: JobWorkType[];
  requiresTravel: boolean;
  salary: string;
  postedDate: string;
}

const MAX_PAGE_CHARS = 48_000;

function normalizeField(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

export function parseExtractedJobJson(raw: unknown): ExtractedJobInfo {
  const data =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};

  const jobTitle = normalizeField(data.jobTitle ?? data.title ?? data.job_title);
  const companyName = normalizeField(
    data.companyName ?? data.company ?? data.company_name
  );
  const jobDescription = normalizeField(
    data.jobDescription ?? data.job_description ?? data.description ?? data.jd
  );
  const salary = normalizeField(data.salary ?? data.compensation ?? data.pay);
  const postedDate = normalizePostedDate(
    data.postedDate ??
      data.posted_date ??
      data.datePosted ??
      data.date_posted ??
      data.postingDate ??
      data.posting_date
  );

  const workTypeAnalysis = analyzeJobWorkType(
    jobDescription,
    data.jobType ?? data.job_type ?? data.workType ?? data.work_type,
    data.jobTypes ?? data.job_types ?? data.workTypes ?? data.work_types
  );

  if (!jobDescription) {
    throw new Error(
      "Could not extract a job description from the pasted content. Try pasting more of the posting."
    );
  }

  return {
    jobTitle,
    companyName,
    jobDescription,
    jobType: workTypeAnalysis.jobType,
    jobTypes: workTypeAnalysis.jobTypes,
    requiresTravel: workTypeAnalysis.requiresTravel,
    salary,
    postedDate,
  };
}

function parseExtractAiResponse(aiResp: { json: unknown; text: string }): unknown {
  if (aiResp.json) return aiResp.json;

  const fromText = extractFirstJson(aiResp.text || "");
  if (fromText) return fromText;

  try {
    return JSON.parse(cleanJsonText(aiResp.text || "{}"));
  } catch {
    const preview = aiResp.text.slice(0, 100).replace(/\s+/g, " ").trim();
    throw new Error(
      `Job extract returned plain text instead of JSON${preview ? ` ("${preview}…")` : ""}. ` +
        "Try EXTRACT_MODEL=deepseek-chat or set EXTRACT_MAX_TOKENS=4096 in backend/.env.local."
    );
  }
}

export interface ExtractJobPageResult {
  extracted: ExtractedJobInfo;
  extractCostUsd?: number;
}

export async function extractJobFromPageContent(
  pageContent: string,
  options?: { useOpenRouter?: boolean; promptOverrides?: PromptOverrides }
): Promise<ExtractJobPageResult> {
  const trimmed = pageContent.trim();
  if (!trimmed) {
    throw new Error("Job page content is required");
  }

  const useOpenRouter = parseUseOpenRouter(options?.useOpenRouter);
  const extractProvider = resolveExtractProvider(useOpenRouter);
  requireAIConfigured(useOpenRouter, extractProvider);
  const extractModel = resolveExtractModel(useOpenRouter);
  const clipped =
    trimmed.length > MAX_PAGE_CHARS
      ? `${trimmed.slice(0, MAX_PAGE_CHARS)}\n\n[truncated]`
      : trimmed;

  try {
    const aiResp = await callAI({
      useOpenRouter,
      model: extractModel,
      ...(extractProvider ? { provider: extractProvider } : {}),
      messages: [
        {
          role: "system",
          content:
            "You extract job posting fields. Respond with a single valid JSON object only — no markdown, no prose, no explanation.",
        },
        { role: "user", content: buildJobPageExtractPrompt(clipped, options?.promptOverrides) },
      ],
      temperature: 0.1,
      max_tokens: resolveExtractMaxTokens(),
      tryParseJson: true,
      stage: "job-extract",
    });

    const parsed = parseExtractAiResponse(aiResp);

    let extracted = parseExtractedJobJson(parsed);
    if (!extracted.postedDate) {
      const fromPage = extractPostedDateFromText(clipped);
      if (fromPage) {
        extracted = { ...extracted, postedDate: fromPage };
      }
    }

    return {
      extracted,
      extractCostUsd: aiResp.costUsd,
    };
  } catch (err: unknown) {
    const elapsedMs =
      err && typeof err === "object" && "elapsedMs" in err
        ? Number((err as { elapsedMs?: number }).elapsedMs)
        : undefined;
    throw new Error(
      formatAIProviderError(err, extractModel, elapsedMs, {
        useOpenRouter,
        provider: extractProvider,
      })
    );
  }
}
