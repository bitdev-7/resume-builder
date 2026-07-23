# Prompt-Driven Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resume skills always come from the composer AI (prompt-driven); default prompt says use existing skillsets/categories; no Profile hard overwrite on success; Profile copy only as composer-failure fallback.

**Architecture:** Restore composer skill JSON fields and assemble from `composerResult`. Keep `buildProfileHardSkills` for `categoryHints` / `allowedSkills` context and failure fallback only. Do not run `normalizeSkillCategories` or `ensureAllEligibleSkills` on the happy path.

**Tech Stack:** TypeScript, Vitest, existing composer/pipeline

## Global Constraints

- Always take AI `skillCategories` / `softSkills` after successful compose
- Default guidance: use existing skillsets/categories from payload; no forced canonical taxonomy
- User-edited composer override changes skill behavior without code branches
- No `normalizeSkillCategories` / `ensureAllEligibleSkills` on happy path
- Composer failure → fallback skills from `buildProfileHardSkills`; softSkills `[]`
- Spec: `docs/superpowers/specs/2026-07-24-prompt-driven-skills-design.md`

## File map

| File | Responsibility |
|------|----------------|
| `lib/prompts/composer-prompt.ts` | Default skills guidance + contract with skill fields |
| `lib/tailoring/composer.ts` | Keep/dedupe AI skills; empty only when absent; fallback uses profile map when provided |
| `lib/tailoring/composer.test.ts` | Assert skills from model are kept |
| `lib/tailoring/assemble.ts` | `hardSkills` / `softSkills` from composer (3-arg signature) |
| `lib/tailoring/assemble.test.ts` | Assert composer skills win |
| `lib/tailoring/pipeline.ts` | Pass composer skills through; profile fallback only on compose failure |

---

### Task 1: Composer prompt + return AI skills

**Files:**
- Modify: `lib/prompts/composer-prompt.ts`
- Modify: `lib/tailoring/composer.ts`
- Modify: `lib/tailoring/composer.test.ts`

**Interfaces:**
- `composeResumeTopSection` returns parsed `skillCategories` (within-category `skillKey` dedupe) and `softSkills`
- `buildDeterministicComposerFallback` accepts optional `profileHardSkills?: Record<string, string[]>` and uses it when non-empty; else `{}`

- [ ] **Step 1: Update composer tests**

Replace “skills ignored” test with:

```ts
describe("composer — prompt-driven skills", () => {
  it("keeps skillCategories and softSkills from the model (deduped within category)", async () => {
    callAIMock.mockResolvedValue({
      providerUsed: "openai",
      modelUsed: "gpt-4.1-mini",
      text: "",
      json: {
        summary: "A".repeat(80),
        skillCategories: {
          Backend: ["Python", "Python", "FastAPI"],
          Languages: ["Go"],
        },
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
      allowedSkills: ["Python", "FastAPI", "Go"],
      targetSkills: [],
      categoryHints: ["Languages", "Backend"],
      projects: [],
    };

    const { result } = await composeResumeTopSection(input, aiRequest);
    expect(result.skillCategories).toEqual({
      Backend: ["Python", "FastAPI"],
      Languages: ["Go"],
    });
    expect(result.softSkills).toEqual(["Leadership"]);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

`npm test -- lib/tailoring/composer.test.ts`

- [ ] **Step 3: Update prompt**

In `COMPOSER_DEFAULT_GUIDANCE`, replace the Skills bullet with:

```
Skills:
- Use the candidate's existing skillsets and categories from allowedSkills and categoryHints. Prefer the user's category names; do not invent a new taxonomy.
- Include the existing skills in skillCategories; do not drop the profile skill set wholesale. You may omit a skill only if it is clearly unrelated to the job.
- Do not invent large sets of skills that are not in allowedSkills unless the user-edited guidance above explicitly asks you to.
- softSkills: only include if relevant; empty list is fine.
```

Restore contract:

```
{
  "summary": string,
  "skillCategories": { "<category name>": string[] },
  "softSkills": string[],
  "projects": [ { "id": string, "description": string, "technologies": string[] } ]
}
```

Also restore intro line to mention skills again: “professional summary, skills grouping, and tailored project descriptions.”

- [ ] **Step 4: Update composer.ts**

Restore dedupe-within-category loop from model output (no `normalizeSkillCategories`). Return those maps + `softSkills` from parse.

Update fallback:

```ts
export function buildDeterministicComposerFallback(input: {
  normalizedTitle: string;
  allowedSkills: string[];
  categoryHints: string[];
  profileHardSkills?: Record<string, string[]>;
}): ComposerResult {
  // ... summary as today ...
  const fromProfile = input.profileHardSkills;
  const skillCategories =
    fromProfile && Object.keys(fromProfile).length > 0
      ? fromProfile
      : input.allowedSkills.length > 0
        ? { [input.categoryHints[0] || "Skills"]: input.allowedSkills.slice(0, 20) }
        : {};
  return { summary, skillCategories, softSkills: [], projects: [] };
}
```

- [ ] **Step 5: Run — expect PASS**

`npm test -- lib/tailoring/composer.test.ts`

- [ ] **Step 6: Commit**

```bash
git add lib/prompts/composer-prompt.ts lib/tailoring/composer.ts lib/tailoring/composer.test.ts
git commit -m "feat: restore prompt-driven composer skills"
```

---

### Task 2: Assemble + pipeline use AI skills

**Files:**
- Modify: `lib/tailoring/assemble.ts`
- Modify: `lib/tailoring/assemble.test.ts`
- Modify: `lib/tailoring/pipeline.ts`
- Modify: `lib/tailoring/pipeline.test.ts`

**Interfaces:**
- `assembleFinalResume(profile, experienceResults, composerResult)` — 3 args again
- Pipeline: on compose success, skills from composer; on failure fallback already includes profile skills via Task 1

- [ ] **Step 1: Change assemble test**

Replace profile-overwrite test with:

```ts
  it("uses composer skillCategories and softSkills on the resume", () => {
    const experienceResults: ExperienceGenerationResult[] = [
      { experienceId: "exp_1", bullets: [{ text: "Built authentication APIs", evidenceIds: ["fact_1"], requirementIds: [] }] },
    ];
    const resume = assembleFinalResume(profile, experienceResults, {
      summary: "Backend engineer with strong Python experience.",
      skillCategories: { Backend: ["Python"], Languages: ["Go"] },
      softSkills: ["Leadership"],
      projects: [],
    });
    expect(resume.hardSkills).toEqual({ Backend: ["Python"], Languages: ["Go"] });
    expect(resume.softSkills).toEqual(["Leadership"]);
  });
