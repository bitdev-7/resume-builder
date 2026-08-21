"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import RequireAdmin from "@/components/RequireAdmin";
import {
  AdminUserProvider,
  formatUserLabel,
  useAdminUser,
} from "@/components/admin/AdminUserContext";

const ADMIN_NAV = [
  { href: "/admin/users", label: "Users" },
  { href: "/admin/bids", label: "Job Bid status" },
  { href: "/admin/ai", label: "AI Usage" },
  { href: "/admin/catalog", label: "Skill catalog" },
] as const;

function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { users, selectedUserId, setSelectedUserId, loadingUsers, usersError } =
    useAdminUser();

  return (
    <main className="page-shell">
      <div className="mx-auto w-full max-w-7xl space-y-6">
        <div>
          <h1 className="page-title">Admin</h1>
          <p className="page-subtitle mt-1">
            Inspect user bid status and AI usage
          </p>
        </div>

        <div className="glass-panel p-4">
          <label htmlFor="admin-user-select" className="filter-label">
            User
          </label>
          <select
            id="admin-user-select"
            className="filter-control mt-1 max-w-xl"
            disabled={loadingUsers || users.length === 0}
            value={selectedUserId ?? ""}
            onChange={(e) => setSelectedUserId(e.target.value)}
          >
            {loadingUsers ? (
              <option value="">Loading users…</option>
            ) : users.length === 0 ? (
              <option value="">No users found</option>
            ) : (
              users.map((u) => (
                <option key={u.id} value={u.id}>
                  {formatUserLabel(u)}
                </option>
              ))
            )}
          </select>
          {usersError ? (
            <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">{usersError}</p>
          ) : null}
        </div>

        <div className="flex flex-col gap-6 md:flex-row md:items-start">
          <aside className="glass-panel w-full shrink-0 overflow-hidden md:w-52">
            <nav className="flex flex-row gap-1 p-2 md:flex-col">
              {ADMIN_NAV.map((item) => {
                const active =
                  pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={
                      active
                        ? "tab-pill tab-pill-active px-4 py-2.5 text-sm font-medium"
                        : "tab-pill px-4 py-2.5 text-sm font-medium"
                    }
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </aside>

          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </div>
    </main>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAdmin>
      <AdminUserProvider>
        <AdminShell>{children}</AdminShell>
      </AdminUserProvider>
    </RequireAdmin>
  );
}
