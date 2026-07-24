import { describe, expect, it, vi } from "vitest";
import {
  applyBatchPageContentChange,
  countReadyBatchCards,
  createBatchCardsFromJobs,
  getCardsNeedingAlertExtraction,
  isBatchCardReady,
  openExternalUrls,
  toggleJobSelection,
} from "./jobs-batch-state";

const job = {
  job_id: "j1",
  url: "https://example.com/a",
  created_at: "2026-07-21T00:00:00.000Z",
  status: "unapplied" as const,
  job_description: "",
};

describe("jobs-batch-state", () => {
  it("creates empty cards from selected jobs", () => {
    const cards = createBatchCardsFromJobs([job]);
    expect(cards).toEqual([
      expect.objectContaining({
        jobId: "j1",
        url: job.url,
        pageContent: "",
        status: "empty",
      }),
    ]);
  });

  it("marks a card ready when paste text exists", () => {
    const [card] = createBatchCardsFromJobs([job]);
    expect(isBatchCardReady(card)).toBe(false);
    expect(isBatchCardReady({ ...card, pageContent: "  JD text  " })).toBe(true);
  });

  it("counts ready cards", () => {
    const cards = createBatchCardsFromJobs([job, { ...job, job_id: "j2" }]);
    cards[0].pageContent = "hello";
    expect(countReadyBatchCards(cards)).toBe(1);
  });

  it("clears extracted metadata when pasted content changes", () => {
    const [card] = createBatchCardsFromJobs([job]);
    expect(
      applyBatchPageContentChange(
        {
          ...card,
          pageContent: "old paste",
          jobTitle: "Old title",
          companyName: "Old company",
          jobDescription: "Old description",
          status: "ready",
        },
        "new paste"
      )
    ).toEqual(
      expect.objectContaining({
        pageContent: "new paste",
        jobTitle: "",
        companyName: "",
        jobDescription: "",
        status: "ready",
        error: null,
      })
    );
  });

  it("selects ready cards missing company metadata for alert extraction", () => {
    const cards = createBatchCardsFromJobs([
      job,
      { ...job, job_id: "j2" },
      { ...job, job_id: "j3" },
    ]);
    cards[0].pageContent = "first";
    cards[1].pageContent = "second";
    cards[1].companyName = "Known company";
    cards[2].jobDescription = "already extracted description";
    cards[2].companyName = "";

    expect(getCardsNeedingAlertExtraction(cards).map((card) => card.jobId)).toEqual([
      "j1",
      "j3",
    ]);
  });

  it("toggles selection set immutably", () => {
    const next = toggleJobSelection(new Set(["j1"]), "j2");
    expect([...next].sort()).toEqual(["j1", "j2"]);
    expect([...toggleJobSelection(next, "j1")]).toEqual(["j2"]);
  });

  it("reports popup-blocked opens", () => {
    const openFn = vi
      .fn()
      .mockReturnValueOnce({} as Window)
      .mockReturnValueOnce(null);
    expect(openExternalUrls(["https://a.com", "https://b.com"], openFn)).toEqual({
      opened: 1,
      blocked: 1,
    });
  });
});
