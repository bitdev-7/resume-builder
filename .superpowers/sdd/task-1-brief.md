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
