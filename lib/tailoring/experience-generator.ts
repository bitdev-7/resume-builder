import { callAI, formatAIProviderError } from "@/lib/ai-provider";
import type { AIMessage } from "@/lib/ai-provider";
import type { ResolvedAIRequest } from "@/lib/ai-api";
import {
  buildExperienceWriterSystemPrompt,
  buildExperienceWriterUserPrompt,
  type ExperienceWriterInput,
} from "@/lib/prompts/experience-writer-prompt";
import { experienceGenerationAiOutputSchema } from "@/lib/tailoring/schemas";
import { cleanJsonText } from "@/lib/analyze-json";
import type { ExperienceGenerationResult } from "@/lib/types/tailoring";
import type { PromptOverrides } from "@/lib/prompts/prompt-overrides";

export interface ExperienceGenerationCallResult {
  result: ExperienceGenerationResult;
  costUsd?: number;
}

/** Stage 7 (single experience) — never trusts model-returned identity; the requested id always wins. */
export async function generateExperience(
  input: ExperienceWriterInput,
  aiRequest: ResolvedAIRequest,
  repairNotes?: string,
  promptOverrides?: PromptOverrides
): Promise<ExperienceGenerationCallResult> {
  const userPrompt = repairNotes
    ? `${buildExperienceWriterUserPrompt(input)}\n\nPREVIOUS ATTEMPT HAD THESE PROBLEMS — fix only these, keep everything else the same:\n${repairNotes}`
    : buildExperienceWriterUserPrompt(input);

  const messages: AIMessage[] = [
    { role: "system", content: buildExperienceWriterSystemPrompt(promptOverrides) },
    { role: "user", content: userPrompt },
  ];

  let resp;
  try {
    resp = await callAI({
      useOpenRouter: aiRequest.useOpenRouter,
      model: aiRequest.model,
      ...(aiRequest.provider ? { provider: aiRequest.provider } : {}),
      messages,
      temperature: 0.6,
      max_tokens: 1536,
      tryParseJson: true,
    });
  } catch (err) {
    throw new Error(
      formatAIProviderError(err, aiRequest.model, undefined, {
        useOpenRouter: aiRequest.useOpenRouter,
        provider: aiRequest.provider,
      })
    );
  }

  const text = resp.json
    ? typeof resp.json === "string"
      ? resp.json
      : JSON.stringify(resp.json)
    : resp.text || "";

  let parsedRaw: unknown;
  try {
    parsedRaw = JSON.parse(cleanJsonText(text));
  } catch {
    throw new Error(`Experience writer for ${input.experienceId} returned invalid JSON`);
  }

  const parsed = experienceGenerationAiOutputSchema.safeParse(parsedRaw);
  if (!parsed.success) {
    throw new Error(
      `Experience writer output failed validation for ${input.experienceId}: ${parsed.error.issues
        .map((i) => i.message)
        .join("; ")}`
    );
  }

  return {
    result: {
      experienceId: input.experienceId, // never trust model-returned identity
      bullets: parsed.data.bullets,
    },
    costUsd: resp.costUsd,
  };
}

/**
 * Stage 7 (concurrent orchestration) — generates all experiences independently.
 * Uses Promise.allSettled so one failed role never corrupts the others; results
 * are re-mapped onto `inputs` (not settle order) for stable, deterministic output.
 */
export async function generateExperiencesInParallel(
  inputs: ExperienceWriterInput[],
  aiRequest: ResolvedAIRequest,
  buildFallback: (input: ExperienceWriterInput) => ExperienceGenerationResult,
  promptOverrides?: PromptOverrides
): Promise<{ results: ExperienceGenerationResult[]; costUsd: number }> {
  const settled = await Promise.allSettled(
    inputs.map((input) => generateExperience(input, aiRequest, undefined, promptOverrides))
  );

  let totalCost = 0;
  const results = inputs.map((input, i) => {
    const outcome = settled[i];
    if (outcome.status === "fulfilled") {
      totalCost += outcome.value.costUsd ?? 0;
      return outcome.value.result;
    }
    console.error(`[tailoring] Experience generation failed for ${input.experienceId}:`, outcome.reason);
    return buildFallback(input);
  });

  return { results, costUsd: totalCost };
}
