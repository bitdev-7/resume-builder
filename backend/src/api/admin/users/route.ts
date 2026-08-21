import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AuthError } from "@/lib/supabase/server-client";
import { ForbiddenError, requireAdmin } from "@/lib/supabase/require-admin";
import type {
  AdminUserSummary,
  AppRole,
  BidStatus,
} from "@/lib/supabase/database.types";

type BidStatusCounts = Partial<Record<BidStatus, number>>;
type UserActivitySummary = Pick<
  AdminUserSummary,
  "resume_count" | "bid_status_counts" | "ai_call_count" | "ai_cost_usd"
>;

const PAGE_SIZE = 1000;

function emptySummary(): UserActivitySummary {
  return {
    resume_count: 0,
    bid_status_counts: {},
    ai_call_count: 0,
    ai_cost_usd: 0,
  };
}

type AdminClient = Awaited<ReturnType<typeof requireAdmin>>["adminClient"];

async function loadAuthEmailByUserId(
  adminClient: AdminClient
): Promise<Map<string, string>> {
  const emailById = new Map<string, string>();
  let page = 1;
  const perPage = 200;

  // auth.admin.listUsers is paginated; profiles.email is often null because
  // account email lives on auth.users.
  for (;;) {
    const { data, error } = await adminClient.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error) throw error;
    const users = data?.users ?? [];
    for (const user of users) {
      if (user.email) emailById.set(user.id, user.email);
    }
    if (users.length < perPage) break;
    page += 1;
    if (page > 50) break;
  }

  return emailById;
}

/** PostgREST caps a single select at ~1000 rows; page until exhausted. */
async function fetchAllRows<T extends Record<string, unknown>>(
  fetchPage: (
    from: number,
    to: number
  ) => Promise<{ data: T[] | null; error: { message?: string } | null }>
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await fetchPage(from, to);
    if (error) throw error;
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return all;
}

async function loadActivitySummaries(
  adminClient: AdminClient
): Promise<Map<string, UserActivitySummary>> {
  const [resumeRows, usageRows] = await Promise.all([
    fetchAllRows<{ user_id: string; bid_status: BidStatus | null }>(
      async (from, to) => {
        const result = await adminClient
          .from("resume_history")
          .select("user_id, bid_status")
          .order("id", { ascending: true })
          .range(from, to);
        return {
          data: (result.data ?? null) as
            | { user_id: string; bid_status: BidStatus | null }[]
            | null,
          error: result.error,
        };
      }
    ),
    fetchAllRows<{ user_id: string; cost_usd: number | string | null }>(
      async (from, to) => {
        const result = await adminClient
          .from("ai_usage_logs")
          .select("user_id, cost_usd")
          .order("id", { ascending: true })
          .range(from, to);
        return {
          data: (result.data ?? null) as
            | { user_id: string; cost_usd: number | string | null }[]
            | null,
          error: result.error,
        };
      }
    ),
  ]);

  const summaryByUser = new Map<string, UserActivitySummary>();

  for (const row of resumeRows) {
    const userId = row.user_id;
    const current = summaryByUser.get(userId) ?? emptySummary();
    current.resume_count += 1;
    const status = row.bid_status ?? null;
    if (status) {
      const counts = current.bid_status_counts as BidStatusCounts;
      counts[status] = (counts[status] ?? 0) + 1;
    }
    summaryByUser.set(userId, current);
  }

  for (const row of usageRows) {
    const userId = row.user_id;
    const current = summaryByUser.get(userId) ?? emptySummary();
    current.ai_call_count += 1;
    const cost = Number(row.cost_usd);
    if (Number.isFinite(cost)) current.ai_cost_usd += cost;
    summaryByUser.set(userId, current);
  }

  return summaryByUser;
}

export async function GET(request: NextRequest) {
  try {
    const { adminClient } = await requireAdmin(request);
    const includeStats =
      new URL(request.url).searchParams.get("stats") === "1";

    const [profilesResult, emailById, summaryByUser] = await Promise.all([
      adminClient
        .from("profiles")
        .select("id, full_name, email, role")
        .order("full_name", { ascending: true, nullsFirst: false }),
      loadAuthEmailByUserId(adminClient),
      includeStats
        ? loadActivitySummaries(adminClient)
        : Promise.resolve(new Map<string, UserActivitySummary>()),
    ]);

    if (profilesResult.error) throw profilesResult.error;

    const users: AdminUserSummary[] = (profilesResult.data ?? []).map((row) => {
      const id = row.id as string;
      const summary = summaryByUser.get(id) ?? emptySummary();
      const profileEmail = (row.email as string | null) ?? null;
      const authEmail = emailById.get(id) ?? null;
      return {
        id,
        full_name: (row.full_name as string | null) ?? null,
        email: profileEmail?.trim() || authEmail,
        role: (row.role === "admin" ? "admin" : "user") as AppRole,
        resume_count: summary.resume_count,
        bid_status_counts: summary.bid_status_counts,
        ai_call_count: summary.ai_call_count,
        ai_cost_usd: Number(summary.ai_cost_usd.toFixed(6)),
      };
    });

    users.sort((a, b) => {
      const labelA = (a.email || a.full_name || a.id).toLowerCase();
      const labelB = (b.email || b.full_name || b.id).toLowerCase();
      return labelA.localeCompare(labelB);
    });

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
