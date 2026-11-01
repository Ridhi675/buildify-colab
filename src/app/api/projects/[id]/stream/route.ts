// Server-Sent Events: realtime sync + presence for one project.
import { requireMember } from "@/lib/server/auth";
import { subscribe, touchPresence, presenceList, lockList, draftList, type BusEvent } from "@/lib/server/realtime";
import { json } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let who;
  try {
    who = await requireMember(req, id);
  } catch {
    return json({ error: "Unauthorized" }, 401);
  }
  const { user } = who;
  const me = { userId: user.id, name: user.name, color: user.color };
  const enc = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream({
    start(controller) {
      const send = (e: BusEvent) => {
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
        } catch {
          cleanup();
        }
      };
      const unsub = subscribe(id, send);
      touchPresence(id, me, +1);
      send({ type: "presence", presence: presenceList(id), locks: lockList(id) });
      send({ type: "drafts", drafts: draftList(id) });
      const ping = setInterval(() => touchPresence(id, me, 0), 20_000);
      let done = false;
      cleanup = () => {
        if (done) return;
        done = true;
        clearInterval(ping);
        unsub();
        touchPresence(id, me, -1);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      req.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive" },
  });
}
