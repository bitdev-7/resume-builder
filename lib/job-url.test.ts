import { describe, expect, it } from "vitest";
import { normalizeJobUrl } from "./job-url";

describe("normalizeJobUrl", () => {
  it("keeps the full URL including query string", () => {
    expect(
      normalizeJobUrl(
        "https://www.indeed.com/jobs?q=Full+Stack+Developer&vjk=236e1bf004a60594"
      )
    ).toBe(
      "https://www.indeed.com/jobs?q=Full+Stack+Developer&vjk=236e1bf004a60594"
    );
  });

  it("does not trim or collapse whitespace", () => {
    expect(normalizeJobUrl("  https://jobs.example.com/a   ")).toBe(
      "  https://jobs.example.com/a   "
    );
  });

  it("returns empty string for empty input", () => {
    expect(normalizeJobUrl("")).toBe("");
  });
});