```

Update all assemble call sites to 3 args.

- [ ] **Step 2: Run assemble tests — expect FAIL**

`npm test -- lib/tailoring/assemble.test.ts`

- [ ] **Step 3: Restore assemble**

```ts
export function assembleFinalResume(
  profile: CandidateProfile,
  experienceResults: ExperienceGenerationResult[],
  composerResult: ComposerResult
): UpdatedResume {
  // ...
    hardSkills: composerResult.skillCategories,
    softSkills: composerResult.softSkills,
  // ...
}
```

- [ ] **Step 4: Update pipeline**

Keep `profileHardSkills = buildProfileHardSkills(...)` for `categoryHints` and for failure fallback:

```ts
    initialComposerResult = buildDeterministicComposerFallback({
      normalizedTitle: jdAnalysis.normalizedTitle,
      allowedSkills: composerInput.allowedSkills,
      categoryHints: composerInput.categoryHints,
      profileHardSkills,
    });
```

On success path, **do not** overwrite:

```ts
  const finalComposerResult = repairOutcome.composerResult;

  const resume = assembleFinalResume(
    candidateProfile,
    coveredExperienceResults,
    finalComposerResult
  );

  const skillsOnResume = Object.values(finalComposerResult.skillCategories).flat();
```

Remove any `skillCategories: profileHardSkills` assignment on the success path.

- [ ] **Step 5: Update pipeline.test.ts**

Assert resume `hardSkills` match **mocked composer** `skillCategories` (e.g. Backend Python+FastAPI from mock), not a forced profile-only map. Soft skills from mock if present.

- [ ] **Step 6: Run focused suites**

```bash
npm test -- lib/tailoring/composer.test.ts lib/tailoring/assemble.test.ts lib/tailoring/pipeline.test.ts lib/tailoring/profile-hard-skills.test.ts
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add lib/tailoring/assemble.ts lib/tailoring/assemble.test.ts lib/tailoring/pipeline.ts lib/tailoring/pipeline.test.ts
git commit -m "feat: assemble resume skills from composer output"
```

---

## Spec coverage

| Requirement | Task |
|-------------|------|
| Default prompt: use existing skillsets/categories | Task 1 |
| Always take AI skills on success | Task 1 + 2 |
| No Profile overwrite on success | Task 2 |
| Failure fallback = profile copy | Task 1 + 2 |
| No normalize/ensure on happy path | Task 1 |

## Placeholder scan

None.
