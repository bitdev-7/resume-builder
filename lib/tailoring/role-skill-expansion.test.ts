import { describe, expect, it } from "vitest";
import { expandRoleSkills } from "@/lib/tailoring/role-skill-expansion";
import { resolveSkillEvidence } from "@/lib/tailoring/skill-evidence-resolver";
import { detectRoleArchetype } from "@/lib/tailoring/role-archetype";
import type { CandidateProfile, JDAnalysis } from "@/lib/types/tailoring";

const jdAnalysis: JDAnalysis = {
  normalizedTitle: "Full Stack Python Developer",
  seniority: "mid",
  roleFamily: "software_engineering",
  domains: [],
  requirements: [
    { id: "req_1", text: "Python", type: "must_have", category: "technology", canonicalTerm: "Python", priority: 10 },
    { id: "req_2", text: "FastAPI", type: "must_have", category: "technology", canonicalTerm: "FastAPI", priority: 10 },
    { id: "req_3", text: "PostgreSQL", type: "must_have", category: "technology", canonicalTerm: "PostgreSQL", priority: 10 },
  ],
  responsibilityThemes: [],
  atsTerms: [],
  rawText: "Python FastAPI PostgreSQL",
};

describe("Case 1: role skill expansion considers broader relevant skills, not just literal JD keywords", () => {
  it("surfaces Redis/JavaScript/React as relevant + resolves them as supported when the candidate has evidence", async () => {
    const profile: CandidateProfile = {
      contact: {},
      experiences: [
        {
          id: "exp_1",
          title: "Full Stack Developer",
          company: "Acme",
          startDate: "01/2022",
          endDate: "Present",
          facts: [
            { id: "fact_1", text: "Built FastAPI services on PostgreSQL with Redis caching", factType: "responsibility", confidence: "imported" },
            { id: "fact_2", text: "Built interactive dashboards in React and JavaScript", factType: "responsibility", confidence: "imported" },
          ],
          technologies: [
            { name: "FastAPI", evidenceLevel: "used_in_role", sourceIds: ["fact_1"] },
            { name: "PostgreSQL", evidenceLevel: "used_in_role", sourceIds: ["fact_1"] },
            { name: "Redis", evidenceLevel: "used_in_role", sourceIds: ["fact_1"] },
            { name: "React", evidenceLevel: "used_in_role", sourceIds: ["fact_2"] },
            { name: "JavaScript", evidenceLevel: "used_in_role", sourceIds: ["fact_2"] },
          ],
        },
      ],
      projects: [],
      education: [],
      certifications: [],
      declaredSkills: [],
    };

    const roleArchetype = detectRoleArchetype(jdAnalysis);
    expect(roleArchetype.primaryRoleArchetype).toBe("full_stack_python_engineer");

    const candidates = await expandRoleSkills(jdAnalysis, roleArchetype, ["FastAPI", "PostgreSQL", "Redis", "React", "JavaScript"]);
    const names = candidates.map((c) => c.canonicalName);
    expect(names).toEqual(expect.arrayContaining(["Redis", "JavaScript", "React"]));

    const resolved = resolveSkillEvidence(candidates, profile);
    const redis = resolved.find((c) => c.canonicalName === "Redis")!;
    const react = resolved.find((c) => c.canonicalName === "React")!;
    const javascript = resolved.find((c) => c.canonicalName === "JavaScript")!;

    // Relevant AND candidate-supported, even though absent from the JD's literal requirement list.
    expect(redis.evidenceStatus).toBe("direct");
    expect(react.evidenceStatus).toBe("direct");
    expect(javascript.evidenceStatus).toBe("direct");
  });
});
