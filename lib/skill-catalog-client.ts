import { apiUrl } from "@/lib/api-config";

export interface SkillAddition {
  id: string;
  canonicalName: string;
  aliases: string[];
  version: number;
}

export interface ArchetypeAddition {
  id: string;
  label: string;
  titleKeywords: string[];
  core: string[];
  ecosystem: Record<string, string[]>;
  marketRelevant: string[];
  skillCategoryHints: string[];
  version: number;
}

export interface DefaultSkill {
  canonicalName: string;
  aliases: string[];
}

export interface EffectiveCatalog {
  version: string;
  defaults: {
    skills: DefaultSkill[];
    archetypes: Array<{
      id: string;
      label: string;
      titleKeywords: string[];
      core: string[];
      ecosystem: Record<string, string[]>;
      marketRelevant: string[];
      skillCategoryHints: string[];
    }>;
  };
  additions: {
    skills: SkillAddition[];
    archetypes: ArchetypeAddition[];
  };
}

/** Error thrown on a 409 conflict — carries the machine-readable `code`. */
export class CatalogConflictError extends Error {
  code: "stale_version" | "duplicate" | "reserved_id";
  constructor(code: "stale_version" | "duplicate" | "reserved_id", message: string) {
    super(message);
    this.code = code;
  }
}

async function parseError(response: Response): Promise<Error> {
  const err = await response.json().catch(() => ({}));
  const message = typeof err.error === "string" ? err.error : "Request failed";
  if (response.status === 409 && typeof err.code === "string") {
    return new CatalogConflictError(
      err.code as CatalogConflictError["code"],
      message
    );
  }
  return new Error(message);
}

export async function fetchSkillCatalog(accessToken: string): Promise<EffectiveCatalog> {
  const response = await fetch(apiUrl("/api/skill-catalog"), {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw await parseError(response);
  return (await response.json()) as EffectiveCatalog;
}

export interface SkillSavePayload {
  id?: string;
  canonicalName: string;
  aliases: string[];
  version?: number;
}

export async function saveSkillAddition(
  accessToken: string,
  payload: SkillSavePayload
): Promise<SkillAddition> {
  const response = await fetch(apiUrl("/api/skill-catalog/skills"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw await parseError(response);
  const data = (await response.json()) as { skill: SkillAddition };
  return data.skill;
}

export async function deleteSkillAddition(
  accessToken: string,
  id: string,
  version: number
): Promise<void> {
  const response = await fetch(apiUrl("/api/skill-catalog/skills/delete"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ id, version }),
  });
  if (!response.ok) throw await parseError(response);
}

export interface ArchetypeSavePayload {
  id: string;
  label: string;
  titleKeywords: string[];
  core: string[];
  ecosystem: Record<string, string[]>;
  marketRelevant: string[];
  skillCategoryHints: string[];
  version?: number;
}

export async function saveArchetypeAddition(
  accessToken: string,
  payload: ArchetypeSavePayload
): Promise<ArchetypeAddition> {
  const response = await fetch(apiUrl("/api/skill-catalog/archetypes"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw await parseError(response);
  const data = (await response.json()) as { archetype: ArchetypeAddition };
  return data.archetype;
}

export async function deleteArchetypeAddition(
  accessToken: string,
  id: string,
  version: number
): Promise<void> {
  const response = await fetch(apiUrl("/api/skill-catalog/archetypes/delete"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ id, version }),
  });
  if (!response.ok) throw await parseError(response);
}
