"use client";

import { useEffect, useState } from "react";
import AdminBidsActivity from "@/components/admin/AdminBidsActivity";
import { useAdminUser } from "@/components/admin/AdminUserContext";
import { fetchAdminBidsActivity } from "@/lib/admin-client";
import { supabase } from "@/lib/supabase";
import type { InterviewRecord, ResumeRecord } from "@/lib/supabase/database.types";

export default function AdminBidsPage() {
  const { selectedUserId } = useAdminUser();
  const [resumes, setResumes] = useState<ResumeRecord[]>([]);
  const [interviews, setInterviews] = useState<InterviewRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedUserId) {
      setResumes([]);
      setInterviews([]);
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

        const data = await fetchAdminBidsActivity(token, selectedUserId);
        if (!active) return;
        setResumes(data.resumes);
        setInterviews(data.interviews);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load bid activity");
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
      <AdminBidsActivity resumes={resumes} interviews={interviews} loading={loading} />
    </div>
  );
}
