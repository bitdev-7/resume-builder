# Fixed Skill Categories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resume hard skills appear only under seven fixed category headings in fixed order; skills under unmappable categories are dropped; soft skills stay separate.

**Architecture:** Add a shared `skill-categories` module (canonical list + alias map + normalizer). Update the composer prompt and always-pass `categoryHints` as the seven labels. Resolve must-keep placements through the alias map (fallback `Tools & Protocols`). Run `normalizeSkillCategories` on composer output and on the final post-`ensureAllEligibleSkills` result before assemble.

**Tech Stack:** TypeScript, Vitest, existing tailoring pipeline (`lib/tailoring/*`, `lib/prompts/composer-prompt.ts`)

## Global Constraints

- Exact category labels (in order): Languages, Backend, Frontend, Database, Cloud & DevOps, Tools & Protocols, Testing
- Soft skills remain in `softSkills[]` only — not one of the seven
- Unknown / unmappable category headings → **drop** those skills (do not fold into Tools & Protocols)
- Empty categories omitted from output
- Must-keep skills with empty or unmappable profile category → place under **Tools & Protocols**
- Spec: `docs/superpowers/specs/2026-07-23-skill-categories-design.md`
- Out of scope: Profile UI dropdown, soft-skill policy changes, full per-skill ontology, mandatory DB catalog cleanup

## File map

| File | Responsibility |
|------|----------------|
| `lib/tailoring/skill-categories.ts` | Canonical labels, alias map, `resolveCanonicalSkillCategory`, `normalizeSkillCategories` |
| `lib/tailoring/skill-categories.test.ts` | Unit tests for resolve + normalize |
| `lib/tailoring/composer.ts` | Fallback category, must-keep placement via resolve, normalize on compose result / fallback |
| `lib/prompts/composer-prompt.ts` | Prompt rules: only the seven categories |
| `lib/tailoring/pipeline.ts` | Pass fixed `categoryHints`; normalize after `ensureAllEligibleSkills` |
| `lib/tailoring/composer.test.ts` | Update must-keep / compose expectations for Tools & Protocols + drop behavior |

Reuse: `skillKey` from `lib/tailoring/skill-ontology.ts`; `assembleFinalResume` unchanged (receives already-normalized map).

---

### Task 1: Canonical skill-categories module (TDD)

**Files:**
- Create: `lib/tailoring/skill-categories.ts`
- Create: `lib/tailoring/skill-categories.test.ts`

**Interfaces:**
- Consumes: nothing from later tasks
- Produces:
  - `CANONICAL_SKILL_CATEGORIES: readonly string[]` — the seven labels in order
  - `FALLBACK_SKILL_CATEGORY: "Tools & Protocols"`
  - `resolveCanonicalSkillCategory(raw: string | null | undefined): string | null` — alias or exact match → canonical label; else `null`
  - `normalizeSkillCategories(skillCategories: Record<string, string[]>): Record<string, string[]>` — remap → drop unknown → dedupe by `skillKey` (first canonical category wins) → order → omit empty

- [ ] **Step 1: Write the failing tests**

Create `lib/tailoring/skill-categories.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- lib/tailoring/skill-categories.test.ts`

Expected: FAIL (module not found / export missing)

- [ ] **Step 3: Write minimal implementation**

Create `lib/tailoring/skill-categories.ts`:

