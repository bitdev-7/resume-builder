# Resume Maker — Project Documentation

A monorepo application that helps a job seeker go from a pasted job posting to a tailored, ATS-optimized resume PDF, cover letter, and interview-answer draft, while tracking every application (bid), interview, and outcome in a personal dashboard.

- **Frontend:** Next.js 14 (App Router) + React 18 + Tailwind CSS, deployed as a standalone site (port 3000 in dev).
- **Backend:** Express server exposing REST endpoints that wrap AI calls, PDF generation, and local file saves (port 4000 in dev).
- **Database/Auth/Storage:** Supabase (Postgres + Auth + Storage), queried directly from the frontend for app data (profile, resume history, interviews) and used for JWT auth verification on the backend.
- **AI:** OpenRouter (proxy to many hosted models) or direct provider keys (OpenAI, Anthropic, DeepSeek), selected per user/request.
- **PDF rendering:** Puppeteer (headless Chrome) rendering Mustache HTML templates.

```
resume-maker/
├── frontend/     Next.js UI (pages, components)
├── backend/      Express API (AI orchestration, PDF, file saves)
├── lib/          Shared TypeScript — Supabase clients/services, AI clients, prompts, PDF pipeline, types (imported by BOTH frontend and backend via the "@/lib/..." alias)
└── templates/    Mustache HTML resume templates used by the PDF pipeline (standard.html, folio.html)
```

Note on architecture: the backend's route handlers are Next.js-style (`NextRequest`/`NextResponse`) handlers, adapted onto Express via a small adapter (`backend/src/next-adapter.ts`), and all actually call into the shared `lib/` directory at the repo root for their real logic. The frontend, meanwhile, talks to Supabase **directly** for all app data (profile, resume history, interview history) — the Express backend is only used for AI calls, PDF generation, and saving files to a local Downloads folder.

---

## 1. What the app does (end-to-end user journey)

1. **Sign in** with a Supabase email/password account (`app/page.tsx` + `Auth.tsx`).
2. **Fill out a profile once** (`/profile`): default resume contact info, work history ("companies"), education, certifications, projects, and a preferred PDF template (Standard or Folio). This becomes the base resume content that every generated resume is built from.
3. **Paste a job posting** into the Generator (`/generator`) and click **Analyse**. The backend uses a cheap/fast AI model to extract structured job data (title, company, description, work type, salary, posted date) from the raw pasted text.
4. **Generate a tailored resume** for that job. The backend rewrites the user's base resume (bullets, summary, skills) to match the job description using a large, heavily-engineered prompt, merges it back with the user's verified profile data (so contact info, education, and certain achievements are never hallucinated), and renders it to PDF via Puppeteer. The result is saved to the user's OS Downloads folder and recorded in Supabase (`resume_history`) with the JD and resume JSON archived in Supabase Storage.
5. Optionally: **check the ATS match score** (keyword/skill alignment against the JD), **generate a cover letter**, or **generate answers to interview questions**, all as separate AI calls grounded in the same resume JSON.
6. **Track outcomes**: every generated resume is a "bid" with a status (`applied → interviewing → rejected/offer/accepted`). The History page lets the user update status, log interview details (call type, interviewer, notes), and re-download artifacts. The Dashboard visualizes bid/interview conversion rates over time, broken down by AI model, provider, and job site.
7. **Settings** let the user choose OpenRouter vs. direct provider API keys, enable/disable an automatic post-generation ATS check, configure duplicate-application and hybrid/onsite warnings, and set resume generation preferences (tone, spelling, language, and free-text instructions).

---

## 2. Tech stack

| Layer | Technology |
|---|---|
| Frontend framework | Next.js 14.2 (App Router), React 18.3, TypeScript |
| Styling | Tailwind CSS 3.4 (hand-rolled components; no UI kit, no charting library — SVG/CSS built by hand) |
| Fonts | Self-hosted via `@fontsource` (Manrope Variable, Space Grotesk Variable, Roboto) |
| Backend framework | Express (Node.js, ESM), running Next.js-style route handlers via a custom adapter |
| Runtime | `tsx` (no build/compile step for the backend; `npm run build` is a no-op) |
| Auth | Supabase Auth (JWT bearer tokens), verified server-side via `auth.getUser()` round-trip (not local signature verification) |
| Database | Supabase Postgres (`profiles`, `user_educations`, `user_skills`, `user_certifications`, `user_projects`, `user_companies`, `resume_history`, `interview_history`, legacy `user_preferences`) |
| File storage | Supabase Storage (buckets `jds` and `resumes` — job description text and resume/cover-letter JSON archives) |
| AI providers | OpenRouter (multi-model proxy) or direct: OpenAI, Anthropic, DeepSeek |
| PDF generation | Puppeteer (headless Chrome) + Mustache HTML templates |
| Networking | `undici`-based proxy-aware fetch wrapper (corporate proxy / VPN support), used for both Supabase and AI calls |

