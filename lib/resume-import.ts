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

/** Truncate very long resume text to keep token usage bounded. */
const MAX_RESUME_TEXT_CHARS = 24_000;

/**
 * A full resume's structured JSON (every bullet as a separate string, plus
 * skills/projects/certs) can be large. 4096 output tokens truncates it and the
 * JSON becomes unparseable, so allow plenty of headroom. Override via env.
 */
const RESUME_PARSE_MAX_TOKENS = Number(process.env.RESUME_PARSE_MAX_TOKENS || 8192);

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
    const diagnostics = diagnoseJsonParseFailure(raw, parseError);
    console.error("[parse-resume] Could not parse model JSON.", {
      model,
      resumeTextChars: text.length,
      rawChars: raw.length,
      diagnostics,
      rawSnippet: raw.slice(0, 400),
    });
    const looksTruncated = /truncat|incomplete|unterminated|unexpected end/i.test(
      `${diagnostics.likelyCauses?.join(" ") ?? ""} ${
        parseError instanceof Error ? parseError.message : ""
      }`
    );
    throw new Error(
      looksTruncated
        ? "The resume is long and the extraction was cut off before finishing. Try again, or shorten the resume PDF (fewer pages) and re-upload."
        : "Could not read structured data from this resume. Try a different file or fill the profile manually."
    );
  }

  const parsed = parsedResumeSchema.parse(parsedRaw);
  return { parsed, costUsd: resp.costUsd };
}
