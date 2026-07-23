# Main-skill bullet coverage (≥60%) — design

Date: 2026-07-24  
Status: Approved in conversation

## Goal

When generating experience bullets for a role whose JD centers on a primary technology (e.g. Java developer) but the candidate’s history mentions that stack lightly, the **main skill** must still appear in **at least 60% of all experience bullets** across the resume.

This is a focused coverage floor — not a full “skill-focused bullets” redesign (deferred).

## Approach

**Prompt + deterministic top-up.**

1. Instruct the experience writer that the main skill must appear in ≥60% of bullets overall.  
2. After generation, measure coverage; if below 60%, deterministically inject the main skill into enough existing bullets to hit the floor.

## Behavior

### Selecting the main skill

1. From `jdAnalysis.requirements`, consider entries with `type === "must_have"` that are technology-like (`category === "technology"` when present; otherwise include if the requirement text normalizes to a known skill via `normalizeSkillName` / skill ontology).
2. Prefer the highest `priority` must-have technology.
3. Tie-break: first in analyzer order.
4. Fallback: first entry in `jdAnalysis.atsTerms` that normalizes to a known skill.
5. If none → **skip** the rule (no main skill, no coverage enforcement).

Call this value `mainSkill` (canonical name).

### Coverage definition

- Universe: every bullet text in all `ExperienceGenerationResult`s after the writer (and after any existing target-skill ensure that still runs).
- A bullet **covers** `mainSkill` if a word-boundary / `detectSkillMentions`-compatible check finds that skill (same rigor as `ensureTargetSkillsInExperiences`).
- `coverage = coveredCount / totalBullets`.
- Required: `coverage >= 0.60`.
- Bullets needed: `needed = ceil(0.60 * totalBullets)`; top-up until `coveredCount >= needed`.
- If `totalBullets === 0`, skip.

### Prompt changes

In experience writer guidance (single + batched), add:

- Identify `mainSkill` from the payload (pass explicitly as `mainSkill` on `ExperienceWriterInput`).
- Across the whole resume, at least ~60% of experience bullets must mention `mainSkill` by name (or a clear alias).
- Spread mentions across roles when timeline-compatible; do not force historically impossible claims; no fabricated metrics.

### Deterministic top-up

New helper e.g. `ensureMainSkillBulletCoverage(results, mainSkill, minRatio = 0.6)`:

1. Compute covered vs uncovered bullet indices (experience index + bullet index).
2. While covered < needed, take the next uncovered bullet (prefer experiences with more bullets first, then earlier bullets).
3. Rewrite that bullet by appending a short natural clause that includes `mainSkill` (e.g. `… using {mainSkill}`) if not already present — avoid duplicating if a soft match already exists.
4. Do **not** invent metrics; keep `evidenceIds` as-is (or empty if already creative).
5. Prefer mutating existing bullets over appending brand-new bullets (unlike the “missing target skill once” helper).

Run **after** experience generation / repair and **alongside or after** `ensureTargetSkillsInExperiences` (order: target-skill ensure first for “at least once” JD targets, then main-skill coverage floor).

### Pipeline wiring

- Compute `mainSkill` once after JD analysis + skill expansion.
- Pass `mainSkill` into each `ExperienceWriterInput`.
- Call coverage ensure before final assemble.

## Scope

**In scope**

- Main-skill selection helper + coverage measure + top-up
- Experience writer prompt + input field
- Pipeline wiring + unit tests

**Out of scope**

- Broader “every bullet skill-focused” product rewrite
- Skills-section (hardSkills) changes
- Soft skills
- Changing metric / evidence policy

## Success criteria

- When a main skill exists, ≥60% of experience bullets mention it after the pipeline (verified in unit tests with under-covered fixtures).
- When no main skill can be selected, behavior unchanged.
- Prompt includes the 60% instruction and explicit `mainSkill`.
- No fabricated metrics introduced by the top-up.
