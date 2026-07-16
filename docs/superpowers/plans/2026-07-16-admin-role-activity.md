# Admin Role + User Activity Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `profiles.role` (`admin` | `user`), slim redundant account columns, and ship an admin-only `/admin` console that lists users and reuses existing bid / AI usage charts for a selected account.

**Architecture:** Role lives on `profiles`. Client reads own role for nav gating. Cross-user reads go through backend admin APIs that verify `role === 'admin'` then use the service-role Supabase client. Admin UI mirrors settings layout (left tabs) with a user dropdown; chart panels take data as props and call existing `dashboard-stats` / `ai-usage-stats` helpers.

**Tech Stack:** Supabase (Postgres + RLS), Express backend with Next-style route handlers, Next.js App Router frontend, Vitest, existing dashboard chart components.

**Spec:** `docs/superpowers/specs/2026-07-16-admin-role-activity-design.md`

## Global Constraints

- Roles: only `admin` | `user`; default `user`
- No separate users table
- Drop from `profiles`: `headline`, `linkedin_url`, `summary`, `location` (keep on `resume_profiles`)
- Keep `default_settings` on `profiles`
- First admin: manual Supabase update (no in-app promote)
- Cross-user data: backend + service role only; do not broaden RLS for normal JWT clients
- Charts: reuse Dashboard / Statistics helpers and chart components
- Paths: `/admin` → `/admin/bids`; `/admin/ai` for AI Usage
- Clients must not be able to escalate their own `role`

---

## File structure

| File | Responsibility |
|------|----------------|
| `supabase/migrations/012_profiles_role.sql` | Add `role`, drop redundant columns, block client role escalation |
| `supabase/schema.sql` | Keep canonical schema in sync |
| `lib/supabase/database.types.ts` | `AppRole`, slim `Profile*` types, `AdminUserSummary` |
| `lib/supabase/empty-profile-bundle.ts` | Match slim `Profile` shape |
| `lib/supabase/ensure-profile.ts` | Return/normalize `role` |
| `lib/supabase/require-admin.ts` | Auth + role gate + service-role client |
| `lib/supabase/require-admin.test.ts` | Unit tests for gate helpers (pure / mocked) |
| `backend/src/api/admin/users/route.ts` | `GET /api/admin/users` |
| `backend/src/api/admin/users/activity/route.ts` | `GET /api/admin/users/:userId/activity` |
| `backend/src/index.ts` | Register admin routes |
| `lib/admin-client.ts` | Frontend fetch helpers for admin APIs |
| `frontend/components/AuthProvider.tsx` | Expose `role` from `ensureProfile` |
| `frontend/components/AppNav.tsx` | Admin nav item when `role === 'admin'` |
| `frontend/components/RequireAdmin.tsx` | Redirect non-admins away from `/admin` |
| `frontend/app/admin/layout.tsx` | User dropdown + left tabs shell |
| `frontend/app/admin/page.tsx` | Redirect to `/admin/bids` |
| `frontend/app/admin/bids/page.tsx` | Job Bid status charts for selected user |
| `frontend/app/admin/ai/page.tsx` | AI Usage charts for selected user |
| `frontend/components/admin/AdminBidsActivity.tsx` | Bid charts wired from props |
| `frontend/components/admin/AdminAiActivity.tsx` | AI charts wired from props |

---

### Task 1: Migration + types (role + slim profiles)

**Files:**
- Create: `supabase/migrations/012_profiles_role.sql`
- Modify: `supabase/schema.sql` (profiles table definition)
- Modify: `lib/supabase/database.types.ts`
- Modify: `lib/supabase/empty-profile-bundle.ts`
- Test: `lib/supabase/database.types.ts` is type-checked via existing tests; add `lib/supabase/empty-profile-bundle.test.ts` if needed for shape

**Interfaces:**
- Produces: `export type AppRole = "admin" | "user"`
- Produces: `Profile.role: AppRole`
- Produces: slim `Profile` without `headline` | `linkedin_url` | `summary` | `location`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/012_profiles_role.sql`:

```sql
-- profiles.role + drop redundant account fields (live on resume_profiles)

alter table public.profiles
  add column if not exists role text not null default 'user';

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check check (role in ('admin', 'user'));

