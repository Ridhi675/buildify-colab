import { requireMember } from "@/lib/server/auth";
import { ActionSchema, dispatch } from "@/lib/server/actions";
import { handle } from "@/lib/server/http";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async () => {
    const { user, member } = await requireMember(req, id);
    const action = ActionSchema.parse(await req.json().catch(() => ({})));
    return (await dispatch(id, user, member.role, action)) ?? { ok: true };
  });
}
