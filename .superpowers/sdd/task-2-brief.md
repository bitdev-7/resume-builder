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
