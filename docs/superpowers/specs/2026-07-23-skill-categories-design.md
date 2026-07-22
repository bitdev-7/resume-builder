# Fixed resume skill categories — design

Date: 2026-07-23  
Status: Approved in conversation (updated: unknown categories dropped)

## Goal

When the tailoring pipeline writes the resume skills section, hard skills must appear only under a fixed set of category headings, in a fixed order. Soft skills remain a separate list. Skills under any other category name are **not written** (dropped).

## Canonical categories (exact labels, in order)

1. Languages  
2. Backend  
3. Frontend  
4. Database  
5. Cloud & DevOps  
6. Tools & Protocols  
7. Testing  

**Soft skills:** stay in `softSkills[]` — not one of the seven hard-skill categories.

**Empty categories:** omit from the resume (do not print empty headings).

**Hard rule:** never emit a hard-skill heading outside these seven. Do not invent catch-alls. Do not fold unknown buckets into Tools & Protocols.

## Approach

**Prompt + deterministic normalize** (not prompt-only).

1. Prompt steers the model toward the seven labels.  
2. A post-compose normalizer remaps known aliases, then **drops** skills whose category does not resolve to one of the seven.

## Behavior

### Composer prompt

- Instruct the Final Composer to group hard skills **only** into the seven canonical category names above.
- Do not allow inventing new category labels. If a skill does not fit any of the seven, omit it from `skillCategories` (do not create another heading).
- Soft skills remain in `softSkills` only.
- Pass `categoryHints` as the fixed seven labels (not freeform profile/catalog names).

### Normalize step

Run after compose and after `ensureAllEligibleSkills` (so repair/fallback paths also get clean headings).

For each `skillCategories` map:

1. **Alias remap** of category keys (case-insensitive), including at least:
   - `Cloud` → `Cloud & DevOps`
   - `DevOps` → `Cloud & DevOps`
   - `Cloud and DevOps` → `Cloud & DevOps`
   - `Testing & Tools` → `Testing`
   - `Data` → `Database`
   - `Databases` → `Database`
   - `Tools & Technologies` → `Tools & Protocols`
   - `Tools` → `Tools & Protocols`
   - Exact matches for the seven canonical names stay as-is
2. **Unknown category names** → **drop those skills** (do not write them; do not move them into Tools & Protocols)
3. **Deduplicate** skill names across categories (canonical order: first category wins)
4. **Reorder** keys to the fixed seven-order list
5. **Drop** empty categories

### Must-keep placement (`ensureAllEligibleSkills`)

When forcing JD/target skills into the skills section:

- If the profile category aliases to a canonical label, use that.
- If there is **no** category (empty/missing), place under **Tools & Protocols** so must-keep skills are not lost.
- If the profile category is a **non-aliasable** name (e.g. `AI/ML`), treat like empty: place under **Tools & Protocols** (placement into a canonical bucket — not inventing a heading). Normalize will not drop these because they already sit under a canonical key.

Change the current fallback string from `Tools & Technologies` to `Tools & Protocols`.

### Deterministic composer fallback

When the AI composer fails, place allowed skills under **Tools & Protocols** (or split only when profile `categoryByKey` aliases to a canonical label). Always run the same normalizer so unknown keys never survive.

## Scope

**In scope**

- Shared constant for the seven ordered category labels + alias map + `normalizeSkillCategories()` helper (remap → drop unknown → dedupe → order → omit empty)
- Composer prompt / guidance update
- Pipeline wiring so final `composerResult.skillCategories` is normalized before assemble
- Unit tests for alias remap, unknown **drop**, order, empty omit, dedupe, must-keep fallback to Tools & Protocols
- Fallback category string update

**Out of scope**

- Forcing Profile UI category field to a dropdown (freeform profile categories remain OK; normalize/placement rules handle generate)
- Changing soft-skill selection policy
- Full per-skill ontology assignment (rule-based category of every technology by name)
- Mandatory cleanup of every historical `skillCategoryHints` row in the DB (optional follow-up: seed JSON hints)

**Optional nice-to-have (same PR if cheap)**

- Align `data/tailoring/role-skill-catalog.json` `skillCategoryHints` to the seven labels so admin/research UI does not suggest obsolete names

## Success criteria

- Generated resumes never show hard-skill headings outside the seven labels
- Skills that only appear under unmappable invented categories are absent from the resume
- Heading order always matches the list above when multiple categories are present
- Soft skills still appear via the existing soft-skills path
- Existing composer/ensure-all tests updated; new normalize tests pass
