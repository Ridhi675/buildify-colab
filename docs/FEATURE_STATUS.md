# Feature status

**Functional** = implemented end to end and exercised by tests and/or the live two-tab demo. **Partial** = works with stated limits. **Simulated** = deliberately simulated and labelled in the UI. **Not implemented** = absent.

## Functional
- Two identifiable humans + one observer; per-tab signed sessions; project-level authorization on every API call; observers cannot mutate
- Real-time sync across browser sessions (SSE), presence/online status, which view each person is on, follow mode, live cursors, focus mode
- Soft edit locks ("Aisha is currently editing REQ-001") + server-side optimistic version checks; conflicting proposals preserved with Rebase / Discard
- Query simplification: original request shown beside structured requirements (ID, description, priority, author, timestamp, version, acceptance criteria, components, approval status); edit / reject / approve
- Preview Studio: JSON-driven visual preview (mobile/desktop), textual spec, approve / reject / request changes / comment, regenerate with feedback, compare previews
- Preview-first gate: Builder full generation starts only after the configured number of human approvals
- Parallel agent work: Reviewer acceptance plan and Builder build run as concurrent async jobs
- Agent Control Centre: pause (safe boundary), resume (from persisted phase), stop (late output rejected), redirect, retry (bounded, refreshes context), delegate (eligible task types), inspect (inputs, context version, dependency fingerprint, run logs, output, validation)
- Context versions (immutable snapshots), decision log, context timeline, agent context viewer
- Stale-work detection: every task stores base context + requirement versions; output is checked before commit and quarantined with a plain-language reason
- Agent restart & recovery from persistent state (epoch bump discards in-memory work); orphaned "running" tasks after a server restart are detected and made resumable
- Ripple Effect: requirement graph + component graph traversal + simulated rebuild diff; affected/unaffected components, stale tasks, agents, effort, severity, confidence, plan; approve / reject / modify; dependency graph view
- Impact-aware rebuild: only affected components regenerate; unaffected components kept byte-identical
- Checkpoints at all milestones + manual; restore checkpoint or version with preview + confirmation; restore creates new versions and never deletes history
- Decision Time Machine: versions with their own saved spec + requirements, decision explanations, compare two versions (visual, requirements, decisions, actors, reasons)
- Approvals: configurable policy (1 or 2 humans for major/minor/release); Reviewer recommendations are advisory and labelled; AI can never vote
- Notifications in five categories with grouping; @mentions; activity feed with actor, action, target, context version, outcome; Ctrl/Cmd+Shift+N/M/A
- Context knowledge graph (React Flow) from persisted relationships; click for details and related activity
- Cost tracking: preview/build/rebuild counts, rejected previews, LLM vs rules runs, tokens and estimated cost from configurable pricing

## Partial
- **LLM integration**: implemented (Anthropic structured output, retries, timeouts, refusal fallback). Not exercised in this environment because no API key was configured; all demo runs used the rules engine, labelled "Rules engine" in the UI.
- **Builder output** is a structured AppSpec rendered by a safe React renderer — a clickable prototype, not generated source code.
- **Realtime** is single-process (in-memory hub). Multiple server instances would need Redis/Postgres pub-sub.
- **Effort estimates** are a per-category heuristic, labelled as such.
- **Graphify** is used for the developer code graph only (`graphify update src`); token savings were not measured.

## Simulated (labelled)
- **Agent restart** simulates a crash (in-memory work discarded via epoch bump); the process itself is not killed. Activity entries are marked SIMULATED.
- **Agent phase pacing**: phases sleep `BC_AGENT_STEP_MS` (full builds × `BC_BUILD_PACING`) so humans can intervene during a live demo.

## Not implemented
- Docker sandbox / execution of generated code (intentionally avoided; JSON preview instead)
- Real authentication (demo identities only), Supabase hookup, Monaco code view, image export of previews
- Public deployment (no URL claimed)
