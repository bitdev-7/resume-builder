import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { createFetchWithTimeout, getProxySetupHint } from "@/lib/proxy-fetch";
import type { DirectAIProvider } from "@/lib/direct-ai-shared";
import {
  resolveDefaultOpenRouterModel,
  getModelProvider,
  isDeepSeekModel,
  isDeepSeekReasoningModel,
  resolveJsonFriendlyModel,
} from "@/lib/openrouter";
import { resolveAICost, type AICostSource, type AIUsage } from "@/lib/ai-usage";

/** Resume generation uses large prompts; allow plenty of time (ms). Override via .env.local */
const AI_REQUEST_TIMEOUT_MS = Number(process.env.AI_REQUEST_TIMEOUT_MS || 180_000);
/** App-level retries only; SDK retries multiply undici connect timeouts on flaky networks. */
const AI_MAX_RETRIES = Number(process.env.AI_MAX_RETRIES || 1);
const aiFetch = createFetchWithTimeout(AI_REQUEST_TIMEOUT_MS);

const openRouterBaseUrl = (
  process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1"
).replace(/\/+$/, "");

const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY || "",
  baseURL: openRouterBaseUrl,
  timeout: AI_REQUEST_TIMEOUT_MS,
  maxRetries: 0,
  fetch: aiFetch,
  defaultHeaders: {
    ...(process.env.OPENROUTER_SITE_URL
      ? { "HTTP-Referer": process.env.OPENROUTER_SITE_URL }
      : {}),
    ...(process.env.OPENROUTER_APP_NAME
      ? { "X-Title": process.env.OPENROUTER_APP_NAME }
      : {}),
  },
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "",
  timeout: AI_REQUEST_TIMEOUT_MS,
  maxRetries: 0,
  fetch: aiFetch,
});

const deepseekBaseUrl = (
  process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1"
).replace(/\/+$/, "");

const deepseek = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY || "",
  baseURL: deepseekBaseUrl,
  timeout: AI_REQUEST_TIMEOUT_MS,
  maxRetries: 0,
  fetch: aiFetch,
});

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || "",
  timeout: AI_REQUEST_TIMEOUT_MS,
  maxRetries: 0,
  fetch: aiFetch,
});

export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface CallAIOptions {
  messages: AIMessage[];
  temperature?: number;
  max_tokens?: number;
  tryParseJson?: boolean;
  /** Defaults to true when model contains "/". */
  useOpenRouter?: boolean;
  model?: string;
  provider?: DirectAIProvider;
  /** Optional human-readable tag identifying which pipeline stage made the call (e.g. "jd-analyzer"). Included in timing logs. */
  stage?: string;
}

export interface AIResponse {
  providerUsed: string;
  modelUsed: string;
  text: string;
  json: unknown;
  raw: unknown;
  usage?: AIUsage;
  costUsd?: number;
  costSource?: AICostSource;
}

function enrichAiResponse<T extends Omit<AIResponse, "usage" | "costUsd" | "costSource">>(
  result: T
): AIResponse {
  const cost = resolveAICost(result.modelUsed, result.raw);
  return {
    ...result,
    ...(cost
      ? {
          usage: cost.usage,
          costUsd: cost.costUsd,
          costSource: cost.costSource,
        }
      : {}),
  };
}

