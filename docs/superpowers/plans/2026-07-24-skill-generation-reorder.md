# Skill Reorder + Expanded Categories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resume skills start from the profile set, reorder by JD priority, add only missing JD-required skills, and use the new 12-category taxonomy (Mobile/ML omit when empty).

**Architecture:** Update the shared `skill-categories` module (12 labels, aliases, `APIs & Protocols` fallback). Rewrite composer Final skills policy for reorder-first + JD-gap adds only. Pipeline already passes `[...CANONICAL_SKILL_CATEGORIES]` and re-normalizes — it picks up the new list automatically. Soft skills stay separate.

**Tech Stack:** TypeScript, Vitest, existing tailoring composer/pipeline

## Global Constraints

- Exact category labels in order: Languages, AI & Generative AI, Data Engineering, Backend, Frontend, Mobile Development, Machine Learning, APIs & Protocols, Databases, Cloud & DevOps, Security & Compliance, Testing
- Mobile Development and Machine Learning are JD-gated: omit when empty (prompt should leave them empty on non-mobile/non-ML JDs)
- Never invent category headings outside the 12
- Empty headings omitted for all categories
- Skills policy: reorder profile/`allowedSkills` by JD priority; add only missing JD-required (`targetSkills`) gaps; do not invent large non-JD stacks
- `FALLBACK_SKILL_CATEGORY` = `APIs & Protocols`
- Soft skills remain in `softSkills[]` only
- Spec: `docs/superpowers/specs/2026-07-24-skill-generation-reorder-design.md`
- Out of scope: Profile UI dropdown, per-skill ontology auto-bucket, soft-skill policy, printing empty always-on headings

## File map

| File | Responsibility |
|------|----------------|
| `lib/tailoring/skill-categories.ts` | 12 labels, aliases, fallback, normalize |
| `lib/tailoring/skill-categories.test.ts` | Unit tests for resolve + normalize |
| `lib/prompts/composer-prompt.ts` | Final skills policy + contract comment |
| `lib/tailoring/composer.ts` | Comment text only if it still says Tools & Protocols |
| `lib/tailoring/composer.test.ts` | Expect `APIs & Protocols` fallback |
| `lib/tailoring/pipeline.ts` | No logic change required (uses `CANONICAL_SKILL_CATEGORIES`); optional stale-comment cleanup |

---

### Task 1: Expand skill-categories module (TDD)

**Files:**
- Modify: `lib/tailoring/skill-categories.ts`
- Modify: `lib/tailoring/skill-categories.test.ts`

**Interfaces:**
- Consumes: `skillKey` from ontology
- Produces (unchanged names, new values):
  - `CANONICAL_SKILL_CATEGORIES: readonly string[]` — the 12 labels in order
  - `FALLBACK_SKILL_CATEGORY: "APIs & Protocols"`
  - `resolveCanonicalSkillCategory(raw): CanonicalSkillCategory | null`
  - `normalizeSkillCategories(map): Record<string, string[]>`

- [ ] **Step 1: Rewrite failing tests**

Replace `lib/tailoring/skill-categories.test.ts` with:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- lib/tailoring/skill-categories.test.ts`

Expected: FAIL (old 7-label expectations / missing aliases)

- [ ] **Step 3: Implement `lib/tailoring/skill-categories.ts`**

```ts
import { skillKey } from "@/lib/tailoring/skill-ontology";

export const CANONICAL_SKILL_CATEGORIES = [
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
] as const;

export type CanonicalSkillCategory = (typeof CANONICAL_SKILL_CATEGORIES)[number];

export const FALLBACK_SKILL_CATEGORY: CanonicalSkillCategory = "APIs & Protocols";

