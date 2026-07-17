import { describe, expect, it } from "vitest";
import {
  getAiUsageContext,
  runWithAiUsageContextAsync,
} from "@/lib/ai-usage-context";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("ai usage AsyncLocalStorage", () => {
  it("keeps context across awaits when the async job itself enters the store", async () => {
    let seen: string | undefined;

    async function job() {
      await runWithAiUsageContextAsync(
        { userId: "user-inside-job", source: "resume_generation" },
        async () => {
          await delay(20);
          await Promise.all(
            [1, 2].map(async () => {
              await delay(5);
              seen = getAiUsageContext()?.userId;
            })
          );
        }
      );
    }

    // Mimic Express returning 202 before the job finishes.
    void job();
    await delay(80);

    expect(seen).toBe("user-inside-job");
  });
});
