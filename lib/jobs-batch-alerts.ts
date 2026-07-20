import {
  findDuplicateCompanyApplications,
  jobContainsHybridOrOnsite,
  type DuplicateApplicationMatch,
} from "@/lib/apply-alerts";
import type { ResumeRecord } from "@/lib/supabase/database.types";

export interface BatchAlertSummary {
  duplicateByJobId: Record<string, DuplicateApplicationMatch[]>;
  hybridJobIds: string[];
  hasAny: boolean;
}

export function buildBatchAlertSummary(input: {
  cards: Array<{
    jobId: string;
    companyName: string;
    pageContent: string;
    jobDescription: string;
  }>;
  resumes: ResumeRecord[];
  duplicateEnabled: boolean;
  duplicateMonths: number;
  hybridEnabled: boolean;
}): BatchAlertSummary {
  const duplicateByJobId: Record<string, DuplicateApplicationMatch[]> = {};
  const hybridJobIds: string[] = [];

  for (const card of input.cards) {
    const text = card.jobDescription || card.pageContent;

    if (input.hybridEnabled && jobContainsHybridOrOnsite(text)) {
      hybridJobIds.push(card.jobId);
    }

    if (input.duplicateEnabled && card.companyName) {
      const matches = findDuplicateCompanyApplications(
        input.resumes,
        card.companyName,
        input.duplicateMonths
      );
      if (matches.length > 0) {
        duplicateByJobId[card.jobId] = matches;
      }
    }
  }

  const hasAny =
    hybridJobIds.length > 0 ||
    Object.values(duplicateByJobId).some((matches) => matches.length > 0);

  return { duplicateByJobId, hybridJobIds, hasAny };
}