const CATEGORY_ALIASES: Record<string, CanonicalSkillCategory> = {
  languages: "Languages",
  "ai & generative ai": "AI & Generative AI",
  ai: "AI & Generative AI",
  "generative ai": "AI & Generative AI",
  "data engineering": "Data Engineering",
  data: "Data Engineering",
  backend: "Backend",
  frontend: "Frontend",
  "mobile development": "Mobile Development",
  mobile: "Mobile Development",
  "machine learning": "Machine Learning",
  ml: "Machine Learning",
  "apis & protocols": "APIs & Protocols",
  apis: "APIs & Protocols",
  "api & protocols": "APIs & Protocols",
  "tools & protocols": "APIs & Protocols",
  "tools & technologies": "APIs & Protocols",
  tools: "APIs & Protocols",
  databases: "Databases",
  database: "Databases",
  "cloud & devops": "Cloud & DevOps",
  "cloud and devops": "Cloud & DevOps",
  cloud: "Cloud & DevOps",
  devops: "Cloud & DevOps",
  "security & compliance": "Security & Compliance",
  security: "Security & Compliance",
  compliance: "Security & Compliance",
  testing: "Testing",
  "testing & tools": "Testing",
};

export function resolveCanonicalSkillCategory(
  raw: string | null | undefined
): CanonicalSkillCategory | null {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (!trimmed) return null;
  return CATEGORY_ALIASES[trimmed.toLowerCase()] ?? null;
}

