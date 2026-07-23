# Profile-Owned Skills Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resume skills section is an exact copy of Profile categories/skills; soft skills empty; composer no longer owns skills (summary + projects only).

**Architecture:** Add `buildProfileHardSkills()` to copy `default_resume.skills` / `hardSkills` (excluding Soft Skills). Assemble uses that map. Pipeline skips `ensureAllEligibleSkills` and `normalizeSkillCategories`. Composer prompt/contract drop skill generation; ignore any model skill fields.

**Tech Stack:** TypeScript, Vitest, existing tailoring pipeline

## Global Constraints

- Copy Profile skill categories as-is (user free-text names); no canonical remap / reorder / JD skill adds on the skills section
- Exclude category `"Soft Skills"` (case-insensitive); always `softSkills: []` on generated resume
- Composer: summary + projects only; thin prompt note that skills come from profile
- Do not call `ensureAllEligibleSkills` or `normalizeSkillCategories` on the resume skills path
- Spec: `docs/superpowers/specs/2026-07-24-profile-owned-skills-design.md`
- Out of scope: Profile UI changes, deleting `skill-categories.ts`, soft skills on PDF, prompt-driven skill rewrite

## File map

| File | Responsibility |
|------|----------------|
| `lib/tailoring/profile-hard-skills.ts` | `buildProfileHardSkills(defaultResume)` pure helper |
| `lib/tailoring/profile-hard-skills.test.ts` | Unit tests for copy / Soft Skills exclude / merge |
| `lib/tailoring/assemble.ts` | Accept profile hardSkills; always empty softSkills |
| `lib/tailoring/assemble.test.ts` | Assert skills from profile arg, not composer |
| `lib/tailoring/pipeline.ts` | Build profile map; skip ensure/normalize; pass into assemble |
| `lib/prompts/composer-prompt.ts` | Remove Final skills rewrite policy; thin profile note; drop skill fields from contract |
| `lib/tailoring/composer.ts` | Return empty skillCategories/softSkills from compose/fallback; stop normalizing AI skills |
| `lib/tailoring/composer.test.ts` | Drop ensure/normalize skill tests; assert empty skills from compose |
| `lib/tailoring/pipeline.test.ts` | Assert resume hardSkills match profile, ignore AI skillCategories |
| `lib/tailoring/schemas.ts` | Make skillCategories/softSkills optional with defaults (already default) — keep accepting for back-compat, ignored |

---

### Task 1: `buildProfileHardSkills` helper (TDD)

**Files:**
- Create: `lib/tailoring/profile-hard-skills.ts`
- Create: `lib/tailoring/profile-hard-skills.test.ts`

**Interfaces:**
- Consumes: profile `default_resume`-shaped object with optional `skills` / `hardSkills`
- Produces: `buildProfileHardSkills(defaultResume: { skills?: Record<string, string[]>; hardSkills?: Record<string, string[]> } | null | undefined): Record<string, string[]>`

- [ ] **Step 1: Write failing tests**

```ts
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
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npm test -- lib/tailoring/profile-hard-skills.test.ts`

- [ ] **Step 3: Implement**

```ts
import { skillKey } from "@/lib/tailoring/skill-ontology";

export type ProfileSkillsSource = {
  skills?: Record<string, string[]>;
  hardSkills?: Record<string, string[]>;
} | null | undefined;

function isSoftSkillsCategory(category: string): boolean {
  return /^soft\s*skills$/i.test(category.trim());
}

/**
 * Resume hard-skills map from Profile — category names and skill lists as stored.
 * Excludes Soft Skills. Does not remap to a canonical taxonomy.
 */
export function buildProfileHardSkills(
  defaultResume: ProfileSkillsSource
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (!defaultResume) return out;

  for (const record of [defaultResume.skills, defaultResume.hardSkills]) {
    if (!record) continue;
    for (const [rawCategory, list] of Object.entries(record)) {
      const category = String(rawCategory || "").trim();
      if (!category || isSoftSkillsCategory(category)) continue;

      const bucket = out[category] ?? [];
      const seen = new Set(bucket.map((s) => skillKey(s)).filter(Boolean));
      for (const raw of list || []) {
        const name = String(raw || "").trim();
        const key = skillKey(name);
        if (!name || !key || seen.has(key)) continue;
        seen.add(key);
        bucket.push(name);
      }
      if (bucket.length > 0) out[category] = bucket;
      else delete out[category];
    }
  }
  return out;
}
```

Note: when first creating a category, use `out[category] ?? []` then assign back so order of first-seen categories is preserved across `skills` then `hardSkills`.

- [ ] **Step 4: Run tests — expect PASS**

Run: `npm test -- lib/tailoring/profile-hard-skills.test.ts`

