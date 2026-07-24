import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import {
  addJobForUser,
  listJobsForUser,
  mergeCatalogJobsWithUserStatus,
  nextStatusAfterOpen,
  openJobForUser,
  resolveJobDescriptionOnAdd,
  setJobStatusForUser,
  updateJobDescriptionForUser,
} from "./jobs";

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

type CapturedWrite = {
  table: string;
  method: "upsert" | "update";
  payload: unknown;
  options?: unknown;
};

function capturingClient(
  reads: Array<{ data: unknown; error: unknown }>,
  onWrite?: (capture: CapturedWrite) => void
): SupabaseClient {
  let readIndex = 0;

  return {
    from(table: string) {
      let method: CapturedWrite["method"] | null = null;
      let payload: unknown;
      let options: unknown;
      const filters: Record<string, unknown> = {};

      const finalize = () => ({
        data: null,
        error: null,
      });

      const builder: Record<string, unknown> = {
        select() {
          return builder;
        },
        eq(column: string, value: unknown) {
          filters[column] = value;
          return builder;
        },
        in(column: string, value: unknown) {
          filters[column] = value;
          return builder;
        },
        single() {
          const response = reads[readIndex++];
          return Promise.resolve(response);
        },
        maybeSingle() {
          const response = reads[readIndex++];
          return Promise.resolve(response);
        },
        upsert(nextPayload: unknown, nextOptions?: unknown) {
          method = "upsert";
          payload = nextPayload;
          options = nextOptions;
          return builder;
        },
        update(nextPayload: unknown) {
          method = "update";
          payload = nextPayload;
          return builder;
        },
        order() {
          return builder;
        },
        then(
          resolve: (value: { data: unknown; error: unknown }) => unknown,
          reject?: (reason: unknown) => unknown
        ) {
          if (method) {
            onWrite?.({ table, method, payload, options });
            return Promise.resolve(finalize()).then(resolve, reject);
          }
          const response = reads[readIndex++];
          return Promise.resolve(response).then(resolve, reject);
        },
      };

      return builder as unknown as ReturnType<SupabaseClient["from"]>;
    },
  } as unknown as SupabaseClient;
}