export function normalizeSkillCategories(
  skillCategories: Record<string, string[]>
): Record<string, string[]> {
  const buckets = Object.fromEntries(
    CANONICAL_SKILL_CATEGORIES.map((label) => [label, [] as string[]])
  ) as Record<CanonicalSkillCategory, string[]>;

  const seen = new Set<string>();
  const pending: { category: CanonicalSkillCategory; skill: string }[] = [];

  for (const [rawCategory, skills] of Object.entries(skillCategories)) {
    const canonical = resolveCanonicalSkillCategory(rawCategory);
    if (!canonical) continue;
    for (const skill of skills) {
      if (!skillKey(skill)) continue;
      pending.push({ category: canonical, skill });
    }
  }

  for (const label of CANONICAL_SKILL_CATEGORIES) {
    for (const item of pending) {
      if (item.category !== label) continue;
      const key = skillKey(item.skill);
      if (seen.has(key)) continue;
      seen.add(key);
      buckets[label].push(item.skill);
    }
  }

  const out: Record<string, string[]> = {};
  for (const label of CANONICAL_SKILL_CATEGORIES) {
    if (buckets[label].length > 0) out[label] = buckets[label];
  }
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- lib/tailoring/skill-categories.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/tailoring/skill-categories.ts lib/tailoring/skill-categories.test.ts
git commit -m "feat: expand canonical skill categories to twelve labels"
```

---

### Task 2: Composer prompt + test expectation updates

**Files:**
- Modify: `lib/prompts/composer-prompt.ts`
- Modify: `lib/tailoring/composer.test.ts`
- Modify: `lib/tailoring/composer.ts` (doc comment only — replace Tools & Protocols → APIs & Protocols)

**Interfaces:**
- Consumes: updated `FALLBACK_SKILL_CATEGORY` / `CANONICAL_SKILL_CATEGORIES` from Task 1
- Produces: prompt that encodes reorder-first + JD-gap-only + 12 categories + Mobile/ML gating

- [ ] **Step 1: Update failing composer tests**

In `lib/tailoring/composer.test.ts`, replace every expected `"Tools & Protocols"` with `"APIs & Protocols"`, including test titles:

- `"appends must-keep skills under APIs & Protocols when category is unknown"`
- Expectation objects using `"APIs & Protocols": [...]`
- `"re-places eligible skills listed under non-canonical headings"` → Tools → APIs & Protocols

- [ ] **Step 2: Run composer tests to verify they fail**

Run: `npm test -- lib/tailoring/composer.test.ts`

Expected: FAIL on assertion strings still expecting Tools & Protocols from runtime fallback (after Step 1 expectations change, runtime still returns APIs & Protocols from Task 1 — if Task 1 already landed, Step 1 alone may already PASS for ensure tests). If Task 1 is done, ensure tests should PASS after Step 1; still update prompt in Step 3.

- [ ] **Step 3: Update composer prompt**

In `lib/prompts/composer-prompt.ts`, replace the **Final skills policy** bullets (the block currently about allowedSkills / dynamic add / seven categories) with:

```
Final skills policy:
- Baseline: start from "allowedSkills" (the candidate's existing skill set). Keep those skills as the foundation of the skills section. You may omit a skill only when it is clearly unrelated to the job description and targetSkills.
- Reorder: within each category, list JD-required / high-priority technologies (targetSkills and must-have JD tech) first, then remaining baseline skills.
- Add gaps only: if a targetSkills entry (JD-required technology) is missing from the baseline, ADD it under the correct category. Do NOT invent large sets of extra role/ecosystem skills that are not in allowedSkills and not in targetSkills.
- Prefer concrete technologies over generic soft labels. Deduplicate near-aliases (e.g. do not list both "JS" and "JavaScript").
- Group hard skills ONLY into these exact category names (and only these), in this conceptual order: Languages, AI & Generative AI, Data Engineering, Backend, Frontend, Mobile Development, Machine Learning, APIs & Protocols, Databases, Cloud & DevOps, Security & Compliance, Testing. Use the provided "categoryHints" list. Do NOT invent any other category heading. If a skill does not fit any of these, omit it from skillCategories.
- JD-gated categories: omit "Mobile Development" and "Machine Learning" entirely when the job is not about mobile apps or machine learning (unless allowedSkills clearly includes mobile/ML technologies that belong there). All other category names remain allowed; still omit a category from the JSON when it has no skills (no empty arrays needed).
- Soft skills: only include ones actually relevant to the role in softSkills; never put soft skills inside skillCategories. It is fine to return an empty softSkills list.
```

Update `COMPOSER_CONTRACT` skillCategories line to:

```
  "skillCategories": { "<one of: Languages|AI & Generative AI|Data Engineering|Backend|Frontend|Mobile Development|Machine Learning|APIs & Protocols|Databases|Cloud & DevOps|Security & Compliance|Testing>": string[] },
```

Also in `lib/tailoring/composer.ts`, update the doc comment on `ensureAllEligibleSkills` that still says `"Tools & Protocols"` to say `"APIs & Protocols"`.

- [ ] **Step 4: Run focused suites**

Run:

```bash
npm test -- lib/tailoring/skill-categories.test.ts lib/tailoring/composer.test.ts lib/tailoring/pipeline.test.ts lib/tailoring/validators.test.ts lib/tailoring/repair.test.ts
```

Expected: PASS (pipeline already spreads `CANONICAL_SKILL_CATEGORIES`)

- [ ] **Step 5: Commit**

```bash
git add lib/prompts/composer-prompt.ts lib/tailoring/composer.test.ts lib/tailoring/composer.ts
git commit -m "feat: reorder profile skills and lock twelve category prompt"
```

---

### Task 3: Pipeline comment cleanup (optional small)

**Files:**
- Modify: `lib/tailoring/pipeline.ts` (comment near profileSkillCategoryByKey / categoryHints only)

**Interfaces:** none new

- [ ] **Step 1: Fix stale comments**

If comments still say profile categories “hint the composer’s grouping” or mention seven labels / Tools & Protocols, update them to:

- `profileSkillCategoryByKey` is for must-keep placement only
- `categoryHints` is always the twelve canonical labels from `CANONICAL_SKILL_CATEGORIES`

No behavior change.

- [ ] **Step 2: Run pipeline test once**

Run: `npm test -- lib/tailoring/pipeline.test.ts`

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add lib/tailoring/pipeline.ts
git commit -m "docs: clarify skill categoryHints use twelve canonical labels"
```

If there is nothing to change, skip the commit and mark the task complete with a note in the report.

---

## Spec coverage self-check

| Spec requirement | Task |
|------------------|------|
| 12 exact labels in order | Task 1 |
| FALLBACK = APIs & Protocols | Task 1 |
| Alias remap (legacy + new) | Task 1 |
| Unknown → drop; empty omit | Task 1 |
| Mobile/ML keep when non-empty | Task 1 |
| Reorder + JD-gap-only prompt | Task 2 |
| Soft skills separate | Task 2 |
| Pipeline categoryHints = canonical list | Already wired; Task 1 updates list; Task 3 comments |
| ensureAllEligibleSkills fallback | Task 1 constant + Task 2 tests |

## Placeholder scan

No TBD / implement-later steps.

## Type consistency

- `FALLBACK_SKILL_CATEGORY` = `"APIs & Protocols"` everywhere
- Plural `Databases` (not `Database`)
- Legacy `Tools & Protocols` aliases → `APIs & Protocols`
