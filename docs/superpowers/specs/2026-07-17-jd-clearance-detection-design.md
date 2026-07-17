# JD Security Clearance Detection

Date: 2026-07-17  
Status: Implemented

## Goal

Detect explicit security-clearance requirements during the JD Analyzer stage of
resume generation and warn the user so clearance-dependent roles are easy to
identify. Detection must not block generation or alter resume content.

## Scope

### In scope

- Extend the editable default guidance for **Job description analyzer**.
- Add dedicated clearance fields to its fixed JSON contract and validated
  analysis model.
- Carry clearance data through the tailoring pipeline and asynchronous analyze
  response.
- Show a visible badge/details on the generated analysis card.
- Show an in-app warning toast when clearance is detected.
- Add regression tests for true and false positives.

### Out of scope

- Resume upload parser changes.
- Job posting extractor changes.
- Blocking or requiring confirmation before generation.
- Persisting clearance fields in Supabase for Jobs/History filters.
- Adding clearance information to resume requirements or generated content.

## Detection model

The JD Analyzer returns four top-level fields:

```ts
type ClearanceStatus =
  | "active_required"
  | "obtain_required"
  | "eligibility_required"
  | "preferred"
  | null;

interface ClearanceAnalysis {
  clearanceRequired: boolean;
  clearanceType: string | null;
  clearanceStatus: ClearanceStatus;
  clearanceRequirementText: string | null;
}
```

Rules:

- `clearanceRequired` is `true` for active, obtain, or eligibility requirements.
- `clearanceRequired` is `false` when clearance is only preferred.
- `clearanceStatus` is `null` when no clearance language exists.
- `clearanceType` preserves the exact named level/type when stated.
- `clearanceRequirementText` preserves the exact JD phrase or sentence.
- Citizenship, export controls, background checks, drug screening, work
  authorization, and suitability checks alone do not count.
- Clearance data stays outside `requirements[].category`.

## Prompt and validation

Update `JD_ANALYZER_DEFAULT_GUIDANCE` with the approved clearance rules.

Extend the fixed output contract with:

```json
{
  "clearanceRequired": false,
  "clearanceType": null,
  "clearanceStatus": null,
  "clearanceRequirementText": null
}
```

The Zod schema supplies conservative defaults for model compatibility:

- `clearanceRequired`: `false`
- remaining fields: `null`

This allows older/cached-style model responses without the fields to validate
as no-clearance results.

## Data flow

1. `analyzeJobDescription` validates and maps clearance fields into `JDAnalysis`.
2. `runTailoringPipeline` includes a clearance object in its result.
3. The backend analyze job response includes that clearance object.
4. `JobsGeneratePanel` stores it on the corresponding generation session.
5. `AnalysisResultCard` renders the warning and exact requirement text.

The JD Analyzer runs inside **Generate resume**, so this warning appears when
generation completes. The existing **Analyse** button continues to use the Job
posting extractor and does not perform clearance detection.

## UI behavior

- Required (`active_required`, `obtain_required`, `eligibility_required`):
  red **Clearance required** badge and warning panel.
- Preferred: amber **Clearance preferred** badge and informational panel.
- No clearance: render nothing.
- Panel shows clearance type when available and the exact extracted phrase.
- A warning toast fires when a required or preferred clearance is returned.
- Generation, preview, save, and download remain available.

## Error handling

- Missing clearance fields default to no clearance.
- Invalid `clearanceStatus` fails JD Analyzer validation, consistent with other
  malformed structured output.
- A detected clearance never fails or interrupts resume generation.
- Existing generation error handling remains unchanged.

## Tests

- Prompt contract includes all four fields and allowed status values.
- Schema accepts valid required/preferred/no-clearance outputs.
- Schema defaults missing fields to no clearance.
- Analyzer maps fields into `JDAnalysis`.
- Pipeline/analyze response passes the clearance object through unchanged.
- UI helper differentiates required, preferred, and absent states.
- Regression fixtures verify these alone do not trigger:
  - U.S. citizenship
  - export-control eligibility
  - background check
  - drug screening
  - work authorization
  - suitability check

## Success criteria

- A JD requiring active Secret clearance produces a red warning with the exact
  source phrase.
- A JD requiring eligibility to obtain Public Trust is marked required with
  `eligibility_required`.
- A JD saying clearance is preferred produces an amber warning without setting
  `clearanceRequired` to true.
- A JD mentioning only citizenship or background checks produces no warning.
- Resume generation completes normally in all cases.
