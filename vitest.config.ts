import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 30000,
    env: { DATABASE_URL: "file:./test.db", AUTH_SECRET: "test-secret", BC_AGENT_STEP_MS: "0", ANTHROPIC_API_KEY: "" },
    globalSetup: ["tests/global-setup.ts"],
  },
});
