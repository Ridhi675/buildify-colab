import { ZodError } from "zod";
import { HttpError } from "./auth";

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data ?? { ok: true }), { status, headers: { "content-type": "application/json" } });
}

export async function handle(fn: () => Promise<unknown>) {
  try {
    return json(await fn());
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message, data: e.data }, e.status);
    if (e instanceof ZodError) return json({ error: "Invalid input", issues: e.issues }, 400);
    const msg = (e as Error).message ?? "Server error";
    if (/No .* found|Record to update not found/i.test(msg)) return json({ error: "Not found" }, 404);
    console.error(e);
    return json({ error: msg }, 400);
  }
}