```ts
import { skillKey } from "@/lib/tailoring/skill-ontology";

export const CANONICAL_SKILL_CATEGORIES = [
  "Languages",
  "Backend",
  "Frontend",
  "Database",
  "Cloud & DevOps",
  "Tools & Protocols",
  "Testing",
] as const;

export type CanonicalSkillCategory = (typeof CANONICAL_SKILL_CATEGORIES)[number];

export const FALLBACK_SKILL_CATEGORY: CanonicalSkillCategory = "Tools & Protocols";

/** Lowercase alias / exact label → canonical label */
const CATEGORY_ALIASES: Record<string, CanonicalSkillCategory> = {
  languages: "Languages",
  backend: "Backend",
  frontend: "Frontend",
  database: "Database",
  databases: "Database",
  data: "Database",
  "cloud & devops": "Cloud & DevOps",
  "cloud and devops": "Cloud & DevOps",
  cloud: "Cloud & DevOps",
  devops: "Cloud & DevOps",
  "tools & protocols": "Tools & Protocols",
  "tools & technologies": "Tools & Protocols",
  tools: "Tools & Protocols",
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

/**
 * Remap known aliases, drop skills under unknown headings, dedupe by skill key
 * (earlier canonical category wins), emit only non-empty categories in fixed order.
 */
export function normalizeSkillCategories(
  skillCategories: Record<string, string[]>
): Record<string, string[]> {
  const buckets: Record<string, string[]> = {};
  for (const label of CANONICAL_SKILL_CATEGORIES) {
    buckets[label] = [];
  }

  const seen = new Set<string>();

  // Process in canonical order first for skills already under canonical/aliased keys,
  // then any remaining entries (unknown keys are skipped entirely).
  const entries = Object.entries(skillCategories);
  const orderedEntries = [
    ...CANONICAL_SKILL_CATEGORIES.flatMap((label) =>
      entries.filter(([k]) => resolveCanonicalSkillCategory(k) === label)
    ),
    ...entries.filter(([k]) => resolveCanonicalSkillCategory(k) === null),
  ];
  // Dedupe entry pairs that matched multiple times via flatMap
  const seenEntry = new Set<string>();
  for (const [rawCategory, skills] of orderedEntries) {
    const entryId = `${rawCategory}::${skills.join("\0")}`;
    if (seenEntry.has(entryId)) continue;
    seenEntry.add(entryId);

    const canonical = resolveCanonicalSkillCategory(rawCategory);
    if (!canonical) continue; // drop unknown category entirely

    for (const skill of skills) {
      const key = skillKey(skill);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      buckets[canonical].push(skill);
    }
  }

  const out: Record<string, string[]> = {};
  for (const label of CANONICAL_SKILL_CATEGORIES) {
    if (buckets[label].length > 0) out[label] = buckets[label];
  }
  return out;
}
```

Note: if the orderedEntries dedupe feels fragile, a simpler loop is fine — iterate `Object.entries` once, resolve canonical, skip nulls, push into buckets while tracking `seen` skill keys; then emit in `CANONICAL_SKILL_CATEGORIES` order. Prefer that simpler loop if the flatMap version is confusing:

```ts
export function normalizeSkillCategories(
  skillCategories: Record<string, string[]>
): Record<string, string[]> {
  const buckets: Record<CanonicalSkillCategory, string[]> = {
    Languages: [],
    Backend: [],
    Frontend: [],
    Database: [],
    "Cloud & DevOps": [],
    "Tools & Protocols": [],
    Testing: [],
  };
  const seen = new Set<string>();

  // First pass: collect by canonical label without cross-category skill order yet
  const pending: { category: CanonicalSkillCategory; skill: string }[] = [];
  for (const [rawCategory, skills] of Object.entries(skillCategories)) {
    const canonical = resolveCanonicalSkillCategory(rawCategory);
    if (!canonical) continue;
    for (const skill of skills) {
      if (!skillKey(skill)) continue;
      pending.push({ category: canonical, skill });
    }
  }

  // Assign in canonical category order so earlier category wins on duplicate skills
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

Use the **simpler** second implementation in the PR.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- lib/tailoring/skill-categories.test.ts`

Expected: PASS (all tests green)

- [ ] **Step 5: Commit**

```bash
git add lib/tailoring/skill-categories.ts lib/tailoring/skill-categories.test.ts
git commit -m "feat: add canonical skill category normalizer"
```

---

### Task 2: Wire composer placement + normalize

**Files:**
- Modify: `lib/tailoring/composer.ts`
- Modify: `lib/tailoring/composer.test.ts`

**Interfaces:**
- Consumes: `FALLBACK_SKILL_CATEGORY`, `resolveCanonicalSkillCategory`, `normalizeSkillCategories`, `CANONICAL_SKILL_CATEGORIES` from Task 1
- Produces: `ensureAllEligibleSkills` / `buildDeterministicComposerFallback` / `composeResumeTopSection` always emit only canonical (or empty) category keys

- [ ] **Step 1: Update failing expectations in composer tests**

In `lib/tailoring/composer.test.ts`, change the must-keep test so omitted skills without a profile category land under `Tools & Protocols`:

