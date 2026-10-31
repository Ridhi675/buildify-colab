// Ollama provider in the LLM adapter, with fetch stubbed (no Ollama server needed).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { llmStatus, structured } from "@/lib/ai/llm";
import { simplifyRequest } from "@/lib/ai/agents";

const Schema = z.object({ title: z.string(), checks: z.array(z.string()) });
const opts = { system: "sys", prompt: "hello", schema: Schema };

const reply = (content: string, extra: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ model: "qwen3:8b", message: { role: "assistant", content }, done_reason: "stop", prompt_eval_count: 42, eval_count: 17, ...extra }), { status: 200 });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubEnv("LLM_PROVIDER", "ollama");
  vi.stubEnv("OLLAMA_MODEL", "qwen3:8b");
  vi.stubEnv("OLLAMA_BASE_URL", "http://ollama.test:11434/");
  vi.stubEnv("OLLAMA_THINK", "false");
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Ollama provider", () => {
  it("reports the provider and model, with zero pricing", () => {
    expect(llmStatus()).toMatchObject({ enabled: true, provider: "ollama", model: "qwen3:8b", pricing: { inPerMTok: 0, outPerMTok: 0 } });
  });

  it("sends a JSON-schema constrained chat request and validates the reply", async () => {
    fetchMock.mockResolvedValueOnce(reply(JSON.stringify({ title: "Book", checks: ["a", "b"] })));
    const r = await structured(opts);
    expect(r).toEqual({ data: { title: "Book", checks: ["a", "b"] }, model: "qwen3:8b", tokensIn: 42, tokensOut: 17, costUsd: 0 });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://ollama.test:11434/api/chat");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ model: "qwen3:8b", stream: false, think: false });
    expect(body.format).toMatchObject({ type: "object", required: ["title", "checks"] });
    expect(body.messages.map((m: { role: string }) => m.role)).toEqual(["system", "user"]);
  });

  it("retries a reply that does not match the schema, then gives up", async () => {
    fetchMock.mockImplementation(async () => reply(JSON.stringify({ title: 3 })));
    await expect(structured(opts)).rejects.toThrow(/did not match the schema/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects truncated and non-JSON output", async () => {
    fetchMock.mockImplementation(async () => reply('{"title": "Bo', { done_reason: "length" }));
    await expect(structured(opts)).rejects.toThrow(/truncated/);
    fetchMock.mockImplementation(async () => reply("not json"));
    await expect(structured(opts)).rejects.toThrow(/not valid JSON/);
  });

  it("does not retry when Ollama is unreachable or the model is missing", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await expect(structured(opts)).rejects.toThrow(/not reachable at http:\/\/ollama.test:11434/);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response('{"error":"model \\"qwen3:8b\\" not found"}', { status: 404 }));
    await expect(structured(opts)).rejects.toThrow(/Ollama 404/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns null without calling anything when no provider is configured", async () => {
    vi.stubEnv("LLM_PROVIDER", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(await structured(opts)).toBeNull();
    expect(llmStatus().provider).toBe("rules");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("strips a <think> block and ```json fences before parsing", async () => {
    fetchMock.mockResolvedValueOnce(reply('<think>plan the answer</think>\n```json\n{"title":"Book","checks":[]}\n```'));
    expect((await structured(opts))?.data).toEqual({ title: "Book", checks: [] });
  });

  it("agents fall back to the rules engine, labelled, when Ollama is down", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    const out = await simplifyRequest("Healthcare appointment booking for elderly patients", ["nav", "typography"]);
    expect(out.source).toBe("rules");
    expect(out.note).toMatch(/LLM unavailable \(Ollama not reachable/);
    expect(out.data.requirements.length).toBeGreaterThan(0);
  });
});

const chat = (content: string, extra: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ model: "qwen/qwen3-32b", choices: [{ message: { role: "assistant", content }, finish_reason: "stop" }], usage: { prompt_tokens: 100, completion_tokens: 50 }, ...extra }), { status: 200 });

describe("OpenAI-compatible provider", () => {
  beforeEach(() => {
    vi.stubEnv("LLM_PROVIDER", "openai");
    vi.stubEnv("OPENAI_BASE_URL", "https://api.groq.test/openai/v1/");
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("OPENAI_MODEL", "qwen/qwen3-32b");
    vi.stubEnv("OPENAI_JSON_MODE", "");
    vi.stubEnv("BC_PRICE_IN_PER_MTOK", "0.3");
    vi.stubEnv("BC_PRICE_OUT_PER_MTOK", "0.6");
  });

  it("reports the host and model, and is disabled without a base URL or model", () => {
    expect(llmStatus()).toMatchObject({ enabled: true, provider: "openai-compatible (api.groq.test)", model: "qwen/qwen3-32b", pricing: { inPerMTok: 0.3, outPerMTok: 0.6 } });
    vi.stubEnv("OPENAI_MODEL", "");
    expect(llmStatus().provider).toBe("rules");
  });

  it("sends a json_schema chat completion with the key and prices the usage", async () => {
    fetchMock.mockResolvedValueOnce(chat(JSON.stringify({ title: "Book", checks: ["a"] })));
    const r = await structured(opts);
    expect(r).toEqual({ data: { title: "Book", checks: ["a"] }, model: "qwen/qwen3-32b", tokensIn: 100, tokensOut: 50, costUsd: (100 * 0.3 + 50 * 0.6) / 1_000_000 });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.groq.test/openai/v1/chat/completions");
    expect(init.headers.authorization).toBe("Bearer test-key");
    const body = JSON.parse(init.body);
    expect(body.model).toBe("qwen/qwen3-32b");
    expect(body.response_format).toMatchObject({ type: "json_schema", json_schema: { name: "output", schema: { type: "object" } } });
  });

  it("falls back to json_object mode when the model rejects json_schema", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('{"error":{"message":"response_format json_schema is not supported for this model"}}', { status: 400 }))
      .mockResolvedValueOnce(chat(JSON.stringify({ title: "Book", checks: [] })));
    expect((await structured(opts))?.data).toEqual({ title: "Book", checks: [] });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).response_format).toEqual({ type: "json_object" });
  });

  it("does not retry auth errors, but retries rate limits", async () => {
    fetchMock.mockResolvedValue(new Response('{"error":"invalid api key"}', { status: 401 }));
    await expect(structured(opts)).rejects.toThrow(/LLM API 401/);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(new Response("slow down", { status: 429 })).mockResolvedValueOnce(chat(JSON.stringify({ title: "Ok", checks: [] })));
    expect((await structured(opts))?.data.title).toBe("Ok");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
