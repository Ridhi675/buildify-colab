# Buildify CoLab

**Two humans. Two AI agents. One shared product. Every decision understood.**

A preview-first, context-aware multiplayer AI workspace for the TechnoTribes / Buildify hackathon ("From Multi-Agent to Multiplayer AI"). A founder and a designer collaborate in real time with a **Reviewer AI** (coordinator) and a **Builder AI** (developer) on one visible product artifact. Requirement changes ripple through a dependency graph, outdated agent work is quarantined, agents recover context after a restart, and every decision is recorded in a navigable time machine.

The flagship demo project is **CareConnect — accessible healthcare appointment booking**; the platform itself is domain-independent (create any project from the dashboard).

> Not affiliated with or integrated into Buildify. The artifact layer is a structured AppSpec, so a Buildify-like generation service could be plugged in behind the Builder later.

## Quick start

Requirements: Node.js 20+ (tested on 26), npm. No Docker or Postgres needed locally.

```bash
cp .env.example .env
```

```bash
npm install
```

```bash
npm run setup
```

```bash
npm run dev
```

Open http://localhost:3000 and either:

- **Use your own account** — create an account, create a project, then click **Invite** in the workspace to copy a link for a teammate. They open it on their own computer, sign in or sign up, and join with the role you picked (founder, designer or observer).
- **Try the demo** — under "Or explore the CareConnect demo as", pick **Aisha (Founder)**. Open a second tab or browser, pick **Daniel (Designer)**. Open **CareConnect** in both — the demo guide in the corner walks through all 17 steps and ticks them off from live state. Demo people are shared by everyone and cannot join real projects.

- No `ANTHROPIC_API_KEY` or Ollama? Everything still works: agents use a deterministic rules engine and every output is labelled **Rules engine**. Set the key, or `LLM_PROVIDER="ollama"` for local open-weight models (see below), to switch to the LLM (labelled **LLM**).
- Reset the demo at any time from the demo guide (or `npm run db:seed`).

## Tests

```bash
npm test
```

36 tests: LLM adapter tests (Ollama and OpenAI-compatible providers with a stubbed server), accounts and invite links (password hashing, sign-up/sign-in, invite join/revoke, observer and demo restrictions), engine unit tests (simplification, fingerprints, stale detection, ripple traversal, impact-aware rebuild) and a full demo scenario against a real SQLite DB using the real task runner (two-human approval gate, observer permissions, parallel agents, mid-flight change, quarantine, conflict detection, restart/recovery, rebuild/validation/approval, compare, safe restore, pause/resume/stop).

## Architecture

```mermaid
flowchart LR
  subgraph Browser["Browser tabs (one identity per tab)"]
    H1[Aisha · Founder]
    H2[Daniel · Designer]
  end
  H1 & H2 -- "POST /action (zod)" --> API
  API -- "SSE: changed / presence / cursor" --> H1 & H2
  subgraph Server["Next.js server (single Node process)"]
    API[Action dispatcher<br/>authz · validation] --> WF[Workflows<br/>requirements · approvals · ripple · restore]
    WF --> RUN[Agent task runner<br/>safe boundaries · epochs · pause/stop]
    RUN --> REV[Reviewer AI]
    RUN --> BLD[Builder AI]
    REV & BLD --> LLM[LLM adapter<br/>Anthropic / Ollama structured output]
    REV & BLD --> RULES[Deterministic engine<br/>spec · impact · stale check]
    WF --> HUB[Realtime hub<br/>presence · locks]
  end
  WF & RUN --> DB[(Prisma DB<br/>context versions · tasks · decisions<br/>artifacts · checkpoints · audit log)]
  REV & BLD -. "load authoritative context" .-> DB
```

Key ideas:
- **Shared context service, not the Reviewer**, is the source of truth. Agents load an immutable `ContextVersion`; each task stores a fingerprint of the requirement versions it depends on.
- **Stale check before commit.** When an agent finishes, its fingerprint is compared with the live requirements; mismatches are quarantined, explained, and the Reviewer prepares an updated task for human approval.
- **Epochs.** Restarting an agent bumps its epoch; every runner write is guarded by epoch, so pre-restart work can never commit.
- **Deterministic first, AI second.** Ripple Effect uses requirement and component graphs plus a simulated rebuild diff; AI additions are labelled *inferred*.
- **Safe artifact.** Previews and builds are JSON AppSpecs rendered by a whitelist renderer — no generated code is executed.
- **A real app at the end.** Any preview or built version opens as a standalone website (**Open website**) or downloads as a runnable project (**Download project**): Node.js backend + frontend + README. Unzip it and run `npm start`; it needs only Node 18+.

More: [docs/FEATURE_STATUS.md](docs/FEATURE_STATUS.md), [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md), [docs/SOLUTION.md](docs/SOLUTION.md), [docs/PROGRESS.md](docs/PROGRESS.md).