function stripCodeFences(text: string) {
  let t = String(text || "").trim();
  if (t.startsWith("```json")) t = t.replace(/^```json\n?/, "");
  if (t.startsWith("```")) t = t.replace(/^```\n?/, "");
  if (t.endsWith("```")) t = t.replace(/```$/, "");
  return t.trim();
}

function extractFirstJson(text: string): any | null {
  const cleaned = stripCodeFences(text);
  try {
    return JSON.parse(cleaned);
  } catch {
    const objMatch = cleaned.match(/\{[\s\S]*\}/);
    const arrMatch = cleaned.match(/\[[\s\S]*\]/);
    const candidate = objMatch?.[0] || arrMatch?.[0];
    if (!candidate) return null;
    try {
      return JSON.parse(candidate);
    } catch {
      return null;
    }
  }
}

type AssistantMessage = {
  content?: string | null;
  reasoning_content?: string | null;
};

/** Prefer JSON from content or reasoning; DeepSeek reasoning models may plan in content. */
function pickAssistantText(
  message?: AssistantMessage,
  choiceText?: string | null
): string {
  const content = String(message?.content ?? choiceText ?? "").trim();
  const reasoning = String(message?.reasoning_content ?? "").trim();

  for (const candidate of [content, reasoning]) {
    if (!candidate) continue;
    const json = extractFirstJson(candidate);
    if (json !== null) {
      return typeof json === "string" ? json : JSON.stringify(json);
    }
  }

  if (content.startsWith("{") || content.startsWith("[")) return content;
  if (reasoning.startsWith("{") || reasoning.startsWith("[")) return reasoning;

  return content || reasoning;
}

function isTimeoutError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: string; message?: string; code?: string; cause?: { code?: string } };
  return (
    e.name === "APIConnectionTimeoutError" ||
    e.name === "TimeoutError" ||
    e.code === "ETIMEDOUT" ||
    e.cause?.code === "ETIMEDOUT" ||
    /timed out|timeout/i.test(String(e.message || ""))
  );
}

function isConnectionError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: string; message?: string; cause?: { message?: string } };
  const text = `${e.message || ""} ${e.cause?.message || ""}`;
  return (
    e.name === "APIConnectionError" ||
    /^connection error\.?$/i.test(String(e.message || "").trim()) ||
    /failed to fetch|fetch failed|error sending request|ECONNREFUSED|ENOTFOUND|getaddrinfo/i.test(
      text
    )
  );
}

function isNetworkError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as {
    name?: string;
    message?: string;
    code?: string;
    cause?: { code?: string; message?: string };
  };
  return (
    isTimeoutError(err) ||
    isConnectionError(err) ||
    e.code === "ECONNRESET" ||
    e.code === "ENOTFOUND" ||
    e.cause?.code === "ENOTFOUND" ||
    e.cause?.code === "UND_ERR_CONNECT_TIMEOUT"
  );
}

function isConnectTimeout(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as {
    name?: string;
    message?: string;
    cause?: { code?: string; message?: string };
  };
  return (
    e.cause?.code === "UND_ERR_CONNECT_TIMEOUT" ||
    /connect timeout|connection timed out|error sending request/i.test(
      String(e.message || "") + String(e.cause?.message || "")
    )
  );
}

/** HTTP status from an SDK/fetch error, if any. */
function getHttpStatus(err: unknown): number | undefined {
  if (!err || typeof err !== "object") return undefined;
  const e = err as { status?: number; statusCode?: number; response?: { status?: number } };
  if (typeof e.status === "number") return e.status;
  if (typeof e.statusCode === "number") return e.statusCode;
  if (typeof e.response?.status === "number") return e.response.status;
  return undefined;
}

/** Transient statuses worth retrying: rate limit, request timeout, and 5xx. */
function isRetryableStatus(status: number | undefined): boolean {
  return status === 408 || status === 409 || status === 429 || (status !== undefined && status >= 500 && status <= 599);
}

/** Honor a Retry-After header (seconds or HTTP-date) when the provider sends one. */
function getRetryAfterMs(err: unknown): number | undefined {
  if (!err || typeof err !== "object") return undefined;
  const headers = (err as { headers?: unknown }).headers;
  let raw: string | null | undefined;
  if (headers && typeof (headers as { get?: unknown }).get === "function") {
    raw = (headers as { get: (k: string) => string | null }).get("retry-after");
  } else if (headers && typeof headers === "object") {
    const h = headers as Record<string, string | undefined>;
    raw = h["retry-after"] ?? h["Retry-After"];
  }
  if (raw == null) return undefined;
  const secs = Number(raw);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const when = Date.parse(String(raw));
  if (!Number.isNaN(when)) return Math.max(0, when - Date.now());
  return undefined;
}

function isRetryableError(err: unknown): boolean {
  return isTimeoutError(err) || isConnectionError(err) || isRetryableStatus(getHttpStatus(err));
}

function providerLabel(useOpenRouter: boolean, provider?: string, modelId?: string): string {
  if (useOpenRouter) {
    return modelId ? `OpenRouter (${modelId})` : "OpenRouter";
  }
  const name =
    provider === "openai"
      ? "OpenAI"
      : provider === "anthropic"
        ? "Anthropic"
        : provider === "deepseek"
          ? "DeepSeek"
          : provider || "AI";
  return modelId ? `${name} (${modelId})` : name;
}

/** User-facing message for AI provider failures. */
export function formatAIProviderError(
  err: unknown,
  modelId?: string,
  elapsedMs?: number,
  options?: { useOpenRouter?: boolean; provider?: DirectAIProvider }
): string {
  const useOpenRouter = options?.useOpenRouter ?? Boolean(modelId?.includes("/"));
  const label = providerLabel(useOpenRouter, options?.provider, modelId);

  const status = getHttpStatus(err);
  if (status === 402) {
    return (
      `${label} rejected the request (402 — out of API credits). ` +
      "Top up your provider account (e.g. openrouter.ai/settings/credits) or switch to a funded provider/key, then try again."
    );
  }
  if (status === 429) {
    return `${label} is rate-limited (429). Wait a moment and try again; retries were attempted automatically.`;
  }
  if (status !== undefined && status >= 500 && status <= 599) {
    return `${label} had a server error (${status}). This is usually temporary — try again shortly.`;
  }

  if (isConnectionError(err) && !isTimeoutError(err)) {
    const keyHint = useOpenRouter
      ? "verify OPENROUTER_API_KEY in .env.local"
      : `verify ${options?.provider?.toUpperCase()}_API_KEY in backend .env.local`;
    return (
      `Could not connect to ${label} (connection error).` +
      ` Check VPN/proxy/firewall, ${keyHint},` +
      " and ensure your proxy/VPN is running." +
      getProxySetupHint()
    );
  }

  if (isTimeoutError(err)) {
    const configuredSec = Math.round(AI_REQUEST_TIMEOUT_MS / 1000);
    const elapsedSec =
      typeof elapsedMs === "number" ? Math.max(1, Math.round(elapsedMs / 1000)) : undefined;

    if (isConnectTimeout(err) || (elapsedSec !== undefined && elapsedSec < configuredSec * 0.5)) {
      return (
        `Could not connect to ${label} (${elapsedSec ?? "unknown"}s elapsed; limit is ${configuredSec}s). ` +
        "This is usually a network/VPN/firewall issue, not slow model generation." +
        getProxySetupHint()
      );
    }

    return (
      `${label} request timed out after ${elapsedSec ?? configuredSec}s (limit ${configuredSec}s). ` +
      "Try again, use a shorter job description, or pick a faster model."
    );
  }

  if (
    err instanceof Error &&
    (/403/.test(err.message) || /forbidden|request not allowed/i.test(err.message))
  ) {
    return `${label} rejected the request (403 forbidden). Check your API key and model access.`;
  }

  if (isNetworkError(err)) {
    return (
      `Could not reach ${label} (network error). Check your connection, VPN/firewall, and API keys.` +
      getProxySetupHint()
    );
  }

  return err instanceof Error ? err.message : "AI request failed";
}

const MAX_BACKOFF_MS = Number(process.env.AI_MAX_BACKOFF_MS || 20_000);

/** Human-readable summary of one completed LLM call, for timing/observability logs. */
function formatAiCallSummary(stageLabel: string, elapsedMs: number, result: AIResponse): string {
  const usage = result.usage;
  const tokenInfo = usage
    ? `, tokens=${usage.totalTokens ?? "?"} (prompt=${usage.promptTokens ?? "?"}, completion=${usage.completionTokens ?? "?"})`
    : "";
  const costInfo = result.costUsd != null ? `, cost=$${result.costUsd.toFixed(5)}` : "";
  return `[ai] ${stageLabel} call completed in ${elapsedMs}ms (provider=${result.providerUsed}, model=${result.modelUsed}${tokenInfo}${costInfo})`;
}

/**
 * Runs an AI call with bounded retries on transient failures: timeouts,
 * connection errors, and retryable HTTP statuses (429 rate-limit, 408/409, 5xx).
 * Honors a Retry-After header when present, else exponential backoff + jitter.
 * Non-transient errors (400/401/402/403/404 etc.) fail immediately.
 */
async function withTimeoutRetry<T>(
  label: string,
  fn: () => Promise<T>,
  extraAttempts = AI_MAX_RETRIES
): Promise<T> {
  let lastError: unknown;
  const attempts = 1 + Math.max(0, extraAttempts);

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const started = Date.now();
    try {
      const result = await fn();
      const elapsedMs = Date.now() - started;
      console.log(`[ai] ${label} attempt ${attempt}/${attempts} took ${elapsedMs}ms`);
      return result;
    } catch (err) {
      lastError = err;
      const elapsedMs = Date.now() - started;

      if (!isRetryableError(err) || attempt >= attempts) {
        if (isTimeoutError(err)) {
          throw Object.assign(err instanceof Error ? err : new Error(String(err)), {
            elapsedMs,
          });
        }
        throw err;
      }

      const status = getHttpStatus(err);
      const backoff =
        getRetryAfterMs(err) ??
        Math.min(MAX_BACKOFF_MS, 1000 * 2 ** (attempt - 1) + Math.floor(Math.random() * 500));
      const reason = isTimeoutError(err)
        ? `timed out (${Math.round(elapsedMs / 1000)}s)`
        : status
          ? `HTTP ${status}`
          : "connection error";
      console.warn(
        `${label} ${reason} (attempt ${attempt}/${attempts}); retrying in ${Math.round(backoff / 1000)}s…`
      );
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
  }

  throw lastError;
}

export function getAIRequestTimeoutMs() {
  return AI_REQUEST_TIMEOUT_MS;
}

function resolveOpenRouterMode(opts: CallAIOptions): boolean {
  if (typeof opts.useOpenRouter === "boolean") return opts.useOpenRouter;
  const model = opts.model || "";
  return model.includes("/");
}

async function callDirectAI(
  provider: DirectAIProvider,
  model: string,
  opts: Omit<CallAIOptions, "useOpenRouter" | "provider" | "model">
) {
  const {
    messages,
    temperature = 0.7,
    max_tokens = 1024,
    tryParseJson = false,
  } = opts;

  if (provider === "openai") {
    const resp = await openai.chat.completions.create({
      model: model || process.env.OPENAI_MODEL || "gpt-4o",
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      temperature,
      max_tokens,
      ...(tryParseJson ? { response_format: { type: "json_object" } } : {}),
    } as any);

    const text = resp.choices?.[0]?.message?.content || "";
    const json = tryParseJson ? extractFirstJson(String(text)) : null;
    return enrichAiResponse({
      providerUsed: "openai" as const,
      modelUsed: model || process.env.OPENAI_MODEL || "gpt-4o",
      text: String(text).trim(),
      json,
      raw: resp,
    });
  }

  if (provider === "deepseek") {
    try {
      const requestedModel = model || process.env.DEEPSEEK_MODEL || "deepseek-chat";
      const dsModel = tryParseJson
        ? resolveJsonFriendlyModel(requestedModel, "deepseek")
        : requestedModel;
      if (tryParseJson && dsModel !== requestedModel) {
        console.log(
          `[ai] DeepSeek reasoning model "${requestedModel}" → "${dsModel}" for JSON output`
        );
      }
      const raw = await deepseek.chat.completions.create({
        model: dsModel,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        temperature,
        max_tokens,
        ...(tryParseJson ? { response_format: { type: "json_object" } } : {}),
        extra_body: { thinking: { type: "disabled" } },
      } as any);
      const rawAny: any = raw;
      const message = rawAny?.choices?.[0]?.message;
      const text = pickAssistantText(message, rawAny?.choices?.[0]?.text);
      if (!text) {
        throw new Error(
          "DeepSeek response was empty. For resume generation use deepseek-chat (DEEPSEEK_JSON_MODEL) instead of deepseek-v4-pro."
        );
      }
      const json = tryParseJson ? extractFirstJson(text) : null;
      return enrichAiResponse({
        providerUsed: "deepseek" as const,
        modelUsed: dsModel,
        text,
        json,
        raw,
      });
    } catch (err: any) {
      const causeCode = err?.cause?.code;
      const hostname = err?.cause?.hostname;
      if (causeCode === "ENOTFOUND") {
        throw new Error(
          `DeepSeek DNS lookup failed for host "${hostname || "unknown"}". ` +
            `Set DEEPSEEK_BASE_URL in .env.local (recommended: https://api.deepseek.com/v1), ` +
            `then restart the dev server.`
        );
      }
      throw err;
    }
  }

  if (provider === "anthropic") {
    const anthModel = model || process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";
    const message = await anthropic.messages.create({
      model: anthModel,
      max_tokens,
      system: [
        {
          type: "text",
          text: messages.find((m) => m.role === "system")?.content || "",
          cache_control: { type: "ephemeral", ttl: "1h" },
        },
      ],
      messages: messages
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role, content: m.content })),
    } as any);

    const content = message.content?.[0];
    if (!content || content.type !== "text") {
      throw new Error("Unexpected response type from Anthropic");
    }
    const text = content.text || "";
    const json = tryParseJson ? extractFirstJson(String(text)) : null;
    return enrichAiResponse({
      providerUsed: "anthropic" as const,
      modelUsed: anthModel,
      text: String(text).trim(),
      json,
      raw: message,
    });
  }

  throw new Error(`Unsupported provider: ${provider}`);
}

