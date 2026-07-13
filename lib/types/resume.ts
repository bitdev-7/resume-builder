import type { WorkType, ResumeLanguage } from "@/lib/supabase/database.types";

export type { WorkType, ResumeLanguage };

export interface ResumeExperience {
  title: string;
  company: string;
  startDate: string;
  endDate: string;
  location?: string;
  workType?: WorkType;
  description?: string;
  achievements?: string[];
}

export interface ResumeEducation {
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

export interface ResumeProject {
  name: string;
  description?: string;
  technologies?: string[];
  githubUrl?: string;
  liveUrl?: string;
  startDate?: string;
  endDate?: string;
}

export interface UpdatedResume {
  name?: string;
  /** Professional title/headline shown under the name (e.g. "Software Engineer"). */
  headline?: string;
  /** Optional headshot as a data URL (rendered only on visual templates). */
  photo?: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedin?: string;
  summary?: string;
  languages?: ResumeLanguage[];
  experience?: ResumeExperience[];
  skills?: Record<string, string[]>;
  hardSkills?: Record<string, string[]>;
  softSkills?: string[];
  education?: ResumeEducation[];
  certifications?: string[];
  projects?: ResumeProject[];
}

export type AnalysisResult = UpdatedResume;
