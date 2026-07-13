import { describe, expect, it, vi } from "vitest";
import type { ResolvedAIRequest } from "@/lib/ai-api";
import type { ExperienceWriterInput } from "@/lib/prompts/experience-writer-prompt";

const callAIMock = vi.fn();

vi.mock("@/lib/ai-provider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai-provider")>();
  return { ...actual, callAI: callAIMock };
});

// Import after mocking so the module under test picks up the mocked callAI.
const { generateExperiencesInParallel } = await import("@/lib/tailoring/experience-generator");

const aiRequest: ResolvedAIRequest = { useOpenRouter: true, model: "openai/gpt-4.1-mini" };

function writerInput(experienceId: string): ExperienceWriterInput {
  return {
    experienceId,
    title: "Backend Engineer",
    company: "Acme",
    startDate: "01/2022",
    endDate: "Present",
    allowedEvidence: [{ id: `fact_${experienceId}`, text: "Built authentication APIs", factType: "responsibility", confidence: "imported" }],
    allowedSkills: ["Python"],
    targetSkills: [],
    priorityRequirements: [],
    targetBulletCount: 2,
  };
}

function buildFallback(input: ExperienceWriterInput) {
  return { experienceId: input.experienceId, bullets: [{ text: "FALLBACK", evidenceIds: [], requirementIds: [] }], usedFallback: true };
}

describe("Case 17: concurrent experience generation", () => {
  it("preserves input ordering, maps by experienceId, and isolates a single failure", async () => {
    callAIMock.mockImplementation(async (opts: { messages: { role: string; content: string }[] }) => {
      const userMessage = opts.messages.find((m) => m.role === "user")!.content;
      const parsed = JSON.parse(userMessage.split("\n\nPREVIOUS")[0]);
      const experienceId = parsed.experienceId as string;

      if (experienceId === "exp_2") {
        throw new Error("simulated network failure");
      }

      return {
        providerUsed: "openai",
        modelUsed: "gpt-4.1-mini",
        text: "",
        json: { experienceId, bullets: [{ text: `Bullet for ${experienceId}`, evidenceIds: [`fact_${experienceId}`], requirementIds: [] }] },
        raw: {},
        costUsd: 0.001,
      };
    });

    const inputs = [writerInput("exp_1"), writerInput("exp_2"), writerInput("exp_3")];
    const { results } = await generateExperiencesInParallel(inputs, aiRequest, buildFallback);

    // Stable ordering matching input order, not settle order.
    expect(results.map((r) => r.experienceId)).toEqual(["exp_1", "exp_2", "exp_3"]);

    expect(results[0].bullets[0].text).toBe("Bullet for exp_1");
    expect(results[2].bullets[0].text).toBe("Bullet for exp_3");

    // The failed experience falls back deterministically and doesn't corrupt the others.
    expect(results[1].usedFallback).toBe(true);
    expect(results[1].bullets[0].text).toBe("FALLBACK");
  });
});
