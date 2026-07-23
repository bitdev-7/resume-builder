# Profile-owned skills section (composer skips skills) — design

Date: 2026-07-24  
Status: Approved in conversation (approach C)  
Supersedes skill-membership / category-normalize policy in:
- `docs/superpowers/specs/2026-07-23-skill-categories-design.md`
- `docs/superpowers/specs/2026-07-24-skill-generation-reorder-design.md`

Those docs’ **hard-skill heading rewrite / JD-gap / reorder** behavior is replaced for the resume skills section. Soft skills are no longer generated.

## Goal

The resume **skills section** must be an exact reflection of what the user entered on Profile:

- Same category names (user free-text)
- Same skills under each category
- No reorder, no JD adds, no canonicalize/normalize rewrite
- No soft skills on the generated resume

Summary, experience bullets, and projects may still be AI-tailored. Skills are **not**.

Prompt stays thin so the user can later adjust wording without fighting pipeline code that rewrites skills.

## Approach

**Remove skills from the composer’s job.** Composer writes **summary + projects only**. Skills are injected in **assemble** (or immediately before assemble in the pipeline) from the profile’s `skills` / `hardSkills` maps.

## Behavior

### Source of truth

Build `hardSkills` for the resume from profile data already available to the pipeline:

1. Prefer `default_resume.skills` (category → string[]) when present — **exclude** the category `"Soft Skills"` (case-insensitive) entirely from the resume skills section.
2. Else / also merge with `default_resume.hardSkills` if that is how legacy data is stored — preserve category keys and skill lists as stored; do not remap labels.
3. Preserve **insertion order** of categories and skills as in the profile objects (do not sort into a canonical taxonomy).
4. Deduplicate only exact duplicate skill keys *within* a category if needed for safety; do not move skills across categories.

### Soft skills

- Always set `softSkills: []` on the assembled resume.
- Do not copy profile soft skills / `"Soft Skills"` category onto the resume.
- Composer must not invent soft skills.

### Composer

- Prompt: remove Final skills policy that invents/reorders categories. Replace with a short note that skills are supplied from the profile elsewhere (or omit skill instructions entirely). Keep a one-line editable hint if useful: “Skills are taken from the candidate profile as-is; do not invent skill categories.”
- Output contract: stop requiring `skillCategories` / `softSkills` from the model **or** accept them as optional and **ignore** them in code (prefer removing from the contract so the model doesn’t waste tokens).
- `composeResumeTopSection` / fallback: return empty `skillCategories` and empty `softSkills` (pipeline overwrites before/at assemble).
- Do **not** call `ensureAllEligibleSkills` for the skills section.
- Do **not** call `normalizeSkillCategories` on the resume skills path.

### Assemble / pipeline

- `assembleFinalResume`: set `hardSkills` from the profile-derived map (pass in as argument or read from `CandidateProfile` / parallel profile payload), not from `composerResult.skillCategories`.
- Set `softSkills: []`.
- Enrichment / “skills on resume” for gap recommendations should use the profile-derived map.

### Canonical skill-categories module

- Keep `lib/tailoring/skill-categories.ts` for now if unused by the skills path (or leave in place unused) — **YAGNI cleanup optional**; not required for this change. Do not use it when assembling the resume skills section.

### Validators / repair

- Validators that require JD target skills to appear in `skillCategories` must be relaxed or removed for the skills section (JD coverage stays in experience/project bullets if those policies remain).
- Repair must not rewrite skill categories.

## Prompt-only future

Because skills never come from the model, later “prompt-only” edits cannot change the skills section unless code is changed again. That matches the user’s intent: **Profile owns skills; prompts do not.** If they later want prompt-driven skills again, that would be a new design.

Clarify for the user in the product sense: updating Settings composer guidance will affect summary/projects, not Profile skills.

## Scope

**In scope**

- Pipeline/assemble: inject profile skill categories as-is; empty soft skills
- Composer prompt + schema/contract: drop or ignore skill generation
- Remove/skip `ensureAllEligibleSkills` + `normalizeSkillCategories` on the resume skills path
- Update tests (composer, pipeline, validators, assemble) accordingly

**Out of scope**

- Changing Profile UI skill editor
- Reintroducing the 12-category taxonomy on the resume
- Soft skills on PDF
- Prompt-driven skill rewrite

## Success criteria

- Generated resume `hardSkills` match profile categories/skills (minus Soft Skills category)
- `softSkills` always empty on generated resume
- Generating for different JDs does not change the skills section (only summary/bullets/projects)
- No normalize/ensure rewrite of skill headings
- Focused tests updated and passing
