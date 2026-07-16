import type { ResumeTemplateId } from "@/lib/resume-templates";
import type { JobsiteId } from "@/lib/jobsites";

export type WorkType = "Remote" | "Hybrid" | "Onsite";

export type BidStatus =
  | "unapplied"
  | "opened"
  | "applied"
  | "interviewing"
  | "rejected"
  | "offer"
  | "accepted";

export type InterviewCallType =
  | "intro"
  | "hr"
  | "live_coding"
  | "system_design"
  | "culture"
  | "final";

/** Stored in profiles.default_settings — not separate columns. */
export interface DefaultSettings {
  resume_template?: ResumeTemplateId;
  default_jobsite?: JobsiteId;
  [key: string]: unknown;
}

export type AppRole = "admin" | "user";

export interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  role: AppRole;
  default_settings: DefaultSettings;
  created_at: string;
  updated_at: string;
}

export interface ProfileInsert {
  id: string;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  role?: AppRole;
  default_settings?: DefaultSettings;
}

export interface ProfileUpdate {
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  /** Only service-role / manual SQL should set this; client updates must omit. */
  role?: AppRole;
  default_settings?: DefaultSettings;
}

export interface AdminUserSummary {
  id: string;
  full_name: string | null;
  email: string | null;
  role: AppRole;
}

export interface ResumeLanguage {
  name: string;
  /** Proficiency label, e.g. "Native", "Fluent", "Advanced", "Intermediate", "Basic". */
  level: string;
}

