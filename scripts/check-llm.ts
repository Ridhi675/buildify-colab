// One real Reviewer call through the configured LLM provider.
// Prints which source answered (llm or rules) so you can tell the LLM path works.
// Usage: npm run llm:check

import { llmStatus } from "../src/lib/ai/llm";
import { simplifyRequest } from "../src/lib/ai/agents";

async function main() {
  const status = llmStatus();
  console.log(`Provider: ${status.provider} · model: ${status.model}`);
  if (!status.enabled) {
    console.log("No LLM configured (set LLM_PROVIDER or ANTHROPIC_API_KEY in .env). Agents will use the rules engine.");
    process.exit(1);
  }
  const started = Date.now();
  const out = await simplifyRequest("A simple app for a local bakery where customers can pre-order cakes for pickup and get a reminder.", ["nav", "home-hero", "booking-form", "confirmation"]);
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`Source: ${out.source}${out.model ? ` (${out.model})` : ""} · ${secs}s · tokens in/out ${out.tokensIn}/${out.tokensOut}`);
  if (out.note) console.log(`Note: ${out.note}`);
  console.log(`Product: ${out.data.productName} · ${out.data.requirements.length} requirements`);
  for (const r of out.data.requirements) console.log(`  - [${r.priority}] ${r.title}`);
  process.exit(out.source === "llm" ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