export async function callAI(opts: CallAIOptions): Promise<AIResponse> {
  const stageLabel = opts.stage ? opts.stage : "ai-call";
  const callStarted = Date.now();
  try {
    const result = await callAICore(opts);
    const elapsedMs = Date.now() - callStarted;
    console.log(formatAiCallSummary(stageLabel, elapsedMs, result));
    return result;
  } catch (err) {
    const elapsedMs = Date.now() - callStarted;
    console.error(`[ai] ${stageLabel} call FAILED after ${elapsedMs}ms`);
    throw err;
  }
}

async function callAICore(opts: CallAIOptions): Promise<AIResponse> {
  const {
    messages,
    temperature = 0.7,
    max_tokens = 1024,
    tryParseJson = false,
    model,
    provider,
  } = opts;

  const stageLabel = opts.stage ? opts.stage : "ai-call";
  const useOpenRouter = resolveOpenRouterMode(opts);

  if (!useOpenRouter) {
    if (!provider) {
      throw new Error("AI provider is required when not using OpenRouter");
    }
    const directModel = model || "";
    return withTimeoutRetry(`${stageLabel}: ${provider} ${directModel}`, () =>
      callDirectAI(provider, directModel, {
        messages,
        temperature,
        max_tokens,
        tryParseJson,
      })
    );
  }

  const modelId = model || resolveDefaultOpenRouterModel();
  const effectiveModel = tryParseJson ? resolveJsonFriendlyModel(modelId) : modelId;
  if (tryParseJson && effectiveModel !== modelId) {
    console.log(
      `[ai] DeepSeek reasoning model "${modelId}" → "${effectiveModel}" for JSON output`
    );
  }

  const runOpenRouterModel = (runModel: string) => {
    const providerUsed = getModelProvider(runModel);
    return withTimeoutRetry(`${stageLabel}: OpenRouter ${runModel}`, async () => {
      const requestBody: Record<string, unknown> = {
        model: runModel,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        temperature,
        max_tokens,
      };

      if (isDeepSeekModel(runModel)) {
        requestBody.extra_body = { thinking: { type: "disabled" } };
      }
      if (tryParseJson && (isDeepSeekModel(runModel) || providerUsed === "openai")) {
        requestBody.response_format = { type: "json_object" };
      }

      const resp = await openrouter.chat.completions.create(requestBody as any);
      const choice = resp.choices?.[0] as
        | { message?: AssistantMessage; finish_reason?: string; text?: string }
        | undefined;
      const message = choice?.message;
      const text = pickAssistantText(message, choice?.text);

      if (!text) {
        const finishReason = choice?.finish_reason;
        if (message?.reasoning_content && finishReason === "length") {
          throw new Error(
            "Model ran out of output tokens during reasoning before producing a response. Retry with a faster model or increase max_tokens."
          );
        }
        throw new Error("OpenRouter response was empty");
      }

      const json = tryParseJson ? extractFirstJson(text) : null;
      return enrichAiResponse({ providerUsed, modelUsed: runModel, text, json, raw: resp });
    });
  };

  try {
    return await runOpenRouterModel(effectiveModel);
  } catch (err) {
    const fallback = (process.env.AI_FALLBACK_MODEL || "").trim();
    const status = getHttpStatus(err);
    // Skip fallback for account/request-level failures a different model on the
    // SAME OpenRouter account cannot fix (bad key, out of credits, forbidden, bad request).
    const accountLevel = status === 400 || status === 401 || status === 402 || status === 403;
    const fallbackModel = fallback && fallback.includes("/") ? fallback : "";
    if (!fallbackModel || fallbackModel === effectiveModel || accountLevel) {
      throw err;
    }
    const fbEffective = tryParseJson ? resolveJsonFriendlyModel(fallbackModel) : fallbackModel;
    console.warn(
      `[ai] Primary model "${effectiveModel}" failed (${status ?? "error"}); falling back to "${fbEffective}"`
    );
    return await runOpenRouterModel(fbEffective);
  }
}

export { extractFirstJson };
