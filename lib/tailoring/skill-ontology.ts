/**
 * Skill ontology: canonical names/aliases, relationships between skills, and a
 * conservative auto-entailment policy.
 *
 * Built-in defaults live in data/tailoring/*.json. Runtime DB additions are
 * merged via registerSkillAlias / registerRelationship in skill-registry.ts.
 *
 * IMPORTANT: "related" is not "candidate knows." Only `requires` relationships
 * and a small curated allow-list of `strongly_implies` relationships
 * (AUTO_ENTAILABLE_TYPES below) may auto-create supported evidence.
 */
import skillAliasesJson from "../../data/tailoring/skill-aliases.json";
import relationshipsJson from "../../data/tailoring/skill-relationships.json";
import alternativeGroupsJson from "../../data/tailoring/alternative-groups.json";

export type SkillRelationshipType =
  | "requires"
  | "strongly_implies"
  | "commonly_used_with"
  | "alternative_to"
  | "same_ecosystem"
  | "market_adjacent";

export interface SkillRelationship {
  from: string;
  to: string;
  type: SkillRelationshipType;
  confidence: number;
}

export interface AlternativeGroup {
  group: string;
  relationship: "alternatives";
  skills: string[];
}

/** Mutable snapshot of built-in JSON defaults — updated when catalog is reloaded from disk. */
let builtinSkillAliases: Record<string, string[]> = structuredClone(
  skillAliasesJson as Record<string, string[]>
);

const SKILL_ALIASES: Record<string, string[]> = structuredClone(builtinSkillAliases);

const RELATIONSHIPS: SkillRelationship[] = structuredClone(
  relationshipsJson as SkillRelationship[]
);

const ALTERNATIVE_GROUPS: AlternativeGroup[] = alternativeGroupsJson as AlternativeGroup[];

const ALIAS_TO_CANONICAL: Map<string, string> = new Map();

function rebuildAliasToCanonical(): void {
  ALIAS_TO_CANONICAL.clear();
  for (const [canonical, aliases] of Object.entries(SKILL_ALIASES)) {
    ALIAS_TO_CANONICAL.set(canonical.toLowerCase(), canonical);
    for (const alias of aliases) {
      ALIAS_TO_CANONICAL.set(alias.toLowerCase(), canonical);
    }
  }
}

rebuildAliasToCanonical();

/** True when trimmed lowercased name is a canonical skill or registered alias. */
export function isKnownSkillName(raw: string): boolean {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return false;
  return ALIAS_TO_CANONICAL.has(trimmed.toLowerCase());
}

/** Normalize a raw skill/technology string to its canonical name (best-effort). */
export function normalizeSkillName(raw: string): string {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";
  const lower = trimmed.toLowerCase();
  return ALIAS_TO_CANONICAL.get(lower) || trimmed;
}

export function skillKey(name: string): string {
  return normalizeSkillName(name).toLowerCase();
}

/** Canonical, stable SkillCandidate.id for a skill name — use everywhere a candidate id is created or resolved. */
export function skillCandidateIdFor(name: string): string {
  return `skill_${skillKey(name)}`;
}

export function skillKeyFromCandidateId(id: string): string {
  return id.replace(/^skill_/, "");
}

/** Only these relationship types may ever auto-create supported ("entailed") evidence. */
const AUTO_ENTAILABLE_TYPES: SkillRelationshipType[] = ["requires", "strongly_implies"];
const AUTO_ENTAILMENT_MIN_CONFIDENCE = 0.8;

export function getRelationshipsFrom(skillName: string): SkillRelationship[] {
  const canonical = normalizeSkillName(skillName);
  return RELATIONSHIPS.filter((r) => r.from === canonical);
}

export interface EntailmentResult {
  target: string;
  via: string;
  confidence: number;
}

/**
 * Conservative auto-entailment: given the set of skills the candidate actually
 * possesses (any evidence status other than "unsupported"), return the skills
 * that may be automatically marked "entailed" through requires/strongly_implies.
 */
export function resolveAutoEntailedSkills(
  possessedSkillNames: Iterable<string>
): Map<string, EntailmentResult> {
  const possessed = new Set(
    Array.from(possessedSkillNames, (name) => normalizeSkillName(name))
  );
  const entailed = new Map<string, EntailmentResult>();

  for (const skill of possessed) {
    for (const rel of getRelationshipsFrom(skill)) {
      if (!AUTO_ENTAILABLE_TYPES.includes(rel.type)) continue;
      if (rel.confidence < AUTO_ENTAILMENT_MIN_CONFIDENCE) continue;
      if (possessed.has(rel.to)) continue;

      const existing = entailed.get(rel.to);
      if (!existing || rel.confidence > existing.confidence) {
        entailed.set(rel.to, { target: rel.to, via: skill, confidence: rel.confidence });
      }
    }
  }

  return entailed;
}

