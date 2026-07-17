# JD Clearance Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect security-clearance requirements in the JD Analyzer and warn the user with a badge + toast without blocking generation.

**Architecture:** Extend JD Analyzer guidance/contract/schema/`JDAnalysis`, pass a clearance object through the tailoring pipeline and analyze job response, then render it on `AnalysisResultCard` with a warning toast from `JobsGeneratePanel`.

**Tech Stack:** TypeScript, Zod, Vitest, Next.js React components

## Global Constraints

- Warning only (badge + toast); never block generation
- Clearance fields live on JD analysis, not in `requirements[].category`
- Missing fields default to no clearance (`false` / `null`)
- Invalid `clearanceStatus` fails validation
- No Supabase persistence in this change
- Spec: `docs/superpowers/specs/2026-07-17-jd-clearance-detection-design.md`

## File map

| File | Responsibility |
|------|----------------|
| `lib/prompts/jd-analyzer-prompt.ts` | Default guidance + fixed JSON contract |
| `lib/types/tailoring.ts` | `ClearanceStatus`, clearance fields on `JDAnalysis` |
| `lib/tailoring/schemas.ts` | Zod validation defaults |
| `lib/tailoring/jd-analyzer.ts` | Map validated fields into `JDAnalysis` |
| `lib/tailoring/pipeline.ts` | Include clearance in pipeline result |
| `backend/src/api/analyze/job-store.ts` | Include clearance on analyze result |
| `backend/src/api/analyze/route.ts` | Pass clearance through completed job |
| `lib/clearance-warning.ts` | Pure UI helper for required/preferred/none |
| `frontend/components/AnalysisResultCard.tsx` | Badge + panel |
| `frontend/components/JobsGeneratePanel.tsx` | Store clearance + toast |
| Tests | schema, prompt, clearance helper, analyzer mapping |

---

### Task 1: Prompt, types, schema, analyzer mapping

**Files:** prompt, types, schemas, jd-analyzer, tests

- [x] Update `JD_ANALYZER_DEFAULT_GUIDANCE` with clearance rules from the approved user prompt
- [x] Extend fixed contract with the four clearance fields
- [x] Add types + Zod enums/defaults
- [x] Map into `JDAnalysis` in `analyzeJobDescription`
- [x] Tests: schema defaults, valid statuses, prompt contains fields

### Task 2: Pipeline + analyze API pass-through

**Files:** pipeline, job-store, analyze route

- [x] Add `clearance` to `RunTailoringPipelineResult` from `jdAnalysis`
- [x] Add `clearance` to `AnalyzeJobResult` and completed job payloads
- [x] Keep error fallback path returning no-clearance defaults

### Task 3: UI badge + toast

**Files:** `lib/clearance-warning.ts`, AnalysisResultCard, JobsGeneratePanel

- [x] Helper returns `none | preferred | required` + label
- [x] Card shows red/amber badge + requirement text
- [x] Panel stores clearance from analyze response
- [x] Toast on required/preferred after generate completes
- [x] Helper unit tests

### Task 4: Verify

- [x] `npm test` for schema/clearance/helper/jd tests
- [ ] Commit