```ts
  it("appends must-keep skills the composer omitted, and leaves present ones untouched", () => {
    const composerResult = {
      summary: "s",
      skillCategories: { Backend: ["Python", "FastAPI"] },
      softSkills: [],
      projects: [],
    };
    const result = ensureAllEligibleSkills(composerResult, ["Python", "FastAPI", "Redis", "Kafka"]);

    expect(result.skillCategories.Backend).toEqual(["Python", "FastAPI"]);
    expect(result.skillCategories["Tools & Protocols"]).toEqual(
      expect.arrayContaining(["Redis", "Kafka"])
    );
  });

  it("maps must-keep profile categories through aliases and drops unmappable headings on normalize", () => {
    const composerResult = {
      summary: "s",
      skillCategories: { Streaming: ["Kafka"], Backend: ["Python"] },
      softSkills: [],
      projects: [],
    };
    const categoryByKey = new Map<string, string>([
      ["redis", "Databases"],
      ["pinecone", "AI/ML"],
    ]);
    const result = ensureAllEligibleSkills(
      composerResult,
      ["Python", "Redis", "Pinecone"],
      categoryByKey
    );
    // Caller may normalize; ensureAllEligibleSkills itself should place via resolve:
    expect(result.skillCategories.Database ?? result.skillCategories.Databases).toBeTruthy();
  });
```

Prefer asserting the **exact** post-ensure shape if `ensureAllEligibleSkills` calls `normalizeSkillCategories` before return (recommended):

```ts
  it("appends must-keep skills under Tools & Protocols when category is unknown", () => {
    const composerResult = {
      summary: "s",
      skillCategories: { Backend: ["Python", "FastAPI"] },
      softSkills: [],
      projects: [],
    };
    const result = ensureAllEligibleSkills(composerResult, ["Python", "FastAPI", "Redis", "Kafka"]);
    expect(result.skillCategories).toEqual({
      Backend: ["Python", "FastAPI"],
      "Tools & Protocols": ["Redis", "Kafka"],
    });
  });

  it("uses aliased profile category for must-keep; unmappable profile category → Tools & Protocols; drops invented headings", () => {
    const composerResult = {
      summary: "s",
      skillCategories: { Streaming: ["Kafka"], Backend: ["Python"] },
      softSkills: [],
      projects: [],
    };
    const categoryByKey = new Map<string, string>([
      ["redis", "Databases"],
      ["pinecone", "AI/ML"],
    ]);
    const result = ensureAllEligibleSkills(
      composerResult,
      ["Python", "Redis", "Pinecone", "Kafka"],
      categoryByKey
    );
    expect(result.skillCategories).toEqual({
      Backend: ["Python"],
      Database: ["Redis"],
      "Tools & Protocols": ["Pinecone"],
    });
    // Kafka was only under Streaming → dropped; not re-added unless in eligible list with placement.
    // Kafka is in eligible list with no categoryByKey → Tools & Protocols:
    // Adjust eligible list: if Kafka is eligible with no map entry it should appear under Tools & Protocols.
  });
```

Final recommended must-keep + drop test (use this exact block):

```ts
  it("appends must-keep skills under Tools & Protocols when category is unknown", () => {
    const composerResult = {
      summary: "s",
      skillCategories: { Backend: ["Python", "FastAPI"] },
      softSkills: [],
      projects: [],
    };
    const result = ensureAllEligibleSkills(composerResult, ["Python", "FastAPI", "Redis", "Kafka"]);
    expect(result.skillCategories).toEqual({
      Backend: ["Python", "FastAPI"],
      "Tools & Protocols": ["Redis", "Kafka"],
    });
  });

  it("aliases profile categories, maps unmappable profile cats to Tools & Protocols, drops unknown headings", () => {
    const composerResult = {
      summary: "s",
      skillCategories: { Streaming: ["Kafka"], Backend: ["Python"] },
      softSkills: [],
      projects: [],
    };
    const categoryByKey = new Map<string, string>([
      ["redis", "Databases"],
      ["pinecone", "AI/ML"],
    ]);
    const result = ensureAllEligibleSkills(
      composerResult,
      ["Python", "Redis", "Pinecone"],
      categoryByKey
    );
    expect(result.skillCategories).toEqual({
      Backend: ["Python"],
      Database: ["Redis"],
      "Tools & Protocols": ["Pinecone"],
    });
  });
```

Also add a compose test that unknown AI categories are stripped:

