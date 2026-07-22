# Fixed resume skill categories — design

Date: 2026-07-23  
Status: Approved in conversation

## Goal

When the tailoring pipeline writes the resume skills section, hard skills must appear only under a fixed set of category headings, in a fixed order. Soft skills remain a separate list.

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

## Approach

**Prompt + deterministic normalize** (not prompt-only).

1. Prompt steers the model toward the seven labels.  
2. A post-compose normalizer enforces the contract so invented names (`Data`, `Streaming`, `Tools & Technologies`, etc.) never reach the PDF.

## Behavior

### Composer prompt

- Instruct the Final Composer to group hard skills **only** into the seven canonical category names above.
- Do not allow inventing new category labels.
- Soft skills remain in `softSkills` only.
- Pass `categoryHints` as the fixed seven labels (not freeform profile/catalog names). Profile categories still inform *placement* via the existing `categoryByKey` map used by `ensureAllEligibleSkills`, but resume **headings** are always canonicalized afterward.

### Normalize step

Run after compose and after `ensureAllEligibleSkills` (so repair/fallback paths also get clean headings).

For each `skillCategories` map:

1. **Alias remap** of category keys (case-insensitive), including at least:
   - `Cloud` → `Cloud & DevOps`
   - `DevOps` → `Cloud & DevOps`
   - `Cloud and DevOps` → `Cloud & DevOps`
   - `Testing & Tools` → `Testing` (tools-looking leftovers then fold separately if needed)
   - `Data` → `Database`
   - `Databases` → `Database`
   - `Tools & Technologies` → `Tools & Protocols`
   - `Tools` → `Tools & Protocols`
   - Exact matches for the seven canonical names stay as-is
2. **Unknown category names** → move those skills into **Tools & Protocols**
3. **Deduplicate** skill names across categories (canonical order: first category wins)
4. **Reorder** keys to the fixed seven-order list
5. **Drop** empty categories

Change the current fallback string in `ensureAllEligibleSkills` from `Tools & Technologies` to `Tools & Protocols`.

### Deterministic composer fallback

When the AI composer fails, bucket allowed skills under the first applicable canonical category if hints exist; otherwise put them under **Tools & Protocols** (not a freeform first hint). Prefer running the same normalizer on fallback output so behavior stays consistent.

## Scope

**In scope**

- Shared constant for the seven ordered category labels + alias map + `normalizeSkillCategories()` helper
- Composer prompt / guidance update
- Pipeline wiring so final `composerResult.skillCategories` is normalized before assemble
- Unit tests for alias remap, unknown fold, order, empty omit, dedupe
- Fallback category string update

**Out of scope**

- Forcing Profile UI category field to a dropdown (freeform profile categories remain OK; normalize handles generate)
- Changing soft-skill selection policy
- Full per-skill ontology assignment (rule-based category of every technology by name)
- Mandatory cleanup of every historical `skillCategoryHints` row in the DB (optional follow-up: seed JSON hints)

**Optional nice-to-have (same PR if cheap)**

- Align `data/tailoring/role-skill-catalog.json` `skillCategoryHints` to the seven labels so admin/research UI does not suggest obsolete names

## Success criteria

- Generated resumes never show hard-skill headings outside the seven labels
- Heading order always matches the list above when multiple categories are present
- Soft skills still appear via the existing soft-skills path
- Existing composer/ensure-all tests updated; new normalize tests pass
