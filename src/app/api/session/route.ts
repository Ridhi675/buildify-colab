import { z } from "zod";
import { db } from "@/lib/db";
import { signToken, requireUser, HttpError } from "@/lib/server/auth";
import { publicUser, signIn, signUp } from "@/lib/server/accounts";
import { ensureUsers, USERS } from "@/lib/server/seed";
import { handle } from "@/lib/server/http";

const email = z.string().trim().toLowerCase().email().max(200);
const password = z.string().min(8, "Use at least 8 characters").max(200);

const Body = z.union([
  z.object({ mode: z.literal("signup"), name: z.string().trim().min(2).max(80), email, password, title: z.string().trim().max(80).optional() }),
  z.object({ mode: z.literal("login"), email, password: z.string().min(1).max(200) }),
  // The seeded CareConnect demo people (no password).
  z.object({ mode: z.literal("demo").optional(), userId: z.string() }),
]);

export async function GET(req: Request) {
  return handle(async () => {
    await ensureUsers();
    const users = await db.user.findMany({ where: { id: { in: USERS.map((u) => u.id) } }, orderBy: { createdAt: "asc" } });
    let me = null;
    try {
      me = publicUser(await requireUser(req));
    } catch {
      /* signed out */
    }
    return { users: users.map(publicUser), me };
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const body = Body.parse(await req.json());
    let user;
    if ("mode" in body && body.mode === "signup") user = await signUp(body);
    else if ("mode" in body && body.mode === "login") user = await signIn(body);
    else {
      const { userId } = body as { userId: string };
      if (!USERS.some((u) => u.id === userId)) throw new HttpError(403, "Sign in with your email and password");
      await ensureUsers();
      user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    }
    return { token: signToken(user.id), user: publicUser(user) };
  });
}