```ts
  it("normalizes composer skillCategories — drops unknown headings", async () => {
    callAIMock.mockResolvedValue({
      providerUsed: "openai",
      modelUsed: "gpt-4.1-mini",
      text: "",
      json: {
        summary: "A".repeat(10),
        skillCategories: {
          Backend: ["Python"],
          Streaming: ["Kafka"],
        },
        softSkills: [],
        projects: [],
      },
      raw: {},
      costUsd: 0,
    });

    const input: ComposerInput = {
      normalizedTitle: "Backend Engineer",
      seniority: "mid",
      domains: [],
      topRequirements: [],
      summaryEvidence: [],
      allowedSkills: ["Python"],
      targetSkills: [],
      categoryHints: [...CANONICAL_SKILL_CATEGORIES],
      projects: [],
    };

    const { result } = await composeResumeTopSection(input, aiRequest);
    expect(result.skillCategories).toEqual({ Backend: ["Python"] });
  });
```

Import `CANONICAL_SKILL_CATEGORIES` from `@/lib/tailoring/skill-categories` in the test file.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- lib/tailoring/composer.test.ts`

Expected: FAIL on new/updated assertions

- [ ] **Step 3: Update `lib/tailoring/composer.ts`**

1. Import:

```ts
import {
  CANONICAL_SKILL_CATEGORIES,
  FALLBACK_SKILL_CATEGORY,
  normalizeSkillCategories,
  resolveCanonicalSkillCategory,
} from "@/lib/tailoring/skill-categories";
```

2. Replace local `FALLBACK_SKILL_CATEGORY` constant and update `ensureAllEligibleSkills`:

```ts
export function ensureAllEligibleSkills(
  composerResult: ComposerResult,
  eligibleSkillNames: string[],
  categoryByKey?: Map<string, string>
): ComposerResult {
  const present = new Set<string>();
  for (const skills of Object.values(composerResult.skillCategories)) {
    for (const s of skills) present.add(skillKey(s));
  }

  const missing: string[] = [];
  const seen = new Set<string>();
  for (const name of eligibleSkillNames) {
    const key = skillKey(name);
    if (present.has(key) || seen.has(key)) continue;
    seen.add(key);
    missing.push(name);
  }

  let skillCategories = { ...composerResult.skillCategories };
  for (const name of missing) {
    const knownRaw = categoryByKey?.get(skillKey(name))?.trim();
    const category =
      resolveCanonicalSkillCategory(knownRaw) ?? FALLBACK_SKILL_CATEGORY;
    skillCategories[category] = [...(skillCategories[category] ?? []), name];
  }

  skillCategories = normalizeSkillCategories(skillCategories);
  return { ...composerResult, skillCategories };
}
```

3. Update `buildDeterministicComposerFallback` to put skills under `FALLBACK_SKILL_CATEGORY` and normalize:

```ts
export function buildDeterministicComposerFallback(input: {
  normalizedTitle: string;
  allowedSkills: string[];
  categoryHints: string[];
}): ComposerResult {
  const topSkills = input.allowedSkills.slice(0, 20);
  const highlight = input.allowedSkills.slice(0, 3).join(", ");
  const summary = highlight
    ? `${input.normalizedTitle} with hands-on experience across ${highlight}. Focused on delivering well-tested, maintainable solutions aligned with team and business goals.`
    : `${input.normalizedTitle} with a track record of delivering well-tested, maintainable solutions aligned with team and business goals.`;

  return {
    summary,
    skillCategories: normalizeSkillCategories(
      topSkills.length > 0 ? { [FALLBACK_SKILL_CATEGORY]: topSkills } : {}
    ),
    softSkills: [],
    projects: [],
  };
}
```

(`categoryHints` may remain on the input type for call-site compatibility; unused is fine.)

4. At the end of `composeResumeTopSection`, wrap the built map:

```ts
  return {
    result: {
      summary: parsed.data.summary,
      skillCategories: normalizeSkillCategories(skillCategories),
      softSkills: parsed.data.softSkills,
      projects: parsed.data.projects,
    },
    costUsd: resp.costUsd,
  };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- lib/tailoring/composer.test.ts lib/tailoring/skill-categories.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/tailoring/composer.ts lib/tailoring/composer.test.ts