---

## 3. Environment variables

| Variable | Where used | Purpose |
|---|---|---|
| `PORT` | backend | Express listen port (default 4000). |
| `CORS_ORIGIN` | backend | Comma-separated allowed origins; any origin allowed if unset. |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | frontend + backend | Supabase project URL/anon key. Backend uses these to build a per-request, JWT-scoped client for auth verification. |
| `NEXT_PUBLIC_SUPABASE_FETCH_TIMEOUT_MS` | shared | Supabase fetch timeout override (default 15000ms). |
| `NEXT_PUBLIC_API_URL` | frontend | Backend base URL in production. Unset in local dev, where `next.config.js` rewrites `/api/*` to `http://localhost:4000`. |
| `OPENROUTER_API_KEY` | backend | Required when a request uses OpenRouter. |
| `OPENROUTER_BASE_URL` | backend | Override OpenRouter base URL (default `https://openrouter.ai/api/v1`). |
| `OPENROUTER_SITE_URL`, `OPENROUTER_APP_NAME` | backend | Sent as attribution headers to OpenRouter. |
| `OPENROUTER_DEFAULT_MODEL` | backend | Default OpenRouter model (default `openai/gpt-4.1-mini`). |
| `OPENROUTER_EXTRACT_MODEL` | backend | Model used for job-page extraction via OpenRouter. |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | backend | Direct OpenAI key/model (default `gpt-4o`). |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | backend | Direct Anthropic key/model (default `claude-haiku-4-5-20251001`). |
| `DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL`, `DEEPSEEK_BASE_URL` | backend | Direct DeepSeek key/model/base URL (default `https://api.deepseek.com/v1`). |
| `EXTRACT_PROVIDER`, `EXTRACT_MODEL`, `EXTRACT_MAX_TOKENS` | backend | Direct-mode job-extraction overrides (default max tokens 4096). |
| `RESUME_GENERATION_MAX_TOKENS` | backend | Overrides computed max output tokens for resume generation. |
| `AI_REQUEST_TIMEOUT_MS` | backend | Timeout for AI SDK calls (default 180000ms). |
| `AI_MAX_RETRIES` | backend | Extra retry attempts on AI timeout (default 1). |
| `ANALYZE_GENERATE_PDF` | backend | If `"true"`, `/api/analyze` also renders the PDF inline (slower); otherwise the client calls `/api/generate-pdf` separately afterward. |
| `TEMPLATES_DIR` | backend | Overrides the directory containing `standard.html`/`folio.html`. |
| `PUPPETEER_EXECUTABLE_PATH` | backend | Explicit Chrome/Chromium binary path for PDF rendering. |
| `HTTPS_PROXY` / `HTTP_PROXY` / `ALL_PROXY` / `AI_HTTPS_PROXY` | shared | Corporate/VPN proxy config for outbound Supabase + AI calls (falls back to reading the Windows registry proxy setting). |
| `NODE_ENV` | shared | Gates verbose proxy-selection logging in development. |

---

## 4. Authentication

- Every backend route except `/health`, `GET /api/direct-ai-models`, and `GET /api/openrouter-models` requires a Supabase JWT sent as `Authorization: Bearer <token>`.
- `requireAuthClient(request)` (`lib/supabase/server-client.ts`) extracts the token, builds a Supabase client scoped to that JWT (so Postgres Row-Level Security applies to any queries it makes), and calls `client.auth.getUser()` to verify the session against Supabase's auth server.
- Missing token → `401 { error: "Missing authorization token" }`. Invalid/expired token → `401 { error: "Invalid or expired session" }`.
- On the frontend, `AuthProvider` (`components/AuthProvider.tsx`) tracks the Supabase session (`user`, `loading`, `signOut`), auto-creates a `profiles` row for new users (`ensureProfile`), and has a 4-second failsafe so a slow/unreachable Supabase doesn't leave the UI stuck loading forever. `RequireAuth` (`components/RequireAuth.tsx`) gates every route except `/` (login), redirecting unauthenticated users to `/`.

---

## 5. Backend API reference

All routes are mounted under `/api/*` (see `backend/src/index.ts`). Body size limit: 50MB (to accommodate base64 PDFs and long pasted job pages). Server socket timeout: 300s. Errors not otherwise specified return `500 { error: <message> }`; auth failures always return `401` as described above.

