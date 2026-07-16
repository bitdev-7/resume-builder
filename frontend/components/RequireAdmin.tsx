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
