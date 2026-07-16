import { describe, expect, it } from "vitest";
import { verifyCatalogJsonContents, verifyCatalogOnDisk } from "@/lib/tailoring/catalog-verify";
import type { CatalogFileName } from "@/lib/tailoring/catalog-io";

const minimalValid: Record<CatalogFileName, string> = {
  "catalog-version.json": JSON.stringify({ version: "1.0.0" }),
  "skill-aliases.json": JSON.stringify({ Python: ["py"] }),
  "skill-relationships.json": JSON.stringify([
    { from: "Django", to: "Python", type: "requires", confidence: 0.98 },
  ]),
  "alternative-groups.json": JSON.stringify([
    { group: "cloud_platform", relationship: "alternatives", skills: ["AWS", "Azure"] },
  ]),
  "role-skill-catalog.json": JSON.stringify({
    backend_engineer: {
      id: "backend_engineer",
      label: "Backend Engineer",
      titleKeywords: ["backend"],
      core: ["SQL"],
      ecosystem: { dataStores: ["PostgreSQL"] },
      marketRelevant: [],
      skillCategoryHints: ["Backend"],
    },
  }),
};

describe("verifyCatalogJsonContents", () => {
  it("accepts valid catalog JSON", () => {
    const result = verifyCatalogJsonContents(minimalValid);
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("flags invalid JSON syntax", () => {
    const result = verifyCatalogJsonContents({
      ...minimalValid,
      "skill-aliases.json": "{ not valid json",
    });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.kind === "json_syntax" && i.file === "skill-aliases.json")).toBe(
      true
    );
  });

  it("flags schema errors after valid JSON parse", () => {
    const result = verifyCatalogJsonContents({
      ...minimalValid,
      "catalog-version.json": JSON.stringify({}),
    });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.kind === "schema" && i.file === "catalog-version.json")).toBe(true);
  });

  it("verifies on-disk catalog files in the repo", async () => {
    const result = await verifyCatalogOnDisk();
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });
});