alter table public.profiles drop column if exists headline;
alter table public.profiles drop column if exists linkedin_url;
alter table public.profiles drop column if exists summary;
alter table public.profiles drop column if exists location;

-- Block JWT clients from changing role (service_role can still promote manually)
create or replace function public.prevent_profile_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.role is distinct from old.role then
    if coalesce(auth.role(), '') <> 'service_role' then
      raise exception 'Cannot change profiles.role';
    end if;
  end if;
  if tg_op = 'INSERT' and new.role is distinct from 'user' then
    if coalesce(auth.role(), '') <> 'service_role' then
      raise exception 'Cannot set profiles.role on insert';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_prevent_role_escalation on public.profiles;
create trigger profiles_prevent_role_escalation
  before insert or update on public.profiles
  for each row
  execute function public.prevent_profile_role_escalation();
```

- [ ] **Step 2: Update `schema.sql` profiles block**

Replace the `create table public.profiles` columns so new installs match: include `role text not null default 'user'`, omit the four dropped columns, and append the check constraint + trigger (or document that migrations are source of truth for triggers and keep create-table columns in sync).

- [ ] **Step 3: Update TypeScript types**

In `lib/supabase/database.types.ts`, change `Profile` / `ProfileInsert` / `ProfileUpdate` to:

```ts
export type AppRole = "admin" | "user";

export interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  role: AppRole;
  default_settings: DefaultSettings;
  created_at: string;
  updated_at: string;
}

export interface ProfileInsert {
  id: string;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  role?: AppRole;
  default_settings?: DefaultSettings;
}

export interface ProfileUpdate {
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  /** Only service-role / manual SQL should set this; client updates must omit. */
  role?: AppRole;
  default_settings?: DefaultSettings;
}

export interface AdminUserSummary {
  id: string;
  full_name: string | null;
  email: string | null;
  role: AppRole;
}
```

Remove dropped fields from `Profile*` interfaces only (leave `ResumeProfile*` unchanged).

- [ ] **Step 4: Fix empty profile bundle**

In `lib/supabase/empty-profile-bundle.ts`, slim the account `profile` object:

```ts
profile: {
  id: userId,
  full_name: null,
  email: null,
  phone: null,
  role: "user",
  default_settings: {},
  created_at: timestamp,
  updated_at: timestamp,
},
```

Keep `resumeProfile` fields (including headline/linkedin/summary/location) as they are.

- [ ] **Step 5: Normalize `ensureProfile` return**

In `lib/supabase/ensure-profile.ts`, when mapping existing/created rows, default missing role:

```ts
role: (existing.role === "admin" ? "admin" : "user") as AppRole,
```

(Same for `created`.) Insert remains `{ id: userId, default_settings: {} }` so DB default applies.

- [ ] **Step 6: Typecheck / run a quick test**

Run: `npx vitest run lib/supabase/services/skill-catalog.test.ts` (or any existing lib test)  
Expected: PASS (or only pre-existing failures unrelated to Profile). Fix any TS errors that reference dropped `Profile` fields.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/012_profiles_role.sql supabase/schema.sql lib/supabase/database.types.ts lib/supabase/empty-profile-bundle.ts lib/supabase/ensure-profile.ts
git commit -m "Add profiles.role and drop redundant account fields"
```

---

### Task 2: `requireAdmin` helper

**Files:**
- Create: `lib/supabase/require-admin.ts`
- Create: `lib/supabase/require-admin.test.ts`
- Modify: none required beyond imports

**Interfaces:**
- Consumes: `requireAuthClient`, `AuthError` from `lib/supabase/server-client.ts`; `getAdminSupabaseClient` from `lib/supabase/admin.ts`
- Produces:
  ```ts
  export class ForbiddenError extends Error { status = 403 }
  export async function requireAdmin(request: AuthRequest): Promise<{
    userId: string;
    email: string | null;
    accessToken: string;
    adminClient: SupabaseClient;
  }>
  export function parseAdminActivityTab(raw: string | null): "bids" | "ai"
  ```

- [ ] **Step 1: Write failing tests**

