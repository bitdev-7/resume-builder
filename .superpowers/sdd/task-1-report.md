# Task 1 Report: Brand constants + icon assets

## Status

**DONE**

## Summary

Added Cubi brand constants (`APP_NAME`, `APP_ICON_SRC`) in `lib/brand.ts`, a focused Vitest in `lib/brand.test.ts`, and copied the session icon PNG to `frontend/public/cubi-icon.png` and `frontend/app/icon.png`. No UI components were modified (Task 2 scope).

## Files Created

| File | Purpose |
|------|---------|
| `lib/brand.ts` | Exports `APP_NAME = "Cubi"` and `APP_ICON_SRC = "/cubi-icon.png"` |
| `lib/brand.test.ts` | Vitest asserting exact brand string values |
| `frontend/public/cubi-icon.png` | Public static asset for in-app `<img>` usage |
| `frontend/app/icon.png` | Next.js App Router favicon/metadata icon |

## TDD Evidence

### RED (Step 2)

Command:

```bash
npm test -- lib/brand.test.ts
```

Result: **FAIL**

```
 FAIL  lib/brand.test.ts [ lib/brand.test.ts ]
Error: Failed to load url ./brand (resolved id: ./brand) in D:/Projects/Services/resuma/lib/brand.test.ts. Does the file exist?
```

Cause: `lib/brand.ts` did not exist yet; test imported `./brand` before implementation.

### GREEN (Step 4)

After creating `lib/brand.ts` and copying icon assets:

Command:

```bash
npm test -- lib/brand.test.ts
```

Result: **PASS**

```
 ✓ lib/brand.test.ts (1 test) 1ms
 Test Files  1 passed (1)
      Tests  1 passed (1)
```

### Asset verification

```powershell
(Get-Item frontend/public/cubi-icon.png).Length -gt 1000  # True
(Get-Item frontend/app/icon.png).Length -gt 1000          # True
```

Both icon copies are non-empty binary files (>1000 bytes).

## Commit

| SHA | Subject |
|-----|---------|
| `05d385e` | feat: add Cubi brand constants and icon assets |

## Self-Review

- **Scope:** Only brand constants, test, and icon copies — no UI/component changes.
- **Values:** `APP_NAME` is exactly `"Cubi"`; `APP_ICON_SRC` is exactly `"/cubi-icon.png"` per brief and global constraints.
- **Icon source:** Copied from session asset path specified in brief/global constraints.
- **Conventions:** Test follows existing Vitest patterns in `lib/*.test.ts`; constants live at repo-root `lib/` alongside other shared modules.
- **Global constraints:** No package.json or README renames; functional “resume” copy untouched.

## Concerns

None.
