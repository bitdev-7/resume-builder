import { describe, expect, it } from "vitest";
import { createTailoringPlan, DEFAULT_BULLET_BUDGET } from "@/lib/tailoring/tailoring-planner";
import type { CandidateProfile, JDAnalysis, RoleArchetypeDetection, SkillCandidate } from "@/lib/types/tailoring";
import { skillCandidateIdFor } from "@/lib/tailoring/skill-ontology";

function jdAnalysis(): JDAnalysis {
  return {
    normalizedTitle: "Backend Engineer",
    seniority: "mid",
    roleFamily: "software_engineering",
    domains: [],
    requirements: [
      { id: "req_1", text: "Experience with Python", type: "must_have", category: "technology", canonicalTerm: "Python", priority: 10 },
      { id: "req_2", text: "Experience with Kubernetes", type: "preferred", category: "technology", canonicalTerm: "Kubernetes", priority: 6 },
    ],
    responsibilityThemes: [],
    atsTerms: [],
    clearanceRequired: false,
    clearanceType: null,
    clearanceStatus: null,
    clearanceRequirementText: null,
    rawText: "Experience with Python. Experience with Kubernetes.",
  };
}

function roleArchetype(): RoleArchetypeDetection {
  return { primaryRoleArchetype: "python_backend_engineer", secondaryRoleArchetypes: [], confidence: 0.8 };
}

function skillCandidate(name: string, evidenceStatus: SkillCandidate["evidenceStatus"], matchedRequirementIds: string[] = []): SkillCandidate {
  return {
    id: skillCandidateIdFor(name),
    canonicalName: name,
    aliases: [],
    sources: ["explicit_jd"],
    relevanceScore: 0.9,
    roleImportance: "core",
    evidenceStatus,
    evidenceIds: evidenceStatus === "unsupported" ? [] : ["fact_x"],
    confidence: evidenceStatus === "unsupported" ? 0 : 0.9,
    matchedRequirementIds,
  };
}

describe("tailoring planner — requirement matching", () => {
  it("marks a directly-evidenced technology requirement as strongly_supported", () => {
    const profile: CandidateProfile = {
      contact: {},
      experiences: [
        {
          id: "exp_1",
          title: "Backend Engineer",
          company: "Acme",
          startDate: "01/2023",
          endDate: "Present",
          facts: [{ id: "fact_1", text: "Built services in Python", factType: "responsibility", confidence: "imported" }],
          technologies: [{ name: "Python", evidenceLevel: "used_in_role", sourceIds: ["fact_1"] }],
        },
      ],
      projects: [],
      education: [],
      certifications: [],
      declaredSkills: [],
    };

    const plan = createTailoringPlan(
      profile,
      jdAnalysis(),
      roleArchetype(),
      [skillCandidate("Python", "direct", ["req_1"]), skillCandidate("Kubernetes", "unsupported")]
    );

    const pythonMatch = plan.requirementMatches.find((m) => m.requirementId === "req_1")!;
    const k8sMatch = plan.requirementMatches.find((m) => m.requirementId === "req_2")!;

    expect(pythonMatch.status).toBe("strongly_supported");
    expect(k8sMatch.status).toBe("unsupported");
  });
});

describe("tailoring planner — bullet allocation is not tenure-only", () => {
  it("gives a highly JD-relevant recent role more bullets than an equally-tenured but irrelevant one", () => {
    const profile: CandidateProfile = {
      contact: {},
      experiences: [
        {
          id: "exp_recent_relevant",
          title: "Backend Engineer",
          company: "Acme",
          startDate: "01/2023",
          endDate: "Present",
          facts: Array.from({ length: 6 }, (_, i) => ({
            id: `fact_r_${i}`,
            text: `Built Python service component ${i}`,
            factType: "responsibility" as const,
            confidence: "imported" as const,
          })),
          technologies: [{ name: "Python", evidenceLevel: "used_in_role", sourceIds: ["fact_r_0"] }],
        },
        {
          id: "exp_old_irrelevant",
          title: "Retail Associate",
          company: "OldCo",
          startDate: "01/2021",
          endDate: "12/2022",
          facts: Array.from({ length: 6 }, (_, i) => ({
            id: `fact_o_${i}`,
            text: `Handled customer inquiries ${i}`,
            factType: "responsibility" as const,
            confidence: "imported" as const,
          })),
          technologies: [],
        },
      ],
      projects: [],
      education: [],
      certifications: [],
      declaredSkills: [],
    };

    const plan = createTailoringPlan(
      profile,
      jdAnalysis(),
      roleArchetype(),
      [skillCandidate("Python", "direct", ["req_1"])],
      DEFAULT_BULLET_BUDGET
    );

    const relevantPlan = plan.experiencePlans.find((p) => p.experienceId === "exp_recent_relevant")!;
    const irrelevantPlan = plan.experiencePlans.find((p) => p.experienceId === "exp_old_irrelevant")!;

    expect(relevantPlan.targetBulletCount).toBeGreaterThan(irrelevantPlan.targetBulletCount);
  });

  it("allocates at least minBulletsPerExperience for JD-relevant roles regardless of short tenure", () => {
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1);
    const recentStartDate = `${sixMonthsAgo.getMonth() + 1}/${sixMonthsAgo.getFullYear()}`;

    const profile: CandidateProfile = {
      contact: {},
      experiences: [
        {
          id: "exp_short",
          title: "Backend Engineer",
          company: "Acme",
          startDate: recentStartDate,
          endDate: "Present",
          facts: Array.from({ length: 2 }, (_, i) => ({
            id: `fact_${i}`,
            text: `Built Python service component ${i}`,
            factType: "responsibility" as const,
            confidence: "imported" as const,
          })),
          technologies: [{ name: "Python", evidenceLevel: "used_in_role", sourceIds: ["fact_0"] }],
        },
      ],
      projects: [],
      education: [],
      certifications: [],
      declaredSkills: [],
    };

    const plan = createTailoringPlan(profile, jdAnalysis(), roleArchetype(), [skillCandidate("Python", "direct", ["req_1"])]);
    expect(plan.experiencePlans[0].targetBulletCount).toBeGreaterThanOrEqual(DEFAULT_BULLET_BUDGET.minBulletsPerExperience);
    expect(plan.experiencePlans[0].targetBulletCount).toBeLessThanOrEqual(DEFAULT_BULLET_BUDGET.maxBulletsPerExperience);
  });
});