### `GET /health`
No auth. Returns `{ ok: true }`. Plain liveness check.

### `GET /api/openrouter-models`
No auth. Returns the live OpenRouter model catalog for populating model-selection dropdowns.
- Fetches `https://openrouter.ai/api/v1/models` (12s timeout, with a proxy-aware retry). Caches the result in memory for 1 hour.
- Falls back to a curated hardcoded list of 7 models (`FALLBACK_OPENROUTER_MODELS`) if the live fetch fails or returns nothing.
- **Response:** `{ models: {id, name, provider, contextLength?}[], providers: {id, label, modelCount}[], source: "openrouter" | "fallback" }`.

### `GET /api/direct-ai-models`
No auth. Returns the models configured for direct (non-OpenRouter) provider mode, read from backend env vars.
- **Response:** `{ models: { openai, anthropic, deepseek }, extractProvider: string, extractModel: string }`.

### `POST /api/extract-job`
Auth required. Turns raw pasted job-posting text into structured data.
- **Body:** `{ pageContent: string (required), useOpenRouter?: boolean }`.
- **Logic:** Truncates `pageContent` to 48,000 chars; calls the AI (temperature 0.1) with a prompt tuned to strip navigation/footer noise and infer title/company/description/work-type/salary/posted-date; falls back to regex-based posted-date extraction from the raw text if the model omits it; infers remote/hybrid/onsite classification via keyword analysis of the description.
- **Response (200):** `{ jobTitle, companyName, jobDescription, jobType, jobTypes, requiresTravel, salary, postedDate, extractCostUsd }`.
- **Errors:** `400` if `pageContent` missing/not a string.

### `POST /api/analyze`
Auth required. The core resume-generation endpoint. Runs the multi-stage tailoring pipeline (`lib/tailoring/`). `maxDuration`: 300s. See [AI_WORKFLOW.md](AI_WORKFLOW.md) for the full stage-by-stage breakdown.
- **Body:** `{ jd?: string, pageContent?: string, jobTitle?, companyName?, profileData (required, must contain at least one work experience), template?: string, apiModel?, apiProvider?, useOpenRouter? }`.
- **Logic (summary):**
  1. Resolves/validates the AI provider/model and verifies the API key is configured.
  2. Determines the job description: uses `jd`, or extracts it from `pageContent` via a cheap AI call (same logic as `/api/extract-job`).
  3. Loads the user's generation preferences (Settings → Prompt: tone, spelling, language, additional instructions) and composes them into extra instructions for the pipeline.
  4. Runs `runTailoringPipeline`: JD analysis → role archetype detection → skill evidence resolution → per-experience bullet generation (concurrent) → summary/skills/projects composition → deterministic validation → bounded targeted repair → assembly → enrichment recommendations. Contact info, company names, titles, dates, and education are assembled from the profile in code (never generated); metrics are always evidence-grounded.
  5. Resolves the PDF template (`standard` default, or `folio`).
  6. By default does NOT render the PDF inline (the client calls `/api/generate-pdf` separately) unless `ANALYZE_GENERATE_PDF=true`.
- **Response (200):** `{ resume, providerUsed, modelUsed, jobTitle, companyName, jobDescription, generationCostUsd, roleArchetype, enrichmentRecommendations, normalizedJobTitle, validationIssues?, pdfBase64?, pdfError? }`.
- **Errors:** `400` if `profileData` has no usable work experience, or neither `jd` nor extractable `pageContent` is available. `504` on timeout-like errors, else `500`. If the resume was generated before a later step failed, still returns `200` with the resume plus a `pdfError`.

### `POST /api/check-ats`
Auth required. Scores how well a resume matches a job description (ATS-style analysis).
- **Body:** `{ resume: object (required), jd: string (required), apiModel?, apiProvider?, useOpenRouter? }`.
- **Logic:** Single AI call (temperature 0.2) asking for a strict-JSON keyword/alignment/gap analysis. Robustly parses the model's response even if wrapped in markdown or nested JSON. Throws if the parsed result is degenerate (score 0 and every list empty).
- **Response (200):** `{ ats: { score, summary, matchedKeywords[], missingKeywords[], strengths[], improvements[], formattingNotes[] }, atsCostUsd? }`.
- **Errors:** `400` if `resume`/`jd` missing or invalid.

### `POST /api/cover-letter`
Auth required. Generates a short cover letter grounded in the resume.
- **Body:** `{ resume: object (required), jd?: string, apiModel?, apiProvider?, useOpenRouter? }`.
- **Logic:** One AI call (temperature 0.4, plain text not JSON) with strict format rules: must open with `"Dear Hiring Team,"`, 3–4 body sentences using only resume facts, must close with `"Best Regards.\n\n<candidate name>"`. Post-processes to force the greeting/sign-off if the model omitted them.
- **Response (200):** `{ coverLetter: string }`.
- **Errors:** `400` if `resume` missing/invalid.

