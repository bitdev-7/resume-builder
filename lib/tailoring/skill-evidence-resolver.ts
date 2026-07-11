import type { CandidateProfile, SkillCandidate, SkillEvidenceStatus } from "@/lib/types/tailoring";
import { resolveAutoEntailedSkills, skillKey } from "@/lib/tailoring/skill-ontology";

interface EvidenceIndexEntry {
  status: SkillEvidenceStatus;
  evidenceIds: string[];
  confidence: number;
}

/**
 * Builds a canonical-skill-key -> evidence lookup from the candidate profile.
 * Precedence: direct (role) > project_only > declared > learning — the
 * strongest evidence level found anywhere wins.
 */
function buildEvidenceIndex(profile: CandidateProfile): Map<string, EvidenceIndexEntry> {
  const index = new Map<string, EvidenceIndexEntry>();

  const consider = (name: string, status: SkillEvidenceStatus, sourceIds: string[], confidence: number) => {
    const key = skillKey(name);
    const existing = index.get(key);
    const rank: Record<SkillEvidenceStatus, number> = {
      direct: 4,
      project_only: 3,
      declared: 2,
      learning: 1,
      entailed: 0,
      unsupported: -1,
    };
    if (!existing || rank[status] > rank[existing.status]) {
      index.set(key, { status, evidenceIds: sourceIds, confidence });
      return;
    }
    if (rank[status] === rank[existing.status]) {
      existing.evidenceIds = Array.from(new Set([...existing.evidenceIds, ...sourceIds]));
    }
  };

  for (const exp of profile.experiences) {
    for (const tech of exp.technologies) {
      consider(tech.name, "direct", tech.sourceIds, 0.95);
    }
  }
  for (const proj of profile.projects) {
    for (const tech of proj.technologies) {
      consider(tech.name, "project_only", tech.sourceIds, 0.6);
    }
  }
  for (const skill of profile.declaredSkills) {
    const status: SkillEvidenceStatus = skill.evidenceLevel === "learning" ? "learning" : "declared";
    consider(skill.name, status, skill.sourceIds, status === "learning" ? 0.2 : 0.4);
  }

  return index;
}

/**
 * Stage 5 — resolves every relevant SkillCandidate against candidate evidence.
 * Auto-entailment only ever traverses from skills with DIRECT (role-level)
 * evidence, and only through the ontology's conservative requires/
 * strongly_implies allow-list — never from declared/project-only evidence,
 * and never through commonly_used_with/alternative_to/same_ecosystem/market_adjacent.
 */
export function resolveSkillEvidence(
  candidates: SkillCandidate[],
  profile: CandidateProfile
): SkillCandidate[] {
  const evidenceIndex = buildEvidenceIndex(profile);
  const directlyPossessed = Array.from(evidenceIndex.entries())
    .filter(([, v]) => v.status === "direct")
    .map(([key]) => key);

  const entailments = resolveAutoEntailedSkills(directlyPossessed);

  return candidates.map((candidate) => {
    const key = skillKey(candidate.canonicalName);
    const direct = evidenceIndex.get(key);

    if (direct) {
      return {
        ...candidate,
        evidenceStatus: direct.status,
        evidenceIds: direct.evidenceIds,
        confidence: direct.confidence,
      };
    }

    const entailment = entailments.get(candidate.canonicalName) ?? entailments.get(key);
    if (entailment) {
      const viaKey = skillKey(entailment.via);
      const viaEvidence = evidenceIndex.get(viaKey);
      return {
        ...candidate,
        evidenceStatus: "entailed",
        evidenceIds: viaEvidence?.evidenceIds ?? [],
        confidence: entailment.confidence,
      };
    }

    return {
      ...candidate,
      evidenceStatus: "unsupported",
      evidenceIds: [],
      confidence: 0,
    };
  });
}