function scriptedListClient(
  jobs: Array<{ id: string; url: string; created_at: string }>,
  statuses: Array<{ job_id: string; status: string }>
): SupabaseClient {
  return {
    from(table: string) {
      const response =
        table === "jobs"
          ? { data: jobs, error: null }
          : { data: statuses, error: null };
      const builder = new Proxy(
        {
          then(resolve: (value: { data: unknown; error: unknown }) => unknown) {
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

describe("mergeCatalogJobsWithUserStatus", () => {
  it("returns every catalog job with unapplied when the user has no status row", () => {
    const merged = mergeCatalogJobsWithUserStatus(
      [
        {
          id: "job-a",
          url: "https://example.com/a",
          created_at: "2026-07-16T00:00:00.000Z",
        },
        {
          id: "job-b",
          url: "https://example.com/b",
          created_at: "2026-07-15T00:00:00.000Z",
        },
      ],
      [{ job_id: "job-a", status: "applied" }]
    );

    expect(merged).toEqual([
      {
        job_id: "job-a",
        url: "https://example.com/a",
        created_at: "2026-07-16T00:00:00.000Z",
        status: "applied",
        job_description: "",
      },
      {
        job_id: "job-b",
        url: "https://example.com/b",
        created_at: "2026-07-15T00:00:00.000Z",
        status: "unapplied",
        job_description: "",
      },
    ]);
  });
});

describe("mergeCatalogJobsWithUserStatus — job_description", () => {
  it("includes job_description from status rows (default empty)", () => {
    const merged = mergeCatalogJobsWithUserStatus(
      [{ id: "job-a", url: "https://example.com/a", created_at: "2026-07-16T00:00:00.000Z" }],
      [{ job_id: "job-a", status: "opened", job_description: "Need a Java engineer" }]
    );
    expect(merged[0].job_description).toBe("Need a Java engineer");
  });

  it("defaults job_description to empty string when status has none", () => {
    const merged = mergeCatalogJobsWithUserStatus(
      [{ id: "job-a", url: "https://example.com/a", created_at: "2026-07-16T00:00:00.000Z" }],
      []
    );
    expect(merged[0].job_description).toBe("");
  });
});

describe("resolveJobDescriptionOnAdd", () => {
  it("keeps existing when incoming is empty", () => {
    expect(resolveJobDescriptionOnAdd("old JD", "")).toBe("old JD");
    expect(resolveJobDescriptionOnAdd("old JD", "   ")).toBe("old JD");
  });
  it("overwrites when incoming is non-empty", () => {
    expect(resolveJobDescriptionOnAdd("old JD", " new JD ")).toBe("new JD");
  });
  it("uses incoming when no existing", () => {
    expect(resolveJobDescriptionOnAdd("", "hello")).toBe("hello");
  });
});

describe("listJobsForUser", () => {
  it("loads the shared catalog and overlays the current user's statuses", async () => {
    const client = scriptedListClient(
      [
        {
          id: "job-shared",
          url: "https://example.com/shared",
          created_at: "2026-07-16T00:00:00.000Z",
        },
      ],
      []
    );

    const rows = await listJobsForUser("user-1", client);
    expect(rows).toEqual([
      {
        job_id: "job-shared",
        url: "https://example.com/shared",
        created_at: "2026-07-16T00:00:00.000Z",
        status: "unapplied",
        job_description: "",
      },
    ]);
  });
});

describe("nextStatusAfterOpen", () => {
  it("promotes unapplied to opened", () => {
    expect(nextStatusAfterOpen("unapplied")).toBe("opened");
  });

  it("leaves applied alone", () => {
    expect(nextStatusAfterOpen("applied")).toBe("applied");
  });
});

describe("openJobForUser", () => {
  const job = {
    id: "job-1",
    url: "https://example.com/jobs/1",
    created_at: "2026-07-16T00:00:00.000Z",
  };

  it("upserts status with array payload when no existing row", async () => {
    const writes: CapturedWrite[] = [];
    const client = capturingClient(
      [{ data: job, error: null }, { data: null, error: null }],
      (capture) => writes.push(capture)
    );

    const result = await openJobForUser("user-1", "job-1", client);

    expect(result.status).toBe("opened");
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      table: "user_job_status",
      method: "upsert",
      options: { onConflict: "user_id,job_id" },
    });
    expect(Array.isArray(writes[0].payload)).toBe(true);
    expect(writes[0].payload).toEqual([
      expect.objectContaining({
        user_id: "user-1",
        job_id: "job-1",
        status: "opened",
      }),
    ]);
    expect(
      (writes[0].payload as Array<Record<string, unknown>>)[0]
    ).not.toHaveProperty("job_description");
  });

  it("upserts with array payload and omits job_description when row has JD", async () => {
    const writes: CapturedWrite[] = [];
    const client = capturingClient(
      [
        { data: job, error: null },
        {
          data: { status: "unapplied", job_description: "Need a Java engineer" },
          error: null,
        },
      ],
      (capture) => writes.push(capture)
    );

    const result = await openJobForUser("user-1", "job-1", client);

    expect(result.status).toBe("opened");
    expect(result.job_description).toBe("Need a Java engineer");
    expect(writes).toHaveLength(1);
    expect(Array.isArray(writes[0].payload)).toBe(true);
    expect(
      (writes[0].payload as Array<Record<string, unknown>>)[0]
    ).not.toHaveProperty("job_description");
  });
});

describe("setJobStatusForUser", () => {
  it("uses bulk array upsert (not update) when no pre-existing row", async () => {
    const writes: CapturedWrite[] = [];
    const client = capturingClient([], (capture) => writes.push(capture));

    await setJobStatusForUser("user-1", ["job-a", "job-b"], "applied", client);

    const statusWrite = writes.find((w) => w.table === "user_job_status");
    expect(statusWrite?.method).toBe("upsert");
    expect(statusWrite?.options).toEqual({ onConflict: "user_id,job_id" });
    expect(Array.isArray(statusWrite?.payload)).toBe(true);
    expect(statusWrite?.payload).toEqual([
      expect.objectContaining({
        user_id: "user-1",
        job_id: "job-a",
        status: "applied",
      }),
      expect.objectContaining({
        user_id: "user-1",
        job_id: "job-b",
        status: "applied",
      }),
    ]);
    for (const row of statusWrite?.payload as Array<Record<string, unknown>>) {
      expect(row).not.toHaveProperty("job_description");
    }
    expect(writes.some((w) => w.table === "user_job_status" && w.method === "update")).toBe(
      false
    );
  });
});

describe("updateJobDescriptionForUser", () => {
  it("upserts trimmed JD with array payload and no status column", async () => {
    const writes: CapturedWrite[] = [];
    const client = capturingClient([], (capture) => writes.push(capture));

    const saved = await updateJobDescriptionForUser(
      "user-1",
      "job-1",
      "  Need a Java engineer  ",
      client
    );

    expect(saved).toBe("Need a Java engineer");
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      table: "user_job_status",
      method: "upsert",
      options: { onConflict: "user_id,job_id" },
    });
    expect(Array.isArray(writes[0].payload)).toBe(true);
    const row = (writes[0].payload as Array<Record<string, unknown>>)[0];
    expect(row).toMatchObject({
      user_id: "user-1",
      job_id: "job-1",
      job_description: "Need a Java engineer",
    });
    expect(row).not.toHaveProperty("status");
  });

  it("allows clearing the JD with an empty string", async () => {
    const writes: CapturedWrite[] = [];
    const client = capturingClient([], (capture) => writes.push(capture));

    const saved = await updateJobDescriptionForUser("user-1", "job-1", "   ", client);

    expect(saved).toBe("");
    const row = (writes[0].payload as Array<Record<string, unknown>>)[0];
    expect(row.job_description).toBe("");
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
      { data: { status: "opened", job_description: "" }, error: null },
    ]);

    const result = await addJobForUser(
      "user-1",
      "https://example.com/jobs/1",
      "",
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
      { data: { status: "opened", job_description: "" }, error: null },
    ]);

    const result = await addJobForUser(
      "user-1",
      "https://example.com/jobs/1",
      "",
      client
    );

    expect(result.attached).toBe(false);
    expect(result.item.status).toBe("opened");
  });
});
