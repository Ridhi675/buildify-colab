// Provider adapter for structured LLM calls. Anthropic is the implemented
// provider; callers only see `structured()` / `llmStatus()`, so another
// provider can be added behind the same interface.
//
// When no API key is configured, `structured()` returns null and callers use the
// deterministic rules engine instead. Every output records which source made it.

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";

export interface LlmResult<T> {
  data: T;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
}

const model = () => process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
const priceIn = () => Number(process.env.BC_PRICE_IN_PER_MTOK ?? 2);
const priceOut = () => Number(process.env.BC_PRICE_OUT_PER_MTOK ?? 10);

export function llmStatus() {
  const enabled = !!process.env.ANTHROPIC_API_KEY;
  return {
    enabled,
    provider: enabled ? "anthropic" : "rules",
    model: enabled ? model() : "deterministic rules engine",
    pricing: { inPerMTok: priceIn(), outPerMTok: priceOut() },
  };
}

let client: Anthropic | null = null;
const getClient = () => (client ??= new Anthropic({ maxRetries: 2, timeout: Number(process.env.BC_LLM_TIMEOUT_MS ?? 60_000) }));

export class LlmError extends Error {}

export async function structured<S extends z.ZodType>(opts: {
  system: string;
  prompt: string;
  schema: S;
  maxTokens?: number;
  attempts?: number;
}): Promise<LlmResult<z.infer<S>> | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const attempts = Math.max(1, Math.min(opts.attempts ?? 2, 3));
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await getClient().beta.messages.parse({
        model: model(),
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
      return {
        data: res.parsed_output as z.infer<S>,
        model: res.model,
        tokensIn,
        tokensOut,
        costUsd: (tokensIn * priceIn() + tokensOut * priceOut()) / 1_000_000,
      };
    } catch (e) {
      lastErr = e;
      if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.BadRequestError) break; // not retryable
    }
  }
  throw lastErr instanceof Error ? lastErr : new LlmError(String(lastErr));
}
