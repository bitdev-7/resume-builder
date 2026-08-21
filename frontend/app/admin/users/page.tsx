"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatCostUsd } from "@/lib/ai-usage";
import { listAdminUsers } from "@/lib/admin-client";
import {
  formatUserLabel,
  useAdminUser,
} from "@/components/admin/AdminUserContext";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";
import type { AdminUserSummary, BidStatus } from "@/lib/supabase/database.types";

const STATUS_ORDER: BidStatus[] = [
  "applied",
  "opened",
  "interviewing",
  "offer",
  "accepted",
  "rejected",
  "unapplied",
  "ignored",
];

function formatStatusCounts(
  counts: Partial<Record<BidStatus, number>>
): string {
  const parts = STATUS_ORDER.filter((status) => (counts[status] ?? 0) > 0).map(
    (status) => `${status} ${counts[status]}`
  );
  return parts.length > 0 ? parts.join(" · ") : "—";
}

export default function AdminUsersOverviewPage() {
  const { user } = useAuth();
  const { selectedUserId, setSelectedUserId } = useAdminUser();
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) throw new Error("Not signed in");
        const rows = await listAdminUsers(token, { stats: true });
        if (!cancelled) setUsers(rows);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load users");
          setUsers([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="glass-panel overflow-hidden">
      <div className="page-header">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
          Users overview
        </h2>
        <p className="page-subtitle">
          Bid activity and AI usage across accounts. Select a user, then open Bid
          status or AI Usage for details.
        </p>
      </div>

      <div className="p-4 sm:p-6">
        {error ? (
          <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
            {error}
          </div>
        ) : null}

        {users.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
            No users found.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
              <thead className="bg-slate-50 dark:bg-slate-900/40">
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  <th className="px-3 py-2 font-medium">User</th>
                  <th className="px-3 py-2 font-medium">Role</th>
                  <th className="px-3 py-2 text-right font-medium">Bids</th>
                  <th className="px-3 py-2 font-medium">Bid status</th>
                  <th className="px-3 py-2 text-right font-medium">AI calls</th>
                  <th className="px-3 py-2 text-right font-medium">AI cost</th>
                  <th className="px-3 py-2 font-medium">Open</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {users.map((row) => {
                  const selected = row.id === selectedUserId;
                  return (
                    <tr
                      key={row.id}
                      className={
                        selected
                          ? "bg-blue-50/70 dark:bg-blue-950/30"
                          : undefined
                      }
                    >
                      <td className="px-3 py-2 text-slate-800 dark:text-slate-100">
                        <button
                          type="button"
                          className="text-left font-medium hover:underline"
                          onClick={() => setSelectedUserId(row.id)}
                        >
                          {formatUserLabel(row)}
                        </button>
                      </td>
                      <td className="px-3 py-2 capitalize text-slate-600 dark:text-slate-300">
                        {row.role}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-700 dark:text-slate-200">
                        {row.resume_count}
                      </td>
                      <td className="max-w-xs px-3 py-2 text-xs text-slate-600 dark:text-slate-300">
                        {formatStatusCounts(row.bid_status_counts ?? {})}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-700 dark:text-slate-200">
                        {row.ai_call_count ?? 0}
                        {(row.resume_count ?? 0) > 0 &&
                        (row.ai_call_count ?? 0) === 0 ? (
                          <span
                            className="ml-1 text-[10px] font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400"
                            title="This account has resume history but no ai_usage_logs rows"
                          >
                            unlogged
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-700 dark:text-slate-200">
                        {formatCostUsd(row.ai_cost_usd ?? 0)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-2">
                          <Link
                            href="/admin/bids"
                            className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                            onClick={() => setSelectedUserId(row.id)}
                          >
                            Bids
                          </Link>
                          <Link
                            href="/admin/ai"
                            className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                            onClick={() => setSelectedUserId(row.id)}
                          >
                            AI
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
