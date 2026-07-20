# Task 1 Report: Normalize URL + expand BidStatus types

## Status: COMPLETE

## Commits

| Hash | Message |
|------|---------|
| `d34c972` | feat: add job URL normalize and expand bid statuses |

## Files Changed

| File | Action |
|------|--------|
| `lib/job-url.ts` | Created — `normalizeJobUrl()` helper |
| `lib/job-url.test.ts` | Created — 3 Vitest cases |
| `lib/supabase/database.types.ts` | Modified — expanded `BidStatus`, `BID_STATUSES`, added `JobRecord` + `UserJobListItem` |

## TDD Evidence

### RED (Step 2)

```
npm test -- lib/job-url.test.ts

 FAIL  lib/job-url.test.ts
Error: Failed to load url ./job-url (resolved id: ./job-url) in D:/Projects/Services/resuma/lib/job-url.test.ts. Does the file exist?

 Test Files  1 failed (1)
      Tests  no tests
```

Expected failure: module `./job-url` not found before implementation.

### GREEN (Step 4)

```
npm test -- lib/job-url.test.ts

 ✓ lib/job-url.test.ts (3 tests) 2ms

 Test Files  1 passed (1)
      Tests  3 passed (3)
```

All three behaviors verified:
- Strips query string (`?utm_source=…`)
- Trims and collapses whitespace
- Returns empty string for blank input

## Type Changes

- `BidStatus` now includes `unapplied` and `opened` (7 values total)
- `BID_STATUSES` array updated to match
- `DEFAULT_BID_STATUS` unchanged at `"applied"` (History backward compat)
- New interfaces: `JobRecord`, `UserJobListItem`

## Concerns

- None for this task scope. Schema/UI intentionally untouched per brief.
- Downstream tasks will need to wire `unapplied`/`opened` into services and UI.

## Out of Scope (confirmed not touched)

- Database schema / migrations
- UI components
- Services layer
