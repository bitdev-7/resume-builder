# Resume Generation Guide

This guide walks through the full flow: from creating a resume profile to downloading a tailored PDF for a specific job.

**Quick overview**

```
Sign in → Build resume profile → Add job → Analyse posting → Generate → Preview & download
```

The main UI routes are:

| Route | Purpose |
|-------|---------|
| `/profile` | Create and edit resume profiles |
| `/jobs` | Track job URLs and generate tailored resumes |
| `/history` | View past generated resumes ("bids") |
| `/settings` | AI provider, tone, generation speed, alerts |

> `/generator` redirects to `/jobs`. Use **Jobs** as the generation page.

For the technical AI pipeline (12 stages, evidence rules, prompts), see [AI_WORKFLOW.md](../AI_WORKFLOW.md).

---

## Step 1 — Sign in

1. Open the app and sign in with your email and password (Supabase Auth).
2. On first sign-in, the app creates an account row in `profiles` automatically.
3. Account-level settings (AI provider, default job site, alerts) live under **Settings**. Resume content lives in **resume profiles** (see below).

---

## Step 2 — Create a resume profile

A **resume profile** is a persona — for example "Full-Stack Engineer" or "Data Engineer". You can have several profiles and pick which one to use when generating for a job.

1. Go to **Profile** (`/profile`).
2. Click **New** (or the equivalent create action in the profile switcher).
3. Enter a label when prompted, e.g. `Backend Engineer`.
4. The new profile opens as an empty form. Fill it in (Step 3) and click **Save**.

**Switching profiles:** use the dropdown at the top of the Profile page to move between personas.

**Deleting:** you can delete a profile only if you have more than one. Deleting removes that persona and its linked content (experience, skills, etc.).

---

## Step 3 — Fill in your profile data

Everything you enter here is the **source of truth** for generation. The AI rewrites and prioritizes content for each job, but it does not invent employers, dates, or contact details.

### 3.1 Contact & summary (`resume_profiles`)

| Field | Notes |
|-------|-------|
| Profile label | Display name for switching personas |
| Full name, email, phone, location, LinkedIn | Taken from your profile as-is on the final resume |
| Professional headline | e.g. "Senior Software Engineer" — can be overridden per generation |
| Photo | Optional; used by the **sidebar** template |
| Summary | Your base summary; AI may tailor wording per job |
| Languages | Name + level (Native, Fluent, Advanced, Intermediate, Basic) |
| PDF template | Default layout for generated resumes (standard, folio, modern, classic, compact, minimal, sidebar) |

### 3.2 Work experience (`user_companies`) — most important

For each role, add:

- Job title, company, location
- Start/end dates, work type (Remote / Hybrid / Onsite)
- Role description (optional)
- **Achievement bullets** — the main evidence the AI uses when tailoring

> **Tip:** Strong, specific bullets (metrics, scope, technologies used) produce much better tailored resumes than vague job descriptions.

### 3.3 Education (`user_educations`)

Degree, school, field of study, location, start/end dates, GPA, description.

### 3.4 Skills (`user_skills`)

Skill name and category. Use category **"Soft Skills"** for non-technical skills; those are grouped separately on the resume.

### 3.5 Projects (`user_projects`)

Project name, description, technologies, optional URLs and dates.

### 3.6 Certifications (`user_certifications`)

Certification names (and related details stored in the database).

### 3.7 Save

Click **Save** on the Profile page. Data is stored in Supabase (not via a separate backend API).

**Minimum for generation:** at least one work experience with usable content (title, company, and bullets).

---

## Step 4 — Optional: import from an existing resume PDF

Instead of typing everything manually:

1. On the Profile page, use **Upload resume** (or the PDF import control).
2. The app sends the file to `POST /api/parse-resume`.
3. AI extracts structured data (extraction only — no rewriting).
4. The form is pre-filled; review, correct, and **Save**.

Always review imported data before generating — parsing is not perfect.

---

## Step 5 — Optional: tune settings

These affect *how* resumes are written, not *what facts* can be claimed.

| Setting | Where | What it does |
|---------|--------|----------------|
| AI provider / model | Settings | OpenRouter or direct OpenAI / Anthropic / DeepSeek |
| Tone, spelling, seniority framing | Settings → Prompt | Influences summary and bullet style |
| Custom prompt templates | Settings → Prompt | Per-profile overrides in `prompt_overrides` |
| Generation mode | Settings → Generation | Fast / balanced / accurate / thorough (speed vs. depth) |
| Apply alerts | Settings | Warn on duplicate applications or hybrid/onsite jobs |

---

## Step 6 — Add a job

1. Go to **Jobs** (`/jobs`).
2. Paste the job posting URL and click **Add**.
3. The job appears in your list with status **unapplied** (or similar default).

You can filter by status, open the external link, and update status as you progress (applied, interviewing, offer, etc.).

---

## Step 7 — Open the generate panel

1. On the Jobs page, click **Generate** on a job row.
2. The generate panel opens for that job URL.

---

## Step 8 — Configure generation

In the generate panel:

