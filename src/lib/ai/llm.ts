// Provider adapter for structured LLM calls. Implemented providers: Anthropic
// (hosted), Ollama (local, open-weight models) and any OpenAI-compatible
// chat-completions API (Groq, OpenRouter, Together, ... — hosted open-weight
// models). Callers only see `structured()` / `llmStatus()`, so another provider
// can be added behind the same interface.
//
// Provider selection: LLM_PROVIDER=anthropic|ollama|openai, or unset to use Anthropic
// when ANTHROPIC_API_KEY is set. With no provider configured, `structured()`
// returns null and callers use the deterministic rules engine instead. Every
// output records which source made it.

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

export interface LlmResult<T> {
  data: T;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
}

type Provider = "anthropic" | "ollama" | "openai" | "rules";

function provider(): Provider {
  const p = process.env.LLM_PROVIDER?.toLowerCase();
  if (p === "ollama") return "ollama";
  if (p === "openai") return process.env.OPENAI_BASE_URL && process.env.OPENAI_MODEL ? "openai" : "rules";
  if (p === "anthropic" || !p) return process.env.ANTHROPIC_API_KEY ? "anthropic" : "rules";
  return "rules";
}

const anthropicModel = () => process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
const ollamaModel = () => process.env.OLLAMA_MODEL || "qwen3:8b";
const ollamaUrl = () => (process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/+$/, "");
const openaiModel = () => process.env.OPENAI_MODEL || "";
const openaiUrl = () => (process.env.OPENAI_BASE_URL || "").replace(/\/+$/, "");
const timeoutMs = () => Number(process.env.BC_LLM_TIMEOUT_MS ?? 60_000);
// Local models cost nothing per token; pricing only applies to hosted providers.
const priceIn = () => (provider() === "ollama" ? 0 : Number(process.env.BC_PRICE_IN_PER_MTOK ?? 2));
const priceOut = () => (provider() === "ollama" ? 0 : Number(process.env.BC_PRICE_OUT_PER_MTOK ?? 10));

const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

export function llmStatus() {
  const p = provider();
  const enabled = p !== "rules";
  return {
    enabled,
    provider: p === "openai" ? `openai-compatible (${hostOf(openaiUrl())})` : p,
    model: p === "anthropic" ? anthropicModel() : p === "ollama" ? ollamaModel() : p === "openai" ? openaiModel() : "deterministic rules engine",
    pricing: { inPerMTok: priceIn(), outPerMTok: priceOut() },
  };
}

let client: Anthropic | null = null;
const getClient = () => (client ??= new Anthropic({ maxRetries: 2, timeout: timeoutMs() }));

export class LlmError extends Error {}
// Errors that will not succeed on retry (bad request, unknown model, auth).
class FatalLlmError extends LlmError {}

interface StructuredOpts<S extends z.ZodType> {
  system: string;
  prompt: string;
  schema: S;
  maxTokens?: number;
  attempts?: number;
}

