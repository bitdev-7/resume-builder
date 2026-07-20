import { describe, expect, it, vi } from "vitest";
import { pollAnalyzeJob } from "./analyze-job-client";

describe("pollAnalyzeJob", () => {
  it("returns a completed analysis response", async () => {
    const resume = { name: "Taylor" };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: "completed",
        resume,
        providerUsed: "openrouter",
      }),
    });

    await expect(
      pollAnalyzeJob("analyze-1", "token", { fetchImpl: fetchMock as typeof fetch })
    ).resolves.toMatchObject({ resume, providerUsed: "openrouter" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("surfaces a failed background job without retrying", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: "failed", error: "model unavailable" }),
    });

    await expect(
      pollAnalyzeJob("analyze-2", "token", { fetchImpl: fetchMock as typeof fetch })
    ).rejects.toThrow("model unavailable");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