## Configuration (`.env`)

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `file:./dev.db` | SQLite path (relative to `prisma/`) or a Postgres URL |
| `AUTH_SECRET` | — | HMAC secret for session tokens. **Required in production** — the server refuses to sign in without it |
| `LLM_PROVIDER` | empty | `anthropic`, `ollama`, `openai` (any OpenAI-compatible API), or empty (Anthropic when a key is set, else rules engine) |
| `ANTHROPIC_API_KEY` | empty | Enables the Anthropic LLM path |
| `ANTHROPIC_MODEL` | `claude-opus-5-5` if unset | Model id |
| `BC_LLM_EFFORT` | `medium` | Effort level for LLM calls |
| `BC_PRICE_IN_PER_MTOK` / `BC_PRICE_OUT_PER_MTOK` | 2 / 10 | Cost estimate pricing (Anthropic only; Ollama is $0) |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama server |
| `OLLAMA_MODEL` | `qwen3:8b` | Local model tag (must be pulled first) |
| `OLLAMA_NUM_CTX` | 8192 | Context window for Ollama calls |
| `OLLAMA_THINK` | unset | `false` disables thinking on reasoning models (faster) |
| `OLLAMA_KEEP_ALIVE` | `30m` | How long Ollama keeps the model loaded |
| `OPENAI_BASE_URL` / `OPENAI_API_KEY` / `OPENAI_MODEL` | empty | OpenAI-compatible endpoint (Groq, OpenRouter, Together, vLLM…) for hosted open-weight models |
| `OPENAI_JSON_MODE` | `schema` | `object` for models that reject `json_schema` (otherwise retried automatically) |
| `BC_AGENT_STEP_MS` | 2500 | Pacing per agent phase (demo visibility) |
| `BC_BUILD_PACING` | 5 | Multiplier for full builds, so humans can change requirements mid-flight |
| `BC_TASK_TIMEOUT_MS` / `BC_LLM_TIMEOUT_MS` | 120000 / 60000 | Timeouts |

LLM calls use `client.beta.messages.parse` with a Zod schema, bounded retries, a timeout, refusal handling and the server-side `fallbacks: "default"` option.

### Local models with Ollama

Install [Ollama](https://ollama.com), pull a model, and point the app at it:

```bash
ollama pull qwen3:8b
```

Then set `LLM_PROVIDER="ollama"` (and `OLLAMA_MODEL` if you pulled a different tag) in `.env` and restart `npm run dev`. Calls go to Ollama's `/api/chat` with the Zod schema converted to a JSON schema in `format`, and the reply is validated against the same Zod schema; any failure falls back to the rules engine. Local generation is slower than hosted APIs, so raise `BC_LLM_TIMEOUT_MS` (e.g. 180000) and `BC_TASK_TIMEOUT_MS` (e.g. 300000). Rough sizing: 8 GB VRAM → `qwen3:8b`; 16 GB+ VRAM or 32 GB RAM with patience → `qwen3:14b`.

## Using PostgreSQL / Supabase

Change `provider = "sqlite"` to `"postgresql"` in `prisma/schema.prisma`, set `DATABASE_URL`, then `npm run setup`. JSON is stored as text and statuses as strings, so no model changes are needed.

## Deployment

The app needs a **long-running Node process** (SSE connections and in-process agent jobs), so serverless platforms are not a fit. The repo ships a `Dockerfile` (works on Railway, Render, Fly.io) and `railway.json`.

**Render** (free tier works)
1. New → Web Service → connect this repo → Language: Docker, Branch: `main`, Instance: Free. Render sets `PORT` itself.
2. Environment: `AUTH_SECRET` (long random string, required) and an AI provider (below). Do not use "Add from .env" — your local `.env` points at Ollama on your laptop; `.dockerignore` keeps it out of the image on purpose.
3. Free instances sleep after ~15 min idle (about a minute to wake) and have no persistent disk, so the demo is re-seeded on every deploy or restart.

**Railway**
1. New Project → Deploy from GitHub repo → pick this repo. Railway builds the `Dockerfile` (`railway.json` pins one replica).
2. Variables: `AUTH_SECRET` and an AI provider, as above.
3. Optional: add a Volume mounted at `/data` so the SQLite database (`/data/buildify.db`) survives redeploys.
4. Settings → Networking → Generate Domain for the public URL.

On start, `scripts/start.sh` syncs the schema (`prisma db push`), seeds the CareConnect demo only if it is missing (`scripts/seed-if-empty.ts`), then runs `next start` on `$PORT`. Serve over HTTPS (both hosts do by default) so passwords and session tokens are encrypted in transit.

**Existing databases.** On a database created before accounts existed, Prisma asks to confirm adding the unique `email` column; existing users have no email, so `npx prisma db push --accept-data-loss` is safe for that one change. Fresh databases (Render free tier, new volumes) are unaffected.

**AI on a deployed server.** A server cannot reach Ollama on your laptop. Use a hosted open-weight model through an OpenAI-compatible API, e.g. Groq:
`LLM_PROVIDER=openai`, `OPENAI_BASE_URL=https://api.groq.com/openai/v1`, `OPENAI_API_KEY=…`, `OPENAI_MODEL=openai/gpt-oss-120b`, plus `BC_PRICE_IN_PER_MTOK` / `BC_PRICE_OUT_PER_MTOK` for cost tracking (`0` on a free tier). Or leave `LLM_PROVIDER` empty to use the labelled rules engine.

Without Docker: build `npm ci && npx prisma db push && npm run build`, start `npm start`, then `npm run db:seed` once.

Run a single instance — the realtime hub is in-memory. No public deployment has been made from this repository yet.

## Security notes

Project membership is checked on every API route; inputs are validated with Zod; observers are read/comment-only; AI agents cannot vote; retries and timeouts are bounded; cancellation is cooperative and late outputs are rejected; all state changes run in transactions and are written to an audit log. Accounts use email + password (scrypt-hashed, never sent to the browser) with a small per-email lockout after repeated failures; sessions are HMAC-signed tokens kept in the browser, so each computer signs in separately. Invite links add the person who opens them with a fixed role, can be revoked, and are hidden from observers. The seeded demo people have no password and are limited to the demo; there is no email verification or password reset yet.

## Developer tooling

[Graphify](https://github.com/Graphify-Labs/graphify) builds a code graph for navigating this repository (`graphify update src`, then `graphify explain "<symbol>" --graph src/graphify-out/graph.json`). This is separate from the product's own project-context graph.
