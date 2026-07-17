import { describe, expect, it, vi } from "vitest";
import type { ResolvedAIRequest } from "@/lib/ai-api";
import type {
  CandidateExperience,
  ComposerResult,
  ExperienceGenerationResult,
  ExperiencePlan,
  JDAnalysis,
  SkillCandidate,
} from "@/lib/types/tailoring";
import type { ExperienceWriterInput } from "@/lib/prompts/experience-writer-prompt";
import type { ComposerInput } from "@/lib/prompts/composer-prompt";
import { skillCandidateIdFor, skillKey } from "@/lib/tailoring/skill-ontology";

const composeMock = vi.fn();
const generateExperienceMock = vi.fn();

vi.mock("@/lib/tailoring/composer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tailoring/composer")>();
  return { ...actual, composeResumeTopSection: composeMock };
});

vi.mock("@/lib/tailoring/experience-generator", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tailoring/experience-generator")>();
  return { ...actual, generateExperience: generateExperienceMock };
});

const { repairTailoredResume } = await import("@/lib/tailoring/repair");

const jdAnalysis: JDAnalysis = {
  normalizedTitle: "Backend Engineer",
  seniority: "mid",
  roleFamily: "software_engineering",
  domains: [],
  requirements: [{ id: "req_1", text: "Python", type: "must_have", category: "technology", canonicalTerm: "Python", priority: 10 }],
  responsibilityThemes: [],
  atsTerms: [],
  clearanceRequired: false,
  clearanceType: null,
  clearanceStatus: null,
  clearanceRequirementText: null,
  rawText: "Python",
};

const experience: CandidateExperience = {
  id: "exp_1",
  title: "Backend Engineer",
  company: "Acme",
  startDate: "01/2022",
  endDate: "Present",
  facts: [{ id: "fact_1", text: "Built authentication APIs", factType: "responsibility", confidence: "imported" }],
  technologies: [{ name: "Python", evidenceLevel: "used_in_role", sourceIds: ["fact_1"] }],
};

const experiencePlans: ExperiencePlan[] = [
  {
    experienceId: "exp_1",
    targetBulletCount: 1,
    priorityRequirementIds: ["req_1"],
    allowedEvidenceIds: ["fact_1"],
    relevantSkillIds: [skillCandidateIdFor("Python")],
  },
];

const supportedSkillsByKey = new Map<string, SkillCandidate>([
  [
    skillKey("Python"),
    {
      id: skillCandidateIdFor("Python"),
      canonicalName: "Python",
      aliases: [],
      sources: ["explicit_jd"],
      relevanceScore: 0.9,
      roleImportance: "core",
      evidenceStatus: "direct",
      evidenceIds: ["fact_1"],
      confidence: 0.9,
      matchedRequirementIds: ["req_1"],
    },
  ],
]);

const validExperienceResults: ExperienceGenerationResult[] = [
  { experienceId: "exp_1", bullets: [{ text: "Built authentication APIs for the platform", evidenceIds: ["fact_1"], requirementIds: ["req_1"] }] },
];

const aiRequest: ResolvedAIRequest = { useOpenRouter: true, model: "openai/gpt-4.1-mini" };

describe("Case 16: targeted repair", () => {
  it("leaves dynamic skills intact and does not re-invoke composer for skills-only concerns", async () => {
    const composerResultWithExtraSkill: ComposerResult = {
      summary:
        "Backend engineer with hands-on experience building Python services focused on reliability, clean API design, and maintainable systems. Comfortable owning features end to end, from initial design through deployment and monitoring in production. Works closely with cross-functional teams to translate business requirements into well-tested backend components, prioritizing clarity, consistency, and long-term maintainability across the codebase and infrastructure supporting critical workflows daily for the organization and its customers worldwide today.",
      skillCategories: { Backend: ["Python", "Kubernetes"] },
      softSkills: [],
      projects: [],
    };

    const writerInputsById = new Map<string, ExperienceWriterInput>([
      [
        "exp_1",
        {
          experienceId: "exp_1",
          title: "Backend Engineer",
          company: "Acme",
          startDate: "01/2022",
          endDate: "Present",
          allowedEvidence: experience.facts,
          allowedSkills: ["Python"],
          targetSkills: [],
          priorityRequirements: [{ id: "req_1", text: "Python" }],
          targetBulletCount: 1,
        },
      ],
    ]);

    const composerInput: ComposerInput = {
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

    const outcome = await repairTailoredResume(validExperienceResults, composerResultWithExtraSkill, {
      jdAnalysis,
      experiencePlans,
      experiencesById: new Map([["exp_1", experience]]),
      experienceWriterInputsById: writerInputsById,
      composerInput,
      allowedFinalSkillsByKey: supportedSkillsByKey,
      aiRequest,
      maxAttempts: 2,
      buildFallback: (input) => ({ experienceId: input.experienceId, bullets: [{ text: "FALLBACK", evidenceIds: [], requirementIds: [] }], usedFallback: true }),
    });

    expect(composeMock).not.toHaveBeenCalled();
    expect(outcome.composerResult.skillCategories.Backend).toEqual(["Python", "Kubernetes"]);
    expect(generateExperienceMock).not.toHaveBeenCalled();
    expect(outcome.experienceResults).toEqual(validExperienceResults);
  });
});
