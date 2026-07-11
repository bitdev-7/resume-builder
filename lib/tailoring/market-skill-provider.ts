import { getRoleCatalogEntry, ROLE_SKILL_CATALOG_VERSION } from "@/lib/tailoring/role-skill-catalog";

/**
 * Abstraction for "what's popular/market-relevant for this role right now."
 * Initial implementation reads the curated, versioned catalog seed data.
 * Swap in a database-backed or periodically-refreshed provider later without
 * touching callers — role skill expansion only depends on this interface.
 */
export interface MarketSkillResult {
  skills: string[];
  source: string;
  version: string;
  updatedAt: string;
}

export interface MarketSkillProvider {
  getRelevantSkills(input: {
    roleArchetype: string;
    region?: string;
    seniority?: string;
  }): Promise<MarketSkillResult>;
}

const CATALOG_UPDATED_AT = "2026-07-10T00:00:00.000Z";

export class StaticMarketSkillProvider implements MarketSkillProvider {
  async getRelevantSkills(input: { roleArchetype: string }): Promise<MarketSkillResult> {
    const entry = getRoleCatalogEntry(input.roleArchetype);
    return {
      skills: entry?.marketRelevant ?? [],
      source: "static_catalog_seed",
      version: ROLE_SKILL_CATALOG_VERSION,
      updatedAt: CATALOG_UPDATED_AT,
    };
  }
}

let defaultProvider: MarketSkillProvider = new StaticMarketSkillProvider();

export function getMarketSkillProvider(): MarketSkillProvider {
  return defaultProvider;
}

/** For tests, or to later swap in a DB-backed/periodically-refreshed provider. */
export function setMarketSkillProvider(provider: MarketSkillProvider): void {
  defaultProvider = provider;
}