- [ ] **Step 5: Commit**

```bash
git add lib/tailoring/profile-hard-skills.ts lib/tailoring/profile-hard-skills.test.ts
git commit -m "feat: add profile hard-skills copy helper"
```

---

### Task 2: Assemble + pipeline wire-up

**Files:**
- Modify: `lib/tailoring/assemble.ts`
- Modify: `lib/tailoring/assemble.test.ts`
- Modify: `lib/tailoring/pipeline.ts`
- Modify: `lib/tailoring/pipeline.test.ts`

**Interfaces:**
- Consumes: `buildProfileHardSkills` from Task 1
- Produces: `assembleFinalResume(profile, experienceResults, composerResult, profileHardSkills: Record<string, string[]>)`

- [ ] **Step 1: Update assemble tests (fail first)**

Add to `lib/tailoring/assemble.test.ts`:

```ts
  it("uses profileHardSkills for hardSkills and always empty softSkills (ignores composer skills)", () => {
    const experienceResults: ExperienceGenerationResult[] = [
      { experienceId: "exp_1", bullets: [{ text: "Built authentication APIs", evidenceIds: ["fact_1"], requirementIds: [] }] },
    ];
    const profileHardSkills = { Languages: ["Go"], Backend: ["Python"] };
    const resume = assembleFinalResume(profile, experienceResults, {
      ...composerResult,
      skillCategories: { Invented: ["ShouldNotAppear"] },
      softSkills: ["Leadership"],
    }, profileHardSkills);
    expect(resume.hardSkills).toEqual(profileHardSkills);
    expect(resume.softSkills).toEqual([]);
  });
```

Update existing `assembleFinalResume(...)` call sites in this file to pass `composerResult.skillCategories` or `{}` as the 4th arg so they still compile — prefer `{}` or the old Backend map if a test asserted skills (none currently assert skills deeply).

- [ ] **Step 2: Run assemble tests — expect FAIL** (arity / wrong skills)

Run: `npm test -- lib/tailoring/assemble.test.ts`

- [ ] **Step 3: Update assemble**

```ts
export function assembleFinalResume(
  profile: CandidateProfile,
  experienceResults: ExperienceGenerationResult[],
  composerResult: ComposerResult,
  profileHardSkills: Record<string, string[]>
): UpdatedResume {
  // ... existing experience/projects logic unchanged ...

  return {
    // ... existing identity/summary/experience ...
    summary: composerResult.summary,
    experience,
    hardSkills: profileHardSkills,
    softSkills: [],
    education: profile.education,
    certifications: profile.certifications,
    projects,
  };
}
```

Update the file header comment: skills come from profile, not generation stages.

- [ ] **Step 4: Update pipeline**

1. Import `buildProfileHardSkills`.
2. Early (near profile load):  
   `const profileHardSkills = buildProfileHardSkills(input.profileData.default_resume);`
3. Remove `profileSkillCategoryByKey` loop (only used for ensure).
4. Remove imports/uses of `ensureAllEligibleSkills`, `normalizeSkillCategories`, `CANONICAL_SKILL_CATEGORIES`.
5. For composer input `categoryHints`: pass `Object.keys(profileHardSkills)` (or `[]`) — hints unused for skills output but keep type satisfied.
6. Replace ensure/normalize block with:

```ts
  const finalComposerResult = {
    ...repairOutcome.composerResult,
    skillCategories: profileHardSkills,
    softSkills: [] as string[],
  };

  const resume = assembleFinalResume(
    candidateProfile,
    coveredExperienceResults,
    finalComposerResult,
    profileHardSkills
  );
```

7. Enrichment `skillsOnResume` uses `Object.values(profileHardSkills).flat()`.

- [ ] **Step 5: Update pipeline.test.ts**

- Ensure profile `default_resume` has `skills` or `hardSkills` with known categories.
- Mock composer JSON may still return skillCategories — assert resume uses **profile** skills, not AI Invented ones.
- Example expectation:

```ts
expect(result.resume.hardSkills).toEqual({ Backend: ["Python"] }); // from profile fixture
expect(result.resume.softSkills).toEqual([]);
```

Adjust fixture if currently only `hardSkills: { Backend: ["Python"] }`.

- [ ] **Step 6: Run tests**

```bash
npm test -- lib/tailoring/profile-hard-skills.test.ts lib/tailoring/assemble.test.ts lib/tailoring/pipeline.test.ts
```

Expected: PASS. Fix any other call sites of `assembleFinalResume` (grep) to pass the 4th argument.

- [ ] **Step 7: Commit**

```bash
git add lib/tailoring/assemble.ts lib/tailoring/assemble.test.ts lib/tailoring/pipeline.ts lib/tailoring/pipeline.test.ts
git commit -m "feat: assemble resume skills from profile only"
```

