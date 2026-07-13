import { describe, expect, it } from "vitest";
import { formatAIProviderError } from "@/lib/ai-provider";

const opts = { useOpenRouter: true } as const;

describe("formatAIProviderError — status-aware messages", () => {
  it("402 explains out-of-credits", () => {
    const msg = formatAIProviderError({ status: 402, message: "no credits" }, "openai/gpt-4.1-mini", undefined, opts);
    expect(msg).toContain("402");
    expect(msg.toLowerCase()).toContain("credits");
  });

  it("429 explains rate limiting", () => {
    const msg = formatAIProviderError({ status: 429 }, "openai/gpt-4.1-mini", undefined, opts);
    expect(msg.toLowerCase()).toContain("rate-limited");
  });

  it("5xx is reported as a temporary server error", () => {
    const msg = formatAIProviderError({ status: 503 }, "openai/gpt-4.1-mini", undefined, opts);
    expect(msg).toContain("503");
    expect(msg.toLowerCase()).toContain("server error");
  });

  it("falls back to the error message for non-HTTP errors", () => {
    const msg = formatAIProviderError(new Error("something odd"), "openai/gpt-4.1-mini", undefined, opts);
    expect(msg).toBe("something odd");
  });
});
