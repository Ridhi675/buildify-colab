import { requireMember } from "@/lib/server/auth";
import { getState } from "@/lib/server/state";
import { handle } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async () => {
    const { user, member } = await requireMember(req, id);
    return { ...(await getState(id)), me: { ...user, role: member.role } };
  });
}
