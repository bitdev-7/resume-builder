import { callAI, formatAIProviderError } from "@/lib/ai-provider";
import {
  parseUseOpenRouter,
  requireAIConfigured,
  resolveExtractModel,
  resolveExtractProvider,
} from "@/lib/ai-api";
import { readAllCatalogFilesRaw } from "@/lib/tailoring/catalog-io";
import { parseCatalogFromFiles } from "@/lib/tailoring/catalog-merge";
import type { CatalogVerifyIssue } from "@/lib/tailoring/catalog-verify";
import { catalogPatchSchema, type CatalogPatch } from "@/lib/tailoring/catalog-schemas";

export type CatalogSeniority = "junior" | "mid" | "senior" | "staff";

export interface CatalogResearchInput {
  title: string;
  seniority?: CatalogSeniority;
  useOpenRouter?: boolean;
  /** When set, LLM must merge into this existing archetype id. */
  targetArchetypeId?: string;
}

export interface CatalogResearchResult {
  proposal: CatalogPatch;
  model: string;
  costUsd?: number;
}

export interface CatalogRefineInput {
  proposal: CatalogPatch;
  issues: CatalogVerifyIssue[];
  title?: string;
  seniority?: CatalogSeniority;
  useOpenRouter?: boolean;
}

export interface CatalogRefineResult extends CatalogResearchResult {
  refinedFromIssues: number;
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
  context: { archetypeIds: string[]; canonicalSkills: string[]; sampleArchetypes: string },
  targetArchetypeId?: string
): string {
  const seniorityLine = seniority
    ? `Seniority hint: ${seniority} (adjust emphasis — staff roles include architecture/leadership keywords).`
    : "Seniority: infer from the title.";

  const skillSample = context.canonicalSkills.slice(0, 80).join(", ");

  const archetypeConstraint = targetArchetypeId
    ? `\nIMPORTANT: You MUST set archetype.action to "merge" and archetype.targetId to "${targetArchetypeId}". Refresh market skills for this existing archetype only — do not create a new id.\n`
    : "";

  return `Research current market skills for this job title and produce a catalog patch JSON object.

Job title: "${title}"
${seniorityLine}
${archetypeConstraint}
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

function buildCatalogRefinePrompt(
  proposal: CatalogPatch,
  issues: CatalogVerifyIssue[],
  context: { archetypeIds: string[]; canonicalSkills: string[] },
  title?: string
): string {
  const issueLines = issues
    .map((i) => `- [${i.kind}] ${i.file}${i.path ? ` → ${i.path}` : ""}: ${i.message}`)
    .join("\n");

  const skillSample = context.canonicalSkills.slice(0, 100).join(", ");

  return `A catalog patch failed validation. Fix the patch so every issue is resolved.

${title ? `Original job title: "${title}"\n` : ""}
Validation issues:
${issueLines}

Failed patch:
${JSON.stringify(proposal, null, 2)}

Existing archetype ids:
${context.archetypeIds.join(", ")}

Existing canonical skills (reuse exact names when possible; sample):
${skillSample}

Rules:
1. Return ONE corrected JSON object (same CatalogPatch shape) — no markdown, no prose.
2. Fix every validation issue listed above.
3. For cross_check "use merge" / "use create" — correct archetype.action and targetId.
4. Every relationship from/to must reference a canonical skill in skillAliases or the existing catalog.
5. Add missing canonical skills to skillAliases (aliases may be []).
6. Do NOT remove fields; only fix invalid values and add missing entries.`;
}

async function callCatalogPatchLlm(
  systemContent: string,
  userContent: string,
  useOpenRouter: boolean,
  stage: string
): Promise<{ proposal: CatalogPatch; model: string; costUsd?: number }> {
  const provider = resolveExtractProvider(useOpenRouter);
  requireAIConfigured(useOpenRouter, provider);
  const model = resolveExtractModel(useOpenRouter);

  const resp = await callAI({
    useOpenRouter,
    model,
    ...(provider ? { provider } : {}),
    messages: [
      { role: "system", content: systemContent },
      { role: "user", content: userContent },
    ],
    temperature: 0.2,
    max_tokens: 4096,
    tryParseJson: true,
    stage,
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
  const prompt = buildCatalogResearchPrompt(
    title,
    input.seniority,
    context,
    input.targetArchetypeId
  );

  try {
    const result = await callCatalogPatchLlm(
      "You are a technical recruiter and skills taxonomy expert. Respond with a single valid JSON object only — no markdown fences, no prose.",
      prompt,
      useOpenRouter,
      "catalog-research"
    );

    return result;
  } catch (err: unknown) {
    const elapsedMs =
      err && typeof err === "object" && "elapsedMs" in err
        ? Number((err as { elapsedMs?: number }).elapsedMs)
        : undefined;
    throw new Error(formatAIProviderError(err, model, elapsedMs, { useOpenRouter, provider }));
  }
}

export async function refineCatalogPatch(input: CatalogRefineInput): Promise<CatalogRefineResult> {
  if (!input.issues.length) {
    throw new Error("No validation issues to refine");
  }

  const useOpenRouter = parseUseOpenRouter(input.useOpenRouter, true);
  const provider = resolveExtractProvider(useOpenRouter);
  requireAIConfigured(useOpenRouter, provider);
  const model = resolveExtractModel(useOpenRouter);

  const context = await buildResearchContext();
  const prompt = buildCatalogRefinePrompt(
    input.proposal,
    input.issues,
    context,
    input.title
  );

  try {
    const result = await callCatalogPatchLlm(
      "You fix invalid catalog patch JSON. Respond with a single valid JSON object only — no markdown fences, no prose.",
      prompt,
      useOpenRouter,
      "catalog-refine"
    );

    return {
      ...result,
      refinedFromIssues: input.issues.length,
    };
  } catch (err: unknown) {
    const elapsedMs =
      err && typeof err === "object" && "elapsedMs" in err
        ? Number((err as { elapsedMs?: number }).elapsedMs)
        : undefined;
    throw new Error(formatAIProviderError(err, model, elapsedMs, { useOpenRouter, provider }));
  }
}
