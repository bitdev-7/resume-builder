# Skill generation: reorder profile skills + expanded categories — design

Date: 2026-07-24  
Status: Approved in conversation (approach B)  
Supersedes category list in: `docs/superpowers/specs/2026-07-23-skill-categories-design.md` (normalize/drop mechanics retained; labels and skill-membership policy updated)

## Goal

When writing the resume skills section:

1. Start from the candidate’s **existing** skill set (profile / allowed skills).
2. **Reorder** skills by JD priority (required / must-have technologies first within each category).
3. **Add** only skills the JD requires that are missing from that set — do not invent optional extras.
4. Place skills only under a fixed category list. **Never invent new category headings.**
5. Soft skills remain a separate `softSkills[]` list.

## Canonical categories (exact labels, in order)

1. Languages  
2. AI & Generative AI  
3. Data Engineering  
4. Backend  
5. Frontend  
6. Mobile Development *(JD-gated)*  
7. Machine Learning *(JD-gated)*  
8. APIs & Protocols  
9. Databases  
10. Cloud & DevOps  
11. Security & Compliance  
12. Testing  

### JD-gated categories

- **Mobile Development** and **Machine Learning** may be **omitted** when the job description is not mobile / ML oriented **and** there are no skills to show under that heading.
- All other categories are always **allowed**. Never invent a substitute heading; never drop these category *types* from the allowed set.
- **Empty headings:** omit from the resume (no blank “Security & Compliance:” lines). This applies to gated and non-gated categories alike.

## Approach

**Prompt + update normalizer** (not prompt-only).

The previous 7-label normalizer would drop new buckets (`AI & Generative AI`, `Data Engineering`, etc.). The shared module must use this 12-label list, with Mobile / ML treated as optional omit when empty after generation.

## Behavior

### Skills membership (composer policy)

1. **Baseline:** profile / `allowedSkills` — keep these; do not dump unrelated noise, but do not freely invent a new tech stack.
2. **Reorder:** within each category, put JD-required / high-priority skills first.
3. **Add:** if a JD-required technology is missing from the baseline, add it under the correct canonical category.
4. **Do not:** invent new category names; do not add large sets of non-JD “nice to have” skills beyond the baseline + JD-required gaps.
5. Soft skills: relevant only; never inside `skillCategories`.

### Normalize step

Keep remap → drop unknown → dedupe → fixed order → omit empty.

Updates vs 2026-07-23:

| Item | New behavior |
|------|----------------|
| Canonical labels | The 12 above (replace the 7) |
| Fallback for must-keep with no/unmappable category | Prefer a sensible default among always-on categories — **`APIs & Protocols`** or keep **`Cloud & DevOps`** only if clearly infra; recommended default: **`Backend`** for unspecified tech, or **`APIs & Protocols`** if that fits the old “Tools” role better. **Decision: use `APIs & Protocols` as `FALLBACK_SKILL_CATEGORY`** (replaces `Tools & Protocols`, which no longer exists). |
| Unknown category headings | Still **drop** those skills (do not invent catch-alls) |
| Mobile / ML | After normalize, **omit** these keys when empty. If they contain skills (from profile or JD add), keep them. Composer prompt should omit them when JD is unrelated so they stay empty and disappear. |
| Alias map | Update for new names, e.g. `Database`/`Databases` → `Databases`; `Tools & Protocols` / `Tools & Technologies` → `APIs & Protocols`; `Data` → `Data Engineering` or `Databases` by alias preference (`Data` → `Data Engineering`); `Cloud` → `Cloud & DevOps`; add aliases for `AI`, `Generative AI`, `Security`, `Mobile`, `ML`, etc. |

### Must-keep (`ensureAllEligibleSkills`)

Unchanged idea: force JD targets + skills used in experience bullets into the skills section.

- Resolve profile category via alias → canonical.
- Empty / unmappable → `APIs & Protocols`.
- Then normalize (unknown keys dropped; empty omitted).

### Pipeline `categoryHints`

Pass the full 12 canonical labels (or 10 without Mobile/ML when a cheap JD heuristic says neither mobile nor ML — optional optimization). Default: always pass all 12; rely on prompt + empty-omit for gating.

### Prompt

Update Final skills policy in `composer-prompt.ts`:

- Exact 12 category names only.
- Reorder existing skills by JD priority; add missing JD-required skills only.
- Omit Mobile Development / Machine Learning when the JD is not about those domains (unless the baseline clearly has mobile/ML skills that should remain).
- Soft skills separate.

## Scope

**In scope**

- Update `lib/tailoring/skill-categories.ts` (+ tests) for 12 labels, aliases, fallback, empty omit (including gated empties).
- Update composer prompt guidance / contract comment.
- Keep pipeline wiring: fixed `categoryHints`, normalize after ensure.
- Adjust composer / ensure tests for new labels and fallback.

**Out of scope**

- Profile UI dropdown enforcement
- Full per-skill ontology auto-bucket into AI vs Backend vs Data Engineering
- Soft-skill policy changes
- Showing empty always-on headings

## Success criteria

- Resume hard-skill headings are only from the 12 labels (subset when empty / gated omit).
- Profile skills retained and reordered toward JD priority; JD-required gaps may appear; free invention of non-JD stacks is discouraged by prompt.
- Mobile / ML absent on non-mobile / non-ML jobs when those buckets are empty.
- Empty headings never printed.
- Soft skills still separate.
- Focused unit tests updated and passing.