git commit -m "feat: normalize composer skill categories to canonical set"
```

---

### Task 3: Composer prompt + pipeline categoryHints

**Files:**
- Modify: `lib/prompts/composer-prompt.ts`
- Modify: `lib/tailoring/pipeline.ts` (categoryHints line ~350 and normalize before assemble ~412–419)

**Interfaces:**
- Consumes: `CANONICAL_SKILL_CATEGORIES`, `normalizeSkillCategories` from Task 1; updated composer from Task 2
- Produces: prompts that forbid inventing categories; pipeline always passes fixed hints and final-normalized skills

- [ ] **Step 1: Update composer guidance**

In `lib/prompts/composer-prompt.ts`, replace the Final skills policy bullet that currently says:

```
- Group all final skills into role-appropriate categories drawn from the provided "categoryHints"; you may add a clearly-named category if some skills do not fit any hint. Every skill must land in exactly one category.
```

with:

```
- Group hard skills ONLY into these exact category names (and only these): Languages, Backend, Frontend, Database, Cloud & DevOps, Tools & Protocols, Testing. Use the provided "categoryHints" list — it is exactly those seven labels. Do NOT invent any other category heading. If a skill does not fit any of the seven, omit it from skillCategories. Every included hard skill must land in exactly one of those categories.
- Soft skills: only include ones actually relevant to the role in softSkills; never put soft skills inside skillCategories. It is fine to return an empty softSkills list.
```

Remove the duplicate older soft-skills bullet if it becomes redundant (keep a single soft-skills rule).

Optionally tighten the contract comment to:

```
  "skillCategories": { "<one of: Languages|Backend|Frontend|Database|Cloud & DevOps|Tools & Protocols|Testing>": string[] },
```

- [ ] **Step 2: Update pipeline categoryHints + final normalize**

In `lib/tailoring/pipeline.ts`:

1. Import:

```ts
import {
  CANONICAL_SKILL_CATEGORIES,
  normalizeSkillCategories,
} from "@/lib/tailoring/skill-categories";
```

2. Replace:

```ts
    categoryHints: Array.from(new Set([...profileSkillCategoryOrder, ...catalogEntry.skillCategoryHints])),
```

with:

```ts
    categoryHints: [...CANONICAL_SKILL_CATEGORIES],
```

(`profileSkillCategoryOrder` may become unused for hints — keep building `profileSkillCategoryByKey` for must-keep placement.)

3. After `ensureAllEligibleSkills`, normalize again before assemble (safe even if already normalized):

```ts
  const finalComposerResult = {
    ...ensureAllEligibleSkills(
      repairOutcome.composerResult,
      [...targetSkillNames, ...introducedSkillNames],
      profileSkillCategoryByKey
    ),
  };
  finalComposerResult.skillCategories = normalizeSkillCategories(
    finalComposerResult.skillCategories
  );
```

Or cleaner:

```ts
  const ensured = ensureAllEligibleSkills(
    repairOutcome.composerResult,
    [...targetSkillNames, ...introducedSkillNames],
    profileSkillCategoryByKey
  );
  const finalComposerResult = {
    ...ensured,
    skillCategories: normalizeSkillCategories(ensured.skillCategories),
  };
```

- [ ] **Step 3: Run focused + pipeline tests**

Run:

```bash
npm test -- lib/tailoring/skill-categories.test.ts lib/tailoring/composer.test.ts lib/tailoring/pipeline.test.ts lib/tailoring/validators.test.ts lib/tailoring/repair.test.ts
```

Expected: PASS. Fix any assertions that expect `Tools & Technologies` or freeform headings (e.g. `Streaming`).

- [ ] **Step 4: Commit**

```bash
git add lib/prompts/composer-prompt.ts lib/tailoring/pipeline.ts lib/tailoring/*.test.ts
git commit -m "feat: lock resume skill headings to seven canonical categories"
```

---

## Spec coverage self-check

| Spec requirement | Task |
|------------------|------|
| Seven exact labels in order | Task 1 |
| Soft skills separate | Task 3 prompt (unchanged softSkills path) |
| Alias remap | Task 1 |
| Unknown → drop | Task 1 + Task 2 |
| Must-keep empty/unmappable → Tools & Protocols | Task 2 |
| Prompt only seven | Task 3 |
| Fixed categoryHints | Task 3 |
| Normalize after compose / ensure | Task 2 + Task 3 |
| Fallback string Tools & Protocols | Task 2 |
| Unit tests | Task 1 + Task 2 |
| Optional catalog JSON cleanup | Skipped (YAGNI / out of required scope) |

## Placeholder scan

No TBD / “implement later” steps. Exact code and commands included.

## Type consistency

- `FALLBACK_SKILL_CATEGORY` = `"Tools & Protocols"` everywhere
- `resolveCanonicalSkillCategory` → `CanonicalSkillCategory | null`
- `normalizeSkillCategories` → `Record<string, string[]>`
