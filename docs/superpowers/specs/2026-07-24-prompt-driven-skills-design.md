# Prompt-driven skill generation — design

Date: 2026-07-24  
Status: Approved in conversation  
Supersedes resume skills ownership in: `docs/superpowers/specs/2026-07-24-profile-owned-skills-design.md`

## Goal

Resume **skills section comes from the composer AI**, guided by the editable composer prompt.

- **Default guidance:** use the candidate’s existing skillsets and categories (from profile / `allowedSkills` + category hints). Do not invent a new taxonomy or freely invent stacks.
- **If the user edits** composer guidance in Settings, skill behavior follows that text.
- **No hard Profile overwrite** in assemble — always take `composerResult.skillCategories` (and `softSkills` as returned).

Summary and projects remain AI-tailored as today.

## Approach

Revert the assemble/pipeline “force `buildProfileHardSkills`” path. Restore composer ownership of skills with a thin default prompt. Keep `buildProfileHardSkills` available only to **feed hints** into the composer payload (category keys + skill lists as context), not to replace AI output.

## Behavior

### Default prompt (editable)

Final skills policy (default `COMPOSER_DEFAULT_GUIDANCE`) should say, in substance:

- Use the candidate’s existing skillsets and categories as provided in the payload (`allowedSkills`, `categoryHints`, and any profile skill grouping in context).
- Preserve the user’s category names when grouping; do not force a fixed canonical taxonomy.
- Do not invent large sets of skills that are not in the existing set unless the (user-edited) guidance explicitly asks for that.
- Soft skills: follow guidance (default: empty / omit unless relevant and guidance allows).

Contract again includes:

```json
{
  "summary": string,
  "skillCategories": { "<category name>": string[] },
  "softSkills": string[],
  "projects": [ ... ]
}
```

### Code path

1. **Composer** — parse and keep model `skillCategories` / `softSkills` (dedupe within categories by `skillKey` only; **do not** run `normalizeSkillCategories` or `ensureAllEligibleSkills`).
2. **Fallback** — if composer fails, put `allowedSkills` under profile category hints when available, else a single bucket from first hint / `"Skills"`; or use `buildProfileHardSkills` **only as fallback** when AI fails (recommended: profile copy as deterministic fallback so empty skills don’t ship). **Decision: on composer failure, use `buildProfileHardSkills(default_resume)` as fallback skill map; softSkills `[]`.**
3. **Pipeline** — pass `categoryHints: Object.keys(profileHardSkills)` and `allowedSkills` as today; do not overwrite composer skills after success.
4. **Assemble** — `hardSkills: composerResult.skillCategories`, `softSkills: composerResult.softSkills` (no 4th profile overwrite arg — or keep optional override unused). Prefer restoring previous 3-arg assemble signature for clarity.

### Explicitly out

- Hard overwrite of AI skills with Profile on every successful compose
- Re-enabling `normalizeSkillCategories` / `ensureAllEligibleSkills` on the happy path
- Separate `composerSkills` prompt key (whole composer guidance remains the edit surface)

## Scope

**In scope**

- Restore composer skill fields in prompt contract + compose return
- Restore assemble from composer skills
- Pipeline: stop forcing profile map into final resume skills (keep helper for hints + failure fallback)
- Default guidance text for “use existing skillsets/categories”
- Tests updated

**Out of scope**

- New Settings UI beyond existing composer override
- Canonical 12-category normalizer on the happy path

## Success criteria

- With default prompt, model is instructed to use existing skills/categories; resume skills come from AI output
- Custom composer override changes skill behavior without code changes
- Successful compose does not replace AI skills with Profile copy
- Composer failure still yields a non-empty skills section via profile fallback when profile has skills
- Focused tests pass
