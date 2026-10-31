import { z } from "zod";
import { db } from "@/lib/db";
import { signToken, requireUser } from "@/lib/server/auth";
import { ensureUsers } from "@/lib/server/seed";
import { handle } from "@/lib/server/http";

export async function GET(req: Request) {
  return handle(async () => {
    await ensureUsers();
    const users = await db.user.findMany({ where: { kind: "human" }, orderBy: { createdAt: "asc" } });
    let me = null;
    try {
      me = await requireUser(req);
    } catch {
      /* signed out */
    }
    return { users, me };
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const { userId } = z.object({ userId: z.string() }).parse(await req.json());
    await ensureUsers();
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    return { token: signToken(user.id), user };
  });
}
