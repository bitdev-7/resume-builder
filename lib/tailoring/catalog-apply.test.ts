import fs from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import type { CatalogPatch } from "@/lib/tailoring/catalog-schemas";
import { applyCatalogPatch } from "@/lib/tailoring/catalog-apply";
import { readAllCatalogFilesRaw } from "@/lib/tailoring/catalog-io";
import { getBuiltinSkillAliasesSnapshot } from "@/lib/tailoring/skill-ontology";
import { getBuiltinRoleCatalog } from "@/lib/tailoring/role-skill-catalog";

const tempDirs: string[] = [];

afterEach(async () => {
  delete process.env.CATALOG_DIR;
  for (const dir of tempDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

async function seedTempCatalog(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "catalog-apply-"));
  tempDirs.push(dir);
  process.env.CATALOG_DIR = dir;

  const files = {
    "catalog-version.json": JSON.stringify({ version: "2026-07-16.1" }, null, 2) + "\n",
    "skill-aliases.json": JSON.stringify({ Python: ["py"], SQL: [] }, null, 2) + "\n",
    "skill-relationships.json": JSON.stringify([], null, 2) + "\n",
    "alternative-groups.json": JSON.stringify([], null, 2) + "\n",
    "role-skill-catalog.json":
      JSON.stringify(
        {
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
        null,
        2
      ) + "\n",
  };

  for (const [name, content] of Object.entries(files)) {
    await fs.writeFile(path.join(dir, name), content, "utf8");
  }
  return dir;
}

describe("applyCatalogPatch", () => {
  it("writes merged catalog to disk and reloads runtime builtins", async () => {
    await seedTempCatalog();

    const proposal: CatalogPatch = {
      archetype: {
        action: "merge",
        targetId: "backend_engineer",
        label: "Backend Engineer",
        titleKeywords: ["back end"],
        core: ["Redis"],
        ecosystem: { dataStores: ["Redis"] },
        marketRelevant: [],
        skillCategoryHints: ["Data"],
      },
      skillAliases: { Redis: ["redis cache"] },
      relationships: [],
      alternativeGroups: [],
    };

    const result = await applyCatalogPatch(proposal);
    expect(result.applied).toBe(true);
    expect(result.version).not.toBe("2026-07-16.1");

    const onDisk = await readAllCatalogFilesRaw();
    expect(onDisk["skill-aliases.json"]).toContain("redis cache");
    expect(getBuiltinSkillAliasesSnapshot().Redis).toContain("redis cache");
    expect(getBuiltinRoleCatalog().backend_engineer.core).toContain("Redis");
  });
});
