import { describe, expect, it, vi } from "vitest";
import type { ResolvedAIRequest } from "@/lib/ai-api";
import type { ComposerInput } from "@/lib/prompts/composer-prompt";
import { CANONICAL_SKILL_CATEGORIES } from "@/lib/tailoring/skill-categories";

const callAIMock = vi.fn();

vi.mock("@/lib/ai-provider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai-provider")>();
  return { ...actual, callAI: callAIMock };
});

const { composeResumeTopSection, ensureAllEligibleSkills, DEFAULT_SKILL_BUDGET } = await import(
  "@/lib/tailoring/composer"
);

const aiRequest: ResolvedAIRequest = { useOpenRouter: true, model: "openai/gpt-4.1-mini" };

describe("composer — skill categories", () => {
  it("keeps allowed skills and dynamic additions (deduped), without an allow-list filter", async () => {
    const allowedSkills = Array.from({ length: 20 }, (_, i) => `Skill${i}`);

    callAIMock.mockResolvedValue({
      providerUsed: "openai",
      modelUsed: "gpt-4.1-mini",
      text: "",
      json: {
        summary: "A".repeat(10),
        skillCategories: {
          Backend: [...allowedSkills, "Kubernetes", "Skill0"], // baseline + dynamic + duplicate
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

    expect(result.skillCategories.Backend).toHaveLength(21); // 20 allowed + Kubernetes; Skill0 deduped
    expect(result.skillCategories.Backend).toContain("Kubernetes");
  });

  it("normalizes composer skillCategories — drops unknown headings", async () => {
    callAIMock.mockResolvedValue({
      providerUsed: "openai",
      modelUsed: "gpt-4.1-mini",
      text: "",
      json: {
        summary: "A".repeat(10),
        skillCategories: {
          Backend: ["Python"],
          Streaming: ["Kafka"],
        },
        softSkills: [],
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
      categoryHints: [...CANONICAL_SKILL_CATEGORIES],
      projects: [],
    };

    const { result } = await composeResumeTopSection(input, aiRequest);
    expect(result.skillCategories).toEqual({ Backend: ["Python"] });
  });

  it("uses the default skill budget when none is provided", () => {
    expect(DEFAULT_SKILL_BUDGET.maxSkillsPerCategory).toBeGreaterThan(0);
  });
});

describe("ensureAllEligibleSkills — must-keep guarantee", () => {
  it("appends must-keep skills under Tools & Protocols when category is unknown", () => {
    const composerResult = {
      summary: "s",
      skillCategories: { Backend: ["Python", "FastAPI"] },
      softSkills: [],
      projects: [],
    };
    const result = ensureAllEligibleSkills(composerResult, ["Python", "FastAPI", "Redis", "Kafka"]);
    expect(result.skillCategories).toEqual({
      Backend: ["Python", "FastAPI"],
      "Tools & Protocols": ["Redis", "Kafka"],
    });
  });

  it("aliases profile categories, maps unmappable profile cats to Tools & Protocols, drops unknown headings", () => {
    const composerResult = {
      summary: "s",
      skillCategories: { Streaming: ["Kafka"], Backend: ["Python"] },
      softSkills: [],
      projects: [],
    };
    const categoryByKey = new Map<string, string>([
      ["redis", "Databases"],
      ["pinecone", "AI/ML"],
    ]);
    const result = ensureAllEligibleSkills(
      composerResult,
      ["Python", "Redis", "Pinecone"],
      categoryByKey
    );
    expect(result.skillCategories).toEqual({
      Backend: ["Python"],
      Database: ["Redis"],
      "Tools & Protocols": ["Pinecone"],
    });
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

  it("re-places eligible skills listed under non-canonical headings", () => {
    const composerResult = {
      summary: "s",
      skillCategories: { Streaming: ["Kafka"], Backend: ["Python"] },
      softSkills: [],
      projects: [],
    };
    const result = ensureAllEligibleSkills(composerResult, ["Python", "Kafka"]);
    expect(result.skillCategories).toEqual({
      Backend: ["Python"],
      "Tools & Protocols": ["Kafka"],
    });
  });
});
