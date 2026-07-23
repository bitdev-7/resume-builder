import { describe, expect, it, vi } from "vitest";
import type { ResolvedAIRequest } from "@/lib/ai-api";
import type { LegacyAnalyzeProfile } from "@/lib/mappers/profile-to-resume";

interface MockAIMessage {
  role: string;
  content: string;
}

const callAIMock = vi.fn();
const sentMessages: MockAIMessage[] = [];

vi.mock("@/lib/ai-provider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai-provider")>();
  return { ...actual, callAI: callAIMock };
});

const { runTailoringPipeline } = await import("@/lib/tailoring/pipeline");

const CANDIDATE_EMAIL = "jane.doe@example.com";
const CANDIDATE_PHONE = "555-867-5309";

function profileData(): LegacyAnalyzeProfile {
  return {
    default_resume: {
      name: "Jane Doe",
      email: CANDIDATE_EMAIL,
      phone: CANDIDATE_PHONE,
      location: "Remote",
      linkedin: "",
      hardSkills: { Backend: ["Python"] },
      softSkills: [],
      education: [{ degree: "B.S. Computer Science", school: "State University", graduationDate: "05/2018" }],
      certifications: [],
      projects: [],
    },
    company_1: {
      title: "Backend Engineer",
      company: "Acme Corp",
      startDate: "01/2022",
      endDate: "Present",
      achievements: ["Built FastAPI services on PostgreSQL for the checkout flow"],
    },
    company_2: null,
    company_3: null,
    company_4: null,
    company_5: null,
  };
}

const aiRequest: ResolvedAIRequest = { useOpenRouter: true, model: "openai/gpt-4.1-mini" };

