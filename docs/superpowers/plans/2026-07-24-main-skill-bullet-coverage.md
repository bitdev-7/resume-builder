# Main-Skill Bullet Coverage (≥60%) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure the JD’s top must-have technology (`mainSkill`) appears in at least 60% of all experience bullets via prompt guidance plus deterministic top-up.

**Architecture:** Add `selectMainSkill` + `ensureMainSkillBulletCoverage` helpers. Pass `mainSkill` into experience writer inputs/prompts. After `ensureTargetSkillsInExperiences`, run coverage top-up before assemble.

**Tech Stack:** TypeScript, Vitest, existing experience writer + pipeline

## Global Constraints

- Main skill = highest-priority must_have technology (canonicalTerm / known skill); else first known `atsTerms` skill; else skip
- Coverage ≥ 0.60 of all experience bullets (`ceil(0.60 * total)`)
- Word-boundary / ontology-compatible mention check (same rigor as target-skill ensure)
- Prefer rewriting existing bullets over appending new ones; no fabricated metrics
- Order: `ensureTargetSkillsInExperiences` then `ensureMainSkillBulletCoverage`
- Spec: `docs/superpowers/specs/2026-07-24-main-skill-bullet-coverage-design.md`
- Out of scope: full skill-focused rewrite product, skills-section changes

## File map

| File | Responsibility |
|------|----------------|
| `lib/tailoring/main-skill-coverage.ts` | `selectMainSkill`, `bulletMentionsSkill`, `ensureMainSkillBulletCoverage`, `MAIN_SKILL_COVERAGE_RATIO` |
| `lib/tailoring/main-skill-coverage.test.ts` | Unit tests |
| `lib/prompts/experience-writer-prompt.ts` | `mainSkill` on input + guidance + payload |
| `lib/tailoring/pipeline.ts` | Compute mainSkill, pass to writers, call ensure after target-skill ensure |
| `lib/tailoring/experience-generator.test.ts` | Allow optional `mainSkill` on fixtures if required |

Reuse: `normalizeSkillName`, `skillKey`, `detectSkillMentions` from `skill-ontology.ts`; `escapeRegExp` pattern from `pipeline.ts` (extract shared or duplicate small helper in main-skill-coverage).

---

### Task 1: Main-skill selection + coverage ensure (TDD)

**Files:**
- Create: `lib/tailoring/main-skill-coverage.ts`
- Create: `lib/tailoring/main-skill-coverage.test.ts`

**Interfaces:**
- `MAIN_SKILL_COVERAGE_RATIO = 0.6`
- `selectMainSkill(jdAnalysis: Pick<JDAnalysis, "requirements" | "atsTerms">): string | null`
- `bulletMentionsSkill(text: string, skillName: string): boolean`
- `ensureMainSkillBulletCoverage(results: ExperienceGenerationResult[], mainSkill: string | null, minRatio?: number): ExperienceGenerationResult[]`

- [ ] **Step 1: Write failing tests**

```ts
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
```

- [ ] **Step 2: Run — expect FAIL**

`npm test -- lib/tailoring/main-skill-coverage.test.ts`

- [ ] **Step 3: Implement `lib/tailoring/main-skill-coverage.ts`**

```ts
import type { ExperienceGenerationResult, JDAnalysis } from "@/lib/types/tailoring";
import { normalizeSkillName } from "@/lib/tailoring/skill-ontology";

export const MAIN_SKILL_COVERAGE_RATIO = 0.6;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function bulletMentionsSkill(text: string, skillName: string): boolean {
  const canonical = normalizeSkillName(skillName) || skillName;
  if (!canonical.trim()) return false;
  const re = new RegExp(
    `(^|[^a-z0-9+#.])${escapeRegExp(canonical.toLowerCase())}([^a-z0-9+#]|$)`,
    "i"
  );
  return re.test(String(text || "").toLowerCase());
}

export function selectMainSkill(
  jdAnalysis: Pick<JDAnalysis, "requirements" | "atsTerms">
): string | null {
  const mustTech = jdAnalysis.requirements
    .filter(
      (r) =>
        r.type === "must_have" &&
        (r.category === "technology" || Boolean(r.canonicalTerm))
    )
    .slice()
    .sort((a, b) => b.priority - a.priority);

  for (const r of mustTech) {
    const raw = (r.canonicalTerm || r.text || "").trim();
    const canonical = normalizeSkillName(raw);
    if (canonical) return canonical;
  }

  for (const term of jdAnalysis.atsTerms ?? []) {
    const canonical = normalizeSkillName(String(term || "").trim());
    if (canonical) return canonical;
  }
  return null;
}

function injectSkillIntoBullet(text: string, skill: string): string {
  const trimmed = text.trim().replace(/\.$/, "");
  return `${trimmed} using ${skill}.`;
}