### `POST /api/answer-questions`
Auth required. Generates first-person interview answers grounded in the resume.
- **Body:** `{ questions: string[] (required, non-empty), resume: object (required), apiModel?, apiProvider?, useOpenRouter? }`.
- **Logic:** One AI call (temperature 0.3) instructing the model to answer as the candidate in first person (no name), favoring affirmative framing where plausible. Expects a JSON array of `{question, answer}`; any missing/malformed answer is backfilled with a fallback string so the response array always matches the input question count.
- **Response (200):** `{ answers: { question: string, answer: string }[] }`.
- **Errors:** `400` if `questions`/`resume` missing or invalid.

### `POST /api/generate-pdf`
Auth required. `maxDuration`: 300s. Renders a resume JSON to a PDF and returns it as base64.
- **Body:** `{ resume: object (required), template?: string }`.
- **Logic:** Loads the chosen Mustache template (`standard.html` or `folio.html`), builds the template view model from the resume JSON, renders HTML, then rasterizes to an A4 PDF via a single-at-a-time Puppeteer render lock.
- **Response (200):** `{ pdfBase64: string }`.
- **Errors:** `400` if `resume` missing/invalid.

### `POST /api/generate-cover-letter-pdf`
Auth required. `maxDuration`: 120s. Renders plain cover-letter text into a simple serif-font PDF.
- **Body:** `{ text: string (required) }`.
- **Response (200):** `{ pdfBase64: string }`.
- **Errors:** `400` if `text` missing/not a string.

### `POST /api/save-pdf`
Auth required. Writes a client-supplied base64 PDF directly to the **backend server's own filesystem** (its local Downloads folder) — intended for local/desktop-style deployments where the backend runs on the same machine as the user.
- **Body:** `{ pdfBase64: string (required), companyName?, jobRole?, personName?, fileName? }`.
- **Logic:** Builds `Downloads/{Company}_{Role}/{fileName or personName}.pdf`, decodes the base64, creates the directory, writes the file.
- **Response (200):** `{ savedPath: string, paths: { dirName, fileName } }`.
- **Errors:** `400` if `pdfBase64` missing/not a string.

### `POST /api/save-resume-pdf`
Auth required. `maxDuration`: 300s. Combines `generate-pdf` + `save-pdf` in one call: renders the resume to PDF and writes it straight to the server's Downloads folder without returning the PDF bytes to the client.
- **Body:** `{ resume: object (required), template?, companyName?, jobRole?, personName?, fileName? }`.
- **Response (200):** `{ savedPath: string, paths: { dirName, fileName } }`.
- **Errors:** `400` if `resume` missing/invalid.

### `POST /api/save-text`
Auth required. Saves arbitrary text (e.g. the job description) to the server's Downloads folder.
- **Body:** `{ content: string (required), companyName?, jobRole?, fileName? }` (`fileName` defaults to `"Cover Letter.txt"`).
- **Response (200):** `{ savedPath: string, paths: { dirName, fileName } }`.
- **Errors:** `400` if `content` missing/not a string.

### Notes on backend behavior
- No route writes to Supabase tables directly except reading the user's generation preferences in `/api/analyze`. All Supabase writes (resume history, interviews, profile data) happen from the **frontend**, calling Supabase directly.
- All PDF renders are serialized process-wide (one Puppeteer render at a time) to avoid resource contention; each render launches and tears down its own headless Chrome instance.
- Every AI-backed response that has a meaningful cost includes a `*CostUsd` field, computed either from provider-reported cost or a static per-model USD/1M-token pricing table.
- DeepSeek's "reasoning" models are special-cased throughout: reasoning mode is explicitly disabled for structured-JSON calls, and a JSON-friendly model variant is substituted when strict JSON output is required.

---

## 6. Shared library (`lib/`)

Imported by both `frontend` and `backend` via the `@/lib/...` path alias.

