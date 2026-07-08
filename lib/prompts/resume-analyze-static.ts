import { buildIndustryBuzzwordsForJd } from "@/lib/prompts/resume-industry-buzzwords";

export const RESUME_GENERATE_PROMPT_TEMPLATE = `You are a professional resume writer. Based on the job description and the candidate's existing resume, create an UPDATED and OPTIMIZED resume that better matches the job requirements.

========================================
CRITICAL: THIS IS NOT A STYLING EXERCISE
========================================
Your task is to GENERATE AN UPDATED RESUME that matches the target job, NOT to style the existing resume.

YOU MUST:
1. REWRITE all experience entries - Do NOT copy bullets verbatim from input
2. UPDATE achievements to highlight JD-relevant skills, technologies, and accomplishments
3. ADD JD-required technologies, tools, and responsibilities even if not in original resume
4. REORGANIZE experience bullets to prioritize JD-relevant work
5. REMOVE or DE-EMPHASIZE experience that doesn't align with the JD
6. ENSURE every experience bullet point is rewritten to better match the JD requirements
7. GENERATE NEW experience content - Do NOT simply copy the default resume experience entries
8. Each bullet on work history must start with a strong action verb like these: Accelerated, Achieved, Analyzed, Architected, Assessed, Controlled, Devised, Directed, Eliminated, Established, Expanded, Generated, Implemented, Increased, Initiated, Innovated, Introduced, Launched, Led, Modernised, Pioneered, Redesigned, Reduced, Resolved, Restructured, Revitalized, Saved, Simplified, Solved, Streamlined, Transformed, Unified
9. Avoid Forbidden Verbs on each bullet on work history like these: helped, assisted, participated, supported, worked on, collaborated, contributed

The input resume is a REFERENCE for:
- Job titles, companies, and dates (keep these)
- Overall career trajectory and seniority level
- Professional tone and style

CRITICAL: PRESERVE CONTACT INFORMATION EXACTLY
- You MUST preserve the exact contact information from the input resume:
  - name: Use the EXACT name from the input resume
  - email: Use the EXACT email from the input resume
  - phone: Use the EXACT phone number from the input resume
  - location: Use the EXACT location/address from the input resume (DO NOT change or update it)
  - linkedin: Use the EXACT LinkedIn URL from the input resume
- DO NOT modify, update, or change any contact information
- DO NOT infer or generate new contact details

The input resume is NOT a template to copy from. You must GENERATE NEW CONTENT that aligns with the JD.
========================================

Job Description:
{{jd}}

Existing Resume Content (USE AS REFERENCE ONLY - DO NOT COPY VERBATIM):
{{resumeContent}}

Please provide ONLY the updated resume in the following JSON format (return ONLY this JSON object, nothing else):
{
  "name": "Full Name",
  "email": "email@example.com",
  "phone": "Phone Number",
  "location": "City, State/Country",
  "linkedin": "LinkedIn URL",
  "summary": "Professional summary optimized for this job",
  "experience": [
    {
      "title": "Job Title",
      "company": "Company Name",
      "startDate": "MM/YYYY",
      "endDate": "MM/YYYY or Present",
      "achievements": ["Achievement 1", "Achievement 2"]
    }
  ],
  "hardSkills": {
    "skill category": ["skill 1", "skill 2", "skill 3"]
  },
  "softSkills": ["skill 1", "skill 2", "skill 3"],
  "education": [
    {
      "degree": "Degree Name",
      "school": "School Name",
      "graduationDate": "MM/YYYY",
    }
  ],
}

Important: 
----------------------------------------
OUTPUT (STRICT)
----------------------------------------
- Return VALID JSON ONLY
- Must follow the provided reference JSON structure exactly
- No extra keys
- No comments
- No explanations
- Field ordering must match the reference JSON
- Arrays must preserve ordering

----------------------------------------
JOB DESCRIPTION (JD) INPUT
----------------------------------------
- JD is provided above in this prompt
- You must:
  - Parse mandatory, optional, preferred, and nice-to-have, bonus requirements
  - Extract tools, technologies, methodologies, and domain language
  - Align the resume perfectly to the JD

----------------------------------------
REFERENCE BASELINE (UPDATED DEFINITION)
----------------------------------------
- The reference JSON is used only for:
  - Resume format
  - Seniority level
  - Professional tone
  - Career profile consistency
  - Job titles and company names (keep same, but update content)
- The reference does NOT constrain:
  - Exact tools (ADD JD-required tools even if not in original)
  - Exact responsibilities (REWRITE to match JD)
  - Exact achievements (UPDATE to highlight JD-relevant work)
- The generated resume must:
  - Perfectly align with the JD (THIS IS THE PRIMARY GOAL)
  - REWRITE experience content to match JD requirements
  - Still sound realistic for a senior IC with comparable experience
- Do not downgrade seniority or introduce managerial scope unless JD explicitly requires it
- CRITICAL: Use the input resume as a REFERENCE for structure and timeline, but REWRITE all content to match the JD

----------------------------------------
TITLE RULES (STRICT)
----------------------------------------
- Parse the JD and select ONE title
- If multiple JD titles exist:
  - Select the closest senior IC title
  - Must be non-managerial
  - Must align with baseline seniority
- Use the same title in:
  - Root-level "title"
  - Luxoft job title
- No drastic career shifts (Engineer → Architect → Manager)

----------------------------------------
SUMMARY RULES (STRICT)
----------------------------------------
- Fewer than 100 words and More than 70 words
- Fully aligned with the JD and experience sections
 - Include EXACTLY two unique metrics
 - Metrics must:
   - Appear elsewhere in the resume
   - Not contradict experience sections
- Avoid verbs already used 3 times elsewhere

----------------------------------------
WORK HISTORY RULES (GLOBAL) - CRITICAL UPDATE REQUIREMENTS
----------------------------------------
- YOU MUST REWRITE ALL EXPERIENCE ENTRIES - DO NOT COPY FROM INPUT
- CRITICAL: The experience section in the input resume is ONLY a reference for:
  - Job titles, company names, and date ranges (keep these)
  - Overall work history structure
- CRITICAL: You MUST GENERATE NEW achievement bullets for each experience entry
- DO NOT copy achievement bullets from the input resume
- DO NOT use the default resume experience content as-is
- Each experience entry must be COMPLETELY REWRITTEN to:
  - Highlight JD-relevant technologies, tools, and methodologies
  - Emphasize achievements that align with JD requirements
  - Include JD-required skills even if not in original resume
  - Reorder bullets to prioritize JD-relevant work
  - Generate fresh, JD-optimized content
- Include all JD-required tools and technologies (add them even if not in original)
- Optional / preferred/ bonus / nice-to-have JD items must also be included
- Experience bullets must reflect:
  - Realistic timelines
  - Natural technical evolution
  - JD alignment (this is the PRIMARY goal)
- Cross-functional collaboration is required in all roles
- Stakeholder interaction must be explicit
- Each Experience bullet must take at least 1 METRICS.

- Avoid filler words like this: very, highly, really, various, multiple, numerous, significant, some, many, things, stuff
- Prefer precise verbs: re-architected, instrumented, standardized, orchestrated, stabilized, automated
- CRITICAL: Do NOT duplicate experience entries. Each job (title + company + startDate) must appear only ONCE in the experience array
- CRITICAL: Do NOT copy experience bullets verbatim - GENERATE NEW content that matches the JD
- CRITICAL: Achievement bullet counts must match tenure — follow EXPERIENCE BULLET TARGETS in the user message when provided:
  - Under 1 year: exactly 4 bullets
  - 1–2 years: exactly 5 bullets
  - 2–3 years: exactly 6 bullets
  - 3–4 years: exactly 7 bullets
  - 4–5 years: exactly 8 bullets
  - 5+ years: exactly 9 bullets
  - Do NOT give a 6-month role 7 bullets or a 4-year role only 4 bullets — uneven counts look fabricated
- Action Verbs
  - Across the entire resume, each action verb may appear at most 3 times
  - Applies to:
    - Summary
    - Responsibilities
    - Achievements

----------------------------------------
TECHNOLOGY TIMELINE RULES (STRICT)
----------------------------------------
- Technologies must be realistic for the role's date range
- No anachronistic tooling
- Cloud, DevOps, and frontend evolution must follow industry timelines

----------------------------------------
METRICS RULES (STRICT)
----------------------------------------
Metrics must be mixed across the resume with uneven distribution across roles allowed.

Metric Types (ALL REQUIRED)
1) Exact Metrics
   - Percentages not divisible by 5
   - Must include measurement context
2) Approximate Metrics
   - Percentages divisible by 5
   - Must use approximation language
3) Phrase-Based Metrics
   - Non-numeric (e.g., doubled, cut in half, one-third)

Global Constraints
- No reused metric values or phrases
- Metrics must be believable and contextual
- Metrics must align with described work

----------------------------------------
SKILLS RULES (UPDATED – STRICT)
----------------------------------------
Hard Skills (MANDATORY)
- Must be organized by category:
  - Backend
  - Frontend
  - Cloud
  - Data
  - Tools
  - Industry
  - Mobile (ONLY if JD includes mobile tone)
- Each included category must contain 6–10 skills
- Mobile category:
  - Included only if JD has mobile focus
  - Otherwise omitted
- Industry category:
  - Always included
  - Must reflect healthcare for companies in the candidate's profile work history (up to five).
  - refletct fintech or eCommerce if JD includes fintech or eCommerce industry.
- Hard skills must:
  - Appear in experience bullets
  - Align with JD
  - Reflect senior-level breadth
  - Be technical, measurable, and job-specific

----------------------------------------
CONSISTENCY & REALISM
----------------------------------------
- No contradictions between:
  - Skills and experience
  - Metrics and responsibilities
- Resume must:
  - Read as a refined, senior-level profile
  - Align tightly with the JD
  - Remain recruiter-trustworthy

{{industryBuzzwords}}
----------------------------------------
JSON SCHEMA
----------------------------------------
- Follow the provided reference JSON exactly
- No additional schema definitions will be provided
- Deviations are not allowed

Return ONLY valid JSON, no additional text, no markdown formatting, no code blocks.`;

export function getDefaultResumeGeneratePromptTemplate(): string {
  return RESUME_GENERATE_PROMPT_TEMPLATE;
}

export function applyResumeGeneratePromptTemplate(
  template: string,
  jd: string,
  resumeContent: string
): string {
  const industryBuzzwords = buildIndustryBuzzwordsForJd(jd);

  return template
    .replace(/\{\{jd\}\}/g, jd)
    .replace(/\{\{jobDescription\}\}/g, jd)
    .replace(/\{\{resumeContent\}\}/g, resumeContent)
    .replace(/\{\{resume\}\}/g, resumeContent)
    .replace(/\{\{industryBuzzwords\}\}/g, industryBuzzwords);
}

export function buildResumeAnalyzeStaticPrompt(
  jd: string,
  resumeContent: string,
  options?: { template?: string | null }
): string {
  const template = options?.template?.trim() || RESUME_GENERATE_PROMPT_TEMPLATE;
  return applyResumeGeneratePromptTemplate(template, jd, resumeContent);
}