export function ensureMainSkillBulletCoverage(
  results: ExperienceGenerationResult[],
  mainSkill: string | null,
  minRatio: number = MAIN_SKILL_COVERAGE_RATIO
): ExperienceGenerationResult[] {
  if (!mainSkill || results.length === 0) return results;

  const total = results.reduce((n, r) => n + r.bullets.length, 0);
  if (total === 0) return results;

  const needed = Math.ceil(minRatio * total);

  type Loc = { expIdx: number; bulletIdx: number; expSize: number };
  const uncovered: Loc[] = [];
  let covered = 0;

  results.forEach((r, expIdx) => {
    r.bullets.forEach((b, bulletIdx) => {
      if (bulletMentionsSkill(b.text, mainSkill)) covered += 1;
      else uncovered.push({ expIdx, bulletIdx, expSize: r.bullets.length });
    });
  });

  if (covered >= needed) return results;

  uncovered.sort((a, b) => b.expSize - a.expSize || a.bulletIdx - b.bulletIdx);

  const next = results.map((r) => ({
    ...r,
    bullets: r.bullets.map((b) => ({ ...b })),
  }));
  let i = 0;
  while (covered < needed && i < uncovered.length) {
    const loc = uncovered[i++];
    const bullet = next[loc.expIdx].bullets[loc.bulletIdx];
    if (bulletMentionsSkill(bullet.text, mainSkill)) continue;
    bullet.text = injectSkillIntoBullet(bullet.text, mainSkill);
    covered += 1;
  }
  return next;
}
```

- [ ] **Step 4: Run — expect PASS**

`npm test -- lib/tailoring/main-skill-coverage.test.ts`

- [ ] **Step 5: Commit**

```bash
git add lib/tailoring/main-skill-coverage.ts lib/tailoring/main-skill-coverage.test.ts
git commit -m "feat: add main-skill bullet coverage helpers"
```

---

### Task 2: Prompt + pipeline wiring

**Files:**
- Modify: `lib/prompts/experience-writer-prompt.ts`
- Modify: `lib/tailoring/pipeline.ts`
- Modify: `lib/tailoring/experience-generator.test.ts` (add `mainSkill: null` or omit if optional)
- Modify: any batched prompt builder that copies `ExperienceWriterInput` fields into JSON

**Interfaces:**
- `ExperienceWriterInput.mainSkill?: string | null`
- Payload includes `mainSkill`
- Pipeline calls `selectMainSkill` + `ensureMainSkillBulletCoverage`

- [ ] **Step 1: Update experience writer guidance**

In both `EXPERIENCE_WRITER_DEFAULT_GUIDANCE` and `EXPERIENCE_WRITER_BATCHED_DEFAULT_GUIDANCE` (if separate skill policy sections), add under Experience skill policy:

```
- mainSkill (when present) is the JD's top must-have technology. Across ALL experiences in this generation, at least ~60% of bullets overall must mention mainSkill by name when historically compatible with the employment dates.
- Spread mainSkill mentions across roles rather than concentrating them in a single bullet when possible.
- Do not force mainSkill into historically incompatible periods; leave those bullets for other skills and rely on compatible roles to meet the overall ratio.
```

Add to `ExperienceWriterInput`:

```ts
  /** Top JD must-have technology to feature in ≥60% of bullets overall; null/omit if none. */
  mainSkill?: string | null;
```

Include `mainSkill: input.mainSkill ?? null` in `buildExperienceWriterUserPrompt` and batched user payload builders.

- [ ] **Step 2: Wire pipeline**

```ts
import {
  ensureMainSkillBulletCoverage,
  selectMainSkill,
} from "@/lib/tailoring/main-skill-coverage";

// after targetSkillNames computed:
const mainSkill = selectMainSkill(jdAnalysis);
console.log(`[tailoring] main skill for 60% coverage: ${mainSkill ?? "(none)"}`);

// in experienceWriterInputsById.set:
mainSkill,

// after ensureTargetSkillsInExperiences(...):
const coveredExperienceResults = ensureMainSkillBulletCoverage(
  ensureTargetSkillsInExperiences(repairOutcome.experienceResults, targetSkillNames),
  mainSkill
);
```

(Adjust if current code assigns `coveredExperienceResults` in two steps — keep target ensure first, then main-skill ensure.)

- [ ] **Step 3: Fix compile breaks in tests**

Add `mainSkill: null` only where object literals require it; prefer optional field.

- [ ] **Step 4: Run focused tests**

```bash
npm test -- lib/tailoring/main-skill-coverage.test.ts lib/tailoring/experience-generator.test.ts lib/tailoring/pipeline.test.ts lib/tailoring/target-skill-coverage.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/prompts/experience-writer-prompt.ts lib/tailoring/pipeline.ts lib/tailoring/experience-generator.test.ts
git commit -m "feat: enforce 60% main-skill coverage in experience bullets"
```

---

## Spec coverage

| Spec item | Task |
|-----------|------|
| selectMainSkill rules | Task 1 |
| ≥60% coverage + ceil | Task 1 |
| Mutate bullets, no metrics | Task 1 |
| Prompt + mainSkill payload | Task 2 |
| Pipeline order target then main | Task 2 |

## Placeholder scan

None.
