import { describe, expect, it, vi } from "vitest";
import type { ResolvedAIRequest } from "@/lib/ai-api";
import type { ComposerInput } from "@/lib/prompts/composer-prompt";

const callAIMock = vi.fn();

vi.mock("@/lib/ai-provider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai-provider")>();
  return { ...actual, callAI: callAIMock };
});

const { composeResumeTopSection, DEFAULT_SKILL_BUDGET } = await import("@/lib/tailoring/composer");

const aiRequest: ResolvedAIRequest = { useOpenRouter: true, model: "openai/gpt-4.1-mini" };

describe("composer — skills ignored", () => {
  it("returns empty skillCategories and softSkills even if the model sent skills", async () => {
    callAIMock.mockResolvedValue({
      providerUsed: "openai",
      modelUsed: "gpt-4.1-mini",
      text: "",
      json: {
        summary: "A".repeat(80),
        skillCategories: { Backend: ["Python"] },
        softSkills: ["Leadership"],
        projects: [],
      },
      raw: {},
      costUsd: 0,
    });

    const input: ComposerInput = {
      normalizedTitle: "Backend Engineer",
      seniority: "mid",
      domains: [],
      topRequirements: [],
      summaryEvidence: [],
      allowedSkills: ["Python"],
      targetSkills: [],
      categoryHints: ["Backend"],
      projects: [],
    };

    const { result } = await composeResumeTopSection(input, aiRequest);
    expect(result.skillCategories).toEqual({});
    expect(result.softSkills).toEqual([]);
  });
});

describe("composer — defaults", () => {
  it("uses the default skill budget when none is provided", () => {
    expect(DEFAULT_SKILL_BUDGET.maxSkillsPerCategory).toBeGreaterThan(0);
  });
});
