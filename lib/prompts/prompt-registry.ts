/**
 * UI-facing catalog of the editable prompts. Aggregates each prompt's default
 * guidance + human-readable metadata so the settings page can render an editor
 * and a reset-to-default action. The FIXED output contracts live in the
 * individual prompt files and are never exposed here.
 */
import type { PromptKey } from "@/lib/prompts/prompt-overrides";
import { GLOBAL_POLICY_DEFAULT_GUIDANCE } from "@/lib/prompts/tailoring-policy";
import { JD_ANALYZER_DEFAULT_GUIDANCE } from "@/lib/prompts/jd-analyzer-prompt";
import { EXPERIENCE_WRITER_DEFAULT_GUIDANCE } from "@/lib/prompts/experience-writer-prompt";
import { COMPOSER_DEFAULT_GUIDANCE } from "@/lib/prompts/composer-prompt";
import { RESUME_PARSE_DEFAULT_GUIDANCE } from "@/lib/prompts/resume-parse-prompt";
import { ATS_MATCH_DEFAULT_GUIDANCE } from "@/lib/prompts/ats-match";
import { JOB_PAGE_EXTRACT_DEFAULT_GUIDANCE } from "@/lib/prompts/job-page-extract";

export interface PromptDefinition {
  key: PromptKey;
  label: string;
  description: string;
  defaultGuidance: string;
}

export const PROMPT_DEFINITIONS: PromptDefinition[] = [
  {
    key: "globalPolicy",
    label: "Global tailoring policy",
    description:
      "Shared rules injected into JD analysis, experience writing, and the composer. Controls JD alignment, factual integrity, and technology timeline consistency.",
    defaultGuidance: GLOBAL_POLICY_DEFAULT_GUIDANCE,
  },
  {
    key: "jdAnalyzer",
    label: "Job description analyzer",
    description: "Parses a job posting into structured requirements, seniority, and ATS terms.",
    defaultGuidance: JD_ANALYZER_DEFAULT_GUIDANCE,
  },
  {
    key: "experienceWriter",
    label: "Experience bullet writer",
    description:
      "Writes achievement bullets for each work experience with JD alignment and technology timeline consistency. Use {{STRONG_ACTION_VERBS}} and {{FORBIDDEN_OPENING_VERBS}} for the enforced verb lists.",
    defaultGuidance: EXPERIENCE_WRITER_DEFAULT_GUIDANCE,
  },
  {
    key: "composer",
    label: "Summary, skills & projects",
    description: "Writes the professional summary, groups skills into categories, and tailors project descriptions.",
    defaultGuidance: COMPOSER_DEFAULT_GUIDANCE,
  },
  {
    key: "resumeParse",
    label: "Resume upload parser",
    description: "Extracts structured profile data from an uploaded resume PDF (Upload Existing Resume).",
    defaultGuidance: RESUME_PARSE_DEFAULT_GUIDANCE,
  },
  {
    key: "atsMatch",
    label: "ATS match analyzer",
    description: "Scores a generated resume against the job description and lists matched/missing keywords.",
    defaultGuidance: ATS_MATCH_DEFAULT_GUIDANCE,
  },
  {
    key: "jobPageExtract",
    label: "Job posting extractor",
    description: "Extracts title, company, description, and work type from pasted job-page text.",
    defaultGuidance: JOB_PAGE_EXTRACT_DEFAULT_GUIDANCE,
  },
];