describe("tailoring pipeline — end to end (mocked AI)", () => {
  it("Case 18: never sends candidate contact info to any AI call, and always assembles identity from the profile", async () => {
    sentMessages.length = 0;

    callAIMock.mockImplementation(async (opts: { messages: MockAIMessage[] }) => {
      sentMessages.push(...opts.messages);
      const systemContent = opts.messages.find((m) => m.role === "system")!.content;
      const userContent = opts.messages.find((m) => m.role === "user")!.content;

      if (systemContent.includes("JD Analyzer stage")) {
        return {
          providerUsed: "openai",
          modelUsed: "gpt-4.1-mini",
          text: "",
          json: {
            normalizedTitle: "Backend Engineer",
            seniority: "mid",
            roleFamily: "software_engineering",
            domains: [],
            requirements: [
              { text: "Python", type: "must_have", category: "technology", canonicalTerm: "Python" },
              { text: "FastAPI", type: "must_have", category: "technology", canonicalTerm: "FastAPI" },
            ],
            responsibilityThemes: [],
            atsTerms: [],
          },
          raw: {},
          costUsd: 0.001,
        };
      }

      if (systemContent.includes("Experience Writer stage")) {
        const parsed = JSON.parse(userContent.split("\n\nPREVIOUS")[0].split("\n\nADDITIONAL")[0]);
        // Batched call: user payload is { experiences: [...] }; return one entry per input experience.
        const inputExperiences: Array<{
          experienceId: string;
          allowedEvidence: Array<{ id: string }>;
        }> = parsed.experiences ?? [
          { experienceId: parsed.experienceId, allowedEvidence: parsed.allowedEvidence },
        ];
        return {
          providerUsed: "openai",
          modelUsed: "gpt-4.1-mini",
          text: "",
          json: {
            experiences: inputExperiences.map((exp) => ({
              experienceId: exp.experienceId,
              bullets: [
                {
                  text: "Architected Python and FastAPI services powering the checkout flow",
                  evidenceIds: [exp.allowedEvidence[0].id],
                  requirementIds: [],
                },
              ],
            })),
          },
          raw: {},
          costUsd: 0.001,
        };
      }

      if (systemContent.includes("Final Composer stage")) {
        return {
          providerUsed: "openai",
          modelUsed: "gpt-4.1-mini",
          text: "",
          json: {
            summary:
              "Backend engineer with hands-on Python and FastAPI experience building reliable services that support critical business workflows across teams and products consistently over time.",
            skillCategories: { Backend: ["Python", "FastAPI"] },
            softSkills: ["Leadership"],
            projects: [],
          },
          raw: {},
          costUsd: 0.001,
        };
      }

      throw new Error(`Unexpected AI call in test: ${systemContent.slice(0, 50)}`);
    });

    const result = await runTailoringPipeline({
      jd: "Looking for a Backend Engineer with Python and FastAPI experience.",
      profileData: profileData(),
      aiRequest,
    });

    // Contact privacy: no AI call should ever have seen the candidate's email or phone.
    const allSentText = sentMessages.map((m) => m.content).join("\n");
    expect(allSentText).not.toContain(CANDIDATE_EMAIL);
    expect(allSentText).not.toContain(CANDIDATE_PHONE);

    // Identity is assembled from the profile, not the AI.
    expect(result.resume.name).toBe("Jane Doe");
    expect(result.resume.email).toBe(CANDIDATE_EMAIL);
    expect(result.resume.experience?.[0].company).toBe("Acme Corp");
    expect(result.resume.experience?.[0].title).toBe("Backend Engineer");
    expect(result.resume.experience?.[0].startDate).toBe("01/2022");

    // Tailored content came from the generation stages.
    expect(result.resume.experience?.[0].achievements?.[0]).toContain("FastAPI");
    expect(result.resume.hardSkills).toEqual({ Backend: ["Python", "FastAPI"] });
    expect(result.resume.softSkills).toEqual(["Leadership"]);
    expect(result.roleArchetype.primaryRoleArchetype).toBeTruthy();
    expect(result.generationCostUsd).toBeGreaterThan(0);
  });

  it("falls back to profile hard skills when composer succeeds with empty skillCategories", async () => {
    callAIMock.mockImplementation(async (opts: { messages: MockAIMessage[] }) => {
      const systemContent = opts.messages.find((m) => m.role === "system")!.content;
      const userContent = opts.messages.find((m) => m.role === "user")!.content;

      if (systemContent.includes("JD Analyzer stage")) {
        return {
          providerUsed: "openai",
          modelUsed: "gpt-4.1-mini",
          text: "",
          json: {
            normalizedTitle: "Backend Engineer",
            seniority: "mid",
            roleFamily: "software_engineering",
            domains: [],
            requirements: [
              { text: "Python", type: "must_have", category: "technology", canonicalTerm: "Python" },
            ],
            responsibilityThemes: [],
            atsTerms: [],
          },
          raw: {},
          costUsd: 0.001,
        };
      }

      if (systemContent.includes("Experience Writer stage")) {
        const parsed = JSON.parse(userContent.split("\n\nPREVIOUS")[0].split("\n\nADDITIONAL")[0]);
        const inputExperiences: Array<{
          experienceId: string;
          allowedEvidence: Array<{ id: string }>;
        }> = parsed.experiences ?? [
          { experienceId: parsed.experienceId, allowedEvidence: parsed.allowedEvidence },
        ];
        return {
          providerUsed: "openai",
          modelUsed: "gpt-4.1-mini",
          text: "",
          json: {
            experiences: inputExperiences.map((exp) => ({
              experienceId: exp.experienceId,
              bullets: [
                {
                  text: "Built Python services for the checkout flow",
                  evidenceIds: [exp.allowedEvidence[0].id],
                  requirementIds: [],
                },
              ],
            })),
          },
          raw: {},
          costUsd: 0.001,
        };
      }

      if (systemContent.includes("Final Composer stage")) {
        return {
          providerUsed: "openai",
          modelUsed: "gpt-4.1-mini",
          text: "",
          json: {
            summary:
              "Backend engineer with hands-on Python experience building reliable services that support critical business workflows across teams and products consistently over time.",
            skillCategories: {},
            softSkills: [],
            projects: [],
          },
          raw: {},
          costUsd: 0.001,
        };
      }

      throw new Error(`Unexpected AI call in test: ${systemContent.slice(0, 50)}`);
    });

    const result = await runTailoringPipeline({
      jd: "Looking for a Backend Engineer with Python experience.",
      profileData: profileData(),
      aiRequest,
    });

    expect(result.resume.hardSkills).toEqual({ Backend: ["Python"] });
    expect(result.resume.softSkills).toEqual([]);
  });

  it("throws a clear error when the profile has no work experience", async () => {
    const empty = profileData();
    empty.company_1 = null;

    await expect(
      runTailoringPipeline({ jd: "Some JD", profileData: empty, aiRequest })
    ).rejects.toThrow(/work experience/i);
  });
});
