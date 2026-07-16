import { describe, expect, it } from "vitest";
import { validateTailoredResume } from "@/lib/tailoring/validators";
import type {
  CandidateExperience,
  ComposerResult,
  ExperienceGenerationResult,
  ExperiencePlan,
  JDAnalysis,
  SkillCandidate,
} from "@/lib/types/tailoring";
import { skillCandidateIdFor, skillKey } from "@/lib/tailoring/skill-ontology";

const jdAnalysis: JDAnalysis = {
  normalizedTitle: "Backend Engineer",
  seniority: "mid",
  roleFamily: "software_engineering",
  domains: [],
  requirements: [{ id: "req_1", text: "Python", type: "must_have", category: "technology", canonicalTerm: "Python", priority: 10 }],
  responsibilityThemes: [],
  atsTerms: [],
  rawText: "Python",
};

const experience: CandidateExperience = {
  id: "exp_1",
  title: "Backend Engineer",
  company: "Acme",
  startDate: "01/2022",
  endDate: "Present",
  facts: [
    {
      id: "fact_1",
      text: "Built authentication APIs",
      factType: "responsibility",
      confidence: "imported",
    },
    {
      id: "fact_2",
      text: "Reduced p95 latency by 23%",
      factType: "achievement",
      confidence: "imported",
      metrics: [{ id: "metric_1", value: "23%", context: "Reduced p95 latency by 23%" }],
    },
  ],
  technologies: [{ name: "Python", evidenceLevel: "used_in_role", sourceIds: ["fact_1"] }],
};

