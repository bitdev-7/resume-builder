import { callAI, formatAIProviderError } from "@/lib/ai-provider";
import type { AIMessage } from "@/lib/ai-provider";
import type { ResolvedAIRequest } from "@/lib/ai-api";
import {
  buildJdAnalyzerUserPrompt,
  buildJdAnalyzerSystemPrompt,
} from "@/lib/prompts/jd-analyzer-prompt";
import type { PromptOverrides } from "@/lib/prompts/prompt-overrides";
import { jdAnalysisAiOutputSchema } from "@/lib/tailoring/schemas";
import type { JDAnalysis, JDRequirement, RequirementType } from "@/lib/types/tailoring";
import { cleanJsonText } from "@/lib/analyze-json";
import {
  buildJdAnalysisCacheKey,
  getCachedJdAnalysis,
  setCachedJdAnalysis,
} from "@/lib/tailoring/jd-analysis-cache";

const BASE_PRIORITY_BY_TYPE: Record<RequirementType, number> = {
  must_have: 10,
  preferred: 6,
  optional: 3,
  contextual: 1,
};

/** Explicit and repeated requirements score higher; count case-insensitive occurrences of the term/text in the raw JD. */
function computePriority(jd: string, type: RequirementType, term: string | null, text: string): number {
  const base = BASE_PRIORITY_BY_TYPE[type];
  const needle = (term || text).trim();
  if (!needle) return base;

  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = jd.match(new RegExp(escaped, "gi"));
  const occurrences = matches ? matches.length : 0;
  const repeatBoost = Math.min(3, Math.max(0, occurrences - 1));
  return base + repeatBoost;
}

export interface JdAnalyzerResult {
  analysis: JDAnalysis;
  costUsd?: number;
  providerUsed: string;
  modelUsed: string;
}

/** Stage 1 — parses a raw JD into structured requirements. Makes no resume-content decisions. */
export async function analyzeJobDescription(
  jd: string,
  aiRequest: ResolvedAIRequest,
  promptOverrides?: PromptOverrides
): Promise<JdAnalyzerResult> {
  const systemPrompt = buildJdAnalyzerSystemPrompt(promptOverrides);

  // In-process cache: re-generating against the same JD (+ same analyzer guidance) skips the LLM call.
  const cacheKey = buildJdAnalysisCacheKey(jd, systemPrompt);
  const cached = getCachedJdAnalysis(cacheKey);
  if (cached) {
    console.log("[tailoring] JD analysis cache hit — skipping Stage 1 LLM call");
    return cached;
  }

  const messages: AIMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: buildJdAnalyzerUserPrompt(jd) },
  ];

  let text: string;
  let costUsd: number | undefined;
  let providerUsed: string;
  let modelUsed: string;
  try {
    const resp = await callAI({
      useOpenRouter: aiRequest.useOpenRouter,
      model: aiRequest.model,
      ...(aiRequest.provider ? { provider: aiRequest.provider } : {}),
      messages,
      temperature: 0.1,
      max_tokens: 2048,
      tryParseJson: true,
      stage: "jd-analyzer",
    });
    costUsd = resp.costUsd;
    providerUsed = resp.providerUsed;
    modelUsed = resp.modelUsed;
    text = resp.json
      ? typeof resp.json === "string"
        ? resp.json
        : JSON.stringify(resp.json)
      : resp.text || "";
  } catch (err) {
    throw new Error(
      formatAIProviderError(err, aiRequest.model, undefined, {
        useOpenRouter: aiRequest.useOpenRouter,
        provider: aiRequest.provider,
      })
    );
  }

  let parsedRaw: unknown;
  try {
    parsedRaw = JSON.parse(cleanJsonText(text));
  } catch {
    throw new Error("JD Analyzer returned invalid JSON. Try again or switch to a different AI model.");
  }

  const parsed = jdAnalysisAiOutputSchema.safeParse(parsedRaw);
  if (!parsed.success) {
    throw new Error(
      `JD Analyzer output failed validation: ${parsed.error.issues.map((i) => i.message).join("; ")}`
    );
  }

  const requirements: JDRequirement[] = parsed.data.requirements.map((r, index) => ({
    id: `req_${index + 1}`,
    text: r.text,
    type: r.type,
    category: r.category,
    canonicalTerm: r.canonicalTerm ?? null,
    priority: computePriority(jd, r.type, r.canonicalTerm ?? null, r.text),
  }));

  const analysis: JDAnalysis = {
    normalizedTitle: parsed.data.normalizedTitle,
    seniority: parsed.data.seniority,
    roleFamily: parsed.data.roleFamily,
    domains: parsed.data.domains,
    requirements,
    responsibilityThemes: parsed.data.responsibilityThemes,
    atsTerms: parsed.data.atsTerms,
    clearanceRequired: parsed.data.clearanceRequired,
    clearanceType: parsed.data.clearanceType ?? null,
    clearanceStatus: parsed.data.clearanceStatus ?? null,
    clearanceRequirementText: parsed.data.clearanceRequirementText ?? null,
    rawText: jd,
  };

  const result: JdAnalyzerResult = { analysis, costUsd, providerUsed, modelUsed };
  setCachedJdAnalysis(cacheKey, result);
  return result;
}
