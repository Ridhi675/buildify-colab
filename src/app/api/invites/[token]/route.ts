import { requireUser } from "@/lib/server/auth";
import { acceptInvite, describeInvite } from "@/lib/server/accounts";
import { handle } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** Public preview of an invite: project name, role and who sent it. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return handle(() => describeInvite(token));
}

/** Join the project as the signed-in user. */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return handle(async () => {
    const user = await requireUser(req);
    return acceptInvite(token, user);
  });
}
