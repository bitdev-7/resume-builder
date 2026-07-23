import { describe, expect, it } from "vitest";
import {
  CANONICAL_SKILL_CATEGORIES,
  FALLBACK_SKILL_CATEGORY,
  normalizeSkillCategories,
  resolveCanonicalSkillCategory,
} from "@/lib/tailoring/skill-categories";

describe("CANONICAL_SKILL_CATEGORIES", () => {
  it("is exactly the twelve approved labels in order", () => {
    expect([...CANONICAL_SKILL_CATEGORIES]).toEqual([
      "Languages",
      "AI & Generative AI",
      "Data Engineering",
      "Backend",
      "Frontend",
      "Mobile Development",
      "Machine Learning",
      "APIs & Protocols",
      "Databases",
      "Cloud & DevOps",
      "Security & Compliance",
      "Testing",
    ]);
  });

  it("uses APIs & Protocols as the must-keep fallback label", () => {
    expect(FALLBACK_SKILL_CATEGORY).toBe("APIs & Protocols");
  });
});

describe("resolveCanonicalSkillCategory", () => {
  it("returns exact canonical labels (case-insensitive)", () => {
    expect(resolveCanonicalSkillCategory("Backend")).toBe("Backend");
    expect(resolveCanonicalSkillCategory("ai & generative ai")).toBe("AI & Generative AI");
    expect(resolveCanonicalSkillCategory("Databases")).toBe("Databases");
  });

  it("remaps known aliases including legacy seven-label names", () => {
    expect(resolveCanonicalSkillCategory("Cloud")).toBe("Cloud & DevOps");
    expect(resolveCanonicalSkillCategory("DevOps")).toBe("Cloud & DevOps");
    expect(resolveCanonicalSkillCategory("Database")).toBe("Databases");
    expect(resolveCanonicalSkillCategory("Data")).toBe("Data Engineering");
    expect(resolveCanonicalSkillCategory("Tools & Protocols")).toBe("APIs & Protocols");
    expect(resolveCanonicalSkillCategory("Tools & Technologies")).toBe("APIs & Protocols");
    expect(resolveCanonicalSkillCategory("Tools")).toBe("APIs & Protocols");
    expect(resolveCanonicalSkillCategory("AI")).toBe("AI & Generative AI");
    expect(resolveCanonicalSkillCategory("Generative AI")).toBe("AI & Generative AI");
    expect(resolveCanonicalSkillCategory("Security")).toBe("Security & Compliance");
    expect(resolveCanonicalSkillCategory("Mobile")).toBe("Mobile Development");
    expect(resolveCanonicalSkillCategory("ML")).toBe("Machine Learning");
    expect(resolveCanonicalSkillCategory("APIs")).toBe("APIs & Protocols");
  });

  it("returns null for unknown or empty names", () => {
    expect(resolveCanonicalSkillCategory("Streaming")).toBeNull();
    expect(resolveCanonicalSkillCategory("")).toBeNull();
    expect(resolveCanonicalSkillCategory(null)).toBeNull();
  });
});

describe("normalizeSkillCategories", () => {
  it("remaps aliases, drops unknown buckets, orders, omits empty including gated", () => {
    const out = normalizeSkillCategories({
      Streaming: ["Kafka"],
      Cloud: ["AWS"],
      Backend: ["Python"],
      "Mobile Development": [],
      "Machine Learning": [],
      Data: ["Spark"],
      Database: ["PostgreSQL"],
      "Tools & Technologies": ["REST"],
      AI: ["LangChain"],
    });
    expect(Object.keys(out)).toEqual([
      "AI & Generative AI",
      "Data Engineering",
      "Backend",
      "APIs & Protocols",
      "Databases",
      "Cloud & DevOps",
    ]);
    expect(out["AI & Generative AI"]).toEqual(["LangChain"]);
    expect(out["Data Engineering"]).toEqual(["Spark"]);
    expect(out.Backend).toEqual(["Python"]);
    expect(out["APIs & Protocols"]).toEqual(["REST"]);
    expect(out.Databases).toEqual(["PostgreSQL"]);
    expect(out["Cloud & DevOps"]).toEqual(["AWS"]);
    expect(out).not.toHaveProperty("Streaming");
    expect(out).not.toHaveProperty("Mobile Development");
    expect(out).not.toHaveProperty("Machine Learning");
  });

  it("keeps Mobile Development and Machine Learning when non-empty", () => {
    const out = normalizeSkillCategories({
      "Mobile Development": ["Swift"],
      "Machine Learning": ["PyTorch"],
      Backend: ["Go"],
    });
    expect(Object.keys(out)).toEqual([
      "Backend",
      "Mobile Development",
      "Machine Learning",
    ]);
  });

  it("dedupes across categories — earlier canonical category wins", () => {
    const out = normalizeSkillCategories({
      Testing: ["Jest"],
      Backend: ["Jest", "Python"],
    });
    expect(out.Backend).toEqual(["Jest", "Python"]);
    expect(out).not.toHaveProperty("Testing");
  });
});
