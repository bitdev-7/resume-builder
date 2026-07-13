import {
  applyPromptPlaceholders,
  resolveGuidance,
  type PromptOverrides,
} from "@/lib/prompts/prompt-overrides";

export type JobWorkType = "onsite" | "hybrid" | "remote" | "unknown";

/** EDITABLE default guidance for the job-page extractor prompt. */
export const JOB_PAGE_EXTRACT_DEFAULT_GUIDANCE = `You extract structured job posting data from raw page text (often copied from LinkedIn, Indeed, Greenhouse, etc.).

Rules:
- jobTitle: the role title only (e.g. "Senior Software Engineer"). No company name, no location, no employment type.
- companyName: hiring company only. No "via", no staffing agency unless that is clearly the employer.
- jobDescription: clean job description body — responsibilities, requirements, qualifications. Remove nav menus, footers, "Apply now", similar jobs, cookie banners, and duplicate headers. Keep bullet lists as plain text with line breaks.
- jobTypes: list ALL possible work arrangements supported by the posting (can be more than one):
  - If explicitly "fully remote" / "100% remote" with no in-office option → ["remote"]
  - If duties may be performed remotely AND in an office/laboratory/on-site (flexible wording like "remotely, in an office, or in a laboratory") → ["remote", "hybrid"]
  - If explicit hybrid → include "hybrid"; also include "remote" if remote work is mentioned
  - If in-office/on-site only with no remote option → ["onsite"]
  - Use an empty array only if work location is truly not mentioned
- requiresTravel: true if the posting mentions required/expected travel (business travel, % travel, willingness to travel, etc.)
- salary: compensation text if present (e.g. "$120k–$150k", "$50/hr"). Use "" if not found.
- postedDate: when the page shows when the job was posted or reposted, copy that value exactly (e.g. "2 days ago", "June 5, 2025", "2025-06-05", "Posted 3 weeks ago" → "3 weeks ago"). Use "" if no posted/reposted date appears in the content. Do not guess.
- Do not invent facts not supported by the text.`;

/** FIXED output contract + data injection — never user-editable. */
const JOB_PAGE_EXTRACT_CONTRACT = `Return ONLY valid JSON with this exact shape:
{
  "jobTitle": "string",
  "companyName": "string",
  "jobDescription": "string",
  "jobTypes": ["remote" | "hybrid" | "onsite"],
  "requiresTravel": false,
  "salary": "string",
  "postedDate": "string"
}`;

export function buildJobPageExtractPrompt(pageContent: string, overrides?: PromptOverrides): string {
  const guidance = applyPromptPlaceholders(
    resolveGuidance(overrides, "jobPageExtract", JOB_PAGE_EXTRACT_DEFAULT_GUIDANCE)
  );
  return `${guidance}

${JOB_PAGE_EXTRACT_CONTRACT}

Page content:
"""
${pageContent}
"""`;
}

export function formatJobWorkTypeLabel(jobType: JobWorkType): string {
  switch (jobType) {
    case "onsite":
      return "Onsite";
    case "hybrid":
      return "Hybrid";
    case "remote":
      return "Remote";
    default:
      return "Unknown";
  }
}

export function formatJobWorkTypesLabel(jobTypes: JobWorkType[]): string {
  const labels = jobTypes
    .filter((type) => type !== "unknown")
    .map((type) => formatJobWorkTypeLabel(type));
  return labels.length > 0 ? labels.join(" · ") : "Unknown";
}
