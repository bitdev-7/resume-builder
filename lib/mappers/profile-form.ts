import type {
  ProfileBundle,
  UserCompany,
  UserSkill,
  WorkType,
} from "@/lib/supabase/database.types";
import type { ResumeExperience } from "@/lib/types/resume";
import {
  displayDateToIso,
  formatGpa,
  isoDateToDisplay,
} from "@/lib/mappers/date-format";
import { randomId } from "@/lib/uuid";
import {
  userCertificationToName,
  userCompanyToResumeExperience,
  userEducationToResumeEducation,
  userProjectToResumeProject,
} from "@/lib/mappers/profile-to-resume";
import { resolveResumeTemplate, type ResumeTemplateId } from "@/lib/resume-templates";
import type { ParsedResume } from "@/lib/resume-import";

export interface EducationFormRow {
  clientId: string;
  id?: string;
  degree: string;
  school: string;
  fieldOfStudy: string;
  location: string;
  startDate: string;
  endDate: string;
  gpa: string;
  description: string;
}

export interface ProjectFormRow {
  clientId: string;
  id?: string;
  name: string;
  description: string;
  technologies: string[];
}

export interface CompanyFormRow {
  clientId: string;
  id?: string;
  title: string;
  company: string;
  startDate: string;
  endDate: string;
  location: string;
  workType: WorkType | "";
  description: string;
  achievements: string[];
}

export interface SkillFormRow {
  clientId: string;
  id?: string;
  skillName: string;
  /** Free-text category (e.g. "Backend", "Cloud"). "Soft Skills" is treated as a soft skill on the resume. */
  category: string;
}

export interface LanguageFormRow {
  clientId: string;
  name: string;
  level: string;
}

export interface ProfileFormState {
  /** The profile's display name (for switching between profiles). */
  label: string;
  fullName: string;
  email: string;
  headline: string;
  photoUrl: string;
  phone: string;
  location: string;
  linkedin: string;
  summary: string;
  languages: LanguageFormRow[];
  resumeTemplate: ResumeTemplateId;
  educations: EducationFormRow[];
  certifications: Array<{ clientId: string; id?: string; name: string }>;
  projects: ProjectFormRow[];
  companies: CompanyFormRow[];
  skills: SkillFormRow[];
}

export function newClientId(): string {
  return randomId();
}

export function createEmptyCompanyRow(): CompanyFormRow {
  return {
    clientId: newClientId(),
    title: "",
    company: "",
    startDate: "",
    endDate: "",
    location: "",
    workType: "",
    description: "",
    achievements: [],
  };
}

export function createEmptySkillRow(): SkillFormRow {
  return {
    clientId: newClientId(),
    skillName: "",
    category: "",
  };
}

export function createEmptyLanguageRow(): LanguageFormRow {
  return {
    clientId: newClientId(),
    name: "",
    level: "Fluent",
  };
}

export const LANGUAGE_LEVELS = ["Native", "Fluent", "Advanced", "Intermediate", "Basic"] as const;

export function profileBundleToFormState(bundle: ProfileBundle): ProfileFormState {
  return {
    label: bundle.resumeProfile.label || "My Profile",
    fullName: bundle.resumeProfile.full_name || "",
    email: bundle.resumeProfile.email || "",
    headline: bundle.resumeProfile.headline || "",
    photoUrl: bundle.resumeProfile.photo_url || "",
    phone: bundle.resumeProfile.phone || "",
    location: bundle.resumeProfile.location || "",
    linkedin: bundle.resumeProfile.linkedin_url || "",
    summary: bundle.resumeProfile.summary || "",
    languages: (bundle.resumeProfile.languages || []).map((l) => ({
      clientId: newClientId(),
      name: l.name,
      level: l.level,
    })),
    resumeTemplate: resolveResumeTemplate(
      bundle.resumeProfile.resume_template as string | undefined
    ),
    educations: bundle.educations.map((edu) => {
      const mapped = userEducationToResumeEducation(edu);
      return {
        clientId: edu.id,
        id: edu.id,
        degree: mapped.degree,
        school: mapped.school,
        fieldOfStudy: mapped.fieldOfStudy || "",
        location: mapped.location || "",
        startDate: mapped.startDate || "",
        endDate: mapped.endDate || "",
        gpa: mapped.gpa || "",
        description: mapped.description || "",
      };
    }),
    certifications: bundle.certifications.map((cert) => ({
      clientId: cert.id,
      id: cert.id,
      name: userCertificationToName(cert),
    })),
    projects: bundle.projects.map((project) => {
      const mapped = userProjectToResumeProject(project);
      return {
        clientId: project.id,
        id: project.id,
        name: mapped.name,
        description: mapped.description || "",
        technologies: mapped.technologies || [],
      };
    }),
    companies: bundle.companies.map((company) => {
      const mapped = userCompanyToResumeExperience(company);
      return companyRowFromExperience(company.id, mapped);
    }),
    skills: bundle.skills.map((skill) => ({
      clientId: skill.id,
      id: skill.id,
      skillName: skill.skill_name,
      category: skill.category || "",
    })),
  };
}

/**
 * Maps AI-parsed resume data into profile form state (adds client ids, drops
 * empty rows). Keeps the caller's chosen resume template. Used by the
 * "Upload Existing Resume" flow so the user can review before saving.
 */
