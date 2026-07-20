import type { BidStatus } from "@/lib/supabase/database.types";

/** Soft row tint by bid/job status — light + dark. */
export function bidStatusRowClass(status: BidStatus): string {
  switch (status) {
    case "unapplied":
      return "bg-white dark:bg-slate-900/50";
    case "opened":
      return "bg-amber-50 dark:bg-amber-950/35";
    case "applied":
      return "bg-emerald-50 dark:bg-emerald-950/35";
    case "ignored":
      return "bg-slate-100 dark:bg-slate-800/60";
    case "interviewing":
      return "bg-sky-50 dark:bg-sky-950/35";
    case "rejected":
      return "bg-red-50 dark:bg-red-950/35";
    case "offer":
      return "bg-violet-50 dark:bg-violet-950/35";
    case "accepted":
      return "bg-teal-50 dark:bg-teal-950/40";
    default:
      return "bg-white dark:bg-slate-900/50";
  }
}

/** Status select chip colors so the control itself signals state. */
export function bidStatusSelectClass(status: BidStatus): string {
  switch (status) {
    case "unapplied":
      return "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200";
    case "opened":
      return "border-amber-300 bg-amber-100 text-amber-950 dark:border-amber-700 dark:bg-amber-900/60 dark:text-amber-100";
    case "applied":
      return "border-emerald-300 bg-emerald-100 text-emerald-950 dark:border-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-100";
    case "ignored":
      return "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200";
    case "interviewing":
      return "border-sky-300 bg-sky-100 text-sky-950 dark:border-sky-700 dark:bg-sky-900/60 dark:text-sky-100";
    case "rejected":
      return "border-red-300 bg-red-100 text-red-950 dark:border-red-700 dark:bg-red-900/60 dark:text-red-100";
    case "offer":
      return "border-violet-300 bg-violet-100 text-violet-950 dark:border-violet-700 dark:bg-violet-900/60 dark:text-violet-100";
    case "accepted":
      return "border-teal-300 bg-teal-100 text-teal-950 dark:border-teal-700 dark:bg-teal-900/60 dark:text-teal-100";
    default:
      return "";
  }
}
