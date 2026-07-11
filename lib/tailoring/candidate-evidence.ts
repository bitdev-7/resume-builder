import type { LegacyAnalyzeProfile } from "@/lib/mappers/profile-to-resume";
import type { ResumeEducation, ResumeExperience, ResumeProject } from "@/lib/types/resume";
import type {
  CandidateEducation,
  CandidateExperience,
  CandidateProfile,
  CandidateProject,
  EvidenceFact,
  EvidenceFactType,
  MetricEvidence,
  SkillEvidence,
} from "@/lib/types/tailoring";
import { detectSkillMentions, normalizeSkillName } from "@/lib/tailoring/skill-ontology";

const METRIC_PATTERNS: RegExp[] = [
  /\d+(?:\.\d+)?\s?%/g,
  /\b\d+(?:\.\d+)?x\b/gi,
  /\$?\b\d[\d,]*(?:\.\d+)?\s?(?:million|billion|thousand)\b/gi,
  /\b(?:doubled|tripled|quadrupled|halved|cut in half|one-third|one third|one-half|one half|two-thirds|two thirds)\b/gi,
];

function extractMetrics(text: string, idPrefix: string): MetricEvidence[] {
  const metrics: MetricEvidence[] = [];
  const seen = new Set<string>();
  let index = 0;

  for (const pattern of METRIC_PATTERNS) {
    const matches = text.matchAll(new RegExp(pattern));
    for (const match of matches) {
      const value = match[0].trim();
      const key = value.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      index += 1;
      metrics.push({ id: `${idPrefix}_${index}`, value, context: text });
    }
  }

  return metrics;
}

const LEADERSHIP_RE = /\b(led|managed|mentored|supervised|directed|oversaw|coached)\b/i;
const ARCHITECTURE_RE = /\b(architected|architecture|system design|redesigned|microservices?|designed (?:a|the|an)?\s*(?:system|platform|service))\b/i;
const STAKEHOLDER_RE = /\b(stakeholder|client|customer|cross-functional|cross functional|partnered with|executives?)\b/i;
const SCOPE_RE = /\b(scaled|team of|budget of|ownership of|across \d+|multiple teams)\b/i;

function classifyFact(text: string, hasMetric: boolean): EvidenceFactType {
  if (LEADERSHIP_RE.test(text)) return "leadership";
  if (ARCHITECTURE_RE.test(text)) return "architecture";
  if (STAKEHOLDER_RE.test(text)) return "stakeholder";
  if (SCOPE_RE.test(text)) return "scope";
  if (hasMetric) return "achievement";
  return "responsibility";
}

function buildFactsAndTechnologies(
  achievements: string[] | undefined,
  idPrefix: string
): { facts: EvidenceFact[]; technologies: SkillEvidence[] } {
  const facts: EvidenceFact[] = [];
  const techBySkill = new Map<string, Set<string>>();

  (achievements || []).forEach((raw, i) => {
    const text = String(raw || "").trim();
    if (!text) return;

    const factId = `${idPrefix}_${i + 1}`;
    const metrics = extractMetrics(text, `metric_${factId}`);
    const factType = classifyFact(text, metrics.length > 0);

    facts.push({
      id: factId,
      text,
      factType,
      ...(metrics.length > 0 ? { metrics } : {}),
      confidence: "imported",
    });

    for (const skill of detectSkillMentions(text)) {
      const key = normalizeSkillName(skill);
      if (!techBySkill.has(key)) techBySkill.set(key, new Set());
      techBySkill.get(key)!.add(factId);
    }
  });

  const technologies: SkillEvidence[] = Array.from(techBySkill.entries()).map(([name, sourceIds]) => ({
    name,
    evidenceLevel: "used_in_role",
    sourceIds: Array.from(sourceIds),
  }));

  return { facts, technologies };
}

function toCandidateExperience(exp: ResumeExperience, index: number): CandidateExperience {
  const id = `exp_${index + 1}`;
  const { facts, technologies } = buildFactsAndTechnologies(exp.achievements, `fact_${id}`);
  return {
    id,
    title: exp.title || "",
    company: exp.company || "",
    startDate: exp.startDate || "",
    endDate: exp.endDate || "Present",
    facts,
    technologies,
  };
}

