import { describe, expect, it } from "vitest";
import {
  bumpCatalogVersion,
  mergeCatalogPatch,
  serializeCatalog,
  type ParsedCatalog,
} from "@/lib/tailoring/catalog-merge";
import type { CatalogPatch } from "@/lib/tailoring/catalog-schemas";
import { verifyCatalogJsonContents } from "@/lib/tailoring/catalog-verify";

const baseCatalog: ParsedCatalog = {
  version: "2026-07-16.1",
  skillAliases: { Python: ["py"], Django: [] },
  relationships: [{ from: "Django", to: "Python", type: "requires", confidence: 0.98 }],
  alternativeGroups: [
    { group: "cloud_platform", relationship: "alternatives", skills: ["AWS", "Azure"] },
  ],
  roleSkillCatalog: {
    backend_engineer: {
      id: "backend_engineer",
      label: "Backend Engineer",
      titleKeywords: ["backend"],
      core: ["SQL"],
      ecosystem: { dataStores: ["PostgreSQL"] },
      marketRelevant: [],
      skillCategoryHints: ["Backend"],
    },
  },
};

const samplePatch: CatalogPatch = {
  archetype: {
    action: "merge",
    targetId: "backend_engineer",
    label: "Backend Engineer",
    titleKeywords: ["back end"],
    core: ["Go"],
    ecosystem: { dataStores: ["Redis"] },
    marketRelevant: ["Kafka"],
    skillCategoryHints: ["Languages"],
  },
  skillAliases: {
    Python: ["python3"],
    Go: ["golang"],
  },
  relationships: [
    { from: "Django", to: "Python", type: "requires", confidence: 0.98 },
    { from: "Go", to: "SQL", type: "commonly_used_with", confidence: 0.7 },
  ],
  alternativeGroups: [
    { group: "cloud_platform", relationship: "alternatives", skills: ["GCP"] },
    { group: "message_brokers", relationship: "alternatives", skills: ["Kafka", "RabbitMQ"] },
  ],
};

describe("mergeCatalogPatch", () => {
  it("dedupes aliases and relationships and merges archetype fields", () => {
    const { merged, summary } = mergeCatalogPatch(baseCatalog, samplePatch);
    expect(merged.skillAliases.Python).toContain("py");
    expect(merged.skillAliases.Python).toContain("python3");
    expect(summary.aliasesAdded).toBe(2);
    expect(summary.relationshipsAdded).toBe(1);
    expect(merged.relationships).toHaveLength(2);
    expect(merged.roleSkillCatalog.backend_engineer.core).toContain("SQL");
    expect(merged.roleSkillCatalog.backend_engineer.core).toContain("Go");
    expect(merged.roleSkillCatalog.backend_engineer.titleKeywords).toContain("back end");
    const cloud = merged.alternativeGroups.find((g) => g.group === "cloud_platform");
    expect(cloud?.skills).toEqual(expect.arrayContaining(["AWS", "Azure", "GCP"]));
  });

  it("serializes to valid catalog JSON", () => {
    const { merged } = mergeCatalogPatch(baseCatalog, samplePatch);
    const files = serializeCatalog(merged);
    const result = verifyCatalogJsonContents(files);
    expect(result.valid).toBe(true);
  });
});

describe("bumpCatalogVersion", () => {
  it("increments same-day patch segment", () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(bumpCatalogVersion(`${today}.3`)).toBe(`${today}.4`);
  });

  it("starts at .1 for a new date", () => {
    expect(bumpCatalogVersion("2020-01-01.9")).toMatch(/^\d{4}-\d{2}-\d{2}\.1$/);
  });
});
