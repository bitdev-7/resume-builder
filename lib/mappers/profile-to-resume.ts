import type {
  ProfileBundle,
  UserCertification,
  UserCompany,
  UserEducation,
  UserProject,
  UserSkill,
} from "@/lib/supabase/database.types";
import type {
  ResumeEducation,
  ResumeExperience,
  ResumeProject,
  UpdatedResume,
} from "@/lib/types/resume";
import {
  formatCompanyEndDate,
  formatGpa,
  isoDateToDisplay,
} from "@/lib/mappers/date-format";

export function userCompanyToResumeExperience(
  company: UserCompany
): ResumeExperience {
  return {
    title: company.title || "",
    company: company.company_name,
    startDate: isoDateToDisplay(company.start_date),
    endDate: formatCompanyEndDate(company.end_date, company.is_current),
    location: company.company_location || undefined,
    workType: company.work_type || undefined,
    description: company.description || undefined,
    achievements: company.achievements || undefined,
  };
}

export function userEducationToResumeEducation(
  education: UserEducation
): ResumeEducation {
  // end_date is the completion date; fall back to the legacy graduation_date column.
  const endDate = isoDateToDisplay(education.end_date ?? education.graduation_date);
  return {
    degree: education.degree || "",
    school: education.school,
    location: education.location || undefined,
    startDate: isoDateToDisplay(education.start_date) || undefined,
    endDate: endDate || undefined,
    graduationDate: endDate,
    gpa: formatGpa(education.gpa),
    fieldOfStudy: education.field_of_study || undefined,
    description: education.description || undefined,
  };
}

export function userProjectToResumeProject(project: UserProject): ResumeProject {
  return {
    name: project.project_name,
    description: project.description || undefined,
    technologies: project.technologies || undefined,
    githubUrl: project.github_url || undefined,
    liveUrl: project.live_url || undefined,
    startDate: isoDateToDisplay(project.start_date) || undefined,
    endDate: isoDateToDisplay(project.end_date) || undefined,
  };
}

export function userCertificationToName(cert: UserCertification): string {
  return cert.certification_name;
}

export function userSkillsToSkillsRecord(
  skills: UserSkill[]
): Record<string, string[]> {
  const record: Record<string, string[]> = {};

  for (const skill of skills) {
    const category = skill.category?.trim() || "General";
    if (!record[category]) {
      record[category] = [];
    }
    record[category].push(skill.skill_name);
  }

  return record;
}

function sortCompaniesForResume(companies: UserCompany[]): UserCompany[] {
  return [...companies].sort((a, b) => {
    const aEnd = a.is_current ? Number.MAX_SAFE_INTEGER : Date.parse(a.end_date || "");
    const bEnd = b.is_current ? Number.MAX_SAFE_INTEGER : Date.parse(b.end_date || "");
    if (aEnd !== bEnd) return bEnd - aEnd;

    const aStart = Date.parse(a.start_date || "");
    const bStart = Date.parse(b.start_date || "");
    return bStart - aStart;
  });
}

/** Build UpdatedResume from normalized profile tables (for AI + PDF generation). */
export function profileBundleToUpdatedResume(
  bundle: ProfileBundle,
  email?: string | null
): UpdatedResume {
  const { resumeProfile, companies, educations, skills, certifications, projects } =
    bundle;

  const experience = sortCompaniesForResume(companies).map(
    userCompanyToResumeExperience
  );

  return {
    name: resumeProfile.full_name || undefined,
    headline: resumeProfile.headline || undefined,
    photo: resumeProfile.photo_url || undefined,
    // Prefer the resume email the user entered; fall back to their sign-in email.
    email: resumeProfile.email || email || undefined,
    phone: resumeProfile.phone || undefined,
    location: resumeProfile.location || undefined,
    linkedin: resumeProfile.linkedin_url || undefined,
    summary: resumeProfile.summary || undefined,
    languages:
      Array.isArray(resumeProfile.languages) && resumeProfile.languages.length > 0
        ? resumeProfile.languages
        : undefined,
    experience: experience.length > 0 ? experience : undefined,
    skills: skills.length > 0 ? userSkillsToSkillsRecord(skills) : undefined,
    education:
      educations.length > 0
        ? educations.map(userEducationToResumeEducation)
        : undefined,
    certifications:
      certifications.length > 0
        ? certifications.map(userCertificationToName)
        : undefined,
    projects:
      projects.length > 0 ? projects.map(userProjectToResumeProject) : undefined,
  };
}