export function parsedResumeToFormState(
  parsed: ParsedResume,
  resumeTemplate: ResumeTemplateId,
  label: string
): ProfileFormState {
  return {
    label,
    fullName: parsed.fullName,
    email: parsed.email,
    headline: parsed.headline,
    photoUrl: "",
    phone: parsed.phone,
    location: parsed.location,
    linkedin: parsed.linkedin,
    summary: parsed.summary,
    languages: [],
    resumeTemplate,
    educations: parsed.educations
      .filter((e) => e.school.trim() || e.degree.trim())
      .map((e) => ({
        clientId: newClientId(),
        degree: e.degree,
        school: e.school,
        fieldOfStudy: "",
        location: "",
        startDate: e.startDate,
        endDate: e.endDate || e.graduationDate,
        gpa: e.gpa,
        description: "",
      })),
    certifications: parsed.certifications
      .filter((name) => name.trim())
      .map((name) => ({ clientId: newClientId(), name })),
    projects: parsed.projects
      .filter((p) => p.name.trim())
      .map((p) => ({
        clientId: newClientId(),
        name: p.name,
        description: p.description,
        technologies: p.technologies,
      })),
    companies: parsed.companies
      .filter((c) => c.company.trim() || c.title.trim())
      .map((c) => ({
        clientId: newClientId(),
        title: c.title,
        company: c.company,
        startDate: c.startDate,
        endDate: c.endDate,
        location: c.location,
        workType: c.workType,
        description: c.description,
        achievements: c.achievements,
      })),
    skills: parsed.skills
      .filter((s) => s.skillName.trim())
      .map((s) => ({ clientId: newClientId(), skillName: s.skillName, category: s.category })),
  };
}

export function companyRowFromExperience(
  id: string | undefined,
  exp: ResumeExperience
): CompanyFormRow {
  return {
    clientId: id || newClientId(),
    id,
    title: exp.title,
    company: exp.company,
    startDate: exp.startDate,
    endDate: exp.endDate,
    location: exp.location || "",
    workType: exp.workType || "",
    description: exp.description || "",
    achievements: exp.achievements || [],
  };
}

export function companyFormRowToDbPayload(
  row: CompanyFormRow,
  userId: string,
  profileId: string,
  displayOrder: number
): Omit<UserCompany, "created_at" | "updated_at"> {
  const isCurrent =
    !row.endDate.trim() || row.endDate.trim().toLowerCase() === "present";

  return {
    id: row.id || newClientId(),
    user_id: userId,
    profile_id: profileId,
    company_name: row.company,
    title: row.title || null,
    company_location: row.location || null,
    work_type: row.workType || null,
    start_date: displayDateToIso(row.startDate),
    end_date: isCurrent ? null : displayDateToIso(row.endDate),
    is_current: isCurrent,
    description: row.description || null,
    achievements: row.achievements.length ? row.achievements : null,
    display_order: displayOrder,
  };
}

export function educationFormRowToDbPayload(
  row: EducationFormRow,
  userId: string,
  profileId: string,
  displayOrder: number
) {
  const gpaNum = row.gpa.trim() ? Number.parseFloat(row.gpa) : null;
  const endIso = displayDateToIso(row.endDate);

  return {
    id: row.id || newClientId(),
    user_id: userId,
    profile_id: profileId,
    school: row.school,
    degree: row.degree || null,
    field_of_study: row.fieldOfStudy || null,
    gpa: gpaNum != null && !Number.isNaN(gpaNum) ? gpaNum : null,
    location: row.location || null,
    start_date: displayDateToIso(row.startDate),
    end_date: endIso,
    // Keep the legacy graduation_date column in sync with end_date for backward compatibility.
    graduation_date: endIso,
    description: row.description || null,
    display_order: displayOrder,
  };
}

export function projectFormRowToDbPayload(
  row: ProjectFormRow,
  userId: string,
  profileId: string,
  displayOrder: number
) {
  return {
    id: row.id || newClientId(),
    user_id: userId,
    profile_id: profileId,
    project_name: row.name,
    description: row.description || null,
    technologies: row.technologies.length ? row.technologies : null,
    github_url: null,
    live_url: null,
    start_date: null,
    end_date: null,
    display_order: displayOrder,
  };
}

export function skillFormRowToDbPayload(
  row: SkillFormRow,
  userId: string,
  profileId: string,
  displayOrder: number
): Omit<UserSkill, "created_at"> {
  return {
    id: row.id || newClientId(),
    user_id: userId,
    profile_id: profileId,
    skill_name: row.skillName.trim(),
    category: row.category.trim() || null,
    proficiency: null,
    display_order: displayOrder,
  };
}

export function certificationFormRowToDbPayload(
  row: { id?: string; name: string },
  userId: string,
  profileId: string
) {
  return {
    id: row.id || newClientId(),
    user_id: userId,
    profile_id: profileId,
    certification_name: row.name,
    issuing_organization: null,
    issue_date: null,
    expiration_date: null,
    credential_id: null,
    credential_url: null,
  };
}

export function formatGpaForForm(gpa: number | null | undefined): string {
  return formatGpa(gpa) || "";
}

export { isoDateToDisplay, displayDateToIso };