export function findAlternativeGroup(skillName: string): AlternativeGroup | undefined {
  const canonical = normalizeSkillName(skillName);
  return ALTERNATIVE_GROUPS.find((g) => g.skills.includes(canonical));
}

export function getAlternativeGroups(): AlternativeGroup[] {
  return ALTERNATIVE_GROUPS;
}

export function getAllCanonicalSkillNames(): string[] {
  return Object.keys(SKILL_ALIASES);
}

/** Read-only snapshot of the current skill aliases (defaults + DB additions). */
export function getSkillAliasesSnapshot(): Record<string, string[]> {
  const snapshot: Record<string, string[]> = {};
  for (const [canonical, aliases] of Object.entries(SKILL_ALIASES)) {
    snapshot[canonical] = [...aliases];
  }
  return snapshot;
}

/** Built-in defaults from JSON (before DB additions). */
export function getBuiltinSkillAliasesSnapshot(): Record<string, string[]> {
  return structuredClone(builtinSkillAliases);
}

/** Replace built-in skill ontology from disk/catalog apply (DB additions re-applied separately). */
export function reloadBuiltinSkillOntology(
  aliases: Record<string, string[]>,
  relationships: SkillRelationship[],
  alternativeGroups: AlternativeGroup[]
): void {
  builtinSkillAliases = structuredClone(aliases);

  for (const key of Object.keys(SKILL_ALIASES)) delete SKILL_ALIASES[key];
  Object.assign(SKILL_ALIASES, structuredClone(aliases));

  RELATIONSHIPS.length = 0;
  RELATIONSHIPS.push(...structuredClone(relationships));

  ALTERNATIVE_GROUPS.length = 0;
  ALTERNATIVE_GROUPS.push(...structuredClone(alternativeGroups));

  rebuildAliasToCanonical();
  resetMentionMatchersCache();
}

let mentionMatchers: { canonical: string; regex: RegExp }[] | null = null;

function buildMentionMatchers(): { canonical: string; regex: RegExp }[] {
  const entries: { canonical: string; term: string }[] = [];
  for (const [canonical, aliases] of Object.entries(SKILL_ALIASES)) {
    entries.push({ canonical, term: canonical });
    for (const alias of aliases) entries.push({ canonical, term: alias });
  }
  entries.sort((a, b) => b.term.length - a.term.length);

  return entries.map(({ canonical, term }) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(?<![a-zA-Z0-9])${escaped}(?![a-zA-Z0-9])`, "i");
    return { canonical, regex };
  });
}

/** Scan free text (e.g. a résumé bullet) for mentions of known canonical skills/tools. */
export function detectSkillMentions(text: string): string[] {
  if (!text) return [];
  if (!mentionMatchers) mentionMatchers = buildMentionMatchers();

  const found = new Set<string>();
  for (const { canonical, regex } of mentionMatchers) {
    if (regex.test(text)) found.add(canonical);
  }
  return Array.from(found);
}

export function resetMentionMatchersCache(): void {
  mentionMatchers = null;
}

export function registerSkillAlias(canonical: string, aliases: string[] = []): void {
  const canonicalName = String(canonical || "").trim();
  if (!canonicalName) return;
  const key = canonicalName.toLowerCase();

  const existing = SKILL_ALIASES[canonicalName];
  if (existing) {
    for (const alias of aliases) {
      const a = String(alias || "").trim().toLowerCase();
      if (a && !existing.includes(a)) existing.push(a);
    }
  } else {
    SKILL_ALIASES[canonicalName] = aliases
      .map((a) => String(a || "").trim())
      .filter((a) => a.length > 0);
  }

  rebuildAliasToCanonical();
  resetMentionMatchersCache();
}

export function registerRelationship(rel: SkillRelationship): void {
  const sig = `${rel.from}\0${rel.to}\0${rel.type}`;
  if (RELATIONSHIPS.some((r) => `${r.from}\0${r.to}\0${r.type}` === sig)) return;
  RELATIONSHIPS.push(rel);
}

export function unregisterSkillAlias(canonical: string): boolean {
  const canonicalName = String(canonical || "").trim();
  if (!canonicalName || !(canonicalName in SKILL_ALIASES)) return false;
  const builtin = builtinSkillAliases;
  if (canonicalName in builtin) return false;

  delete SKILL_ALIASES[canonicalName];
  rebuildAliasToCanonical();
  resetMentionMatchersCache();
  return true;
}
