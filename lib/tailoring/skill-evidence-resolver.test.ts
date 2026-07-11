import { describe, expect, it } from "vitest";
import { resolveSkillEvidence } from "@/lib/tailoring/skill-evidence-resolver";
import type { CandidateProfile, SkillCandidate } from "@/lib/types/tailoring";
import { skillCandidateIdFor } from "@/lib/tailoring/skill-ontology";

function candidate(name: string): SkillCandidate {
  return {
    id: skillCandidateIdFor(name),
    canonicalName: name,
    aliases: [],
    sources: ["role_archetype"],
    relevanceScore: 0.8,
    roleImportance: "core",
    evidenceStatus: "unsupported",
    evidenceIds: [],
    confidence: 0,
    matchedRequirementIds: [],
  };
}

function baseProfile(overrides: Partial<CandidateProfile> = {}): CandidateProfile {
  return {
    contact: {},
    experiences: [],
    projects: [],
    education: [],
    certifications: [],
    declaredSkills: [],
    ...overrides,
  };
}

describe("skill evidence resolver", () => {
  it("Case 1 (support): direct role-level evidence resolves to 'direct'", () => {
    const profile = baseProfile({
      experiences: [
        {
          id: "exp_1",
          title: "Backend Engineer",
          company: "Acme",
          startDate: "01/2020",
          endDate: "Present",
          facts: [{ id: "fact_1", text: "Built FastAPI services on PostgreSQL", factType: "responsibility", confidence: "imported" }],
          technologies: [
            { name: "FastAPI", evidenceLevel: "used_in_role", sourceIds: ["fact_1"] },
            { name: "PostgreSQL", evidenceLevel: "used_in_role", sourceIds: ["fact_1"] },
          ],
        },
      ],
    });

    const resolved = resolveSkillEvidence([candidate("FastAPI"), candidate("Redis")], profile);
    const fastapi = resolved.find((c) => c.canonicalName === "FastAPI")!;
    const redis = resolved.find((c) => c.canonicalName === "Redis")!;

    expect(fastapi.evidenceStatus).toBe("direct");
    expect(redis.evidenceStatus).toBe("unsupported");
  });

  it("Case 7: project-only evidence resolves to 'project_only', not 'direct'", () => {
    const profile = baseProfile({
      projects: [
        {
          id: "proj_1",
          name: "Side Project",
          facts: [],
          technologies: [{ name: "AWS", evidenceLevel: "used_in_project", sourceIds: ["proj_1"] }],
        },
      ],
    });

    const resolved = resolveSkillEvidence([candidate("AWS")], profile);
    expect(resolved[0].evidenceStatus).toBe("project_only");
  });

  it("Case 8: candidate-supported skill absent from JD is still resolved as direct evidence", () => {
    const profile = baseProfile({
      experiences: [
        {
          id: "exp_1",
          title: "Full Stack Engineer",
          company: "Acme",
          startDate: "01/2020",
          endDate: "Present",
          facts: [{ id: "fact_1", text: "Built interactive UIs in JavaScript", factType: "responsibility", confidence: "imported" }],
          technologies: [{ name: "JavaScript", evidenceLevel: "used_in_role", sourceIds: ["fact_1"] }],
        },
      ],
    });

    const resolved = resolveSkillEvidence([candidate("JavaScript")], profile);
    expect(resolved[0].evidenceStatus).toBe("direct");
  });

  it("Case 9: role-relevant but unsupported skill (e.g. Kubernetes) stays 'unsupported', never auto-claimed", () => {
    const profile = baseProfile({
      experiences: [
        {
          id: "exp_1",
          title: "DevOps Engineer",
          company: "Acme",
          startDate: "01/2020",
          endDate: "Present",
          facts: [{ id: "fact_1", text: "Containerized services with Docker", factType: "responsibility", confidence: "imported" }],
          technologies: [{ name: "Docker", evidenceLevel: "used_in_role", sourceIds: ["fact_1"] }],
        },
      ],
    });

    const resolved = resolveSkillEvidence([candidate("Docker"), candidate("Kubernetes")], profile);
    const kubernetes = resolved.find((c) => c.canonicalName === "Kubernetes")!;
    expect(kubernetes.evidenceStatus).toBe("unsupported");
  });

  it("declared-only skill (no role/project usage) resolves to 'declared'", () => {
    const profile = baseProfile({
      declaredSkills: [{ name: "GraphQL", evidenceLevel: "declared", sourceIds: ["profile_hard_skills"] }],
    });

    const resolved = resolveSkillEvidence([candidate("GraphQL")], profile);
    expect(resolved[0].evidenceStatus).toBe("declared");
  });

  it("direct evidence takes precedence over declared evidence for the same skill", () => {
    const profile = baseProfile({
      experiences: [
        {
          id: "exp_1",
          title: "Backend Engineer",
          company: "Acme",
          startDate: "01/2020",
          endDate: "Present",
          facts: [{ id: "fact_1", text: "Built services with Redis caching", factType: "responsibility", confidence: "imported" }],
          technologies: [{ name: "Redis", evidenceLevel: "used_in_role", sourceIds: ["fact_1"] }],
        },
      ],
      declaredSkills: [{ name: "Redis", evidenceLevel: "declared", sourceIds: ["profile_hard_skills"] }],
    });

    const resolved = resolveSkillEvidence([candidate("Redis")], profile);
    expect(resolved[0].evidenceStatus).toBe("direct");
  });
});