### 6.1 Supabase layer
- **`lib/supabase.ts`** — Singleton browser/server Supabase client (anon key), with session persistence and a 15s fetch timeout.
- **`lib/supabase/server-client.ts`** — Builds a JWT-scoped server client per backend request; exposes `requireAuthClient()` and the `AuthError` type used for 401 responses.
- **`lib/supabase/get-user-id.ts`**, **`ensure-profile.ts`** — Current-user lookup and "create the profile row if it's missing" bootstrap logic.
- **`lib/supabase/load-profile-bundle.ts`**, **`load-profile-for-app.ts`**, **`empty-profile-bundle.ts`**, **`profile-cache.ts`** — Loads a user's full profile (profile + educations + skills + certifications + projects + companies) in parallel; falls back to a legacy `user_preferences`-based shape for un-migrated accounts, and to a `localStorage` cache or an empty bundle if Supabase is unreachable.
- **`lib/supabase/storage.ts`** — Manages two storage buckets: `jds` (job description text) and `resumes` (resume/cover-letter JSON), with deterministic per-user paths.
- **`lib/supabase/services/*`** — One module per domain: `profiles`, `resumes` (resume history CRUD + bid status), `interviews` (interview CRUD, auto-promotes bid status to "interviewing" on first logged interview), `user-companies`/`user-educations`/`user-projects`/`user-certifications` (diff-and-sync pattern for the profile editor), `ai-settings`, `apply-alert-settings`, `general-settings`, `resume-prompt-settings`, `profile-default-settings` (all settings are packed into a single `profiles.default_settings` JSONB column), and `save-profile` (the top-level "Save Profile" orchestration).
- **`lib/supabase/database.types.ts`** — Hand-authored TypeScript row/enum types: `WorkType`, `BidStatus` (applied/interviewing/rejected/offer/accepted), `InterviewCallType` (intro/hr/live_coding/system_design/culture/final), and the `Profile`, `UserEducation`, `UserSkill`, `UserCertification`, `UserProject`, `UserCompany`, `ResumeRecord`, `InterviewRecord`, `ProfileBundle` interfaces.

**Implied database tables:** `profiles`, `user_educations`, `user_skills`, `user_certifications`, `user_projects`, `user_companies`, `resume_history`, `interview_history`, plus legacy `user_preferences`.

### 6.2 AI / provider layer
- **`lib/ai-api.ts`** — Resolves a client's `{useOpenRouter, apiModel, apiProvider}` request into a normalized AI request, and validates the required API key is configured.
- **`lib/ai-provider.ts`** — The actual SDK call engine (`callAI`). Instantiates OpenRouter/OpenAI/DeepSeek/Anthropic clients through a proxy-aware fetch (180s timeout, 1 retry), extracts/repairs JSON from model output, and formats user-facing error messages (`formatAIProviderError`) for connection errors, timeouts, and bad API keys.
- **`lib/ai-usage.ts`** — Token usage extraction and USD cost estimation (hardcoded pricing table per model, with a fallback rate for unknown models).
- **`lib/openrouter.ts`** / **`openrouter-shared.ts`** — OpenRouter model catalog helpers, provider grouping/labeling, per-provider max-token tuning, DeepSeek reasoning-model detection and JSON-friendly-model swapping.
- **`lib/direct-ai-shared.ts`**, **`lib/anthropic-model.ts`** — Direct-provider (OpenAI/Anthropic/DeepSeek) type/default-model helpers.
- **`lib/ai-settings.ts`** — Per-user `use_openrouter` and `auto_ats_after_resume` preference flags.
- **`lib/proxy-fetch.ts`** — Corporate proxy/VPN-aware `fetch` used by both Supabase and AI calls; auto-detects env or Windows-registry proxy settings, probes loopback proxies for reachability, retries once on connection failure.

### 6.3 Prompts
The resume-tailoring flow uses small, stage-specific prompts (see [AI_WORKFLOW.md](AI_WORKFLOW.md)):
- **`lib/prompts/tailoring-policy.ts`** — Shared evidence + prompt-injection policy block reused across the pipeline prompts.
- **`lib/prompts/jd-analyzer-prompt.ts`** — Parses a JD into structured requirements (no resume content).
- **`lib/prompts/experience-writer-prompt.ts`** — Writes bullets for one experience from its allowed evidence + allowed skills.
- **`lib/prompts/composer-prompt.ts`** — Generates the summary, grouped skills, soft skills, and project descriptions.
- **`lib/prompts/resume-parse-prompt.ts`** — Extracts structured profile data from an uploaded resume's text (Upload Existing Resume).
- **`lib/prompts/job-page-extract.ts`** — Turns messy pasted job-posting text into structured JSON.
- **`lib/prompts/ats-match.ts`** — Prompt for the ATS keyword/alignment scoring feature.
- **`lib/resume-bullets.ts`** — Tenure → bullet-count mapping (4 bullets under 1 year, up to 9 at 5+ years) used by the tailoring planner.
- **`lib/resume-prompt-settings.ts`** — User resume-generation preferences (tone, spelling, language, additional instructions) and `buildResumeExtraInstructions`, which composes them into the pipeline's extra instructions.