Create `lib/supabase/require-admin.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseAdminActivityTab } from "@/lib/supabase/require-admin";

describe("parseAdminActivityTab", () => {
  it("defaults to bids", () => {
    expect(parseAdminActivityTab(null)).toBe("bids");
    expect(parseAdminActivityTab("")).toBe("bids");
    expect(parseAdminActivityTab("nope")).toBe("bids");
  });

  it("accepts bids and ai", () => {
    expect(parseAdminActivityTab("bids")).toBe("bids");
    expect(parseAdminActivityTab("ai")).toBe("ai");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/supabase/require-admin.test.ts`  
Expected: FAIL — module or export not found

- [ ] **Step 3: Implement `require-admin.ts`**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  AuthError,
  requireAuthClient,
  type AuthRequest,
} from "@/lib/supabase/server-client";
import type { AppRole } from "@/lib/supabase/database.types";

export class ForbiddenError extends Error {
  status = 403;
  constructor(message = "Admin access required") {
    super(message);
  }
}

export function parseAdminActivityTab(raw: string | null): "bids" | "ai" {
  return raw === "ai" ? "ai" : "bids";
}

export async function requireAdmin(request: AuthRequest): Promise<{
  userId: string;
  email: string | null;
  accessToken: string;
  adminClient: SupabaseClient;
}> {
  const { client, userId, email, accessToken } = await requireAuthClient(request);

  const { data, error } = await client
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;

  const role = (data?.role === "admin" ? "admin" : "user") as AppRole;
  if (role !== "admin") {
    throw new ForbiddenError();
  }

  const adminClient = getAdminSupabaseClient();
  if (!adminClient) {
    throw new Error("Admin data access is not configured (missing SUPABASE_SERVICE_ROLE_KEY)");
  }

  return { userId, email, accessToken, adminClient };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run lib/supabase/require-admin.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/supabase/require-admin.ts lib/supabase/require-admin.test.ts
git commit -m "Add requireAdmin gate for admin APIs"
```

---

### Task 3: Admin API routes

**Files:**
- Create: `backend/src/api/admin/users/route.ts`
- Create: `backend/src/api/admin/users/activity/route.ts`
- Modify: `backend/src/index.ts`
- Create: `lib/admin-client.ts` (frontend caller; can land in this task or Task 4 — include here)

**Interfaces:**
- Consumes: `requireAdmin`, `parseAdminActivityTab`, `listResumes`, `listInterviews`, `listAiUsageLogs`
- Produces HTTP:
  - `GET /api/admin/users` → `{ users: AdminUserSummary[] }`
  - `GET /api/admin/users/:userId/activity?tab=bids|ai` →
    - bids: `{ tab: "bids", resumes, interviews }`
    - ai: `{ tab: "ai", usageLogs }`
- Produces client:
  ```ts
  listAdminUsers(accessToken: string): Promise<AdminUserSummary[]>
  fetchAdminUserActivity(accessToken: string, userId: string, tab: "bids" | "ai"): Promise<...>
  ```

- [ ] **Step 1: Implement list users route**

`backend/src/api/admin/users/route.ts`:

```ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AuthError } from "@/lib/supabase/server-client";
import { ForbiddenError, requireAdmin } from "@/lib/supabase/require-admin";
import type { AdminUserSummary } from "@/lib/supabase/database.types";

