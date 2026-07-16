import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ensureSkillRegistryLoaded,
  invalidateSkillRegistry,
  getEffectiveCatalog,
} from "@/lib/tailoring/skill-registry";
import { detectSkillMentions } from "@/lib/tailoring/skill-ontology";
import { getRoleCatalogEntry, isBuiltinArchetypeId } from "@/lib/tailoring/role-skill-catalog";

/**
 * Builds a fake Supabase client whose `.from(table).select(...).order(...)[.limit().maybeSingle()]`
 * chains resolve to the seeded data. Two query shapes are used by the registry:
 *  - freshness probe: ...order(...).limit(1).maybeSingle() -> { data: { updated_at } | null, error }
 *  - full load:       ...order(...)                        -> { data: [...], error }
 */
function mockClient(seed: {
  skills: Array<{ id: string; canonical_name: string; aliases: string[]; version: number; updated_at: string }>;
  archetypes: Array<{
    id: string;
    label: string;
    title_keywords: string[];
    core: string[];
    ecosystem: Record<string, string[]>;
    market_relevant: string[];
    skill_category_hints: string[];
    version: number;
    updated_at: string;
  }>;
}): SupabaseClient {
  const buildChain = (table: string) => {
    const state: { select?: string; orderField?: string; limit?: number } = {};
    const chain: any = {
      select(cols: string) {
        state.select = cols;
        return chain;
      },
      order(field: string) {
        state.orderField = field;
        return chain;
      },
      limit(n: number) {
        state.limit = n;
        return chain;
      },
      async maybeSingle() {
        // Freshness probe: return the row with the max updated_at for this table.
        const rows = (table === "skill_catalog_additions" ? seed.skills : seed.archetypes) as Array<{
          updated_at: string;
        }>;
        const sorted = [...rows].sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
        return { data: sorted[0] ? { updated_at: sorted[0].updated_at } : null, error: null };
      },
      then(resolve: (v: any) => void) {
        // Full load: return all rows for this table (ordered by the requested field).
        const rows = table === "skill_catalog_additions" ? seed.skills : seed.archetypes;
        const field = state.orderField ?? "";
        const data = [...rows].sort((a: any, b: any) =>
          (a[field] ?? "") < (b[field] ?? "") ? -1 : 1
        );
        resolve({ data, error: null });
      },
    };
    return chain;
  };

  const client: any = {
    from(table: string) {
      return buildChain(table);
    },
  };
  return client as unknown as SupabaseClient;
}

describe("skill registry — merging additions over defaults", () => {
  it("registers a custom skill alias and detects it in text after reload", async () => {
    const client = mockClient({
      skills: [
        {
          id: "s1",
          canonical_name: "MyCustomSkill",
          aliases: ["mcs", "my custom skill"],
          version: 1,
          updated_at: "2026-07-16T00:00:00Z",
        },
      ],
      archetypes: [],
    });

    // Before loading, the custom alias is not detected.
    expect(detectSkillMentions("Built with mcs")).not.toContain("MyCustomSkill");

    await ensureSkillRegistryLoaded(client);

    expect(detectSkillMentions("Built with mcs")).toContain("MyCustomSkill");
    expect(detectSkillMentions("my custom skill here")).toContain("MyCustomSkill");
  });

  it("registers a custom archetype and exposes it via getRoleCatalogEntry", async () => {
    const client = mockClient({
      skills: [],
      archetypes: [
        {
          id: "custom_platform_engineer",
          label: "Platform Engineer",
          title_keywords: ["platform engineer"],
          core: ["Go", "Kubernetes"],
          ecosystem: { delivery: ["Terraform"] },
          market_relevant: [],
          skill_category_hints: ["Languages", "Cloud & DevOps"],
          version: 1,
          updated_at: "2026-07-16T00:00:01Z",
        },
      ],
    });

    await ensureSkillRegistryLoaded(client);
    expect(getRoleCatalogEntry("custom_platform_engineer")?.label).toBe("Platform Engineer");
    expect(isBuiltinArchetypeId("custom_platform_engineer")).toBe(false);
    expect(isBuiltinArchetypeId("ai_engineer")).toBe(true);
  });

  it("does not mutate built-in defaults and never shadows a built-in archetype id", async () => {
    const client = mockClient({
      skills: [],
      archetypes: [
        {
          id: "ai_engineer", // reserved — must be rejected
          label: "Evil twin",
          title_keywords: [],
          core: [],
          ecosystem: {},
          market_relevant: [],
          skill_category_hints: [],
          version: 1,
          updated_at: "2026-07-16T00:00:02Z",
        },
      ],
    });

    await ensureSkillRegistryLoaded(client);
    expect(getRoleCatalogEntry("ai_engineer")?.label).toBe("AI Engineer"); // unchanged
  });

  it("reconciles deletions: a removed custom skill is no longer detected", async () => {
    const withSkill = mockClient({
      skills: [
        {
          id: "s1",
          canonical_name: "TempSkill",
          aliases: ["temp skill"],
          version: 1,
          updated_at: "2026-07-16T00:00:03Z",
        },
      ],
      archetypes: [],
    });
    await ensureSkillRegistryLoaded(withSkill);
    expect(detectSkillMentions("used temp skill")).toContain("TempSkill");

    invalidateSkillRegistry();

    const withoutSkill = mockClient({ skills: [], archetypes: [] });
    await ensureSkillRegistryLoaded(withoutSkill);
    expect(detectSkillMentions("used temp skill")).not.toContain("TempSkill");
  });

  it("getEffectiveCatalog returns defaults plus additions with versions", async () => {
    const client = mockClient({
      skills: [
        {
          id: "s1",
          canonical_name: "MyCustomSkill",
          aliases: ["mcs"],
          version: 3,
          updated_at: "2026-07-16T00:00:04Z",
        },
      ],
      archetypes: [],
    });
    await ensureSkillRegistryLoaded(client);

    const catalog = getEffectiveCatalog();
    expect(catalog.defaults.skills.length).toBeGreaterThan(0);
    expect(catalog.defaults.archetypes.length).toBeGreaterThan(0);
    expect(catalog.additions.skills).toHaveLength(1);
    expect(catalog.additions.skills[0].version).toBe(3);
    expect(catalog.additions.skills[0].canonicalName).toBe("MyCustomSkill");
  });

  it("is a no-op when the cache is fresh (same stamp)", async () => {
    const seed = {
      skills: [
        {
          id: "s1",
          canonical_name: "StableSkill",
          aliases: ["stable"],
          version: 1,
          updated_at: "2026-07-16T00:00:05Z",
        },
      ],
      archetypes: [],
    };
    const client = mockClient(seed);
    await ensureSkillRegistryLoaded(client);
    expect(detectSkillMentions("stable here")).toContain("StableSkill");
    // Second load with the same stamp should not throw and should keep state.
    await expect(ensureSkillRegistryLoaded(client)).resolves.toBeUndefined();
    expect(detectSkillMentions("stable here")).toContain("StableSkill");
  });
});
