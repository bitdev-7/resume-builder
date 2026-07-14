import { z } from "zod";
import { callAI, formatAIProviderError } from "@/lib/ai-provider";
import type { AIMessage } from "@/lib/ai-provider";
import { resolveExtractModel, resolveExtractProvider } from "@/lib/ai-api";
import { cleanJsonText, diagnoseJsonParseFailure } from "@/lib/analyze-json";
import {
  buildResumeParseSystemPrompt,
  buildResumeParseUserPrompt,
} from "@/lib/prompts/resume-parse-prompt";
import type { PromptOverrides } from "@/lib/prompts/prompt-overrides";

/** Shape returned by resume-PDF parsing; maps 1:1 to the profile form (minus client ids). */
const workTypeSchema = z.enum(["Remote", "Hybrid", "Onsite", ""]).catch("");

export const parsedResumeSchema = z.object({
  fullName: z.string().catch(""),
  email: z.string().catch(""),
  headline: z.string().catch(""),
  phone: z.string().catch(""),
  location: z.string().catch(""),
  linkedin: z.string().catch(""),
  summary: z.string().catch(""),
  educations: z
    .array(
      z.object({
        degree: z.string().catch(""),
        school: z.string().catch(""),
        startDate: z.string().catch(""),
        endDate: z.string().catch(""),
        graduationDate: z.string().catch(""),
        gpa: z.string().catch(""),
      })
    )
    .catch([]),
  certifications: z.array(z.string()).catch([]),
  projects: z
    .array(
      z.object({
        name: z.string().catch(""),
        description: z.string().catch(""),
        technologies: z.array(z.string()).catch([]),
      })
    )
    .catch([]),
  companies: z
    .array(
      z.object({
        title: z.string().catch(""),
        company: z.string().catch(""),
        startDate: z.string().catch(""),
        endDate: z.string().catch(""),
        location: z.string().catch(""),
        workType: workTypeSchema,
        description: z.string().catch(""),
        achievements: z.array(z.string()).catch([]),
      })
    )
    .catch([]),
  skills: z
    .array(
      z.object({
        skillName: z.string().catch(""),
        category: z.string().catch(""),
      })
    )
    .catch([]),
});

export type ParsedResume = z.infer<typeof parsedResumeSchema>;

export interface ParseResumeResult {
  parsed: ParsedResume;
  costUsd?: number;
}

function normalizeForCompare(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").replace(/[.;,\s]+$/, "").trim();
}

/**
 * Post-parse cleanup: a company "description" should be a real role overview, not a
 * bullet. Models often copy the first achievement into description — if the description
 * just duplicates one of the bullets, blank it so it only holds a genuine overview.
 */
export function cleanParsedResume(parsed: ParsedResume): ParsedResume {
  return {
    ...parsed,
    companies: parsed.companies.map((c) => {
      const desc = normalizeForCompare(c.description || "");
      if (!desc) return c;
      const duplicatesBullet = c.achievements.some((a) => normalizeForCompare(a) === desc);
      return duplicatesBullet ? { ...c, description: "" } : c;
    }),
  };
}

/** Truncate very long resume text to keep token usage bounded. Env-overridable. */
const MAX_RESUME_TEXT_CHARS = Number(process.env.RESUME_PARSE_MAX_INPUT_CHARS || 40_000);

/**
 * A full resume's structured JSON (every bullet as a separate string, plus
 * skills/projects/certs) can be large, and too small a cap truncates it so the
 * JSON becomes unparseable. Allow plenty of headroom. Override via env.
 */
const RESUME_PARSE_MAX_TOKENS = Number(process.env.RESUME_PARSE_MAX_TOKENS || 16_384);

/**
 * Recover a usable object from truncated/cut-off model JSON. Scans the text
 * tracking string state and the bracket stack, recording "checkpoints" after
 * each completed value, then tries to close the structure at the furthest
 * checkpoint that yields valid JSON. Because parsedResumeSchema is fully
 * lenient (every field has a default), a partially-recovered object still
 * fills the profile — far better than failing outright on a long resume.
 */
