import { describe, expect, it } from "vitest";
import { buildProfileHardSkills } from "@/lib/tailoring/profile-hard-skills";

describe("buildProfileHardSkills", () => {
  it("copies skills categories as-is and preserves order", () => {
    const out = buildProfileHardSkills({
      skills: {
        Languages: ["Python", "Go"],
        Backend: ["FastAPI"],
      },
    });
    expect(Object.keys(out)).toEqual(["Languages", "Backend"]);
    expect(out.Languages).toEqual(["Python", "Go"]);
    expect(out.Backend).toEqual(["FastAPI"]);
  });

  it("excludes Soft Skills category (case-insensitive)", () => {
    const out = buildProfileHardSkills({
      skills: {
        Backend: ["Python"],
        "Soft Skills": ["Leadership"],
        "soft skills": ["Communication"],
      },
    });
    expect(out).toEqual({ Backend: ["Python"] });
  });

  it("merges hardSkills when skills missing or for additional categories", () => {
    const out = buildProfileHardSkills({
      skills: { Backend: ["Python"] },
      hardSkills: { Frontend: ["React"], Backend: ["Django"] },
    });
    expect(out.Backend).toEqual(["Python", "Django"]);
    expect(out.Frontend).toEqual(["React"]);
  });

  it("returns {} for null/undefined/empty", () => {
    expect(buildProfileHardSkills(null)).toEqual({});
    expect(buildProfileHardSkills(undefined)).toEqual({});
    expect(buildProfileHardSkills({})).toEqual({});
  });

  it("dedupes within a category by skill key, keeps first spelling", () => {
    const out = buildProfileHardSkills({
      skills: { Backend: ["Python", "python", "FastAPI"] },
    });
    expect(out.Backend).toEqual(["Python", "FastAPI"]);
  });
});