/** Plain-text resume used as the "Existing Resume Content" prompt input. */
export function profileBundleToResumeText(
  bundle: ProfileBundle,
  email?: string | null
): string {
  const resume = profileBundleToUpdatedResume(bundle, email);
  let content = "";

  if (resume.name) content += `Name: ${resume.name}\n`;
  if (resume.email) content += `Email: ${resume.email}\n`;
  if (resume.phone) content += `Phone: ${resume.phone}\n`;
  if (resume.location) content += `Location: ${resume.location}\n`;
  if (resume.linkedin) content += `LinkedIn: ${resume.linkedin}\n`;
  if (resume.summary) content += `\nSummary:\n${resume.summary}\n`;

  if (resume.experience?.length) {
    content += `\nExperience:\n`;
    for (const company of resume.experience) {
      content += `\n${company.title} at ${company.company} (${company.startDate} - ${company.endDate})\n`;
      if (company.location || company.workType) {
        content += `Location: ${company.location || ""}${company.location && company.workType ? " · " : ""}${company.workType || ""}\n`;
      }
      if (company.description) {
        content += `Description: ${company.description}\n`;
      }
      company.achievements?.forEach((achievement) => {
        content += `- ${achievement}\n`;
      });
    }
  }

  if (resume.education?.length) {
    content += `\nEducation:\n`;
    for (const edu of resume.education) {
      content += `${edu.degree} from ${edu.school} (${edu.graduationDate})`;
      if (edu.gpa) content += ` - GPA: ${edu.gpa}`;
      content += `\n`;
    }
  }

  if (resume.skills) {
    content += `\nSkills:\n`;
    for (const [category, skillList] of Object.entries(resume.skills)) {
      if (skillList.length > 0) {
        content += `${category}: ${skillList.join(", ")}\n`;
      }
    }
  }

  if (resume.certifications?.length) {
    content += `\nCertifications:\n`;
    for (const cert of resume.certifications) {
      content += `- ${cert}\n`;
    }
  }

  if (resume.projects?.length) {
    content += `\nProjects:\n`;
    for (const project of resume.projects) {
      content += `${project.name}`;
      if (project.description) content += `: ${project.description}`;
      if (project.technologies?.length) {
        content += ` (${project.technologies.join(", ")})`;
      }
      content += `\n`;
    }
  }

  return content.trim();
}

/** Legacy analyze-route shape until Step 6 refactors profileData handling. */
export interface LegacyAnalyzeProfile {
  default_resume: UpdatedResume & {
    hardSkills?: Record<string, string[]>;
    softSkills?: string[];
    resume_template?: string;
  };
  company_1?: ResumeExperience | null;
  company_2?: ResumeExperience | null;
  company_3?: ResumeExperience | null;
  company_4?: ResumeExperience | null;
  company_5?: ResumeExperience | null;
}

export function profileBundleToLegacyAnalyzeProfile(
  bundle: ProfileBundle,
  email?: string | null
): LegacyAnalyzeProfile {
  const resume = profileBundleToUpdatedResume(bundle, email);
  const template = bundle.resumeProfile.resume_template ?? undefined;

  const default_resume: LegacyAnalyzeProfile["default_resume"] = {
    ...resume,
    ...(typeof template === "string" ? { resume_template: template } : {}),
  };

  const sortedExperience = resume.experience ?? [];
  const slots: LegacyAnalyzeProfile = {
    default_resume,
    company_1: sortedExperience[0] ?? null,
    company_2: sortedExperience[1] ?? null,
    company_3: sortedExperience[2] ?? null,
    company_4: sortedExperience[3] ?? null,
    company_5: sortedExperience[4] ?? null,
  };

  return slots;
}

export function isProfileBundlePopulated(bundle: ProfileBundle): boolean {
  const { resumeProfile, companies, educations, certifications, projects, skills } =
    bundle;

  if (companies.length > 0) return true;
  if (educations.length > 0) return true;
  if (certifications.length > 0) return true;
  if (projects.length > 0) return true;
  if (skills.length > 0) return true;
  if (resumeProfile.full_name?.trim()) return true;
  if (resumeProfile.summary?.trim()) return true;
  if (resumeProfile.phone?.trim()) return true;
  if (resumeProfile.linkedin_url?.trim()) return true;
  if (resumeProfile.location?.trim()) return true;

  return false;
}