### 6.4 PDF generation
- **`lib/generate-resume-pdf.ts`** — Builds the Mustache view model from resume JSON (dedupes experience/education, formats skills/certifications/projects) and renders the chosen template to PDF.
- **`lib/pdf-from-html.ts`** — Puppeteer wrapper: resolves a Chrome executable, launches headless Chrome per render (serialized via a process-wide lock), exports A4 PDFs with 10mm margins.
- **`lib/pdf-download.ts`**, **`pdf-download-paths.ts`**, **`save-pdf-to-disk.ts`** — Client-side download orchestration (calls the backend save endpoints, falling back to a browser blob download if the server save fails) and server-side path sanitization/file writing.
- **`lib/resume-templates.ts`** — Registry of the two templates (`standard`, `folio`), with legacy `"ledger"` → `"folio"` migration.
- **`templates/standard.html`** — Centered, single-column, ATS-friendly layout (Arial/Helvetica). Sections: Summary, Skills (grouped by category), Experience, Education.
- **`templates/folio.html`** — Left-aligned, more editorial serif layout (Georgia headings). Adds Certifications and Projects sections that `standard.html` doesn't render, and uses en-dash bullet markers.

### 6.5 Job/analysis helpers
- **`lib/extract-job-page.ts`** — The job-extraction pipeline used by both `/api/extract-job` and `/api/analyze`.
- **`lib/analyze-json.ts`** — JSON helpers: `cleanJsonText` (strips code fences), used by every AI-backed pipeline stage before parsing, plus parse-failure diagnostics.
- **`lib/job-posted-date.ts`**, **`lib/job-work-type.ts`** — Regex-based fallback extraction of posted date and remote/hybrid/onsite/travel classification.
- **`lib/jobsites.ts`** — Static registry of supported job boards (LinkedIn, ZipRecruiter, Indeed, Glassdoor, Dice, JobRight, Cord, Greenhouse, Lever, Workday, Other).
- **`lib/check-ats-client.ts`** — Client-side wrapper for `POST /api/check-ats` plus score-label/color helpers.
- **`lib/apply-alerts.ts`**, **`lib/apply-alert-settings.ts`** — Duplicate-company-application detection (normalizes company names, checks a configurable lookback window) and hybrid/onsite job warnings, plus the settings that control them.

### 6.6 Misc utilities
- **`lib/dashboard-stats.ts`** — All dashboard analytics: bid/interview conversion rates, breakdowns by AI model/provider/job site, daily time-series, and interview-funnel analysis by call type (intro/HR/live coding/system design/culture/final).
- **`lib/format-duration.ts`**, **`lib/theme.ts`**, **`lib/api-config.ts`** — Formatting a millisecond duration for display, light/dark theme persistence, and resolving the backend API base URL.
- **`lib/generator-workspace-storage.ts`** — Persists the Generator page's in-progress state (pasted content, extracted sessions, results) to `sessionStorage` so it survives a refresh; also defines the cross-component `resume-settings-updated` event.
- **`lib/mappers/*`** — Date format conversion (`MM/YYYY` ⟷ ISO), legacy `user_preferences` → normalized `ProfileBundle` conversion, profile ⟷ form-state conversion, and profile ⟷ resume-JSON conversion (the canonical "existing resume" builder fed into AI prompts and PDF rendering).

### 6.7 Types
- **`lib/types/resume.ts`** — `UpdatedResume` (the canonical resume document: contact fields, `experience[]`, `hardSkills`/`softSkills`, `education[]`, `certifications[]`, `projects[]`), `ResumeExperience`, `ResumeEducation`, `ResumeProject`.
- **`lib/types/ats-match.ts`** — `AtsMatchResult` (`score`, `summary`, `matchedKeywords[]`, `missingKeywords[]`, `strengths[]`, `improvements[]`, `formattingNotes[]`) plus a resilient multi-strategy parser for extracting this shape from inconsistent LLM output.

---

## 7. Frontend pages (routes)

All routes except `/` require authentication (enforced by `RequireAuth`, redirecting to `/` otherwise).

### `/` — Login
Public sign-in screen (`Auth.tsx` renders the actual form; calls `supabase.auth.signInWithPassword` directly). Redirects to `/dashboard` automatically if already signed in.

