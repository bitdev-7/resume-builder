# Resume Maker — Project Documentation

A monorepo application that helps a job seeker go from a pasted job posting to a tailored, ATS-optimized resume PDF, cover letter, and interview-answer draft, while tracking every application (bid), interview, and outcome in a personal dashboard.

- **Frontend:** Next.js 14 (App Router) + React 18 + Tailwind CSS (port 3000 in dev).
- **Backend:** Express server exposing REST endpoints that wrap AI calls, PDF generation, and local file saves (port 4000 in dev).
- **Database/Auth/Storage:** Supabase (Postgres + Auth + Storage), queried directly from the frontend for app data and used for JWT auth verification on the backend.
- **AI:** OpenRouter (proxy to many hosted models) or direct provider keys (OpenAI, Anthropic, DeepSeek), selected per user/request. Resume tailoring runs a multi-stage, evidence-grounded pipeline (see [AI_WORKFLOW.md](AI_WORKFLOW.md)).
- **PDF rendering:** Puppeteer (headless Chrome) rendering Mustache HTML templates.

```
resume-maker/
├── frontend/     Next.js UI (pages, components)
├── backend/      Express API (AI orchestration, PDF, file saves)
├── lib/          Shared TypeScript — Supabase clients/services, AI clients, the tailoring pipeline, prompts, PDF, types (imported by BOTH frontend and backend via "@/lib/...")
├── templates/    Mustache HTML resume templates (standard, folio, modern, classic, compact, minimal, sidebar)
└── supabase/     schema.sql (full fresh-install schema) + migrations/
```

Architecture note: the backend's route handlers are Next.js-style (`NextRequest`/`NextResponse`) handlers adapted onto Express via `backend/src/next-adapter.ts`, and they call into the shared `lib/` for their real logic. The frontend talks to Supabase **directly** for all app data (profiles, resume history, interviews); the backend is used only for AI calls, PDF generation, and saving files to a local Downloads folder.

---

## 1. What the app does (end-to-end user journey)

1. **Sign in** with a Supabase email/password account.
2. **Fill out one or more resume profiles** (`/profile`). Each profile is an independent persona with its own name, professional title, contact, resume email, photo, summary, work history, education, certifications, projects, skills, languages, and PDF template. You can create/rename/delete profiles and switch between them. You can also **Upload an existing resume PDF** to auto-fill a profile (AI extraction).
3. **Paste a job posting** into the Generator (`/generator`), pick which profile to use, and click **Analyse**. A cheap AI model extracts structured job data (title, company, description, work type, salary, posted date).
4. **Generate a tailored resume**. The backend runs the multi-stage tailoring pipeline (`lib/tailoring/`), renders a PDF, and opens a **preview**. From the preview you can switch template (re-renders instantly, no AI cost), regenerate with a tone/emphasis tweak, and **Download** the PDF. The run is recorded in Supabase (`resume_history`) with the JD and resume JSON archived in Storage.
5. Optionally: **ATS match score**, **cover letter**, or **interview-question answers**, each a separate grounded AI call.
6. **Track outcomes**: every generated resume is a "bid" (`applied → interviewing → rejected/offer/accepted`). History lets you update status, log interviews, and re-download artifacts. The Dashboard visualizes conversion rates by AI model, provider, and job site.
7. **Settings**: OpenRouter vs. direct keys, auto post-generation ATS check, duplicate-application / hybrid-onsite warnings, and resume generation preferences (tone, spelling, language, seniority framing, free-text instructions).

---

## 2. Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14.2 (App Router), React 18.3, TypeScript, Tailwind 3.4 (hand-rolled components; SVG/CSS charts) |
| Backend | Express (Node.js, ESM), Next.js-style route handlers via a custom adapter, run with `tsx` |
| Auth | Supabase Auth (JWT bearer), verified server-side via `auth.getUser()` |
| Database | Supabase Postgres: `profiles`, `resume_profiles`, `user_educations`, `user_skills`, `user_certifications`, `user_projects`, `user_companies`, `resume_history`, `interview_history` |
| Storage | Supabase Storage (`jds`, `resumes` buckets) |
| AI | OpenRouter (multi-model proxy) or direct OpenAI / Anthropic / DeepSeek |
| PDF | Puppeteer (headless Chrome) + Mustache templates |
| PDF text extraction | `pdf-parse` (Upload Existing Resume) |
| Validation | `zod` (AI-stage output schemas) |
| Tests | `vitest` (root `npm test`) |
| Networking | `undici`-based proxy-aware fetch (corporate proxy / VPN support) |

