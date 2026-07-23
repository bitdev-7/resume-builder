import { describe, expect, it } from "vitest";
import type { JDAnalysis } from "@/lib/types/tailoring";
import {
  MAIN_SKILL_COVERAGE_RATIO,
  bulletMentionsSkill,
  ensureMainSkillBulletCoverage,
  selectMainSkill,
} from "@/lib/tailoring/main-skill-coverage";

function jd(partial: Partial<JDAnalysis> & Pick<JDAnalysis, "requirements">): Pick<JDAnalysis, "requirements" | "atsTerms"> {
  return { atsTerms: [], ...partial };
}

describe("selectMainSkill", () => {
  it("picks highest-priority must_have technology by canonicalTerm", () => {
    const skill = selectMainSkill(
      jd({
        requirements: [
          { id: "r1", text: "Python", type: "must_have", category: "technology", canonicalTerm: "Python", priority: 5 },
          { id: "r2", text: "Java", type: "must_have", category: "technology", canonicalTerm: "Java", priority: 9 },
          { id: "r3", text: "Teamwork", type: "must_have", category: "soft_skill", canonicalTerm: null, priority: 10 },
        ],
      })
    );
    expect(skill).toBe("Java");
  });

  it("falls back to first known atsTerms skill when no must_have tech", () => {
    const skill = selectMainSkill(
      jd({
        requirements: [
          { id: "r1", text: "Communicate well", type: "must_have", category: "soft_skill", canonicalTerm: null, priority: 9 },
        ],
        atsTerms: ["Kubernetes", "Java"],
      })
    );
    expect(skill).toBe("Kubernetes");
  });

  it("returns null when nothing usable", () => {
    expect(selectMainSkill(jd({ requirements: [], atsTerms: [] }))).toBeNull();
  });
});

describe("bulletMentionsSkill", () => {
  it("matches word-boundary skill mentions", () => {
    expect(bulletMentionsSkill("Built APIs in Java and Spring", "Java")).toBe(true);
    expect(bulletMentionsSkill("Built JavaScript UIs", "Java")).toBe(false);
  });
});

describe("ensureMainSkillBulletCoverage", () => {
  it("is a no-op when mainSkill is null or already >= 60%", () => {
    const results = [
      {
        experienceId: "e1",
        bullets: [
          { text: "Built services in Java", evidenceIds: ["f1"], requirementIds: [] },
          { text: "Shipped Java APIs", evidenceIds: [], requirementIds: [] },
          { text: "Mentored teammates", evidenceIds: [], requirementIds: [] },
        ],
      },
    ];
    // 2/3 >= 0.6
    expect(ensureMainSkillBulletCoverage(results, "Java")).toEqual(results);
    expect(ensureMainSkillBulletCoverage(results, null)).toEqual(results);
  });

  it("injects mainSkill into enough uncovered bullets to reach ceil(60%)", () => {
    const results = [
      {
        experienceId: "e1",
        bullets: [
          { text: "Built payment APIs", evidenceIds: ["f1"], requirementIds: [] },
          { text: "Improved latency", evidenceIds: [], requirementIds: [] },
          { text: "Mentored teammates", evidenceIds: [], requirementIds: [] },
          { text: "Owned on-call", evidenceIds: [], requirementIds: [] },
          { text: "Documented runbooks", evidenceIds: [], requirementIds: [] },
        ],
      },
    ];
    // needed = ceil(0.6*5) = 3; currently 0 covered
    const out = ensureMainSkillBulletCoverage(results, "Java");
    const covered = out[0].bullets.filter((b) => bulletMentionsSkill(b.text, "Java")).length;
    expect(covered).toBeGreaterThanOrEqual(Math.ceil(MAIN_SKILL_COVERAGE_RATIO * 5));
    expect(out[0].bullets).toHaveLength(5); // prefer mutate, not append
    expect(out[0].bullets[0].evidenceIds).toEqual(["f1"]);
  });

  it("prefers larger experiences when choosing bullets to rewrite", () => {
    const results = [
      {
        experienceId: "small",
        bullets: [{ text: "Did stuff", evidenceIds: [], requirementIds: [] }],
      },
      {
        experienceId: "large",
        bullets: [
          { text: "Built APIs", evidenceIds: [], requirementIds: [] },
          { text: "Shipped features", evidenceIds: [], requirementIds: [] },
          { text: "Led reviews", evidenceIds: [], requirementIds: [] },
        ],
      },
    ];
    // total 4, needed = ceil(2.4)=3
    const out = ensureMainSkillBulletCoverage(results, "Go");
    const largeCovered = out.find((r) => r.experienceId === "large")!.bullets.filter((b) =>
      bulletMentionsSkill(b.text, "Go")
    ).length;
    expect(largeCovered).toBeGreaterThanOrEqual(2);
  });
});
