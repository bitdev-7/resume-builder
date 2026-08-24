import type { ResumeRecord } from "@/lib/supabase/database.types";
import { analyzeJobWorkType, extractedJobIsHybridOrOnsite } from "@/lib/job-work-type";

export interface DuplicateApplicationMatch {
  date: string;
  company: string;
  role: string;
}

function monthsAgoDate(months: number): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setMonth(date.getMonth() - months);
  return date;
}

export function findDuplicateCompanyApplications(
  records: ResumeRecord[],
  companyName: string,
  months: number
): DuplicateApplicationMatch[] {
  const target = companyName;
  if (!target) return [];

  const cutoff = monthsAgoDate(months);

  return records
    .filter((record) => {
      const company = record.job_company;
      if (!company) return false;
      if (company !== target) return false;
      return new Date(record.created_at) >= cutoff;
    })
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
    .map((record) => ({
      date: new Date(record.created_at).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      }),
      company: record.job_company || "Unknown company",
      role: record.job_title || "Untitled role",
    }));
}

export function jobContainsHybridOrOnsite(text: string): boolean {
  const analysis = analyzeJobWorkType(text);
  return extractedJobIsHybridOrOnsite(analysis);
}

export function formatDuplicateApplicationsMessage(
  matches: DuplicateApplicationMatch[],
  months: number
): string {
  const period = months === 1 ? "the last month" : `the last ${months} months`;
  const lines = matches.map(
    (item) => `• ${item.date} — ${item.company} — ${item.role}`
  );
  return (
    `Already tracked — this company within ${period}:\n\n` + lines.join("\n")
  );
}

export function formatHybridOnsiteMessage(): string {
  return (
    "This job description mentions hybrid or onsite work. " +
    "Review the location requirements before applying."
  );
}