`npm run build` runs the backend typecheck (`tsc --noEmit`) then the frontend `next build`. `npm test` runs vitest.

---

## 3. Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `PORT` | backend | Express listen port (default 4000). |
| `SERVER_TIMEOUT_MS` | backend | Request/socket timeout (default 600000ms). Raised above the default because the multi-call pipeline can run for minutes. |
| `CORS_ORIGIN` | backend | Comma-separated allowed origins; any origin if unset. |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | frontend + backend | Supabase URL/anon key. |
| `NEXT_PUBLIC_API_URL` | frontend | Backend base URL. **Set to `http://localhost:4000` in local dev** so the browser calls the backend directly and long requests aren't reset by the Next dev rewrite proxy. |
| `OPENROUTER_API_KEY` | backend | OpenRouter key (proxies all providers under one key). |
| `OPENROUTER_DEFAULT_MODEL` | backend | Primary model (default `openai/gpt-4.1-mini`). |
| `OPENROUTER_EXTRACT_MODEL` | backend | Cheap model for job-page + resume extraction. |
| `AI_FALLBACK_MODEL` | backend | Optional cross-provider OpenRouter fallback used when the primary fails with a provider-level error (5xx/429/timeout/model-not-found). Recommended: `google/gemini-2.5-flash`. Not triggered on 401/402/403 (account-level). |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `DEEPSEEK_API_KEY` (+ `*_MODEL`, `DEEPSEEK_BASE_URL`) | backend | Only for direct-provider mode; unused when using OpenRouter. |
| `EXTRACT_PROVIDER`, `EXTRACT_MODEL`, `EXTRACT_MAX_TOKENS` | backend | Direct-mode extraction overrides. |
| `RESUME_GENERATION_MAX_TOKENS` | backend | Max output tokens for resume generation. |
| `RESUME_PARSE_MAX_TOKENS` | backend | Max output tokens for Upload-Existing-Resume parsing (default 8192; large resumes need headroom). |
| `AI_REQUEST_TIMEOUT_MS` | backend | Per AI call timeout (default 180000ms). |
| `AI_MAX_RETRIES` | backend | Retry attempts on transient AI failures (default 1). |
| `AI_MAX_BACKOFF_MS` | backend | Cap on retry backoff (default 20000ms). |
| `ANALYZE_GENERATE_PDF` | backend | If `"true"`, `/api/analyze` renders the PDF inline (default off; client renders separately). |
| `TEMPLATES_DIR` | backend | Overrides the templates directory. |
| `PUPPETEER_EXECUTABLE_PATH` | backend | Explicit Chrome binary path. |
| `HTTPS_PROXY` / `HTTP_PROXY` / `ALL_PROXY` / `AI_HTTPS_PROXY` | shared | Proxy/VPN config for outbound Supabase + AI calls. |

---

## 4. Authentication

- Every backend route except `/health`, `GET /api/direct-ai-models`, `GET /api/openrouter-models` requires `Authorization: Bearer <supabase-jwt>`.
- `requireAuthClient(request)` (`lib/supabase/server-client.ts`) extracts the token, builds a JWT-scoped Supabase client (Postgres RLS applies), and verifies via `auth.getUser()`. Missing/invalid token → `401`.
- Frontend: `AuthProvider` tracks the session and ensures a `profiles` row exists on first sign-in; `RequireAuth` gates all routes except `/`.

---

## 5. Backend API reference

