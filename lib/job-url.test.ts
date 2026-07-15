import { describe, expect, it } from "vitest";
import { normalizeJobUrl } from "./job-url";

describe("normalizeJobUrl", () => {
  it("strips query string", () => {
    expect(normalizeJobUrl("https://jobs.example.com/x?utm_source=li&foo=1")).toBe(
      "https://jobs.example.com/x"
    );
  });

  it("trims and collapses whitespace", () => {
    expect(normalizeJobUrl("  https://jobs.example.com/a   ")).toBe(
      "https://jobs.example.com/a"
    );
  });

  it("returns empty for blank input", () => {
    expect(normalizeJobUrl("   ")).toBe("");
  });
});
