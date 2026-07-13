/**
 * Types for the multi-stage resume tailoring pipeline (lib/tailoring/*).
 *
 * Core invariant: the JD/role intelligence side (JDAnalysis, RoleArchetype,
 * SkillCandidate.relevanceScore/roleImportance) controls relevance and
 * terminology. The candidate evidence side (CandidateProfile, EvidenceFact,
 * SkillEvidence, SkillCandidate.evidenceStatus) controls what may be claimed
 * as fact. Generators may only ever assert what the evidence side supports.
 */

// ───────────────────────────── Stage 1: JD Analyzer ─────────────────────────────

export type RequirementType = "must_have" | "preferred" | "optional" | "contextual";

export type RequirementCategory =
  | "technology"
  | "architecture"
  | "responsibility"
  | "methodology"
  | "domain"
  | "soft_skill"
  | "education"
  | "experience";

export interface JDRequirement {
  id: string;
  text: string;
  type: RequirementType;
  category: RequirementCategory;
  /** Normalized technology/skill name when category === "technology"; null otherwise. */
  canonicalTerm: string | null;
  /** Higher = more important. Explicit + repeated requirements score higher. */
  priority: number;
}

export interface JDAnalysis {
  normalizedTitle: string;
  seniority: string;
  roleFamily: string;
  domains: string[];
  requirements: JDRequirement[];
  responsibilityThemes: string[];
  atsTerms: string[];
  /** Raw JD text, kept only for repeated-term priority boosting and archetype scoring. */
  rawText: string;
}

// ───────────────────────── Stage 2: Role Archetype Detection ─────────────────────

export type RoleArchetypeId = string;

export interface RoleArchetypeDetection {
  primaryRoleArchetype: RoleArchetypeId;
  secondaryRoleArchetypes: RoleArchetypeId[];
  confidence: number;
}

// ───────────────────────────── Stage 3: Role Skill Catalog ──────────────────────

export interface RoleSkillCatalogEntry {
  id: RoleArchetypeId;
  label: string;
  /** Keywords matched against the normalized JD title to help archetype detection. */
  titleKeywords: string[];
  /** Skills essential to the archetype regardless of ecosystem group. */
  core: string[];
  /** Named ecosystem groups (backendEcosystem, cloudPlatforms, etc.) — flexible per role. */
  ecosystem: Record<string, string[]>;
  /** Market-relevant skills for this archetype (static seed, versioned with the catalog). */
  marketRelevant: string[];
  /** Suggested final-resume skill category names for the composer stage. */
  skillCategoryHints: string[];
}

export type SkillSource =
  | "explicit_jd"
  | "role_archetype"
  | "ecosystem"
  | "market_popularity"
  | "candidate_profile";

export type RoleImportance = "core" | "strong" | "adjacent" | "optional";

// ───────────────────────── Stage 4: Candidate Evidence Profile ──────────────────

export type EvidenceConfidence = "candidate_confirmed" | "imported" | "inferred";

export type EvidenceFactType =
  | "responsibility"
  | "achievement"
  | "scope"
  | "leadership"
  | "stakeholder"
  | "architecture";

export interface MetricEvidence {
  id: string;
  value: string;
  context: string;
}

export interface EvidenceFact {
  id: string;
  text: string;
  factType: EvidenceFactType;
  metrics?: MetricEvidence[];
  confidence: EvidenceConfidence;
}

export type SkillEvidenceLevel = "used_in_role" | "used_in_project" | "declared" | "learning";

export interface SkillEvidence {
  name: string;
  evidenceLevel: SkillEvidenceLevel;
  sourceIds: string[];
}

export interface CandidateExperience {
  id: string;
  title: string;
  company: string;
  startDate: string;
  endDate: string;
  facts: EvidenceFact[];
  /** Skills evidenced specifically within this experience's facts. */
  technologies: SkillEvidence[];
}

export interface CandidateProject {
  id: string;
  name: string;
  description?: string;
  facts: EvidenceFact[];
  technologies: SkillEvidence[];
}

