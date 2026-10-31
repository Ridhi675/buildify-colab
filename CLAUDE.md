# Buildify CoLab — notes for Claude

Preview-first multiplayer AI workspace: 2 humans + Reviewer AI + Builder AI on one shared product artifact.

## Commands
- `npm run setup` — create SQLite DB (`prisma/dev.db`) and seed the CareConnect demo
- `npm run dev` — Next.js dev server on :3000
- `npm test` — vitest (engine unit tests + full demo scenario on `prisma/test.db`)
- `npm run lint` — `tsc --noEmit`; `npm run build` — production build
- Never use `prisma db push --force-reset` (Prisma blocks it for AI agents). The test setup deletes `prisma/test.db` instead.

- `npm run llm:check` — one real Reviewer call through the configured LLM; exits 0 only if the LLM (not the rules engine) answered
- Project skills: `/check` (typecheck + tests + graphify), `/start-ollama-dev` (Ollama → model → llm:check → dev server)

## Local AI (Ollama)
- This machine runs agents on Ollama: `.env` has `LLM_PROVIDER="ollama"`, `OLLAMA_MODEL="qwen3:8b"`, `OLLAMA_THINK="false"`, longer `BC_LLM_TIMEOUT_MS` / `BC_TASK_TIMEOUT_MS`
- Hardware: RTX 4060 Laptop 8 GB VRAM, 32 GB RAM → 8B models run fully on GPU; bigger ones spill to CPU
- Ollama must be running on `localhost:11434` before testing the AI path; on Windows `ollama.exe` may not be on the Bash PATH
- Tests always use the rules engine (`vitest.config.ts` pins `LLM_PROVIDER=""`); `tests/llm.test.ts` stubs `fetch` for the Ollama adapter
- SQLite writes are slow here: in tests, poll for a condition instead of sleeping a fixed time

## Deployment
- `Dockerfile` + `railway.json` (single replica); `scripts/start.sh` = `prisma db push` → `scripts/seed-if-empty.ts` → `next start`; SQLite at `/data/buildify.db`
- `.dockerignore` excludes `.env` so local Ollama settings never ship; deployed AI uses `LLM_PROVIDER=openai` (OpenAI-compatible: Groq/OpenRouter)
- Deploys from the user's fork `TanishqGoyal27/buildify-colab`; upstream is `Ridhi675/buildify-colab`

## Layout
- `src/lib/engine/` — pure, deterministic logic (no DB): `spec.ts` (requirements → AppSpec, rebuild, diff), `context.ts` (fingerprints, stale check), `impact.ts` (Ripple Effect)
- `src/lib/ai/` — `llm.ts` (Anthropic / Ollama / OpenAI-compatible adapter, structured output, retries/timeouts), `agents.ts` (Reviewer/Builder capabilities, each with rules-engine fallback labelled `source: "rules"`)
- `src/lib/server/` — `tasks.ts` (async runner, safe boundaries, epochs, controls, restart/recovery), `workflow.ts` (requirements, approvals, ripple, restore, compare), `core.ts` (activity, notifications, context commits), `actions.ts` (zod-validated action dispatcher), `realtime.ts` (SSE hub, presence, soft locks), `state.ts` (client snapshot), `accounts.ts` (email/password accounts, invite links), `seed.ts`
- `src/app/api/` — `session` (sign up / sign in / demo pick), `invites/[token]` (preview + join), `projects`, `projects/[id]/{state,action,stream}`
- `src/components/` — `client.ts` (per-tab identity, `useProject` SSE hook), `AppRenderer.tsx` (safe JSON renderer), `workspace/` (shell + one file per view)

## Conventions
- All mutations go through `POST /api/projects/[id]/action` → `ActionSchema` → `dispatch`. Add a new action there.
- Server mutations use `mutate(projectId, reason, tx => …)` so they run in a transaction and broadcast `changed`.
- Runner writes are guarded by `epoch` (`updateMany where {id, epoch}`); keep that invariant.
- JSON columns are strings (`j.parse` / `j.str`) so the schema stays portable to Postgres.
- Label anything simulated (`simulated: true` activity, `SimulatedNote`) and anything AI-inferred.

## Graphify (developer code graph — not the product's context graph)
- Rebuild after code changes: `graphify update src` (no LLM; writes `src/graphify-out/`, git-ignored)
- Query, don't load: `graphify explain "proposeChange" --graph src/graphify-out/graph.json`, `graphify path "vote" "createArtifactVersion" --graph src/graphify-out/graph.json`

## Status
See `docs/PROGRESS.md` and `docs/FEATURE_STATUS.md`.
