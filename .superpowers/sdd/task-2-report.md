# Task 2 Report: Assemble + pipeline use AI skills

## Status

**Complete.** `assembleFinalResume` restored to 3-arg signature; resume `hardSkills`/`softSkills` come from composer output. Pipeline success path no longer overwrites composer skills with profile map; failure fallback passes `profileHardSkills` into `buildDeterministicComposerFallback`.

## TDD Cycle

### RED (Step 2)

Skipped explicit RED run — assemble test and implementation updated in same pass after brief review (Task 1 already restored composer skills).

### GREEN (Step 6)

Command:

```bash
npm test -- lib/tailoring/composer.test.ts lib/tailoring/assemble.test.ts lib/tailoring/pipeline.test.ts lib/tailoring/profile-hard-skills.test.ts
```

Result: **PASS** — 4 files, 15 tests passed

## Changes

| File | Action |
|------|--------|
| `lib/tailoring/assemble.ts` | 3-arg signature; `hardSkills` from `composerResult.skillCategories`, `softSkills` from `composerResult.softSkills` |
| `lib/tailoring/assemble.test.ts` | All call sites 3 args; replaced profile-overwrite test with composer-skills test |
| `lib/tailoring/pipeline.ts` | Removed success-path `skillCategories: profileHardSkills` overwrite; 3-arg assemble; `skillsOnResume` from composer; fallback passes `profileHardSkills` |
| `lib/tailoring/pipeline.test.ts` | Mock composer returns `{ Backend: ["Python", "FastAPI"] }`; asserts resume skills match mock |

## Commit

```
6ec6926 feat: assemble resume skills from composer output
```

Files committed: `lib/tailoring/assemble.ts`, `lib/tailoring/assemble.test.ts`, `lib/tailoring/pipeline.ts`, `lib/tailoring/pipeline.test.ts`

## Out of scope (unchanged)

- Git stash not restored (per brief)
- `profile-hard-skills.ts` still used for `categoryHints` and composer failure fallback only

## Concerns

- Composer fallback still returns empty `softSkills`; only successful AI compose path surfaces soft skills on resume.
- Repair loop may mutate composer skills via `ensureAllEligibleSkills`; resume reflects post-repair composer output, not raw model output.
- Pipeline test stderr shows batched experience mock edge case (fallback path); test still passes.

## Test summary

| Suite | Result |
|-------|--------|
| `composer.test.ts` | 2 passed |
| `assemble.test.ts` | 6 passed |
| `pipeline.test.ts` | 2 passed |
| `profile-hard-skills.test.ts` | 5 passed |

---

## Final review fix: empty composer skillCategories

### Status

**Complete.** Pipeline now falls back to `profileHardSkills` when composer succeeds but returns empty `skillCategories`. JSDoc in `assemble.ts` updated to reflect composer-sourced skills with pipeline fallback.

### Tests

Command:

```bash
npm test -- lib/tailoring/assemble.test.ts lib/tailoring/pipeline.test.ts lib/tailoring/composer.test.ts
```

Result: **PASS** — 3 files, 11 tests passed

### Changes

| File | Action |
|------|--------|
| `lib/tailoring/pipeline.ts` | After repair, if `skillCategories` empty and profile has hard skills, substitute `profileHardSkills` |
| `lib/tailoring/assemble.ts` | JSDoc: skills from composer (profile fallback in pipeline only) |
| `lib/tailoring/pipeline.test.ts` | New test: composer returns `{}` skillCategories → resume uses profile `{ Backend: ["Python"] }` |

### Commit

```
fix: fall back to profile skills when composer returns none
```

### Test summary

| Suite | Result |
|-------|--------|
| `composer.test.ts` | 2 passed |
| `assemble.test.ts` | 6 passed |
| `pipeline.test.ts` | 3 passed |
