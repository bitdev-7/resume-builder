import { apiUrl } from "@/lib/api-config";
import type { ClearanceAnalysis } from "@/lib/clearance-warning";
import type { EnrichmentRecommendation } from "@/lib/types/tailoring";
import type { AnalysisResult } from "@/lib/types/resume";

export interface AnalysisResponse {
  resume: AnalysisResult;
  providerUsed?: string;
  modelUsed?: string;
  jobTitle?: string;
  companyName?: string;
  jobDescription?: string;
  generationCostUsd?: number;
  enrichmentRecommendations?: EnrichmentRecommendation[];
  clearance?: ClearanceAnalysis;
}

const ANALYZE_POLL_INTERVAL_MS = 2000;
const ANALYZE_POLL_DEADLINE_MS = 11 * 60 * 1000;

interface PollAnalyzeJobOptions {
  fetchImpl?: typeof fetch;
  pollIntervalMs?: number;
  deadlineMs?: number;
}

export async function pollAnalyzeJob(
  analyzeJobId: string,
  accessToken: string,
  options: PollAnalyzeJobOptions = {}
): Promise<AnalysisResponse> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const pollIntervalMs = options.pollIntervalMs ?? ANALYZE_POLL_INTERVAL_MS;
  const deadline = Date.now() + (options.deadlineMs ?? ANALYZE_POLL_DEADLINE_MS);
  const statusUrl = apiUrl(`/api/analyze/status/${encodeURIComponent(analyzeJobId)}`);

  while (true) {
    const response = await fetchImpl(statusUrl, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (response.status === 404) {
      throw new Error(
        "Generation was interrupted (job not found). The backend may have restarted — please try again."
      );
    }

    if (!response.ok && response.status !== 202) {
      let errorMessage = "Failed to check generation status";
      try {
        const errorData = await response.json();
        errorMessage =
          typeof errorData.error === "string" && errorData.error.trim()
            ? errorData.error
            : errorMessage;
      } catch {
        errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      }
      throw new Error(errorMessage);
    }

    const payload = (await response.json()) as {
      status: "running" | "completed" | "failed";
      error?: string;
      resume?: AnalysisResult;
      providerUsed?: string;
      modelUsed?: string;
      jobTitle?: string;
      companyName?: string;
      jobDescription?: string;
      generationCostUsd?: number;
      enrichmentRecommendations?: EnrichmentRecommendation[];
      clearance?: ClearanceAnalysis;
    };

    if (payload.status === "failed") {
      throw new Error(payload.error || "Resume generation failed");
    }
    if (payload.status === "completed" && payload.resume) {
      return {
        resume: payload.resume,
        providerUsed: payload.providerUsed,
        modelUsed: payload.modelUsed,
        jobTitle: payload.jobTitle,
        companyName: payload.companyName,
        jobDescription: payload.jobDescription,
        generationCostUsd: payload.generationCostUsd,
        enrichmentRecommendations: payload.enrichmentRecommendations,
        clearance: payload.clearance,
      };
    }

    if (Date.now() > deadline) {
      throw new Error("Resume generation timed out — please try again.");
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}