1. **Select resume profile** — which persona to generate from.
2. **AI model / provider** — if not using account defaults.
3. **Job site** — e.g. LinkedIn, Indeed (for metadata).
4. **Desired title** — optional headline override for this run.
5. **Paste the full job posting** into the text area (copy from the listing page, not just the URL).

---

## Step 9 — Analyse the job posting

1. Click **Analyse**.
2. The app calls `POST /api/extract-job` with the pasted text.
3. A cheap AI model extracts structured fields: title, company, description, work type, salary, posted date, etc.
4. Results appear as an **analysis card** in the panel.

This step does **not** generate your resume yet — it only structures the job data for the tailoring pipeline.

---

## Step 10 — Generate the tailored resume

1. On the analysis card, click **Generate** (or equivalent).
2. Preflight checks may run:
   - **Duplicate application** — same company applied before (if alerts enabled).
   - **Hybrid/onsite warning** — if the job is not fully remote (if alerts enabled).
3. The client submits `POST /api/analyze` and receives a `jobId` (async, HTTP 202).
4. The UI polls `GET /api/analyze/status/:jobId` every ~2 seconds until complete.

### What happens on the server

The backend loads your full profile bundle from Supabase and runs the **12-stage tailoring pipeline** (`lib/tailoring/pipeline.ts`):

| Stage | AI? | Purpose |
|-------|-----|---------|
| 1. JD Analyzer | Yes | Parse requirements, seniority, ATS terms |
| 2. Role archetype | No | Match job to role catalog |
| 3. Role skill expansion | No | Build relevant skill pool |
| 4. Candidate evidence | No | Turn profile into evidence facts |
| 5. Skill evidence resolution | No | Tag skills as supported / unsupported |
| 6. Tailoring planner | No | Bullet budgets, allowed evidence |
| 7. Experience writer | Yes | Rewrite bullets per role |
| 8. Composer | Yes | Summary, skill groups, project blurbs |
| 9. Validation | No | Check evidence and metrics |
| 10. Repair | Yes (bounded) | Fix failed sections only |
| 11. Final assembly | No | Merge AI output + profile identity |
| 12. Enrichment | No | Suggest skills you could add (UI only) |

**Core rule:** the job description controls *relevance*; your profile controls *facts*. Contact info and employment dates always come from your saved profile.

---

## Step 11 — Preview and download

When polling completes:

1. **PDF preview** opens automatically (`ResumePreviewDialog`).
2. The client calls `POST /api/generate-pdf` with the tailored resume JSON.
3. Puppeteer + Mustache render your chosen HTML template to PDF.

In the preview you can:

- Switch PDF template
- Regenerate with tone/emphasis tweaks
- Download the PDF
- Optionally save PDF to the server downloads folder

### Saved to history

The app records the run in **resume history**:

- Metadata in `resume_history` (job title, company, status, model used, etc.)
- JD text and resume JSON in Supabase Storage (`jds` / `resumes` buckets)

View and re-download past resumes under **History** (`/history`).

---

## Step 12 — Optional follow-ups

From the generate panel or history, you can also:

| Feature | Endpoint | Purpose |
|---------|----------|---------|
| ATS match score | `POST /api/check-ats` | Keyword/skill match vs. job description |
| Cover letter | `POST /api/cover-letter` | Draft from tailored resume |
| Interview answers | `POST /api/answer-questions` | Q&A grounded in your resume |
| Cover letter PDF | `POST /api/generate-cover-letter-pdf` | PDF for cover letter |

---

## Multiple profiles workflow

Typical pattern:

1. **"General SWE"** — broad experience and skills.
2. **"Backend / Python"** — emphasize Python, APIs, databases.
3. **"Frontend"** — emphasize React, UI, etc.

For each job, pick the profile that best matches the role before clicking Generate.

---

## Troubleshooting

| Problem | What to check |
|---------|----------------|
| Generate button disabled / fails | At least one company with bullets saved; profile saved successfully |
| Empty or weak bullets | Add metric-backed achievement bullets under Work experience |
| Wrong contact info on PDF | Edit Profile and Save — contact is never AI-generated |
| Generation times out | Try a faster generation mode in Settings → Generation |
| Skills missing on resume | Skill must be supported by profile evidence; see enrichment suggestions after generate |
| Cannot promote to admin | `profiles.role` is protected; use SQL with trigger disabled (see migration `012`) |

---

## Data model (reference)

| Table | Role |
|-------|------|
| `profiles` | Account (settings, role) — not resume body |
| `resume_profiles` | Persona: contact, headline, summary, template |
| `user_companies` | Work experience + bullets |
| `user_educations` | Education |
| `user_skills` | Skills |
| `user_projects` | Projects |
| `user_certifications` | Certifications |
| `jobs` | Shared job URL catalog |
| `user_job_status` | Your status per job |
| `resume_history` | Generated resumes ("bids") |

Full schema: [supabase/schema.sql](../supabase/schema.sql).

---

## Related docs

- [AI_WORKFLOW.md](../AI_WORKFLOW.md) — pipeline stages, prompts, evidence policy
