"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { listAdminUsers } from "@/lib/admin-client";
import { supabase } from "@/lib/supabase";
import type { AdminUserSummary } from "@/lib/supabase/database.types";

const STORAGE_KEY = "adminSelectedUserId";

type AdminUserContextValue = {
  users: AdminUserSummary[];
  selectedUserId: string | null;
  setSelectedUserId: (id: string) => void;
  loadingUsers: boolean;
  usersError: string | null;
};

const AdminUserContext = createContext<AdminUserContextValue | null>(null);

export function useAdminUser(): AdminUserContextValue {
  const ctx = useContext(AdminUserContext);
  if (!ctx) {
    throw new Error("useAdminUser must be used within AdminUserProvider");
  }
  return ctx;
}

export function formatUserLabel(user: AdminUserSummary): string {
  const name = user.full_name?.trim();
  const email = user.email?.trim();
  if (name && email) return `${name} — ${email}`;
  if (email) return email;
  if (name) return name;
  return user.id;
}

export function AdminUserProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [selectedUserId, setSelectedUserIdState] = useState<string | null>(null);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [usersError, setUsersError] = useState<string | null>(null);

  const setSelectedUserId = (id: string) => {
    setSelectedUserIdState(id);
    try {
      sessionStorage.setItem(STORAGE_KEY, id);
    } catch {
      // ignore storage failures
    }
  };

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoadingUsers(true);
      setUsersError(null);
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) throw new Error("Not signed in");

        const rows = await listAdminUsers(token);
        if (!active) return;

        setUsers(rows);

        let stored: string | null = null;
        try {
          stored = sessionStorage.getItem(STORAGE_KEY);
        } catch {
          stored = null;
        }

        const storedValid = stored && rows.some((r) => r.id === stored) ? stored : null;
        const selfInList = user?.id && rows.some((r) => r.id === user.id) ? user.id : null;
        const nextId = storedValid ?? selfInList ?? rows[0]?.id ?? null;
        setSelectedUserIdState(nextId);
        if (nextId) {
          try {
            sessionStorage.setItem(STORAGE_KEY, nextId);
          } catch {
            // ignore
          }
        }
      } catch (err) {
        if (!active) return;
        setUsersError(err instanceof Error ? err.message : "Failed to load users");
        setUsers([]);
        setSelectedUserIdState(null);
      } finally {
        if (active) setLoadingUsers(false);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [user?.id]);

  return (
    <AdminUserContext.Provider
      value={{
        users,
        selectedUserId,
        setSelectedUserId,
        loadingUsers,
        usersError,
      }}
    >
      {children}
    </AdminUserContext.Provider>
  );
}
