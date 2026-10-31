// Seed the CareConnect demo only when it does not exist yet, so restarts with a
// persistent volume keep the team's work. `npm run db:seed` always resets.

import { db } from "../src/lib/db";
import { DEMO_ID, resetDemo } from "../src/lib/server/seed";

async function main() {
  if (await db.project.findUnique({ where: { id: DEMO_ID } })) {
    console.log(`Demo project "${DEMO_ID}" already exists; not reseeding.`);
    return;
  }
  await resetDemo();
  console.log(`Seeded demo project "${DEMO_ID}".`);
}

main().finally(() => db.$disconnect());