Mounted under `/api/*` (`backend/src/index.ts`). Body limit 50MB. Request/socket timeout `SERVER_TIMEOUT_MS` (default 600s). Auth failures → `401`; unhandled errors → `500 { error }` (the adapter guarantees no crash).

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /health` | No | `{ ok: true }` liveness. |
| `GET /api/openrouter-models` | No | Live OpenRouter model catalog (1h cache, curated fallback list). |
| `GET /api/direct-ai-models` | No | Models configured for direct-provider mode. |
| `POST /api/extract-job` | Yes | Pasted page text → structured job data. |
| `POST /api/parse-resume` | Yes | Uploaded resume PDF → structured profile data. |
| `POST /api/analyze` | Yes | The core multi-stage tailoring pipeline. |
| `POST /api/check-ats` | Yes | ATS keyword/alignment score. |
| `POST /api/cover-letter` | Yes | Cover letter grounded in the resume. |
| `POST /api/answer-questions` | Yes | First-person interview answers. |
| `POST /api/generate-pdf` | Yes | Resume JSON → PDF base64. |
| `POST /api/generate-cover-letter-pdf` | Yes | Cover-letter text → PDF base64. |
| `POST /api/save-pdf`, `/api/save-resume-pdf`, `/api/save-text` | Yes | Write a file to the backend's local Downloads folder. |

### `POST /api/parse-resume`
- **Body:** `{ pdfBase64: string (required), useOpenRouter?: boolean }`.
- **Logic:** Extracts text with `pdf-parse`, then one AI call (temperature 0.1, `RESUME_PARSE_MAX_TOKENS` output cap) extracting `{ fullName, email, headline, phone, location, linkedin, summary, educations[], certifications[], projects[], companies[], skills[] }`. Extraction only — the prompt forbids inventing/rewriting. On JSON-parse failure it logs diagnostics and, if the output looks truncated, tells the user the resume is too long.
- **Response (200):** `{ profile: ParsedResume, parseCostUsd? }`.
- **Errors:** `400` if no `pdfBase64`; `422` for unreadable/scanned PDFs (no text) or unparseable output.

### `POST /api/analyze` (core)
- **Body:** `{ jd?, pageContent?, jobTitle?, companyName?, profileData (required, ≥1 work experience), template?, apiModel?, apiProvider?, useOpenRouter?, promptTweak?: { tone?, emphasis? } }`.
- **Logic:** Resolves the AI request → determines the JD (from `jd` or by extracting `pageContent`) → loads the user's generation preferences and composes them (plus any per-run `promptTweak`) into pipeline instructions → runs `runTailoringPipeline` (see [AI_WORKFLOW.md](AI_WORKFLOW.md)) → applies the senior-framing backstop to the summary when that preference is on → resolves the PDF template. PDF is not rendered inline unless `ANALYZE_GENERATE_PDF=true`.
- **Response (200):** `{ resume, providerUsed, modelUsed, jobTitle, companyName, jobDescription, generationCostUsd, roleArchetype, enrichmentRecommendations, normalizedJobTitle, validationIssues?, pdfBase64?, pdfError? }`.
- **Errors:** `400` if `profileData` lacks a usable experience or no JD is available; `504` on timeouts; else `500` (with a status-aware message for 402 out-of-credits / 429 rate-limit / 5xx).

### `POST /api/generate-pdf`
- **Body:** `{ resume: object (required), template?: string }` (template is one of standard / folio / modern / classic / compact / minimal / sidebar).
- **Response:** `{ pdfBase64 }`. Used by the preview (render + template switch) and history re-download.

Other endpoints (`check-ats`, `cover-letter`, `answer-questions`, `generate-cover-letter-pdf`, the save-* file writers) are unchanged single-purpose calls; each returns `{ error }` with the appropriate status on failure.

### Notes
- Save-* endpoints write to the **backend's own** Downloads folder (local/desktop-style deployment); the frontend falls back to a browser blob download if the server save fails.
- AI-backed responses carry a `*CostUsd` field.
- Transient AI failures (timeout, connection, 429, 5xx) are retried with backoff (honoring `Retry-After`); a configured `AI_FALLBACK_MODEL` is tried once on provider-level failures.

---

## 6. Shared library (`lib/`)

### 6.1 Supabase layer
- `lib/supabase.ts`, `lib/supabase/server-client.ts` — singleton browser client and the JWT-scoped server client + `requireAuthClient`/`AuthError`.
- `lib/supabase/ensure-profile.ts` — ensures the account `profiles` row.
- `lib/supabase/load-profile-bundle.ts` / `load-profile-for-app.ts` — load a **specific resume profile's** bundle (account `profiles` row + the chosen `resume_profiles` persona + its content rows, scoped by `profile_id`). `load-profile-for-app` also returns the list of profiles and the active profile id, with a `localStorage` cache + empty-bundle fallback when Supabase is unreachable.
- `lib/supabase/storage.ts` — `jds` and `resumes` buckets, per-user paths.
- `lib/supabase/services/*` — per-domain modules: `resume-profiles` (list/create/update/delete/setDefault + ensure-default), `profiles` (account `default_settings`), `resumes` (history CRUD + bid status, tagged with `profile_id`), `interviews`, the diff-and-sync child services (`user-companies/educations/projects/certifications/skills`, all keyed by `profile_id`), settings services (`ai-settings`, `apply-alert-settings`, `general-settings`, `resume-prompt-settings`, `profile-default-settings`), and `save-profile` (persists a persona + all its content).
- `lib/supabase/database.types.ts` — hand-authored row/enum types incl. `Profile`, `ResumeProfile` (+`ResumeLanguage`), `UserEducation/Skill/Certification/Project/Company` (each with `profile_id`), `ResumeRecord`, `InterviewRecord`, `ProfileBundle` (`profile` + `resumeProfile` + content).

**Tables:** `profiles` (account settings), `resume_profiles` (personas), the five content tables, `resume_history`, `interview_history`. (The legacy `user_preferences` fallback has been removed.)

### 6.2 AI / provider layer
- `lib/ai-api.ts` — resolves `{useOpenRouter, apiModel, apiProvider}` and validates the key.
- `lib/ai-provider.ts` — `callAI` (the SDK engine). Timeout + **retry on transient failures** (timeout/connection/429/408/5xx) with exponential backoff honoring `Retry-After`; **cross-provider fallback** to `AI_FALLBACK_MODEL` on provider-level failures (skips 401/402/403/400). `formatAIProviderError` returns status-aware messages (402 out-of-credits, 429 rate-limit, 5xx server error, connection/timeout/403).
- `lib/ai-usage.ts` — token/USD cost estimation.
- `lib/openrouter.ts` / `openrouter-shared.ts`, `direct-ai-shared.ts`, `anthropic-model.ts` — model catalog + provider helpers.
- `lib/ai-settings.ts` — `use_openrouter`, `auto_ats_after_resume`.
- `lib/proxy-fetch.ts` — proxy/VPN-aware fetch.

### 6.3 Tailoring pipeline (`lib/tailoring/`)
The evidence-grounded, multi-stage generator behind `/api/analyze`. See [AI_WORKFLOW.md](AI_WORKFLOW.md) for full detail. Modules: `pipeline` (orchestrator), `jd-analyzer`, `role-archetype`, `role-skill-catalog`/`role-skill-expansion`/`market-skill-provider`, `skill-ontology`, `candidate-evidence`, `skill-evidence-resolver`, `tailoring-planner`, `experience-generator`, `composer`, `validators`, `repair`, `assemble`, `enrichment`, `schemas` (Zod). Also `lib/resume-import.ts` (Upload Existing Resume parsing).

### 6.4 Prompts + preferences
- `lib/prompts/*` — `tailoring-policy` (shared evidence + injection policy), `jd-analyzer-prompt`, `experience-writer-prompt`, `composer-prompt`, `resume-parse-prompt`, `job-page-extract`, `ats-match`.
- `lib/resume-bullets.ts` — tenure → bullet-count mapping.
- `lib/resume-prompt-settings.ts` — user generation preferences: **tone**, **spelling**, **language**, **seniority framing** (default "senior": never label junior/mid-level), and free-text **additional instructions**; `buildResumeExtraInstructions` composes them, and `enforceSeniorFraming` is the deterministic senior-framing backstop.

### 6.5 PDF generation + templates
- `lib/generate-resume-pdf.ts` — builds the Mustache view model (contact/headline/photo, categorized skills, experience, education, certifications, projects, languages with proficiency bar widths) and renders the chosen template.
- `lib/pdf-from-html.ts` — Puppeteer wrapper (serialized render lock, A4, 10mm margins).
- `lib/pdf-download.ts` (+ `pdf-download-paths.ts`, `save-pdf-to-disk.ts`) — `renderResumePdfBase64` (render-only for preview), `savePdfToDownloadsFolder`, `downloadPdfViaBrowser`, and the foldered save helpers.
- `lib/resume-templates.ts` — registry of 7 templates: **standard**, **folio**, **modern** (accent), **classic** (serif), **compact** (dense), **minimal** (whitespace), and **sidebar** (two-column colored sidebar with icons, optional photo, language bars; visual, less ATS-safe). All single-column ones render every section; `sidebar` is the "visual" option.

### 6.6 Job/analysis + misc helpers
- `lib/extract-job-page.ts`, `lib/analyze-json.ts`, `lib/job-posted-date.ts`, `lib/job-work-type.ts`, `lib/jobsites.ts`, `lib/check-ats-client.ts`, `lib/apply-alerts.ts` / `apply-alert-settings.ts`.
- `lib/dashboard-stats.ts` — all dashboard analytics. `lib/generator-workspace-storage.ts` — persists Generator sessions to `sessionStorage` (excludes the large preview PDF). `lib/mappers/*` — date conversion, profile ⟷ form-state, profile ⟷ resume-JSON (incl. `parsedResumeToFormState`).

### 6.7 Types
- `lib/types/resume.ts` — `UpdatedResume` (name, **headline**, **photo**, email, phone, location, linkedin, summary, **languages[]**, experience[], hardSkills/softSkills, education[], certifications[], projects[]).
- `lib/types/ats-match.ts` — `AtsMatchResult` + resilient parser.
- `lib/types/tailoring.ts` — all pipeline types (`CandidateProfile`, `SkillCandidate`, `TailoringPlan`, `EnrichmentRecommendation`, etc.).

---

## 7. Frontend pages

All routes except `/` require auth.

- **`/` Login** — sign-in form; redirects to `/dashboard` if signed in.
- **`/dashboard`** — bid/interview analytics computed client-side from `resume_history` + `interview_history` (date-range presets, today panel, interview-rate and bid-count groups).
- **`/generator`** — paste JD → **Analyse** (extract) → per-session **Generate resume** → **preview dialog** (PDF preview + template switch + regenerate with tone/emphasis + Download). Includes a **profile selector** (which persona to generate from), AI model/provider pickers, job-site selector, preflight duplicate/hybrid-onsite alerts, ATS match, and interview-answers. Shows enrichment recommendations (relevant JD skills you lack) under a generated resume. Sessions persist to `sessionStorage`.
- **`/history`** — searchable/filterable list of bids; bid-status dropdown; expand to view archived JD + resume; copy/download JD; re-download resume PDF; per-bid interview tracking.
- **`/profile`** — **multiple resume profiles**: an Active-profile switcher with New/Delete, a profile name (label), professional title, editable resume email, **photo upload**, phone/location/LinkedIn/summary, **Languages** (with proficiency), Education, Certifications, Projects, Companies, Skills, and the PDF template picker. **Upload Existing Resume** parses a PDF to fill the form. Save persists the selected profile.
- **`/profile/change-password`** — password change.
- **`/settings`** — OpenRouter toggle, auto-ATS toggle, duplicate-application + hybrid/onsite alerts.
- **`/settings/prompt`** — generation preferences: tone, spelling, language, **seniority framing** (Match evidence / Always senior — default senior), and additional instructions. Also **Custom prompt templates (advanced)**: edit the guidance of each AI system prompt per resume profile (`PromptTemplatesEditor`); the JSON/output contract stays fixed, and overrides persist to `resume_profiles.prompt_overrides`.
- **`/statistics`** — placeholder.

---

## 8. Frontend components (notable)

- Layout/auth: `AppNav`, `AuthenticatedChrome`, `RequireAuth`, `AuthProvider`, `Providers`, `ThemeProvider`/`ThemeToggle`.
- Generator: `AnalysisResultCard` (job card with Generate / **Preview & Download** / ATS / Answers + enrichment strip), **`ResumePreviewDialog`** (PDF preview iframe + template dropdown + regenerate tone/emphasis + Download), `JobDescriptionDialog`, `AtsMatchDialog`, `AnswerQuestionsDialog`, `ApplyAlertDialog`, `OpenRouterModelSelect`, `DirectProviderModelSelect`. (`ResumeForm`/`ResultDisplay` are legacy, not wired into the current flow.)
- Dashboard widgets under `components/dashboard/`.
- `Toast` — per-mounted-component toast system.

---

## 9. Key design decisions worth knowing

- **Multiple profiles per account.** `resume_profiles` holds each persona; content tables are keyed by `profile_id` (with `user_id` still backing RLS). Account settings stay on `profiles.default_settings`.
- **Contact/identity is never trusted from the AI.** Name, headline, email, phone, location, linkedin, company names, titles, dates, education, photo, and languages are assembled from the profile in code — never generated.
- **Evidence-grounded tailoring with deterministic validation + bounded repair.** Each AI stage's output is Zod-validated; a deterministic validator checks evidence references, ungrounded metrics, and skill support; only failing parts are re-generated (max 2 attempts) before a deterministic backstop. See [AI_WORKFLOW.md](AI_WORKFLOW.md).
- **JD-required skills are surfaced (user-chosen).** Skills the JD requires but you lack are added to the skills section and woven into the summary, experience bullets, and project tech — but never with fabricated metrics/quantified results.
- **Senior framing by default.** The summary never uses "junior/mid-level" unless the user switches to "Match evidence"; enforced by prompt + a deterministic backstop.
- **Resilient AI transport.** Retry-with-backoff on transient failures + optional cross-provider fallback model; status-aware error messages (402 credits, 429 rate-limit, 5xx).
- **Local file saves are server-local.** The save-* endpoints write to the backend host's Downloads folder (browser-download fallback otherwise).
- **`schema.sql` is the authoritative fresh-install schema** and is kept in sync with `supabase/migrations/*`; all statements are idempotent.
