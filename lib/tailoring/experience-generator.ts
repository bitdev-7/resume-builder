import { callAI, formatAIProviderError } from "@/lib/ai-provider";
import type { AIMessage } from "@/lib/ai-provider";
import type { ResolvedAIRequest } from "@/lib/ai-api";
import {
  buildExperienceWriterSystemPrompt,
  buildExperienceWriterBatchedSystemPrompt,
  buildExperienceWriterUserPrompt,
  buildExperienceWriterBatchedUserPrompt,
  type ExperienceWriterInput,
} from "@/lib/prompts/experience-writer-prompt";
import {
  experienceGenerationAiOutputSchema,
  batchedExperienceGenerationAiOutputSchema,
} from "@/lib/tailoring/schemas";
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
      stage: "experience-writer",
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

/**
 * Stage 7 (batched) — generates bullets for ALL experiences in a single LLM call.
 * Re-maps results onto `inputs` by experienceId (never trusts settle/model order);
 * any experience the model omitted or botched falls back via `buildFallback`,
 * preserving the same graceful-degradation behavior as the parallel path.
 * `repairNotes` (optional) appends a "fix these problems" block for the repair loop.
 */
export async function generateExperiencesBatched(
  inputs: ExperienceWriterInput[],
  aiRequest: ResolvedAIRequest,
  buildFallback: (input: ExperienceWriterInput) => ExperienceGenerationResult,
  promptOverrides?: PromptOverrides,
  repairNotes?: string
): Promise<{ results: ExperienceGenerationResult[]; costUsd: number }> {
  if (inputs.length === 0) return { results: [], costUsd: 0 };

  const basePrompt = buildExperienceWriterBatchedUserPrompt(inputs);
  const userPrompt = repairNotes
    ? `${basePrompt}\n\nPREVIOUS ATTEMPT HAD THESE PROBLEMS — fix only these, keep everything else the same:\n${repairNotes}`
    : basePrompt;

  const messages: AIMessage[] = [
    { role: "system", content: buildExperienceWriterBatchedSystemPrompt(promptOverrides) },
    { role: "user", content: userPrompt },
  ];

  let costUsd = 0;
  let parsedExperiences: { experienceId: string; bullets: ExperienceGenerationResult["bullets"] }[] = [];

  try {
    const resp = await callAI({
      useOpenRouter: aiRequest.useOpenRouter,
      model: aiRequest.model,
      ...(aiRequest.provider ? { provider: aiRequest.provider } : {}),
      messages,
      temperature: 0.6,
      max_tokens: 4096,
      tryParseJson: true,
      stage: "experience-writer:batched",
    });
    costUsd = resp.costUsd ?? 0;

    const text = resp.json
      ? typeof resp.json === "string"
        ? resp.json
        : JSON.stringify(resp.json)
      : resp.text || "";

    const parsedRaw = JSON.parse(cleanJsonText(text));
    const parsed = batchedExperienceGenerationAiOutputSchema.safeParse(parsedRaw);
    if (!parsed.success) {
      throw new Error(`Batched experience writer output failed validation: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
    }
    parsedExperiences = parsed.data.experiences;
  } catch (err) {
    // Total failure (network, invalid JSON, schema violation): fall back every role
    // rather than failing the whole generation. Mirrors the parallel path's allSettled behavior.
    console.error(
      `[tailoring] Batched experience generation failed, using deterministic fallback for all ${inputs.length} roles:`,
      err
    );
    return { results: inputs.map(buildFallback), costUsd };
  }

  // Re-map onto inputs by experienceId; never trust the model's ordering or returned ids.
  const validIds = new Set(inputs.map((i) => i.experienceId));
  const resultById = new Map<string, ExperienceGenerationResult>();
  for (const exp of parsedExperiences) {
    if (!validIds.has(exp.experienceId)) continue; // model invented/renamed an id — drop it
    const reparsed = experienceGenerationAiOutputSchema.safeParse(exp);
    if (!reparsed.success) continue;
    resultById.set(exp.experienceId, {
      experienceId: exp.experienceId, // requested id always wins
      bullets: reparsed.data.bullets,
    });
  }

  const results = inputs.map((input) => {
    const result = resultById.get(input.experienceId);
    if (result && result.bullets.length > 0) return result;
    // Missing or empty role — use the deterministic fallback for this experience.
    return buildFallback(input);
  });

  return { results, costUsd };
}
