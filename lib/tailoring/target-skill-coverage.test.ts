import { describe, expect, it } from "vitest";
import { ensureTargetSkillsInExperiences, ensureTargetSkillsInProjects } from "@/lib/tailoring/pipeline";
import type { ExperienceGenerationResult } from "@/lib/types/tailoring";

function results(): ExperienceGenerationResult[] {
  return [
    {
      experienceId: "exp_1",
      bullets: [
        { text: "Built the customer portal with a Go backend and a Next.js frontend", evidenceIds: [], requirementIds: [] },
        { text: "Optimized PostgreSQL queries for the reporting service", evidenceIds: [], requirementIds: [] },
      ],
    },
    {
      experienceId: "exp_2",
      bullets: [{ text: "Shipped internal tooling", evidenceIds: [], requirementIds: [] }],
    },
  ];
}

describe("ensureTargetSkillsInExperiences", () => {
  it("leaves bullets untouched when every target skill is already mentioned", () => {
    const out = ensureTargetSkillsInExperiences(results(), ["Go", "Next.js", "PostgreSQL"]);
    expect(out[0].bullets).toHaveLength(2);
    expect(out[1].bullets).toHaveLength(1);
  });

  it("appends the uncovered target skills to the most substantial experience", () => {
    const out = ensureTargetSkillsInExperiences(results(), ["Go", "Kafka", "Terraform"]);
    // exp_1 has the most bullets, so the coverage bullet lands there.
    expect(out[0].bullets).toHaveLength(3);
    expect(out[1].bullets).toHaveLength(1);
    const added = out[0].bullets[2].text;
    expect(added).toContain("Kafka");
    expect(added).toContain("Terraform");
    expect(added).not.toContain("Go,"); // Go was already covered
  });

  it("does not match substrings inside other words", () => {
    const base: ExperienceGenerationResult[] = [
      { experienceId: "exp_1", bullets: [{ text: "Managed Django services and goals", evidenceIds: [], requirementIds: [] }] },
    ];
    // "Go" must NOT be considered covered by "goals"/"Django".
    const out = ensureTargetSkillsInExperiences(base, ["Go"]);
    expect(out[0].bullets).toHaveLength(2);
    expect(out[0].bullets[1].text).toContain("Go");
  });

  it("is a no-op with no target skills", () => {
    const input = results();
    expect(ensureTargetSkillsInExperiences(input, [])).toBe(input);
  });
});

describe("ensureTargetSkillsInProjects", () => {
  const projects = () => [
    { name: "Lumo VPN", description: "Built with Java and Kotlin", technologies: ["Java", "Kotlin", "AWS"] },
    { name: "Stake-Estate", description: "Next.js frontend", technologies: ["Next.js"] },
  ];

  it("appends uncovered target skills to the project with the most technologies", () => {
    const out = ensureTargetSkillsInProjects(projects(), ["Go", "Kafka", "Next.js"]);
    // Lumo VPN has more technologies, so uncovered skills land there.
    expect(out[0].technologies).toEqual(expect.arrayContaining(["Go", "Kafka"]));
    // Next.js already appeared (on project 2's description/tech), so it is not re-added.
    expect(out[0].technologies).not.toContain("Next.js");
    expect(out[1].technologies).toEqual(["Next.js"]);
  });

  it("leaves projects untouched when all target skills are already present", () => {
    const out = ensureTargetSkillsInProjects(projects(), ["Java", "Next.js", "AWS"]);
    expect(out[0].technologies).toEqual(["Java", "Kotlin", "AWS"]);
    expect(out[1].technologies).toEqual(["Next.js"]);
  });

  it("is a no-op with no projects or no target skills", () => {
    expect(ensureTargetSkillsInProjects([], ["Go"])).toEqual([]);
    const input = projects();
    expect(ensureTargetSkillsInProjects(input, [])).toBe(input);
  });
});
