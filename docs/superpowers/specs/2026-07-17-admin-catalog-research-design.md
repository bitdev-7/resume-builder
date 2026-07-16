# Admin catalog research — design spec

**Date:** 2026-07-17  
**Status:** Implemented  
**Goal:** Let admins research a job title via LLM, preview catalog changes, verify JSON structure, and apply updates to `data/tailoring/*.json` on disk.

---

## Decisions (confirmed)

| Decision | Choice |
|----------|--------|
| Persistence | Write directly to `data/tailoring/*.json` on the backend server |
| Archetype strategy | LLM decides: merge into existing archetype if high overlap, else create new `snake_case` id |
| Trigger | Manual admin button (not scheduled) |
| Access | Admin-only (`requireAdmin`) |

---

## Problem

Built-in skill/archetype data lives in JSON under `data/tailoring/`. Expanding it by hand is slow. Admins want to enter a title like **"Senior Backend Engineer"** or **"AI Engineer"**, have the system research current market skills, and merge results into the catalog safely.

---

## User flow

```
Admin enters job title
    → [Research]  LLM returns structured CatalogPatch (preview)
    → [Verify]    Zod + merge dry-run; show errors/warnings
    → [Apply]     Merge patch into JSON files, bump version, hot-reload runtime catalog
```

### Admin UI (`/admin/catalog`)

New admin nav item: **Catalog research**

| Control | Behavior |
|---------|----------|
| Job title input | e.g. `Senior Full Stack Engineer`, `AI Engineer` |
| Optional seniority | `junior` / `mid` / `senior` / `staff` (hint for LLM) |
| **Research** | Calls `POST /api/admin/catalog/research`; shows preview panels |
| **Verify** | Calls `POST /api/admin/catalog/verify` on current preview (or on-disk files if no preview) |
| **Apply** | Calls `POST /api/admin/catalog/apply` after successful verify |

**Preview panels:**

- Archetype: create new **or** merge into existing id (LLM recommendation + overlap score)
- Skills: new aliases, new canonical skills
- Relationships: new edges (`requires`, `strongly_implies`, relevance-only types)
- Alternative groups: new or extended groups
- Diff summary: counts per file

**Warnings (non-blocking):**

- Overwrites nothing without explicit merge target for archetypes
- Built-in archetype ids are never deleted
- `catalog-version.json` bumped on apply

---

## Architecture

```
┌─────────────────┐     ┌──────────────────────────┐     ┌─────────────────────┐
│ Admin UI        │────▶│ Backend (Express)        │────▶│ data/tailoring/*.json│
│ /admin/catalog  │     │ requireAdmin + LLM       │     │ (atomic write)       │
└─────────────────┘     └──────────────────────────┘     └─────────────────────┘
                                    │
                                    ▼
                        ┌──────────────────────────┐
                        │ lib/tailoring/catalog-*  │
                        │ research | merge | io    │
                        │ schemas | reload         │
                        └──────────────────────────┘
                                    │
                                    ▼
                        Hot-reload in-memory catalog
                        (skill-ontology, role-skill-catalog)
```

### New modules (`lib/tailoring/`)

| Module | Responsibility |
|--------|----------------|
| `catalog-schemas.ts` | Zod schemas for all JSON files + `CatalogPatch` proposal shape |
| `catalog-io.ts` | Read/write JSON; atomic write via temp file + rename; optional `.backups/` copy |
| `catalog-merge.ts` | Deterministic merge: dedupe aliases, merge archetype fields, append relationships |
| `catalog-research.ts` | Build LLM prompt; parse structured response into `CatalogPatch` |
| `catalog-reload.ts` | Re-read JSON from disk into runtime `SKILL_ALIASES`, `RELATIONSHIPS`, `ROLE_SKILL_CATALOG` |

### API routes (`backend/src/api/admin/catalog/`)

| Method | Path | Body | Response |
|--------|------|------|----------|
| POST | `/api/admin/catalog/research` | `{ title, seniority? }` | `{ proposal, model, costUsd }` |
| POST | `/api/admin/catalog/verify` | `{ proposal? }` — omit to verify on-disk files | `{ valid, errors[], warnings[], dryRunMerge? }` |
| POST | `/api/admin/catalog/apply` | `{ proposal }` | `{ applied, version, filesWritten[], backupDir? }` |

All routes use `requireAdmin`.

---

## LLM research output (`CatalogPatch`)

Structured JSON (validated by Zod before preview):

```typescript
interface CatalogPatch {
  archetype: {
    action: "create" | "merge";
    targetId: string;           // existing id or new snake_case id
    label: string;
    titleKeywords: string[];
    core: string[];
    ecosystem: Record<string, string[]>;
    marketRelevant: string[];
    skillCategoryHints: string[];
    mergeReason?: string;       // when action === "merge"
  };
  skillAliases: Record<string, string[]>;  // new or extended canonical → aliases
  relationships: SkillRelationship[];
  alternativeGroups: AlternativeGroup[]; // new groups or extensions (by group name)
}
```

