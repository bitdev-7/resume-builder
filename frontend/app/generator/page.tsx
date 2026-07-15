"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function GeneratorRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/jobs");
  }, [router]);

  return (
    <div className="flex h-full items-center justify-center text-sm text-slate-500">
      Redirecting to Jobs…
    </div>
  );
}
