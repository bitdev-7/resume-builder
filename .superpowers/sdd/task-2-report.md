# Task 2 Report: BrandMark + UI wiring

## Status

**DONE_WITH_CONCERNS**

## Summary

Created the reusable `BrandMark` component and wired it into the authenticated navigation and both desktop/mobile login layouts. Updated Next.js metadata so the browser title is exactly `Cubi`; existing functional resume copy remains unchanged.

## Files

- `frontend/components/BrandMark.tsx` — consumes `APP_NAME` and `APP_ICON_SRC` with the exact prop interface and defaults from the brief.
- `frontend/components/AppNav.tsx` — replaces the legacy RT/Resume Tailor badge with `BrandMark`.
- `frontend/components/Auth.tsx` — shows the brand on the desktop hero and mobile form column.
- `frontend/app/layout.tsx` — changes the metadata title from `Resume Generator` to `Cubi`.

## Verification

- Required `Select-String` scan returned no matches.
- `npm test -- lib/brand.test.ts`: PASS (1 file, 1 test).
- `npx tsc --noEmit -p frontend/tsconfig.json`: PASS.
- `git diff --check`: PASS.
- `npm run build -w resume-frontend`: not completed because Windows returned `EPERM` while opening `frontend/.next/trace`, consistent with the existing dev server holding the build directory.
- Manual browser verification was not performed.

## Commit

- `edcafc7` — `feat: show Cubi brand mark in nav, login, and tab title`

## Self-Review

- Compared all four files against the brief's exact snippets and values.
- Confirmed the old `RT`, `Resume Tailor`, and `Resume Generator` brand strings are absent from the scoped files.
- Confirmed the login headline and “Sign in to continue tailoring resumes.” copy are unchanged.
- Confirmed no package or README renames and no unrelated source changes were included in the commit.

## Concerns

The optional production build could not run concurrently with the existing process because `.next/trace` was locked. The required test and independent TypeScript check both passed.

## Accessibility Fix (Task 2 review)

**Finding:** On mobile, the nav brand `Link` had no accessible name — `BrandMark` icon uses `alt=""` and `aria-hidden`, and the wordmark is hidden below `sm`.

**Fix:** Added `aria-label={APP_NAME}` to the dashboard `Link` wrapping `BrandMark` in `frontend/components/AppNav.tsx`; imported `APP_NAME` from `@/lib/brand`.

**Verification:**
- `Select-String` on `AppNav.tsx`, `Auth.tsx`, `layout.tsx` for `Resume Tailor|Resume Generator|\bRT\b`: no matches.
- `npm test -- lib/brand.test.ts`: PASS (1 file, 1 test).

**Commit:** `6542ba9` — `fix: add accessible name to Cubi nav brand link`
