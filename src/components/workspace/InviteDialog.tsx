"use client";

import { Check, Copy, Link2, Trash2 } from "lucide-react";
import { useState } from "react";
import { timeAgo } from "../client";
import { Badge, Button, Modal, Tabs } from "../ui";
import { useNames, useWs } from "./shared";

type Role = "designer" | "founder" | "observer";
const ROLE_HELP: Record<Role, string> = {
  designer: "Can approve, change requirements and invite others.",
  founder: "Same rights as a designer — use it for a co-founder or product lead.",
  observer: "Can view, comment and ask Bunty, but not change or approve.",
};

const linkFor = (token: string) => `${window.location.origin}/invite/${token}`;

/** Create, copy and revoke invite links for the current project. */
export function InviteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, run, toast } = useWs();
  const name = useNames();
  const [role, setRole] = useState<Role>("designer");
  const [copied, setCopied] = useState<string | null>(null);
  const humans = state.members.filter((m) => m.role !== "observer").length;
  const canInvite = state.me.role !== "observer" && !state.project.isDemo;

  const copy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(linkFor(token));
      setCopied(token);
      setTimeout(() => setCopied((c) => (c === token ? null : c)), 1800);
    } catch {
      toast("Copy failed — select the link and copy it manually", "err");
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Invite people">
      <div className="space-y-5">
        <div>
          <div className="mb-2 text-xs font-medium text-muted-foreground">People in this project</div>
          <div className="flex flex-wrap gap-2">
            {state.members.map((m) => (
              <Badge key={m.userId} tone={m.role === "observer" ? "slate" : "indigo"}>{m.name} · {m.role}</Badge>
            ))}
          </div>
          {humans < 2 && <p className="mt-2 text-xs text-amber-700">Approvals need two people who can approve. Invite a designer or co-founder to unblock them.</p>}
        </div>

        {!canInvite ? (
          <p className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">
            {state.project.isDemo ? "The demo uses demo people, so it can’t be shared. Create your own project to invite teammates." : "Observers can’t invite people. Ask a founder or designer for a link."}
          </p>
        ) : (
          <div className="rounded-2xl border border-border p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium">New link for a</span>
              <Tabs<Role> value={role} onChange={setRole} items={[{ value: "designer", label: "Designer" }, { value: "founder", label: "Founder" }, { value: "observer", label: "Observer" }]} />
            </div>
            <p className="mb-3 text-xs text-muted-foreground">{ROLE_HELP[role]} Anyone with the link can join after signing in.</p>
            <Button
              variant="primary"
              className="w-full"
              onClick={async () => {
                const r = (await run({ type: "create_invite", role })) as { token: string } | null;
                if (r) await copy(r.token);
              }}
            >
              <Link2 size={15} /> Create and copy link
            </Button>
          </div>
        )}

        {state.invites.length > 0 && (
          <div>
            <div className="mb-2 text-xs font-medium text-muted-foreground">Active links</div>
            <ul className="space-y-2">
              {state.invites.map((i) => (
                <li key={i.id} className="flex items-center gap-2 rounded-xl border border-border px-3 py-2">
                  <Badge tone={i.role === "observer" ? "slate" : "indigo"}>{i.role}</Badge>
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground" title={linkFor(i.token)}>{linkFor(i.token)}</span>
                  <span className="hidden shrink-0 text-[11px] text-muted-foreground sm:inline">{i.uses} joined · {name(i.createdById).name.split(" ")[0]} · {timeAgo(i.createdAt)}</span>
                  <Button size="sm" variant="ghost" aria-label="Copy link" onClick={() => copy(i.token)}>{copied === i.token ? <Check size={13} /> : <Copy size={13} />}</Button>
                  <Button size="sm" variant="ghost" aria-label="Revoke link" title="Revoke — the link stops working" onClick={() => run({ type: "revoke_invite", inviteId: i.id }, "Link revoked")}><Trash2 size={13} /></Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}
