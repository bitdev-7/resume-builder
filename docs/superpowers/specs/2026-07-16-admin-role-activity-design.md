# Admin Role + User Activity Console

Date: 2026-07-16  
Status: Approved in conversation; awaiting implement

## Goal

Add account roles (`admin` | `user`) on `profiles`, slim redundant account fields that already live on `resume_profiles`, and give admins a dedicated Admin page to inspect any user’s bid-status and AI-usage activity using the same charts the user already sees on Dashboard / Statistics.

## Decisions (from brainstorming)

| Topic | Choice |
|-------|--------|
| Role storage | `profiles.role` — no separate users table |
| Roles | `admin` \| `user` (default `user`) |
| First admin | Manual update in Supabase |
| Duplicate profile fields | Drop `headline`, `linkedin_url`, `summary`, `location` from `profiles` (keep on `resume_profiles`) |
| Settings | Stay on `profiles.default_settings` — shared across that user’s resume personas |
| Cross-user reads | Backend admin APIs + service-role client (keep own-only RLS for normal users) |
| Charts | Reuse existing Dashboard / Statistics chart logic for the selected user |
| Visual companion | Declined |

## Concepts

| Concept | Table | Multiplicity |
|---------|-------|--------------|
| Login / account | `auth.users` + `profiles` | 1:1 |
| Role + shared settings | `profiles` | 1 per account |
| Resume persona | `resume_profiles` | many per account |

Admin picks an **account** (`profiles` row), then views that account’s activity across all of their resume personas.

## Data model

### `profiles` changes

| Change | Detail |
|--------|--------|
| Add `role` | `text not null default 'user'` with check constraint `role in ('admin', 'user')` |
| Drop columns | `headline`, `linkedin_url`, `summary`, `location` |
| Keep | `id`, `full_name`, `email`, `phone` (if still used for account display), `default_settings`, timestamps |

`ensureProfile` must insert/return `role: 'user'` for new accounts. Admins are promoted only by manual SQL/UI in Supabase (no in-app promote UI in v1).

### Unchanged

- `resume_profiles` — continue to own persona contact/bio fields (`headline`, `linkedin_url`, `summary`, `location`, etc.)
- RLS on user data tables remains **own-row only** for the JWT/anon client
- Service-role client remains server-only

### Types / app cleanup

- Update `Profile` / `ProfileInsert` / `ProfileUpdate` in `database.types.ts`
- Remove dropped fields from empty-profile helpers, save-profile paths, and account Profile UI so those fields are edited only on resume personas
- Auth/session helpers load `profiles.role` so the client can gate the Admin nav item

## Auth & authorization

1. **Client:** Load current user’s `profiles.role` (via AuthProvider or a small profile fetch). Show Admin nav only when `role === 'admin'`.
2. **Route guard:** `/admin` (and nested routes) redirect non-admins to `/dashboard` (or `/`).
3. **Server:** Every admin API:
   - Authenticate JWT (`requireAuthClient`)
   - Load caller’s `profiles.role`
   - If not `admin` → `403`
   - Then use service-role client to read target user’s data / list profiles

Normal users never get cross-user reads through the browser Supabase client.

## Admin APIs (backend)

Suggested routes (names can match existing Express/Hono style in `backend/src`):

| Endpoint | Purpose |
|----------|---------|
| `GET /api/admin/users` | List profiles for dropdown: `id`, `full_name`, `email`, `role` |
| `GET /api/admin/users/:userId/activity?tab=bids\|ai` | Return the datasets needed to render reused charts for that user |

Activity payloads should be shaped for existing aggregators:

- **Bids tab:** same inputs Dashboard uses for bid charts (`resume_history` / related interview data as needed)
- **AI tab:** same inputs Statistics / Dashboard AI charts use (`ai_usage_logs`)

Prefer returning raw-enough lists (or pre-aggregated points if payload size becomes an issue) and reusing `lib/dashboard-stats.ts` / `lib/ai-usage-stats.ts` on the client or server. If row volume is large, aggregate on the server with SQL/`GROUP BY` instead of shipping 1000+ logs per request — start by mirroring current per-user limits, optimize if needed.

Do **not** expose service-role keys to the browser.

## UI

### Navigation

- Add **Admin** to `AppNav` `NAV_ITEMS` (and mobile avatar menu) **only when** current user is admin
- Href: `/admin`

### Admin page layout (`/admin`)

```
+--------------------------------------------------+
| [User dropdown: Full name — email]               |  ← top of page
+----------+---------------------------------------+
| Job Bid  |                                       |
| status   |   Charts for selected tab + user      |
|          |                                       |
| AI Usage |                                       |
+----------+---------------------------------------+
```

- **Top:** user select dropdown (label: full name + email; fallback to email if name empty). Selecting a user reloads the active tab’s data.
- **Left sidebar:** two tabs only for v1:
  1. Job Bid status
  2. AI Usage
- **Main panel:** charts for the active tab, reused from existing Dashboard / Statistics components and helpers (date range presets if those already exist on the source pages — include the same controls so admins get the same view).

Default: first user in the list (or current admin) + Job Bid status tab.

Non-admin visiting `/admin` → redirect; no flash of admin chrome if practical.

### Out of v1

- In-app role promotion / demotion
- Separate users table
- Extra activity tabs (login analytics, quotas, etc.)
- Admin mutating other users’ bids or settings
- Broad RLS so admins can query all tables from the client

## Error handling

| Case | Behavior |
|------|----------|
| Non-admin hits `/admin` | Redirect away |
| Non-admin hits admin API | `403` |
| Unknown `userId` | `404` |
| Selected user has no activity | Empty chart states (same as empty Dashboard/Statistics) |
| Admin API failure | Inline error on admin page; keep last good selection if possible |

## Testing

- Unit/service: role default on ensure-profile; admin gate rejects non-admin
- API: list users + activity for admin; 403 for user role
- UI: Admin nav hidden for `user`; visible for `admin`
- Regression: account profile save no longer writes dropped columns; resume persona fields still save

## Implementation notes

- Follow existing patterns: `AuthenticatedChrome` / `RequireAuth`, `AppNav`, backend route registration in `backend/src/index.ts`
- Match settings-sidebar interaction patterns for the admin left tabs (local state or path segments like `/admin/bids` and `/admin/ai` — path segments preferred for shareable URLs)
- Suggested paths: `/admin` → redirect to `/admin/bids`; `/admin/ai` for AI Usage
- Keep design system / existing chart components; do not invent a new dashboard look for admin
