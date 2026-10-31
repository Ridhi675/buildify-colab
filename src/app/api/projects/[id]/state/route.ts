import { requireMember } from "@/lib/server/auth";
import { publicUser } from "@/lib/server/accounts";
import { db } from "@/lib/db";
import { getState } from "@/lib/server/state";
import { handle } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async () => {
    const { user, member } = await requireMember(req, id);
    // Invite links let people join, so only members who can edit see them.
    const invites =
      member.role === "observer"
        ? []
        : await db.projectInvite.findMany({ where: { projectId: id, revokedAt: null }, orderBy: { createdAt: "desc" }, select: { id: true, token: true, role: true, uses: true, createdById: true, createdAt: true } });
    return { ...(await getState(id)), invites, me: { ...publicUser(user), role: member.role } };
  });
}