### `/dashboard` — Dashboard
Home page after login. Loads all resume history and interview history from Supabase, then computes everything else client-side.
- **Date-range presets**: 7 days / 30 days / This month / All time buttons, plus manual "From"/"To" date pickers.
- **Today's activity panel** (`TodayBidsPanel`): today's bid count with an AI-provider breakdown and a job-site breakdown.
- **Interview-rate group**: `DailyInterviewChart` (daily interview rate line/bars), `InterviewCallTypeChart` (stacked breakdown of interview stages into succeed/progressing/failed), `SuccessRatePanel` (overall interview-rate ring + Bids/Interview/Applied tiles), `ModelRateTable` and `JobsiteRateTable` (interview rate by AI model / by job site).
- **Bid-count group**: `DailyBidChart` (bids per day) plus three `CountBarChart`s (by job site, by provider, by model).

### `/generator` — Generator (core workflow)
- **Paste + Analyse**: paste a job posting into the textarea, choose the AI provider/model (OpenRouter model picker or direct-provider picker) and job site, click **Analyse** → `POST /api/extract-job` extracts structured job data into a new session card.
- **Generate resume** (per session card): runs preflight checks first (duplicate-company-application warning, hybrid/onsite warning — both configurable in Settings), then calls `POST /api/analyze`, saves the resulting PDF to the user's Downloads folder, and archives the JD + resume JSON to Supabase (`resume_history` row + Storage). Optionally auto-runs the ATS check afterward if that setting is enabled.
- **View JD**: modal showing the full extracted job description with copy-to-clipboard.
- **ATS match**: modal showing a 0–100 match score, matched/missing keywords, strengths, improvements, and formatting notes (`POST /api/check-ats`).
- **Answers**: modal to paste interview questions and get AI-generated, resume-grounded answers (`POST /api/answer-questions`).
- **Close (×)**: dismisses a session card.
- Multiple sessions can be open at once (one per pasted job); state is persisted to `sessionStorage` so an in-progress multi-job session survives a page refresh.

### `/history` — Resume History
Browse, search, and filter every past resume ("bid").
- **Search/filter bar**: free-text search plus filters for bid status, job site, AI provider, AI model, "has interviews," date range, caller, and interviewer; pagination (10/20/50 per page).
- **Bid status dropdown** per row: updates `applied → interviewing → rejected/offer/accepted`.
- **View/Hide**: expands a row to lazily load and display the archived job description and resume JSON.
- **Copy / Download job description**: clipboard copy or save as `.txt` to Downloads.
- **Download resume PDF**: re-renders the archived resume JSON to PDF and saves it to Downloads.
- **Interview tracking** (moved here from the old `/interviews` page): add/edit/delete interview records per bid (date, call type, caller, interviewer, recording name, notes). Logging the first interview for a bid auto-promotes its status to "interviewing."

### `/interviews`
Deprecated — immediately redirects to `/history`, where interview tracking now lives.

### `/profile` — Profile Settings
Edit the base resume data used to seed every generated resume.
- **PDF template picker**: Standard vs. Folio.
- **Default resume info**: name, phone, location, LinkedIn, summary (email read-only from the auth account).
- **Education / Certifications / Projects / Companies**: add/remove rows freely; each is a full form (achievements and technologies entered as line/comma-separated lists).
- **Save**: writes the profile row and syncs all four child tables (insert/update/delete diff) in one action; **Cancel** discards changes and returns to the dashboard.

### `/profile/change-password`
Standalone password-change form calling `supabase.auth.updateUser({ password })` directly, with client-side length/confirmation validation.

### `/settings` — General Settings
- **Use OpenRouter** toggle (OpenRouter vs. direct provider API keys for the Generator).
- **Show ATS score after generating resume** toggle (auto-runs the ATS check after each resume generation).
- **Alert on duplicate company applications** toggle + configurable look-back window (1–24 months).
- **Alert on hybrid or onsite jobs** toggle.
- **Save settings**: writes all of the above in one call and notifies any open Generator tab to reload live.

### `/settings/prompt` — Resume Generation Preferences
- Set **tone** (Concise / Balanced / Detailed), **spelling** (US / UK), and **language** for the generated resume prose.
- An optional **Additional instructions** free-text box for emphasis, words to avoid, or domain framing.
- These preferences are layered onto the pipeline as extra instructions; they shape style/wording only and cannot override the evidence rules (nothing invented). **Reset to defaults** / **Save preferences**.

### `/statistics`
Placeholder page ("This section is on the way") — not yet implemented.

---

## 8. Frontend components

