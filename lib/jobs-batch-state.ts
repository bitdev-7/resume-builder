import type { BidStatus, UserJobListItem } from "@/lib/supabase/database.types";
import { getExternalJobUrl } from "@/lib/jobs-page-state";

export type BatchCardStatus = "empty" | "ready" | "generating" | "done" | "failed";

export interface JobsBatchCard {
  jobId: string;
  url: string;
  bidStatus: BidStatus;
  pageContent: string;
  jobTitle: string;
  companyName: string;
  jobDescription: string;
  status: BatchCardStatus;
  error: string | null;
  resumeId?: string;
}

export function createBatchCardsFromJobs(jobs: UserJobListItem[]): JobsBatchCard[] {
  return jobs.map((job) => ({
    jobId: job.job_id,
    url: job.url,
    bidStatus: job.status,
    pageContent: "",
    jobTitle: "",
    companyName: "",
    jobDescription: "",
    status: "empty",
    error: null,
  }));
}

export function isBatchCardReady(card: JobsBatchCard): boolean {
  if (card.status === "generating") return false;
  return Boolean(card.pageContent.trim() || card.jobDescription.trim());
}

export function countReadyBatchCards(cards: JobsBatchCard[]): number {
  return cards.filter(isBatchCardReady).length;
}

export function applyBatchPageContentChange(
  card: JobsBatchCard,
  pageContent: string
): JobsBatchCard {
  const preserveStatus = card.status === "generating" || card.status === "done";
  return {
    ...card,
    pageContent,
    jobTitle: "",
    companyName: "",
    jobDescription: "",
    error: null,
    status: preserveStatus ? card.status : pageContent.trim() ? "ready" : "empty",
  };
}

export function getCardsNeedingAlertExtraction(
  cards: JobsBatchCard[]
): JobsBatchCard[] {
  return cards.filter(
    (card) =>
      isBatchCardReady(card) &&
      !card.companyName.trim()
  );
}

export function toggleJobSelection(selected: Set<string>, jobId: string): Set<string> {
  const next = new Set(selected);
  if (next.has(jobId)) next.delete(jobId);
  else next.add(jobId);
  return next;
}

export function openExternalUrls(
  urls: string[],
  openFn: (url: string) => Window | null = (url) => window.open(url, "_blank")
): { opened: number; blocked: number } {
  let opened = 0;
  let blocked = 0;
  for (const raw of urls) {
    const tab = openFn(getExternalJobUrl(raw));
    if (tab) {
      tab.opener = null;
      opened += 1;
    } else {
      blocked += 1;
    }
  }
  return { opened, blocked };
}