### Research prompt rules (LLM)

- Research **current market** skills for the title (tools, frameworks, clouds, practices).
- Prefer skills already in catalog; only add canonical names for genuinely new tools.
- Relationships: prefer `requires` / `strongly_implies` only when confident; use relevance-only types otherwise.
- Archetype: compare to existing ids in `role-skill-catalog.json`; **merge** if same role family and >80% core/ecosystem overlap; else **create** new id.
- Do not remove or rename existing built-in archetype ids.
- Seniority affects emphasis (e.g. staff → architecture, leadership keywords) not employer names.

**Model:** cheap/fast model for research (e.g. same tier as `extract-job`); temperature 0.2.

---

## Merge rules (deterministic, post-LLM)

### `skill-aliases.json`

- New canonical: add entry.
- Existing canonical: union aliases (dedupe, lowercase).
- Never remove aliases or canonicals in v1.

### `role-skill-catalog.json`

- **create:** add entry if id not reserved/conflicting.
- **merge:** union `titleKeywords`, `core`, `ecosystem` groups, `marketRelevant`, `skillCategoryHints`; never delete existing keys from ecosystem object.

### `skill-relationships.json`

- Append edge if `(from, to, type)` not already present.

### `alternative-groups.json`

- Match by `group` name: union `skills` if group exists; else append group.

### `catalog-version.json`

- Bump patch segment on apply (e.g. `2026-07-17.1` → `2026-07-17.2`) or date-based `2026-07-17.admin-<n>`.

---

## Verify

1. **JSON syntax** — `JSON.parse` each file; failures reported as `kind: "json_syntax"`.
2. **Schema** — Zod validation per file (`catalog-schemas.ts`).
3. Cross-check (future, with proposal dry-run):
   - Every relationship `from`/`to` references known canonical skill (or new skill in patch).
   - Archetype `targetId` matches `^[a-z0-9_]+$`.
   - No duplicate archetype id on create.
4. Return `{ valid, issues[] }` with file path and message.

Verify runs on **on-disk** `data/tailoring/*.json` via `POST /api/admin/catalog/verify` (admin-only).

---

## UI changes (user vs admin)

| Audience | Before | After |
|----------|--------|-------|
| Normal users | Settings → Skill catalog (edit DB additions) | **Removed** — `/settings/skill-catalog` redirects to `/settings` |
| Admins | — | **Admin → Skill catalog** (`/admin/catalog`) |

### Admin catalog page (v1)

- **Read-only** disabled textareas for each JSON file (loaded from disk).
- **Verify JSON** — syntax + schema check; shows issues inline.
- **Reload** — re-fetch files from server.
- **LLM Research / Apply** — enabled on `/admin/catalog`; only LLM may update files (no manual edit).

User-facing `POST /api/skill-catalog/*` write routes **removed**. Built-in catalog is JSON-only; DB additions UI retired for normal users (pipeline may still merge legacy DB rows until cleanup).

---

## UI placement

- Page: `frontend/app/admin/catalog/page.tsx`
- Nav: `frontend/app/admin/layout.tsx` → **Skill catalog**
- Client: `lib/admin-catalog-client.ts`

---

## Apply & hot-reload

1. Copy current `data/tailoring/` → `data/tailoring/.backups/<iso-timestamp>/`
2. Merge patch into in-memory catalog objects.
3. Validate merged state.
4. Write each file atomically (`*.tmp` → rename).
5. Call `reloadBuiltinCatalogFromDisk()` to refresh runtime modules without full server restart.
6. `invalidateSkillRegistry()` so next generation reloads DB additions on top of new builtins.

**Limitation:** Works when the backend has write access to the repo `data/` folder (local dev, VPS). Read-only deploys (some containers) cannot apply — UI should show a clear error if write fails.

---

## Testing

| Test | Type |
|------|------|
| Zod schemas accept current JSON files | Unit |
| Merge dedupes aliases, merges archetype | Unit |
| Verify catches invalid relationship | Unit |
| Apply writes files + reload updates `normalizeSkillName` | Integration (temp dir) |
| Research route rejects non-admin | Unit |
| Mocked LLM returns valid patch | Unit |

---

## Out of scope (v1)

- Automatic git commit / PR creation
- Scheduled/periodic research
- Deleting skills or archetypes via research
- Writing relationship types into DB
- Researching multiple titles in one batch

---

## Implementation plan

After spec approval: use `writing-plans` skill for task breakdown (schemas → merge → io → research → API → admin UI → tests).
