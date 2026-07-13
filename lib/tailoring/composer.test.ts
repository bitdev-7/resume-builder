import { describe, expect, it, vi } from "vitest";
import type { ResolvedAIRequest } from "@/lib/ai-api";
import type { ComposerInput } from "@/lib/prompts/composer-prompt";

const callAIMock = vi.fn();

vi.mock("@/lib/ai-provider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai-provider")>();
  return { ...actual, callAI: callAIMock };
});

const { composeResumeTopSection, ensureAllEligibleSkills, DEFAULT_SKILL_BUDGET } = await import(
  "@/lib/tailoring/composer"
);

const aiRequest: ResolvedAIRequest = { useOpenRouter: true, model: "openai/gpt-4.1-mini" };

describe("composer — skill allow-list filtering", () => {
  it("keeps all allowed skills (no per-category cap) and drops anything outside the allow-list", async () => {
    const allowedSkills = Array.from({ length: 20 }, (_, i) => `Skill${i}`);

    callAIMock.mockResolvedValue({
      providerUsed: "openai",
      modelUsed: "gpt-4.1-mini",
      text: "",
      json: {
        summary: "A".repeat(10),
        skillCategories: {
          Backend: [...allowedSkills, "NotAllowedSkill"], // 20 allowed + 1 disallowed
        },
        softSkills: [],
        projects: [],
      },
      raw: {},
      costUsd: 0.002,
    });

    const input: ComposerInput = {
      normalizedTitle: "Backend Engineer",
      seniority: "mid",
      domains: [],
      topRequirements: [],
      summaryEvidence: [],
      allowedSkills,
      targetSkills: [],
      categoryHints: ["Backend"],
      projects: [],
    };

    const { result } = await composeResumeTopSection(input, aiRequest, { maxTotalSkills: 35, maxSkillsPerCategory: 10 });

    // All 20 allowed skills are kept (no cap); the disallowed one is dropped.
    expect(result.skillCategories.Backend).toHaveLength(20);
    expect(result.skillCategories.Backend).not.toContain("NotAllowedSkill");
  });

  it("uses the default skill budget when none is provided", () => {
    expect(DEFAULT_SKILL_BUDGET.maxSkillsPerCategory).toBeGreaterThan(0);
  });
});

describe("ensureAllEligibleSkills — completeness guarantee", () => {
  it("appends eligible skills the composer omitted, and leaves present ones untouched", () => {
    const composerResult = {
      summary: "s",
      skillCategories: { Backend: ["Python", "FastAPI"] },
      softSkills: [],
      projects: [],
    };
    // Redis (declared) and Kafka (JD-required) were both eligible but dropped by the composer.
    const result = ensureAllEligibleSkills(composerResult, ["Python", "FastAPI", "Redis", "Kafka"]);

    const allSkills = Object.values(result.skillCategories).flat();
    expect(allSkills).toEqual(expect.arrayContaining(["Python", "FastAPI", "Redis", "Kafka"]));
    // Original category preserved.
    expect(result.skillCategories.Backend).toEqual(["Python", "FastAPI"]);
  });

  it("returns the input unchanged when every eligible skill is already present", () => {
    const composerResult = {
      summary: "s",
      skillCategories: { Backend: ["Python"] },
      softSkills: [],
      projects: [],
    };
    const result = ensureAllEligibleSkills(composerResult, ["Python"]);
    expect(result.skillCategories).toEqual({ Backend: ["Python"] });
  });
});
