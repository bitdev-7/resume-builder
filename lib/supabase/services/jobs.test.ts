import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { addJobForUser, nextStatusAfterOpen } from "./jobs";

function scriptedClient(
  responses: Array<{ data: unknown; error: unknown }>
): SupabaseClient {
  let query = 0;

  return {
    from() {
      const response = responses[query++];
      const builder = new Proxy(
        {
          then(
            resolve: (value: { data: unknown; error: unknown }) => unknown
          ) {
            return Promise.resolve(response).then(resolve);
          },
        },
        {
          get(target, property) {
            if (property === "then") return target.then;
            return () => builder;
          },
        }
      );
      return builder;
    },
  } as unknown as SupabaseClient;
}

describe("nextStatusAfterOpen", () => {
  it("promotes unapplied to opened", () => {
    expect(nextStatusAfterOpen("unapplied")).toBe("opened");
  });

  it("leaves applied alone", () => {
    expect(nextStatusAfterOpen("applied")).toBe("applied");
  });
});

describe("addJobForUser", () => {
  const job = {
    id: "job-1",
    url: "https://example.com/jobs/1",
    created_at: "2026-07-16T00:00:00.000Z",
  };

  it("does not claim catalog creation when a concurrent insert wins", async () => {
    const client = scriptedClient([
      { data: null, error: null },
      { data: null, error: null },
      { data: job, error: null },
      { data: { status: "opened" }, error: null },
    ]);

    const result = await addJobForUser(
      "user-1",
      "https://example.com/jobs/1",
      client
    );

    expect(result.createdCatalog).toBe(false);
  });

  it("returns the existing attachment after a concurrent attach wins", async () => {
    const duplicateKeyError = { code: "23505", message: "duplicate key" };
    const client = scriptedClient([
      { data: job, error: null },
      { data: job, error: null },
      { data: null, error: null },
      { data: null, error: duplicateKeyError },
      { data: { status: "opened" }, error: null },
    ]);

    const result = await addJobForUser(
      "user-1",
      "https://example.com/jobs/1",
      client
    );

    expect(result.attached).toBe(false);
    expect(result.item.status).toBe("opened");
  });
});
