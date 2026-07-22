import { describe, expect, it } from "vitest";
import {
  CANONICAL_SKILL_CATEGORIES,
  FALLBACK_SKILL_CATEGORY,
  normalizeSkillCategories,
  resolveCanonicalSkillCategory,
} from "@/lib/tailoring/skill-categories";

describe("CANONICAL_SKILL_CATEGORIES", () => {
  it("is exactly the seven approved labels in order", () => {
    expect([...CANONICAL_SKILL_CATEGORIES]).toEqual([
      "Languages",
      "Backend",
      "Frontend",
      "Database",
      "Cloud & DevOps",
      "Tools & Protocols",
      "Testing",
    ]);
  });

  it("uses Tools & Protocols as the must-keep fallback label", () => {
    expect(FALLBACK_SKILL_CATEGORY).toBe("Tools & Protocols");
  });
});

describe("resolveCanonicalSkillCategory", () => {
  it("returns exact canonical labels", () => {
    expect(resolveCanonicalSkillCategory("Backend")).toBe("Backend");
    expect(resolveCanonicalSkillCategory("cloud & devops")).toBe("Cloud & DevOps");
  });

  it("remaps known aliases", () => {
    expect(resolveCanonicalSkillCategory("Cloud")).toBe("Cloud & DevOps");
    expect(resolveCanonicalSkillCategory("DevOps")).toBe("Cloud & DevOps");
    expect(resolveCanonicalSkillCategory("Cloud and DevOps")).toBe("Cloud & DevOps");
    expect(resolveCanonicalSkillCategory("Testing & Tools")).toBe("Testing");
    expect(resolveCanonicalSkillCategory("Data")).toBe("Database");
    expect(resolveCanonicalSkillCategory("Databases")).toBe("Database");
    expect(resolveCanonicalSkillCategory("Tools & Technologies")).toBe("Tools & Protocols");
    expect(resolveCanonicalSkillCategory("Tools")).toBe("Tools & Protocols");
  });

  it("returns null for unknown or empty names", () => {
    expect(resolveCanonicalSkillCategory("Streaming")).toBeNull();
    expect(resolveCanonicalSkillCategory("AI/ML")).toBeNull();
    expect(resolveCanonicalSkillCategory("")).toBeNull();
    expect(resolveCanonicalSkillCategory(null)).toBeNull();
    expect(resolveCanonicalSkillCategory(undefined)).toBeNull();
    expect(resolveCanonicalSkillCategory("   ")).toBeNull();
  });
});

describe("normalizeSkillCategories", () => {
  it("remaps aliases, drops unknown buckets, orders, and omits empty", () => {
    const out = normalizeSkillCategories({
      Streaming: ["Kafka"],
      Cloud: ["AWS", "Docker"],
      Backend: ["Python"],
      Frontend: [],
      Data: ["PostgreSQL"],
      "Tools & Technologies": ["Git"],
    });
    expect(Object.keys(out)).toEqual([
      "Backend",
      "Database",
      "Cloud & DevOps",
      "Tools & Protocols",
    ]);
    expect(out.Backend).toEqual(["Python"]);
    expect(out.Database).toEqual(["PostgreSQL"]);
    expect(out["Cloud & DevOps"]).toEqual(["AWS", "Docker"]);
    expect(out["Tools & Protocols"]).toEqual(["Git"]);
    expect(out).not.toHaveProperty("Streaming");
    expect(out).not.toHaveProperty("Frontend");
  });

  it("dedupes the same skill across categories — earlier canonical category wins", () => {
    const out = normalizeSkillCategories({
      Testing: ["Jest"],
      Backend: ["Jest", "Python"],
    });
    expect(out.Backend).toEqual(["Jest", "Python"]);
    expect(out).not.toHaveProperty("Testing");
  });
});