export async function GET(request: NextRequest) {
  try {
    const { adminClient } = await requireAdmin(request);
    const { data, error } = await adminClient
      .from("profiles")
      .select("id, full_name, email, role")
      .order("full_name", { ascending: true, nullsFirst: false });

    if (error) throw error;

    const users = (data ?? []).map((row) => ({
      id: row.id as string,
      full_name: (row.full_name as string | null) ?? null,
      email: (row.email as string | null) ?? null,
      role: row.role === "admin" ? "admin" : "user",
    })) satisfies AdminUserSummary[];

    return NextResponse.json({ users });
  } catch (error) {
    if (error instanceof AuthError || error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("GET /api/admin/users", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "An error occurred" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Implement activity route**

`backend/src/api/admin/users/activity/route.ts` — parse `userId` from pathname (same pattern as `analyze/status`), `tab` from query:

```ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AuthError } from "@/lib/supabase/server-client";
import {
  ForbiddenError,
  parseAdminActivityTab,
  requireAdmin,
} from "@/lib/supabase/require-admin";
import { listResumes } from "@/lib/supabase/services/resumes";
import { listInterviews } from "@/lib/supabase/services/interviews";
import { listAiUsageLogs } from "@/lib/supabase/services/ai-usage-logs";

function extractUserId(pathname: string): string | null {
  // .../api/admin/users/<userId>/activity
  const parts = pathname.split("/").filter(Boolean);
  const usersIdx = parts.indexOf("users");
  if (usersIdx < 0 || !parts[usersIdx + 1] || parts[usersIdx + 2] !== "activity") {
    return null;
  }
  return parts[usersIdx + 1] ?? null;
}

export async function GET(request: NextRequest) {
  try {
    const { adminClient } = await requireAdmin(request);
    const url = new URL(request.url);
    const userId = extractUserId(url.pathname);
    if (!userId) {
      return NextResponse.json({ error: "Missing user id" }, { status: 400 });
    }

    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const tab = parseAdminActivityTab(url.searchParams.get("tab"));

    if (tab === "ai") {
      const usageLogs = await listAiUsageLogs(userId, adminClient);
      return NextResponse.json({ tab, usageLogs });
    }

    const [resumes, interviews] = await Promise.all([
      listResumes(userId, adminClient),
      listInterviews(userId, adminClient),
    ]);
    return NextResponse.json({ tab: "bids", resumes, interviews });
  } catch (error) {
    if (error instanceof AuthError || error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("GET /api/admin/users/:userId/activity", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "An error occurred" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 3: Register routes in `backend/src/index.ts`**

```ts
import { GET as adminUsersGet } from "./api/admin/users/route.js";
import { GET as adminUserActivityGet } from "./api/admin/users/activity/route.js";

registerRoute(app, "get", "/api/admin/users", adminUsersGet);
registerRoute(app, "get", "/api/admin/users/:userId/activity", adminUserActivityGet);
```

- [ ] **Step 4: Add `lib/admin-client.ts`**

```ts
import { apiUrl } from "@/lib/api-config";
import type {
  AdminUserSummary,
  AiUsageLog,
  InterviewRecord,
  ResumeRecord,
} from "@/lib/supabase/database.types";

async function adminFetch<T>(accessToken: string, path: string): Promise<T> {
  const response = await fetch(apiUrl(path), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(
      typeof err.error === "string" && err.error.trim()
        ? err.error
        : `HTTP ${response.status}`
    );
  }
  return (await response.json()) as T;
}

export async function listAdminUsers(accessToken: string): Promise<AdminUserSummary[]> {
  const data = await adminFetch<{ users: AdminUserSummary[] }>(
    accessToken,
    "/api/admin/users"
  );
  return data.users;
}

export async function fetchAdminBidsActivity(
  accessToken: string,
  userId: string
): Promise<{ resumes: ResumeRecord[]; interviews: InterviewRecord[] }> {
  const data = await adminFetch<{
    tab: "bids";
    resumes: ResumeRecord[];
    interviews: InterviewRecord[];
  }>(accessToken, `/api/admin/users/${encodeURIComponent(userId)}/activity?tab=bids`);
  return { resumes: data.resumes, interviews: data.interviews };
}

export async function fetchAdminAiActivity(
  accessToken: string,
  userId: string
): Promise<{ usageLogs: AiUsageLog[] }> {
  const data = await adminFetch<{ tab: "ai"; usageLogs: AiUsageLog[] }>(
    accessToken,
    `/api/admin/users/${encodeURIComponent(userId)}/activity?tab=ai`
  );
  return { usageLogs: data.usageLogs };
}
```

- [ ] **Step 5: Smoke-check imports compile**

Run: `npx tsc --noEmit -p backend` if a backend tsconfig exists; otherwise `npx vitest run lib/supabase/require-admin.test.ts`  
Expected: no new import errors for admin routes (backend may need a start to fully resolve).

- [ ] **Step 6: Commit**

```bash
git add backend/src/api/admin backend/src/index.ts lib/admin-client.ts
git commit -m "Add admin users and activity API routes"
```

---

### Task 4: Auth role on client + Admin nav + route guard

**Files:**
- Modify: `frontend/components/AuthProvider.tsx`
- Modify: `frontend/components/AppNav.tsx`
- Create: `frontend/components/RequireAdmin.tsx`
- Modify: `frontend/components/AuthenticatedChrome.tsx` only if needed to wrap admin; prefer layout-level `RequireAdmin`

**Interfaces:**
- Consumes: `ensureProfile` → `Profile.role`
- Produces: `useAuth()` also returns `role: AppRole | null`

- [ ] **Step 1: Extend AuthProvider**

```ts
import type { AppRole } from "@/lib/supabase/database.types";

interface AuthContextType {
  user: User | null;
  role: AppRole | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

// default: role: null
// in applySession when nextUser:
const profile = await ensureProfile(nextUser.id);
if (active) setRole(profile?.role === "admin" ? "admin" : profile ? "user" : null);
// when nextUser null: setRole(null)
// signOut: setRole(null)
```

Also reset `role` when identity clears. Keep ignoring same-user refresh events (do not refetch role on every token refresh unless identity changes).

- [ ] **Step 2: Gate Admin in AppNav**

```ts
const { user, role, signOut } = useAuth();

const navItems = [
  ...NAV_ITEMS,
  ...(role === "admin" ? ([{ href: "/admin", label: "Admin" }] as const) : []),
];
```

Use `navItems` for both desktop nav and mobile avatar links. Active check: `pathname === "/admin" || pathname.startsWith("/admin/")`.

- [ ] **Step 3: Create RequireAdmin**

```tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";

export default function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user, role, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user || role !== "admin") {
      router.replace("/dashboard");
    }
  }, [loading, user, role, router]);

  if (loading || !user || role !== "admin") {
    return (
      <div className="flex flex-1 items-center justify-center py-20">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600" />
      </div>
    );
  }

  return <>{children}</>;
}
```

- [ ] **Step 4: Manual verify checklist (no automated UI test required)**

- Sign in as non-admin: no Admin nav; visiting `/admin` redirects to dashboard
- After setting `role = 'admin'` in Supabase and refreshing session identity (sign out/in): Admin appears

- [ ] **Step 5: Commit**

```bash
git add frontend/components/AuthProvider.tsx frontend/components/AppNav.tsx frontend/components/RequireAdmin.tsx
git commit -m "Gate Admin nav and routes by profiles.role"
```

---

### Task 5: Admin layout shell (dropdown + tabs)

**Files:**
- Create: `frontend/app/admin/layout.tsx`
- Create: `frontend/app/admin/page.tsx`
- Create: `frontend/components/admin/AdminUserContext.tsx` (selected user id shared with child pages)

**Interfaces:**
- Produces React context:
  ```ts
  { users: AdminUserSummary[]; selectedUserId: string | null; setSelectedUserId: (id: string) => void; loadingUsers: boolean; usersError: string | null }
  ```

- [ ] **Step 1: AdminUserContext**

Load users via `listAdminUsers` using `supabase.auth.getSession()` access token (same pattern other pages use with session). Default `selectedUserId` to first user in list (or current `user.id` if present in list). Persist selection in `sessionStorage` key `adminSelectedUserId` so tab switches keep the user.

- [ ] **Step 2: Admin layout**

Mirror `frontend/app/settings/layout.tsx` structure:

- Wrap children in `RequireAdmin` then provider
- Title: `Admin`
- Subtitle: `Inspect user bid status and AI usage`
- Top control: `<select>` of users labeled `full_name — email` (fallback email or id)
- Left aside tabs:
  - `/admin/bids` → `Job Bid status`
  - `/admin/ai` → `AI Usage`

- [ ] **Step 3: `/admin/page.tsx`**

```tsx
import { redirect } from "next/navigation";

export default function AdminIndexPage() {
  redirect("/admin/bids");
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/app/admin frontend/components/admin/AdminUserContext.tsx frontend/components/RequireAdmin.tsx
git commit -m "Add admin layout with user picker and activity tabs"
```

---

### Task 6: Admin chart panels (bids + AI)

**Files:**
- Create: `frontend/components/admin/AdminBidsActivity.tsx`
- Create: `frontend/components/admin/AdminAiActivity.tsx`
- Create: `frontend/app/admin/bids/page.tsx`
- Create: `frontend/app/admin/ai/page.tsx`

**Interfaces:**
- Consumes: chart components from `frontend/components/dashboard/*`, helpers from `lib/dashboard-stats.ts` / `lib/ai-usage-stats.ts`, admin fetch helpers, `useAdminUser()` context
- Produces: pages that load activity for `selectedUserId` and render charts

- [ ] **Step 1: AdminBidsActivity**

Props: `{ resumes: ResumeRecord[]; interviews: InterviewRecord[]; loading: boolean }`.

Copy the analytics wiring from `frontend/app/dashboard/page.tsx` (range presets, `TodayBidsPanel`, `DailyBidChart`, `SuccessRatePanel`, `DailyInterviewChart`, `InterviewCallTypeChart`) so behavior matches the user’s Dashboard bid view. Do not include AI usage charts here.

- [ ] **Step 2: AdminAiActivity**

Props: `{ usageLogs: AiUsageLog[]; loading: boolean }`.

Mirror the summary cards + breakdowns from `frontend/app/statistics/page.tsx` (and/or Dashboard’s `DailyAiUsageChart` section): daily usage, cost, by source/model, failure counts via `computeAiUsageStats` / related helpers already used on Statistics.

- [ ] **Step 3: bids page**

On `selectedUserId` change, call `fetchAdminBidsActivity(token, selectedUserId)`, show inline error on failure, pass data into `AdminBidsActivity`.

- [ ] **Step 4: ai page**

Same with `fetchAdminAiActivity` → `AdminAiActivity`.

- [ ] **Step 5: Empty / loading states**

Match Dashboard/Statistics empty chart behavior when arrays are empty.

- [ ] **Step 6: Commit**

```bash
git add frontend/components/admin frontend/app/admin
git commit -m "Render admin bid and AI usage charts for selected user"
```

---

### Task 7: Verification + promote-admin note

**Files:**
- Optionally append a short comment at top of migration (already has SQL comments)
- No README required unless repo already documents migrations similarly

- [ ] **Step 1: Run unit tests**

Run: `npx vitest run lib/supabase/require-admin.test.ts`  
Expected: PASS

- [ ] **Step 2: Apply migration**

Apply `012_profiles_role.sql` in the target Supabase project (CLI or SQL editor). Then promote yourself:

```sql
update public.profiles
set role = 'admin'
where email = 'YOUR_ADMIN_EMAIL';
```

(Service role / SQL editor bypasses the escalation trigger via `auth.role() = 'service_role'` — if the SQL editor runs as a different role and the update fails, use the service role connection or temporarily disable the trigger for the one-off update.)

- [ ] **Step 3: Manual E2E checklist**

1. Non-admin: no Admin nav; `/admin` → dashboard; `GET /api/admin/users` → 403  
2. Admin: Admin nav visible; user dropdown lists accounts; bids + AI tabs show charts for selected user  
3. Profile / resume persona: headline/summary/location/linkedin still edit on resume profiles  
4. Settings still load from `profiles.default_settings`

- [ ] **Step 4: Final commit if any fixes**

```bash
git add -A
git commit -m "Fix admin activity console follow-ups"
```

(Only if there are leftover fixes; skip empty commit.)

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| `profiles.role` admin\|user default user | Task 1 |
| Drop headline/linkedin/summary/location from profiles | Task 1 |
| Keep default_settings | Task 1 (unchanged) |
| Manual admin assignment | Task 7 |
| Client cannot escalate role | Task 1 trigger |
| ensureProfile defaults user | Task 1 |
| Types / empty bundle cleanup | Task 1 |
| Backend admin APIs + service role | Tasks 2–3 |
| 403 / 404 behaviors | Task 3 |
| AuthProvider role + Admin nav | Task 4 |
| `/admin` guard | Task 4–5 |
| User dropdown + left tabs | Task 5 |
| Reuse Dashboard/Statistics charts | Task 6 |
| Paths `/admin/bids` and `/admin/ai` | Tasks 5–6 |

## Self-review notes

- No TBD placeholders; path param parsing matches existing `analyze/status` style.
- `AdminUserSummary` and activity payload shapes are consistent across Tasks 1, 3, and 6.
- Migration number `012` avoids clash with untracked `011_discovered_skill_metadata.sql`.
- Profile form already saves persona fields to `resume_profiles` via `saveProfileForm` — no account UI field removal beyond type/DB cleanup.
