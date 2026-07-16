import { callAI, formatAIProviderError } from "@/lib/ai-provider";
import {
  parseUseOpenRouter,
  requireAIConfigured,
  resolveExtractModel,
  resolveExtractProvider,
} from "@/lib/ai-api";
import { readAllCatalogFilesRaw } from "@/lib/tailoring/catalog-io";
import { parseCatalogFromFiles } from "@/lib/tailoring/catalog-merge";
import { catalogPatchSchema, type CatalogPatch } from "@/lib/tailoring/catalog-schemas";

export type CatalogSeniority = "junior" | "mid" | "senior" | "staff";

export interface CatalogResearchInput {
  title: string;
  seniority?: CatalogSeniority;
  useOpenRouter?: boolean;
}

export interface CatalogResearchResult {
  proposal: CatalogPatch;
  model: string;
  costUsd?: number;
}

async function buildResearchContext(): Promise<{
  archetypeIds: string[];
  canonicalSkills: string[];
  sampleArchetypes: string;
}> {
  const raw = await readAllCatalogFilesRaw();
  const catalog = parseCatalogFromFiles(raw);
  const archetypeIds = Object.keys(catalog.roleSkillCatalog);
  const canonicalSkills = Object.keys(catalog.skillAliases);
  const sampleArchetypes = archetypeIds
    .slice(0, 12)
    .map((id) => {
      const entry = catalog.roleSkillCatalog[id];
      return `${id}: ${entry.label} | core: ${entry.core.slice(0, 6).join(", ")}`;
    })
    .join("\n");

  return { archetypeIds, canonicalSkills, sampleArchetypes };
}

function buildCatalogResearchPrompt(
  title: string,
  seniority: CatalogSeniority | undefined,
  context: { archetypeIds: string[]; canonicalSkills: string[]; sampleArchetypes: string }
): string {
  const seniorityLine = seniority
    ? `Seniority hint: ${seniority} (adjust emphasis — staff roles include architecture/leadership keywords).`
    : "Seniority: infer from the title.";

  const skillSample = context.canonicalSkills.slice(0, 80).join(", ");

  return `Research current market skills for this job title and produce a catalog patch JSON object.

Job title: "${title}"
${seniorityLine}

Existing archetype ids (${context.archetypeIds.length} total):
${context.archetypeIds.join(", ")}

Sample archetypes:
${context.sampleArchetypes}

Existing canonical skills (prefer reusing these exact names; sample):
${skillSample}

Rules:
1. Return ONE JSON object matching this shape exactly (no markdown):
{
  "archetype": {
    "action": "create" | "merge",
    "targetId": "snake_case_id",
    "label": "Human Label",
    "titleKeywords": ["..."],
    "core": ["..."],
    "ecosystem": { "groupName": ["skill", "..."] },
    "marketRelevant": ["..."],
    "skillCategoryHints": ["..."],
    "mergeReason": "optional when action is merge"
  },
  "skillAliases": { "CanonicalName": ["alias1"] },
  "relationships": [{ "from": "Skill", "to": "Skill", "type": "requires|strongly_implies|commonly_used_with|alternative_to|same_ecosystem|market_adjacent", "confidence": 0.0-1.0 }],
  "alternativeGroups": [{ "group": "group_name", "relationship": "alternatives", "skills": ["A", "B"] }]
}
2. Compare to existing archetypes — merge if same role family with high overlap (>80% core/ecosystem); else create new snake_case targetId.
3. Do NOT remove or rename existing archetype ids.
4. Only add genuinely new tools as new canonical skills in skillAliases.
5. Use requires/strongly_implies only when confident; otherwise commonly_used_with or market_adjacent.
6. Include any new canonical skills referenced in relationships inside skillAliases (aliases may be empty []).
7. Ecosystem group names should be descriptive camelCase keys (e.g. backendEcosystem, cloudPlatforms).`;
}

export async function researchCatalogPatch(
  input: CatalogResearchInput
): Promise<CatalogResearchResult> {
  const title = String(input.title || "").trim();
  if (!title) throw new Error("Job title is required");

  const useOpenRouter = parseUseOpenRouter(input.useOpenRouter, true);
  const provider = resolveExtractProvider(useOpenRouter);
  requireAIConfigured(useOpenRouter, provider);
  const model = resolveExtractModel(useOpenRouter);

  const context = await buildResearchContext();
  const prompt = buildCatalogResearchPrompt(title, input.seniority, context);

  try {
    const resp = await callAI({
      useOpenRouter,
      model,
      ...(provider ? { provider } : {}),
      messages: [
        {
          role: "system",
          content:
            "You are a technical recruiter and skills taxonomy expert. Respond with a single valid JSON object only — no markdown fences, no prose.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
      max_tokens: 4096,
      tryParseJson: true,
      stage: "catalog-research",
    });

    const parsed = catalogPatchSchema.safeParse(resp.json ?? JSON.parse(resp.text));
    if (!parsed.success) {
      const detail = parsed.error.issues.map((i) => i.message).join("; ");
      throw new Error(`LLM returned invalid catalog patch: ${detail}`);
    }

    return {
      proposal: parsed.data,
      model: resp.modelUsed,
      costUsd: resp.costUsd,
    };
  } catch (err: unknown) {
    const elapsedMs =
      err && typeof err === "object" && "elapsedMs" in err
        ? Number((err as { elapsedMs?: number }).elapsedMs)
        : undefined;
    throw new Error(formatAIProviderError(err, model, elapsedMs, { useOpenRouter, provider }));
  }
}