function toCandidateProject(project: ResumeProject, index: number): CandidateProject {
  const id = `proj_${index + 1}`;
  const descriptionAchievements = project.description ? [project.description] : [];
  const { facts, technologies } = buildFactsAndTechnologies(descriptionAchievements, `fact_${id}`);

  const explicitTech = new Set(technologies.map((t) => t.name));
  for (const raw of project.technologies || []) {
    const canonical = normalizeSkillName(raw);
    if (!canonical) continue;
    if (!explicitTech.has(canonical)) {
      technologies.push({ name: canonical, evidenceLevel: "used_in_project", sourceIds: [id] });
      explicitTech.add(canonical);
    }
  }
  // Anything only detected from free text is project-level evidence, not role evidence.
  const projectTechnologies = technologies.map((t) => ({ ...t, evidenceLevel: "used_in_project" as const }));

  return {
    id,
    name: project.name || "",
    description: project.description,
    facts,
    technologies: projectTechnologies,
  };
}

function toCandidateEducation(edu: ResumeEducation): CandidateEducation {
  return {
    degree: edu.degree || "",
    school: edu.school || "",
    location: edu.location,
    graduationDate: edu.graduationDate || "",
    gpa: edu.gpa,
    fieldOfStudy: edu.fieldOfStudy,
    description: edu.description,
  };
}

function declaredSkillsFromProfile(
  defaultResume: LegacyAnalyzeProfile["default_resume"]
): SkillEvidence[] {
  const skills: SkillEvidence[] = [];
  const seen = new Set<string>();

  const addDeclared = (raw: string, sourceId: string) => {
    const canonical = normalizeSkillName(raw);
    if (!canonical) return;
    const key = canonical.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    skills.push({ name: canonical, evidenceLevel: "declared", sourceIds: [sourceId] });
  };

  // The normalized profile flow populates `skills` (category -> list) via the
  // profile Skills section; the legacy flow may instead use `hardSkills`. Read both.
  const hardSkills = defaultResume.hardSkills || {};
  for (const list of Object.values(hardSkills)) {
    for (const raw of list || []) addDeclared(raw, "profile_hard_skills");
  }

  const skillsRecord = defaultResume.skills || {};
  for (const [category, list] of Object.entries(skillsRecord)) {
    const isSoft = /soft/i.test(category);
    for (const raw of list || []) {
      addDeclared(raw, isSoft ? "profile_soft_skills" : "profile_skills");
    }
  }

  for (const raw of defaultResume.softSkills || []) {
    addDeclared(raw, "profile_soft_skills");
  }

  return skills;
}

/**
 * Stage 4 — adapts the existing legacy profile payload (as actually sent by
 * the frontend to /api/analyze: { default_resume, company_1..company_5 })
 * into an evidence-oriented CandidateProfile. Pure function, no persistence
 * or schema changes — the normalized Supabase tables are untouched.
 */
export function buildCandidateEvidenceProfile(profileData: LegacyAnalyzeProfile): CandidateProfile {
  const defaultResume = profileData.default_resume || ({} as LegacyAnalyzeProfile["default_resume"]);

  const companies = [
    profileData.company_1,
    profileData.company_2,
    profileData.company_3,
    profileData.company_4,
    profileData.company_5,
  ].filter((c): c is ResumeExperience => Boolean(c));

  const experiences = companies.map(toCandidateExperience);
  const projects = (defaultResume.projects || []).map(toCandidateProject);
  const education = (defaultResume.education || []).map(toCandidateEducation);
  const certifications = (defaultResume.certifications || []).filter(Boolean);
  const declaredSkills = declaredSkillsFromProfile(defaultResume);

  return {
    contact: {
      name: defaultResume.name,
      headline: defaultResume.headline,
      photo: defaultResume.photo,
      email: defaultResume.email,
      phone: defaultResume.phone,
      location: defaultResume.location,
      linkedin: defaultResume.linkedin,
      languages: defaultResume.languages,
    },
    experiences,
    projects,
    education,
    certifications,
    declaredSkills,
  };
}

/** Flat, deduplicated list of every skill name the candidate has any evidence for (any level). */
export function getPossessedSkillNames(profile: CandidateProfile): string[] {
  const names = new Set<string>();
  for (const exp of profile.experiences) {
    for (const tech of exp.technologies) names.add(tech.name);
  }
  for (const proj of profile.projects) {
    for (const tech of proj.technologies) names.add(tech.name);
  }
  for (const skill of profile.declaredSkills) names.add(skill.name);
  return Array.from(names);
}