export interface ResumeProfile {
  id: string;
  user_id: string;
  /** Display name for switching between profiles (e.g. "Software Engineer"). */
  label: string;
  full_name: string | null;
  email: string | null;
  headline: string | null;
  phone: string | null;
  linkedin_url: string | null;
  summary: string | null;
  location: string | null;
  resume_template: string | null;
  /** Optional headshot as a data URL (shown only on visual templates). */
  photo_url: string | null;
  languages: ResumeLanguage[];
  /** Per-profile editable AI prompt guidance overrides, keyed by prompt key. */
  prompt_overrides: Record<string, string> | null;
  is_default: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface ResumeProfileInsert {
  user_id: string;
  label: string;
  full_name?: string | null;
  email?: string | null;
  headline?: string | null;
  phone?: string | null;
  linkedin_url?: string | null;
  summary?: string | null;
  location?: string | null;
  resume_template?: string | null;
  is_default?: boolean;
  display_order?: number;
}

export interface ResumeProfileUpdate {
  label?: string;
  full_name?: string | null;
  email?: string | null;
  headline?: string | null;
  phone?: string | null;
  linkedin_url?: string | null;
  summary?: string | null;
  location?: string | null;
  resume_template?: string | null;
  photo_url?: string | null;
  languages?: ResumeLanguage[];
  prompt_overrides?: Record<string, string> | null;
  is_default?: boolean;
  display_order?: number;
}

export interface UserEducation {
  id: string;
  user_id: string;
  profile_id: string;
  school: string;
  degree: string | null;
  field_of_study: string | null;
  gpa: number | null;
  location: string | null;
  start_date: string | null;
  end_date: string | null;
  graduation_date: string | null;
  description: string | null;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface UserSkill {
  id: string;
  user_id: string;
  profile_id: string;
  skill_name: string;
  category: string | null;
  proficiency: string | null;
  display_order: number;
  created_at: string;
}

export interface UserCertification {
  id: string;
  user_id: string;
  profile_id: string;
  certification_name: string;
  issuing_organization: string | null;
  issue_date: string | null;
  expiration_date: string | null;
  credential_id: string | null;
  credential_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserProject {
  id: string;
  user_id: string;
  profile_id: string;
  project_name: string;
  description: string | null;
  technologies: string[] | null;
  github_url: string | null;
  live_url: string | null;
  start_date: string | null;
  end_date: string | null;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface UserCompany {
  id: string;
  user_id: string;
  profile_id: string;
  company_name: string;
  title: string | null;
  company_location: string | null;
  work_type: WorkType | null;
  start_date: string | null;
  end_date: string | null;
  is_current: boolean;
  description: string | null;
  achievements: string[] | null;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface ResumeRecord {
  id: string;
  user_id: string;
  profile_id: string | null;
  job_id: string | null;
  ai_type: string | null;
  model: string | null;
  job_site: string | null;
  job_link: string | null;
  job_title: string | null;
  job_company: string | null;
  jd_file_path: string | null;
  resume_file_path: string | null;
  bid_status: BidStatus | null;
  created_at: string;
  updated_at: string;
}

export interface InterviewRecord {
  id: string;
  user_id: string;
  resume_id: string | null;
  interview_date: string;
  caller: string | null;
  interviewer: string | null;
  call_type: InterviewCallType | null;
  video_name: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Full payload for one resume profile: the account row (for default_settings),
 * the persona (`resumeProfile`), and that persona's content rows.
 */
export interface ProfileBundle {
  profile: Profile;
  resumeProfile: ResumeProfile;
  educations: UserEducation[];
  skills: UserSkill[];
  certifications: UserCertification[];
  projects: UserProject[];
  companies: UserCompany[];
}

export const WORK_TYPES: WorkType[] = ["Remote", "Hybrid", "Onsite"];

export const DEFAULT_BID_STATUS: BidStatus = "applied";

export const BID_STATUSES: BidStatus[] = [
  "unapplied",
  "opened",
  "applied",
  "interviewing",
  "rejected",
  "offer",
  "accepted",
];

export interface JobRecord {
  id: string;
  url: string;
  created_at: string;
}

export interface UserJobListItem {
  job_id: string;
  url: string;
  created_at: string;
  status: BidStatus;
}

export const INTERVIEW_CALL_TYPES: InterviewCallType[] = [
  "intro",
  "hr",
  "live_coding",
  "system_design",
  "culture",
  "final",
];

export const JD_STORAGE_BUCKET = "jds";
export const RESUME_STORAGE_BUCKET = "resumes";

/** One row per LLM call, written from the central `callAI` recorder. */
export interface AiUsageLog {
  id: string;
  user_id: string;
  profile_id: string | null;
  source: string;
  stage: string;
  provider: string | null;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_usd: number;
  cost_source: "provider" | "estimated";
  duration_ms: number | null;
  success: boolean;
  error: string | null;
  created_at: string;
}

export interface AiUsageLogInsert {
  user_id: string;
  profile_id?: string | null;
  source?: string;
  stage?: string;
  provider?: string | null;
  model: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  cost_usd?: number;
  cost_source?: "provider" | "estimated";
  duration_ms?: number | null;
  success?: boolean;
  error?: string | null;
}

/**
 * User-editable addition to the skill ontology (canonical skill + aliases).
 * Layered on top of the built-in SKILL_ALIASES defaults, which stay read-only.
 * One shared global set; any authenticated user can read/write.
 */
export interface SkillCatalogAddition {
  id: string;
  canonical_name: string;
  aliases: string[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
  version: number;
}

export interface SkillCatalogAdditionInsert {
  canonical_name: string;
  aliases?: string[];
  created_by?: string | null;
}

export interface SkillCatalogAdditionUpdate {
  canonical_name?: string;
  aliases?: string[];
}

/**
 * User-editable addition to the role-skill catalog (a custom archetype).
 * `ecosystem` is a map of group name -> skills, mirroring RoleSkillCatalogEntry.
 */
export interface RoleArchetypeAddition {
  id: string;
  label: string;
  title_keywords: string[];
  core: string[];
  ecosystem: Record<string, string[]>;
  market_relevant: string[];
  skill_category_hints: string[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
  version: number;
}

export interface RoleArchetypeAdditionInsert {
  id: string;
  label: string;
  title_keywords?: string[];
  core?: string[];
  ecosystem?: Record<string, string[]>;
  market_relevant?: string[];
  skill_category_hints?: string[];
  created_by?: string | null;
}

export interface RoleArchetypeAdditionUpdate {
  label?: string;
  title_keywords?: string[];
  core?: string[];
  ecosystem?: Record<string, string[]>;
  market_relevant?: string[];
  skill_category_hints?: string[];
}
