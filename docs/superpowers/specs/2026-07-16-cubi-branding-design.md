# Cubi Branding (User-Facing)

Date: 2026-07-16  
Status: Approved in conversation; awaiting implement

## Goal

Rename the product’s user-facing brand to **Cubi** and use the provided kawaii document/pencil icon PNG for favicon and in-app brand marks. Package/npm names, README, and domain terms (e.g. “resume”) stay unchanged.

## Scope

**In**

- Browser tab title / favicon
- App nav brand (icon + wordmark)
- Login (`Auth`) brand (icon + wordmark)

**Out**

- Repo/docs/README renames
- npm package / workspace names
- Changing functional “resume” language in features

## Asset

- Source: user-provided Cubi icon PNG (session asset)
- Destination: `frontend/public/cubi-icon.png`
- Also wire Next.js app icon/favicon to that file (e.g. `app/icon.png` or metadata `icons`, matching existing Next 14 App Router patterns)

## UI changes

| Surface | Current | Target |
|---------|---------|--------|
| `layout.tsx` metadata | title `Resume Generator` | title `Cubi`; description can stay product-focused or mention Cubi briefly |
| Favicon | none / default | Cubi PNG |
| `AppNav` | blue “RT” badge + “Resume Tailor” | `<img>` Cubi icon + **Cubi** (wordmark `hidden` on xs, same as today’s `sm:block`) |
| `Auth` login | “Resume Tailor” text | Cubi icon + **Cubi** wordmark; supporting copy can keep resume-tailoring meaning |

## Approach

**Icon + wordmark** everywhere we show brand: replace the gradient initials badge with the PNG so the kawaii mark is consistent in tab, nav, and login.

## Success criteria

- Tab shows **Cubi** and Cubi favicon
- Signed-in nav shows Cubi icon + Cubi
- Login shows Cubi icon + Cubi
- No package.json / README renames as part of this work