### Layout / navigation / auth
- **`AppNav`** — Persistent top nav: logo/home link, desktop pill nav (Dashboard/Generator/History/Statistics), theme toggle, and a user-avatar dropdown (Settings, Prompt, Profile, Change password, Sign out; also duplicates the main nav links on mobile).
- **`AuthenticatedChrome`** — Chooses between the bare public layout (`/` only) and the authenticated app shell (nav + `RequireAuth`-gated content) for every other route.
- **`RequireAuth`** — Auth gate: shows a spinner while auth state resolves, redirects to `/` if unauthenticated, otherwise renders the page inside a caller-provided shell (keeps the nav visible during the loading/redirect transition).
- **`AuthProvider`** — Global Supabase session context (`user`, `loading`, `signOut`); auto-creates the user's `profiles` row on first sign-in.
- **`Providers`** — Composition root nesting `ThemeProvider` then `AuthProvider`.
- **`ThemeProvider`** / **`ThemeToggle`** — Light/dark theme state (persisted to `localStorage`) and the sun/moon toggle button.
- **`PlaceholderPage`** — Generic "coming soon" empty state, used by `/statistics`.

### Generator workflow
- **`AnalysisResultCard`** — One job-session card: job metadata, work-type badges, a simulated progress bar during generation, and the Generate/View JD/ATS match/Answers/Close actions.
- **`JobDescriptionDialog`** — Modal showing the full extracted job description with copy-to-clipboard.
- **`AtsMatchDialog`** — Modal that fetches (or reuses a cached) ATS score and renders a color-coded score ring, matched/missing keyword pills, and strengths/improvements/formatting-notes lists.
- **`AnswerQuestionsDialog`** — Modal for pasting interview questions and generating/copying AI-drafted answers.
- **`ApplyAlertDialog`** — Confirmation modal warning about duplicate company applications and/or hybrid/onsite requirements before generation proceeds.
- **`OpenRouterModelSelect`** — Provider + model dropdown pair backed by the live OpenRouter catalog (`GET /api/openrouter-models`), with an offline fallback list and auto-correction if the current selection becomes invalid.
- **`DirectProviderModelSelect`** — Provider dropdown + read-only model field for direct (non-OpenRouter) mode, where the model is fixed per provider by backend configuration.
- **`ResumeForm`** and **`ResultDisplay`** — An earlier/alternate single-job generation form and results panel (extract → preflight → parent-driven submit; PDF download, cover letter, and Q&A actions). Not wired into the current `/generator` page's flow, kept as a simpler alternate/legacy implementation.

### Dashboard widgets (`components/dashboard/`)
- **`TodayBidsPanel`** — Hero "today's bids" counter with provider and job-site mini-breakdowns.
- **`CountBarChart`** — Generic horizontal bar chart for label→count breakdowns.
- **`DailyBidChart`** / **`DailyInterviewChart`** — Vertical bar charts of daily bid counts / daily interview rate.
- **`InterviewCallTypeChart`** — Stacked bar breakdown of interviews by stage (succeed/progressing/failed).
- **`SuccessRatePanel`** — Overall interview-rate ring plus Bids/Interview/Applied metric tiles.
- **`ModelRateTable`** / **`JobsiteRateTable`** — Tables of interview rate by AI model / by job site.
- **`ProviderBreakdown`** — Donut chart + legend (or compact pill row) of AI-provider distribution.
- **`JobsitePills`** — Small pill list of job-site → count.
- **`StatCard`** — Generic large-number stat tile primitive.

### Shared primitives
- **`Toast`** — `useToast()` hook + `ToastContainer`; every page/dialog manages its own toast instance (no single global toast queue).

---

## 9. Key design decisions worth knowing

- **Local file saves are server-local.** `/api/save-pdf`, `/api/save-resume-pdf`, and `/api/save-text` write to the *backend's own* filesystem Downloads folder — this only produces a file the user can find if the backend runs on their own machine (a local/desktop-style deployment), not a typical multi-tenant cloud host. If deployed remotely, these endpoints should be treated as writing to server-side storage rather than the end user's computer, and the frontend also falls back to a plain browser blob download if the server save fails.
- **Settings are packed into one JSONB column.** AI provider choice, apply-alert configuration, and resume generation preferences are all stored inside `profiles.default_settings` rather than dedicated columns/tables.
- **Contact info and education are never trusted from the AI.** `/api/analyze` always overwrites name/email/phone/location/linkedin and education from the user's verified profile data, only using the AI's output for experience bullets, summary, and skills — this prevents hallucinated contact details or degree information from reaching the final resume.
- **`/api/analyze` uses a multi-stage pipeline with deterministic validation and bounded repair.** Each AI stage's output is schema-validated; a deterministic validator then checks evidence references, ungrounded metrics, and skill support, and only the failing parts are re-generated (max 2 attempts) before falling back. Structure and factual integrity live in application code, not in a single model call. See [AI_WORKFLOW.md](AI_WORKFLOW.md).