export interface CandidateEducation {
  degree: string;
  school: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  graduationDate: string;
  gpa?: string;
  fieldOfStudy?: string;
  description?: string;
}

export interface CandidateContact {
  name?: string;
  headline?: string;
  photo?: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedin?: string;
  languages?: { name: string; level: string }[];
}

export interface CandidateProfile {
  contact: CandidateContact;
  experiences: CandidateExperience[];
  projects: CandidateProject[];
  education: CandidateEducation[];
  certifications: string[];
  /** Skills declared at the profile level (hardSkills/softSkills categories), not tied to a role/project. */
  declaredSkills: SkillEvidence[];
}

// ───────────────────────── Stage 5: Skill Evidence Resolution ───────────────────

export type SkillEvidenceStatus =
  | "direct"
  | "entailed"
  | "declared"
  | "project_only"
  | "learning"
  | "unsupported";

export interface SkillCandidate {
  id: string;
  canonicalName: string;
  aliases: string[];
  sources: SkillSource[];
  relevanceScore: number;
  roleImportance: RoleImportance;
  evidenceStatus: SkillEvidenceStatus;
  /** EvidenceFact ids / SkillEvidence source ids / entailment-source-skill id that back this status. */
  evidenceIds: string[];
  confidence: number;
  matchedRequirementIds: string[];
}

// ───────────────────────────── Stage 6: Tailoring Planner ───────────────────────

export type RequirementMatchStatus =
  | "strongly_supported"
  | "supported"
  | "weakly_supported"
  | "unsupported";

export interface RequirementMatch {
  requirementId: string;
  status: RequirementMatchStatus;
  evidenceIds: string[];
}

export interface ExperiencePlan {
  experienceId: string;
  targetBulletCount: number;
  priorityRequirementIds: string[];
  allowedEvidenceIds: string[];
  relevantSkillIds: string[];
}

export interface TailoringPlan {
  requirementMatches: RequirementMatch[];
  experiencePlans: ExperiencePlan[];
  summaryEvidenceIds: string[];
  supportedSkills: SkillCandidate[];
  roleRelevantSupportedSkills: SkillCandidate[];
  ecosystemRelevantSupportedSkills: SkillCandidate[];
  marketRelevantSupportedSkills: SkillCandidate[];
  unsupportedHighValueSkills: SkillCandidate[];
}

// ───────────────────── Stage 7: Per-Experience Bullet Generation ────────────────

export interface GeneratedBullet {
  text: string;
  evidenceIds: string[];
  requirementIds: string[];
}

export interface ExperienceGenerationResult {
  experienceId: string;
  bullets: GeneratedBullet[];
  /** Set when the AI generation failed and a deterministic fallback (original achievements) was used. */
  usedFallback?: boolean;
}

// ───────────────── Stage 8: Final Summary / Skills / Projects Composer ─────────

export interface GeneratedProjectContent {
  id: string;
  description: string;
  technologies: string[];
}

export interface ComposerResult {
  summary: string;
  skillCategories: Record<string, string[]>;
  softSkills: string[];
  projects: GeneratedProjectContent[];
}

// ───────────────────────── Stage 9/10: Validation & Repair ──────────────────────

export interface ValidationIssue {
  code: string;
  path: string;
  message: string;
}

// ───────────────────────── Stage 12: Enrichment Recommendations ────────────────

export type EnrichmentAction = "ask_candidate";

export interface EnrichmentRecommendation {
  skill: string;
  reason: string;
  source: SkillSource;
  candidateEvidence: string[];
  action: EnrichmentAction;
}

// ───────────────────────────── Pipeline configuration ───────────────────────────

export interface SkillBudgetConfig {
  maxTotalSkills: number;
  maxSkillsPerCategory: number;
}

export interface BulletBudgetConfig {
  /** Absolute floor/ceiling per experience regardless of computed priority. */
  minBulletsPerExperience: number;
  maxBulletsPerExperience: number;
  maxRepairAttempts: number;
}
