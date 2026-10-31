import { resetDemo } from "../src/lib/server/seed";
import { db } from "../src/lib/db";

resetDemo()
  .then((id) => console.log(`Seeded demo project "${id}" with 2 humans, 1 observer and 2 agents.`))
  .finally(() => db.$disconnect());