async function callAnthropic<S extends z.ZodType>(opts: StructuredOpts<S>): Promise<LlmResult<z.infer<S>>> {
  try {
    const res = await getClient().beta.messages.parse({
      model: anthropicModel(),
      max_tokens: opts.maxTokens ?? 16000,
      system: opts.system,
      messages: [{ role: "user", content: opts.prompt }],
      output_config: { format: betaZodOutputFormat(opts.schema), effort: (process.env.BC_LLM_EFFORT as "low" | "medium" | "high") || "medium" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
    if (res.stop_reason === "refusal") throw new LlmError("Model declined the request");
    if (res.stop_reason === "max_tokens") throw new LlmError("Output truncated (max_tokens)");
    if (!res.parsed_output) throw new LlmError("Output did not match the schema");
    const tokensIn = res.usage.input_tokens;
    const tokensOut = res.usage.output_tokens;
    return { data: res.parsed_output as z.infer<S>, model: res.model, tokensIn, tokensOut, costUsd: (tokensIn * priceIn() + tokensOut * priceOut()) / 1_000_000 };
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.BadRequestError) throw new FatalLlmError(e.message);
    throw e;
  }
}

// Parse model text as JSON and validate it. Tolerates a leading <think> block
// and ```json fences, which some open-weight models emit even in JSON mode.
function parseOutput<S extends z.ZodType>(content: string | null | undefined, schema: S): z.infer<S> {
  const text = (content ?? "").replace(/^\s*<think>[\s\S]*?<\/think>/, "").trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new LlmError("Output was not valid JSON");
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new LlmError("Output did not match the schema");
  return parsed.data as z.infer<S>;
}

// Ollama native chat API with JSON-schema constrained output (`format`).
async function callOllama<S extends z.ZodType>(opts: StructuredOpts<S>): Promise<LlmResult<z.infer<S>>> {
  const body: Record<string, unknown> = {
    model: ollamaModel(),
    stream: false,
    format: z.toJSONSchema(opts.schema),
    messages: [
      { role: "system", content: `${opts.system}\nRespond only with JSON matching the requested schema.` },
      { role: "user", content: opts.prompt },
    ],
    options: { temperature: 0.2, num_ctx: Number(process.env.OLLAMA_NUM_CTX ?? 8192), num_predict: opts.maxTokens ?? 8192 },
    keep_alive: process.env.OLLAMA_KEEP_ALIVE || "30m",
  };
  // Reasoning models (qwen3, deepseek-r1, gpt-oss) think before answering. OLLAMA_THINK=false turns it off
  // for speed; unset leaves the model default (only send it to models that support thinking).
  if (process.env.OLLAMA_THINK) body.think = process.env.OLLAMA_THINK === "true";
  let res: Response;
  try {
    res = await fetch(`${ollamaUrl()}/api/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs()) });
  } catch (e) {
    const err = e as Error;
    if (err.name === "TimeoutError") throw new LlmError(`Ollama timed out after ${timeoutMs()}ms`);
    throw new FatalLlmError(`Ollama not reachable at ${ollamaUrl()} (${err.message})`);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const msg = `Ollama ${res.status}: ${text.slice(0, 200)}`;
    throw res.status >= 500 ? new LlmError(msg) : new FatalLlmError(msg);
  }
  const out = (await res.json()) as { model: string; message?: { content?: string }; done_reason?: string; prompt_eval_count?: number; eval_count?: number };
  if (out.done_reason === "length") throw new LlmError("Output truncated (num_predict)");
  return { data: parseOutput(out.message?.content, opts.schema), model: out.model, tokensIn: out.prompt_eval_count ?? 0, tokensOut: out.eval_count ?? 0, costUsd: 0 };
}

// OpenAI-compatible chat completions (Groq, OpenRouter, Together, vLLM, ...).
// Asks for JSON-schema output; providers or models that reject `json_schema`
// are retried once in plain JSON mode (the schema is always in the prompt).
async function callOpenAI<S extends z.ZodType>(opts: StructuredOpts<S>): Promise<LlmResult<z.infer<S>>> {
  const schema = z.toJSONSchema(opts.schema);
  const objectMode = process.env.OPENAI_JSON_MODE === "object";
  const send = async (mode: "schema" | "object") => {
    const body = {
      model: openaiModel(),
      temperature: 0.2,
      max_tokens: opts.maxTokens ?? 8192,
      messages: [
        { role: "system", content: `${opts.system}
Respond only with a JSON object matching this JSON schema:
${JSON.stringify(schema)}` },
        { role: "user", content: opts.prompt },
      ],
      response_format: mode === "schema" ? { type: "json_schema", json_schema: { name: "output", schema } } : { type: "json_object" },
    };
    try {
      return await fetch(`${openaiUrl()}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(process.env.OPENAI_API_KEY ? { authorization: `Bearer ${process.env.OPENAI_API_KEY}` } : {}) },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs()),
      });
    } catch (e) {
      const err = e as Error;
      if (err.name === "TimeoutError") throw new LlmError(`LLM API timed out after ${timeoutMs()}ms`);
      throw new LlmError(`LLM API not reachable at ${hostOf(openaiUrl())} (${err.message})`);
    }
  };
  let res = await send(objectMode ? "object" : "schema");
  if (res.status === 400 && !objectMode) {
    const text = await res.clone().text().catch(() => "");
    if (/response_format|json_schema|structured/i.test(text)) res = await send("object");
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const msg = `LLM API ${res.status}: ${text.slice(0, 200)}`;
    throw res.status === 429 || res.status >= 500 ? new LlmError(msg) : new FatalLlmError(msg);
  }
  const out = (await res.json()) as { model?: string; choices?: { message?: { content?: string | null }; finish_reason?: string }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
  const choice = out.choices?.[0];
  if (choice?.finish_reason === "length") throw new LlmError("Output truncated (max_tokens)");
  const tokensIn = out.usage?.prompt_tokens ?? 0;
  const tokensOut = out.usage?.completion_tokens ?? 0;
  return {
    data: parseOutput(choice?.message?.content, opts.schema),
    model: out.model || openaiModel(),
    tokensIn,
    tokensOut,
    costUsd: (tokensIn * priceIn() + tokensOut * priceOut()) / 1_000_000,
  };
}

export async function structured<S extends z.ZodType>(opts: StructuredOpts<S>): Promise<LlmResult<z.infer<S>> | null> {
  const p = provider();
  if (p === "rules") return null;
  const attempts = Math.max(1, Math.min(opts.attempts ?? 2, 3));
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return p === "ollama" ? await callOllama(opts) : p === "openai" ? await callOpenAI(opts) : await callAnthropic(opts);
    } catch (e) {
      lastErr = e;
      if (e instanceof FatalLlmError) break; // not retryable
    }
  }
  throw lastErr instanceof Error ? lastErr : new LlmError(String(lastErr));
}