---

### Task 3: Composer prompt + ignore AI skills

**Files:**
- Modify: `lib/prompts/composer-prompt.ts`
- Modify: `lib/tailoring/composer.ts`
- Modify: `lib/tailoring/composer.test.ts`
- Modify: `lib/tailoring/schemas.ts` (optional — keep defaults)
- Modify: `lib/tailoring/repair.test.ts` / `validators.test.ts` only if they break

**Interfaces:**
- Composer still returns `ComposerResult` with empty `skillCategories` / `softSkills`
- `ensureAllEligibleSkills` may remain exported but unused (do not delete in this task unless tests force it — prefer leave + stop importing from pipeline)

- [ ] **Step 1: Rewrite composer skill tests**

Replace skill-category / ensureAllEligibleSkills describes with:

```ts
describe("composer — skills ignored", () => {
  it("returns empty skillCategories and softSkills even if the model sent skills", async () => {
    callAIMock.mockResolvedValue({
      providerUsed: "openai",
      modelUsed: "gpt-4.1-mini",
      text: "",
      json: {
        summary: "A".repeat(80),
        skillCategories: { Backend: ["Python"] },
        softSkills: ["Leadership"],
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
      categoryHints: ["Backend"],
      projects: [],
    };

    const { result } = await composeResumeTopSection(input, aiRequest);
    expect(result.skillCategories).toEqual({});
    expect(result.softSkills).toEqual([]);
  });
});
```

Remove or skip the old ensureAllEligibleSkills test block (or keep testing the helper if left in place — prefer **delete the describe** and leave the function for now unused to avoid maintenance; if deleting tests, keep function until a later cleanup).

- [ ] **Step 2: Run composer tests — expect FAIL**

Run: `npm test -- lib/tailoring/composer.test.ts`

- [ ] **Step 3: Update composer.ts**

In `composeResumeTopSection` return:

```ts
  return {
    result: {
      summary: parsed.data.summary,
      skillCategories: {},
      softSkills: [],
      projects: parsed.data.projects,
    },
    costUsd: resp.costUsd,
  };
```

In `buildDeterministicComposerFallback`:

```ts
  return {
    summary,
    skillCategories: {},
    softSkills: [],
    projects: [],
  };
```

Remove unused imports of `normalizeSkillCategories` / `FALLBACK_SKILL_CATEGORY` / `resolveCanonicalSkillCategory` if no longer referenced. Keep `ensureAllEligibleSkills` in file only if still exported for other imports — grep; if only tests used it, you may leave the function body or delete with tests.

- [ ] **Step 4: Update composer-prompt.ts**

Replace Final skills policy bullets with:

```
Skills:
- Skills and skill categories are taken from the candidate profile as-is by the application. Do not invent skill categories or skill lists. You may omit skillCategories and softSkills from your JSON (they are ignored).
```

Update `COMPOSER_CONTRACT` to:

```
{
  "summary": string,
  "projects": [ { "id": string, "description": string, "technologies": string[] } ]
}
```

Keep schema defaults for optional skill fields so older model output still parses:

In `schemas.ts`, ensure `skillCategories` and `softSkills` remain `.default({})` / `.default([])` (already true).

Update `ComposerInput` usage: `allowedSkills` / `categoryHints` / `targetSkills` can remain in the user payload for summary/project context but prompt should not ask to group skills.

- [ ] **Step 5: Run focused suites**

```bash
npm test -- lib/tailoring/profile-hard-skills.test.ts lib/tailoring/assemble.test.ts lib/tailoring/composer.test.ts lib/tailoring/pipeline.test.ts lib/tailoring/validators.test.ts lib/tailoring/repair.test.ts
```

Expected: PASS. Fix repair/validators only if they assert composer skillCategories on the final resume path incorrectly.

- [ ] **Step 6: Commit**

```bash
git add lib/prompts/composer-prompt.ts lib/tailoring/composer.ts lib/tailoring/composer.test.ts lib/tailoring/schemas.ts
git commit -m "feat: stop composer from owning resume skills"
```

---

## Spec coverage

| Spec item | Task |
|-----------|------|
| Copy profile skills as-is | Task 1 + 2 |
| Exclude Soft Skills; softSkills [] | Task 1 + 2 |
| Assemble from profile not composer | Task 2 |
| Skip ensure/normalize | Task 2 |
| Composer summary+projects; thin prompt | Task 3 |
| No skill-rewrite engine | All |

## Placeholder scan

None.

## Type consistency

- `assembleFinalResume(..., profileHardSkills: Record<string, string[]>)`
- `buildProfileHardSkills(...)` → same map type
- Composer always `{ skillCategories: {}, softSkills: [] }`
