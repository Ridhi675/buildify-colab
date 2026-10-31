import { execSync } from "node:child_process";
import fs from "node:fs";

// Fresh throwaway SQLite database for each test run (prisma/test.db).
export default function setup() {
  for (const f of ["prisma/test.db", "prisma/test.db-journal"]) fs.rmSync(f, { force: true });
  execSync("npx prisma db push --skip-generate", {
    stdio: "ignore",
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
  });
}
