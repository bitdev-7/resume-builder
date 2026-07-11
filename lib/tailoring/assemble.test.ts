import { describe, expect, it } from "vitest";
import { assembleFinalResume } from "@/lib/tailoring/assemble";
import type { CandidateProfile, ComposerResult, ExperienceGenerationResult } from "@/lib/types/tailoring";

const profile: CandidateProfile = {
  contact: { name: "Jane Doe", email: "jane@example.com", phone: "555-1234", location: "Remote", linkedin: "" },
  experiences: [
    {
      id: "exp_1",
      title: "Senior Backend Engineer",
      company: "Acme Corp",
      startDate: "01/2022",
      endDate: "Present",
      facts: [{ id: "fact_1", text: "Built authentication APIs", factType: "responsibility", confidence: "imported" }],
      technologies: [],
    },
  ],
  projects: [],
  education: [{ degree: "B.S. Computer Science", school: "State University", graduationDate: "05/2018" }],
  certifications: [],
  declaredSkills: [],
};

const composerResult: ComposerResult = {
  summary: "Backend engineer with strong Python experience.",
  skillCategories: { Backend: ["Python"] },
  softSkills: [],
  projects: [],
};

describe("final assembly — immutable identity fields", () => {
  it("Case 13: preserves the original company name even if a bullet result tried to imply otherwise", () => {
    const experienceResults: ExperienceGenerationResult[] = [
      { experienceId: "exp_1", bullets: [{ text: "Built services at a different company", evidenceIds: ["fact_1"], requirementIds: [] }] },
    ];

    const resume = assembleFinalResume(profile, experienceResults, composerResult);
    expect(resume.experience?.[0].company).toBe("Acme Corp");
    expect(resume.experience?.[0].title).toBe("Senior Backend Engineer");
  });

  it("Case 14: preserves original start/end dates regardless of generated content", () => {
    const experienceResults: ExperienceGenerationResult[] = [
      { experienceId: "exp_1", bullets: [{ text: "Built authentication APIs", evidenceIds: ["fact_1"], requirementIds: [] }] },
    ];

    const resume = assembleFinalResume(profile, experienceResults, composerResult);
    expect(resume.experience?.[0].startDate).toBe("01/2022");
    expect(resume.experience?.[0].endDate).toBe("Present");
  });

  it("always takes contact info and education from the candidate profile, never from generated content", () => {
    const experienceResults: ExperienceGenerationResult[] = [
      { experienceId: "exp_1", bullets: [{ text: "Built authentication APIs", evidenceIds: ["fact_1"], requirementIds: [] }] },
    ];

    const resume = assembleFinalResume(profile, experienceResults, composerResult);
    expect(resume.name).toBe("Jane Doe");
    expect(resume.email).toBe("jane@example.com");
    expect(resume.education).toEqual(profile.education);
  });

  it("clears linkedin rather than surfacing a hallucinated URL when the profile has none", () => {
    const experienceResults: ExperienceGenerationResult[] = [
      { experienceId: "exp_1", bullets: [{ text: "Built authentication APIs", evidenceIds: ["fact_1"], requirementIds: [] }] },
    ];
    const resume = assembleFinalResume(profile, experienceResults, composerResult);
    expect(resume.linkedin).toBe("");
  });

  it("falls back to original facts when no generated bullets exist for an experience", () => {
    const resume = assembleFinalResume(profile, [], composerResult);
    expect(resume.experience?.[0].achievements).toEqual(["Built authentication APIs"]);
  });
});
