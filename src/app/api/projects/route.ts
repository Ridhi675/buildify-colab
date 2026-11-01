import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/server/auth";
import { createProject, resetDemo, DEMO_ID } from "@/lib/server/seed";
import { handle } from "@/lib/server/http";
import { TEMPLATE_KEYS } from "@/lib/engine/templates";

export async function GET(req: Request) {
  return handle(async () => {
    const user = await requireUser(req);
    if (!(await db.project.findUnique({ where: { id: DEMO_ID } }))) await resetDemo();
    const projects = await db.project.findMany({
      where: { members: { some: { userId: user.id } } },
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { requirements: true, decisions: true } } },
    });
    return { projects };
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser(req);
    const body = z
      .object({ name: z.string().trim().min(2).max(80), description: z.string().trim().max(500).default(""), healthcare: z.boolean().default(false), template: z.enum(TEMPLATE_KEYS).default("auto") })
      .parse(await req.json());
    const p = await createProject(user.id, body.name, body.description, body.healthcare, body.template);
    return { id: p.id };
  });
}
