"use client";

import { useEffect, useState } from "react";
import AdminAiActivity from "@/components/admin/AdminAiActivity";
import { useAdminUser } from "@/components/admin/AdminUserContext";
import { fetchAdminAiActivity } from "@/lib/admin-client";
import { supabase } from "@/lib/supabase";
import type { AiUsageLog } from "@/lib/supabase/database.types";

export default function AdminAiPage() {
  const { selectedUserId } = useAdminUser();
  const [usageLogs, setUsageLogs] = useState<AiUsageLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedUserId) {
      setUsageLogs([]);
      return;
    }

    let active = true;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) throw new Error("Not signed in");

        const data = await fetchAdminAiActivity(token, selectedUserId);
        if (!active) return;
        setUsageLogs(data.usageLogs);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load AI usage");
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [selectedUserId]);

  return (
    <div className="space-y-3">
      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
          {error}
        </div>
      ) : null}
      <AdminAiActivity usageLogs={usageLogs} loading={loading} />
    </div>
  );
}
