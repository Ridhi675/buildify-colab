---
name: start-ollama-dev
description: Start Buildify CoLab with local Ollama models — check Ollama is running and the model is pulled, start the dev server, and confirm the agents get real LLM answers. Use when the user types /start-ollama-dev or asks to run the app with Ollama / local AI.
---

# /start-ollama-dev — run Buildify CoLab on local Ollama

Settings live in `.env`: `LLM_PROVIDER="ollama"`, `OLLAMA_MODEL` (default `qwen3:8b`), `OLLAMA_BASE_URL` (default `http://localhost:11434`). Read the model name from `.env` rather than assuming it.

Hardware: RTX 4060 Laptop (8 GB VRAM), 32 GB RAM. `qwen3:8b` fits fully on the GPU; 14B+ models spill to CPU and are much slower.

## Steps

1. **Ollama installed?** Check `ollama --version`. On Windows the binary is `%LOCALAPPDATA%\Programs\Ollama\ollama.exe` and may not be on the Bash PATH — use PowerShell or the full path. If it is not installed, stop and tell the user; do not download anything without asking (installer ~1.6 GB from github.com/ollama/ollama releases; winget's download service is disabled on this PC, so winget hangs).
2. **Server running?** `curl -s http://localhost:11434/api/version`. If it does not answer, start it in the background with `ollama serve` (or launch the Ollama app) and re-check for up to ~15 s.
3. **Model pulled?** `ollama list` must include `OLLAMA_MODEL`. If missing, ask before pulling (state the size — `qwen3:8b` is ~5.2 GB), then run `ollama pull <model>` in a Terminal tab so the user sees the progress bar.
4. **LLM path works?** Run `npm run llm:check`. It makes one real Reviewer call and exits 0 only if the answer came from the LLM. Report the source, model, seconds and token counts. If it fell back to the rules engine, show the `Note:` line and diagnose (server down, model name typo, timeout → raise `BC_LLM_TIMEOUT_MS`).
5. **Database ready?** If `prisma/dev.db` does not exist, run `npm run setup`.
6. **Start the app** with the preview tool: `preview_start` `{name: "buildify-colab"}` (from `.claude/launch.json`, port 3000). Never start the dev server through Bash. If it is already running, restart it so it picks up `.env` changes.
7. **Confirm in the UI**: open a project → Settings → "AI provider" card should show `LLM enabled`, `ollama`, and the model name.

## Report

One short summary: Ollama version, model, llm:check result (source + latency), app URL. Mention anything that fell back to the rules engine.
