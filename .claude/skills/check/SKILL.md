---
name: check
description: Run the Buildify CoLab quality gate — typecheck, full test suite, and graphify code-graph refresh — and report a short pass/fail summary. Use after code changes, before committing, or when the user types /check.
---

# /check — Buildify CoLab quality gate

Run these from the project root, in order. Keep going after a failure so the user sees every problem at once.

1. **Typecheck**: `npm run lint` (this is `tsc --noEmit`).
2. **Tests**: `npm test` (vitest; takes ~10 s). Tests always run on the rules engine (`vitest.config.ts` pins `LLM_PROVIDER=""`), so Ollama does not need to be running.
3. **Code graph**: if `graphify` is on PATH, run `graphify update src`. If it is not installed, skip this step and say so in one line — do not install it.

## Report

Reply with a compact table:

| Step | Result |
|---|---|
| Typecheck | ✅ / ❌ (N errors) |
| Tests | ✅ X passed / ❌ X failed of Y |
| Graphify | ✅ updated / ⏭ skipped (not installed) |

For each failure, quote the first relevant error lines (file:line and message) and say whether it looks related to the current change. Do not fix anything unless the user asks.

## Notes for this machine

- SQLite writes are slow on this PC. If a scenario test fails on timing, it is almost certainly a fixed `setTimeout` wait — the fix is to poll for the condition (see the parallel-agents check in `tests/scenario.test.ts`), not to lengthen the sleep.
- Never use `prisma db push --force-reset`; the test setup deletes `prisma/test.db` itself.