export function salvageTruncatedJson(input: string): unknown | null {
  const start = input.indexOf("{");
  if (start < 0) return null;
  const s = input.slice(start);

  let inStr = false;
  let esc = false;
  const stack: ("}" | "]")[] = [];
  const checkpoints: { end: number; closers: string }[] = [];
  const record = (end: number) => {
    checkpoints.push({ end, closers: [...stack].reverse().join("") });
  };

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') {
        inStr = false;
        record(i + 1); // end of a string (key or value)
      }
      continue;
    }
    if (ch === '"') {
      inStr = true;
    } else if (ch === "{") {
      stack.push("}");
    } else if (ch === "[") {
      stack.push("]");
    } else if (ch === "}" || ch === "]") {
      stack.pop();
      record(i + 1);
    } else {
      const next = s[i + 1];
      // end of a bare literal (number / true / false / null)
      if (/[0-9a-z.]/i.test(ch) && (next === undefined || /[\s,}\]]/.test(next))) record(i + 1);
    }
  }

  for (let k = checkpoints.length - 1; k >= 0; k--) {
    const { end, closers } = checkpoints[k];
    const candidate = s.slice(0, end).replace(/,\s*$/, "") + closers;
    try {
      return JSON.parse(candidate);
    } catch {
      // try an earlier checkpoint
    }
  }
  return null;
}

/**
 * Turns raw resume text into structured profile data via one AI call.
 * Extraction only: the prompt forbids inventing or rewriting content.
 */
export async function parseResumeText(
  resumeText: string,
  options: { useOpenRouter?: boolean; promptOverrides?: PromptOverrides } = {}
): Promise<ParseResumeResult> {
  const useOpenRouter = options.useOpenRouter ?? true;
  const text = resumeText.slice(0, MAX_RESUME_TEXT_CHARS);

  const messages: AIMessage[] = [
    { role: "system", content: buildResumeParseSystemPrompt(options.promptOverrides) },
    { role: "user", content: buildResumeParseUserPrompt(text) },
  ];

  const model = resolveExtractModel(useOpenRouter);
  const provider = resolveExtractProvider(useOpenRouter);

  let resp;
  try {
    resp = await callAI({
      useOpenRouter,
      model,
      ...(provider ? { provider } : {}),
      messages,
      temperature: 0.1,
      max_tokens: RESUME_PARSE_MAX_TOKENS,
      tryParseJson: true,
    });
  } catch (err) {
    throw new Error(formatAIProviderError(err, model, undefined, { useOpenRouter, provider }));
  }

  const raw = resp.json
    ? typeof resp.json === "string"
      ? resp.json
      : JSON.stringify(resp.json)
    : resp.text || "";

  let parsedRaw: unknown;
  try {
    parsedRaw = JSON.parse(cleanJsonText(raw));
  } catch (parseError) {
    // The output was likely cut off (long resume). Recover as much as parsed
    // rather than failing — the user gets a mostly-filled form to finish.
    const salvaged = salvageTruncatedJson(cleanJsonText(raw));
    if (salvaged && typeof salvaged === "object") {
      console.warn("[parse-resume] Model JSON was truncated; recovered partial data.", {
        model,
        resumeTextChars: text.length,
        rawChars: raw.length,
      });
      const partial = parsedResumeSchema.safeParse(salvaged);
      if (partial.success) {
        return { parsed: cleanParsedResume(partial.data), costUsd: resp.costUsd };
      }
    }

    const diagnostics = diagnoseJsonParseFailure(raw, parseError);
    console.error("[parse-resume] Could not parse model JSON.", {
      model,
      resumeTextChars: text.length,
      rawChars: raw.length,
      diagnostics,
      rawSnippet: raw.slice(0, 400),
    });
    throw new Error(
      "Could not read structured data from this resume. Try uploading again, or fill the profile manually."
    );
  }

  const parsed = parsedResumeSchema.safeParse(parsedRaw);
  if (!parsed.success) {
    // Shape drifted — recover what we can instead of erroring on a long resume.
    const salvaged = parsedResumeSchema.safeParse(salvageTruncatedJson(raw) ?? {});
    return {
      parsed: cleanParsedResume(salvaged.success ? salvaged.data : parsedResumeSchema.parse({})),
      costUsd: resp.costUsd,
    };
  }
  return { parsed: cleanParsedResume(parsed.data), costUsd: resp.costUsd };
}