const experiencePlans: ExperiencePlan[] = [
  {
    experienceId: "exp_1",
    targetBulletCount: 2,
    priorityRequirementIds: ["req_1"],
    allowedEvidenceIds: ["fact_1", "fact_2", "metric_1"],
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

function composerResult(overrides: Partial<ComposerResult> = {}): ComposerResult {
  return {
    summary:
      "Backend engineer with experience building Python services, focused on reliability and clean API design across the stack. Delivers well-tested, maintainable systems that meet business and user needs consistently over time here today.",
    skillCategories: { Backend: ["Python"] },
    softSkills: [],
    projects: [],
    ...overrides,
  };
}

function baseValidateInput(experienceResults: ExperienceGenerationResult[], composer = composerResult()) {
  return {
    jdAnalysis,
    experiencePlans,
    experiencesById: new Map([["exp_1", experience]]),
    experienceResults,
    allowedFinalSkillsByKey: supportedSkillsByKey,
    composerResult: composer,
  };
}

describe("validators — metric grounding", () => {
  it("Case 10: a bullet with no invented metric passes", () => {
    const results: ExperienceGenerationResult[] = [
      {
        experienceId: "exp_1",
        bullets: [
          { text: "Built authentication APIs for the platform", evidenceIds: ["fact_1"], requirementIds: ["req_1"] },
          { text: "Reduced p95 latency by 23% through query optimization", evidenceIds: ["fact_2"], requirementIds: [] },
        ],
      },
    ];

    const issues = validateTailoredResume(baseValidateInput(results));
    expect(issues.filter((i) => i.code === "UNGROUNDED_METRIC")).toHaveLength(0);
  });

  it("Case 11: an invented metric on a reference-based bullet is flagged", () => {
    const results: ExperienceGenerationResult[] = [
      {
        experienceId: "exp_1",
        bullets: [
          { text: "Reduced latency by 37% across services", evidenceIds: ["fact_2"], requirementIds: [] },
          { text: "Built authentication APIs for the platform", evidenceIds: ["fact_1"], requirementIds: [] },
        ],
      },
    ];

    const issues = validateTailoredResume(baseValidateInput(results));
    expect(issues.some((i) => i.code === "UNGROUNDED_METRIC" && i.message.includes("37%"))).toBe(true);
  });

  it("allows invented metrics on creatively generated bullets (empty evidenceIds)", () => {
    const results: ExperienceGenerationResult[] = [
      {
        experienceId: "exp_1",
        bullets: [
          { text: "Reduced latency by 37% across services", evidenceIds: [], requirementIds: [] },
          { text: "Built authentication APIs for the platform", evidenceIds: ["fact_1"], requirementIds: [] },
        ],
      },
    ];

    const issues = validateTailoredResume(baseValidateInput(results));
    expect(issues.filter((i) => i.code === "UNGROUNDED_METRIC")).toHaveLength(0);
  });
});

describe("validators — evidence/requirement id integrity", () => {
  it("Case 12: flags an evidence id that doesn't belong to this experience", () => {
    const results: ExperienceGenerationResult[] = [
      {
        experienceId: "exp_1",
        bullets: [{ text: "Built authentication APIs for the platform", evidenceIds: ["fact_from_another_role"], requirementIds: [] }],
      },
    ];

    const issues = validateTailoredResume(baseValidateInput(results));
    expect(issues.some((i) => i.code === "UNKNOWN_EVIDENCE_ID")).toBe(true);
  });

  it("flags a requirement id that does not exist", () => {
    const results: ExperienceGenerationResult[] = [
      {
        experienceId: "exp_1",
        bullets: [{ text: "Built authentication APIs for the platform", evidenceIds: ["fact_1"], requirementIds: ["req_does_not_exist"] }],
      },
    ];

    const issues = validateTailoredResume(baseValidateInput(results));
    expect(issues.some((i) => i.code === "UNKNOWN_REQUIREMENT_ID")).toBe(true);
  });
});

describe("validators — skill support", () => {
  it("allows dynamic skills not in the candidate allow-list", () => {
    const results: ExperienceGenerationResult[] = [
      { experienceId: "exp_1", bullets: [{ text: "Built authentication APIs for the platform", evidenceIds: ["fact_1"], requirementIds: [] }] },
    ];
    const composer = composerResult({ skillCategories: { Backend: ["Python", "Kubernetes"] } });

    const issues = validateTailoredResume(baseValidateInput(results, composer));
    expect(issues.some((i) => i.code === "UNSUPPORTED_SKILL")).toBe(false);
  });

  it("does NOT flag a JD-required skill that is present in allowedFinalSkillsByKey (even without evidence)", () => {
    const results: ExperienceGenerationResult[] = [
      { experienceId: "exp_1", bullets: [{ text: "Built authentication APIs for the platform", evidenceIds: ["fact_1"], requirementIds: [] }] },
    ];
    // Kafka has no candidate evidence but is JD-required, so it is eligible for the final skills section.
    const eligibleWithKafka = new Map(supportedSkillsByKey);
    eligibleWithKafka.set(skillKey("Kafka"), {
      id: skillCandidateIdFor("Kafka"),
      canonicalName: "Kafka",
      aliases: [],
      sources: ["explicit_jd"],
      relevanceScore: 0.9,
      roleImportance: "core",
      evidenceStatus: "unsupported",
      evidenceIds: [],
      confidence: 0,
      matchedRequirementIds: ["req_1"],
    });
    const composer = composerResult({ skillCategories: { Backend: ["Python"], Streaming: ["Kafka"] } });

    const issues = validateTailoredResume({
      ...baseValidateInput(results, composer),
      allowedFinalSkillsByKey: eligibleWithKafka,
    });
    expect(issues.some((i) => i.code === "UNSUPPORTED_SKILL")).toBe(false);
  });
});

describe("validators — experience skill policy", () => {
  it("allows the writer to introduce a role-appropriate technology not in the allowed list", () => {
    const results: ExperienceGenerationResult[] = [
      {
        experienceId: "exp_1",
        bullets: [{ text: "Orchestrated Kubernetes clusters for the platform", evidenceIds: ["fact_1"], requirementIds: [] }],
      },
    ];

    const issues = validateTailoredResume(baseValidateInput(results));
    expect(issues.some((i) => i.code === "UNSUPPORTED_EXPERIENCE_SKILL")).toBe(false);
  });
});
