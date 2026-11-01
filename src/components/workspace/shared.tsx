"use client";

import { AlertTriangle, Bot, CheckCircle2, Download, ExternalLink, MessageSquare, RotateCcw, Send, ThumbsDown, ThumbsUp } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { Cursor, Draft, Lock, Presence, State } from "../client";
import { agentColor } from "../effects";
import { cn, getToken, timeAgo } from "../client";
import { Avatar, Badge, Button, inputCls, SourceBadge, StatusBadge } from "../ui";

export interface Ctx {
  state: State;
  act: <T = unknown>(a: Record<string, unknown>) => Promise<T>;
  run: (a: Record<string, unknown>, ok?: string) => Promise<unknown>;
  presence: Presence[];
  locks: Lock[];
  cursors: Record<string, Cursor>;
  drafts: Record<string, Draft>;
  /** Realtime (SSE) connection to the server. */
  connected: boolean;
  go: (view: string, query?: string) => void;
  view: string;
  toast: (msg: string, tone?: "ok" | "err") => void;
}

export const WorkspaceCtx = createContext<Ctx | null>(null);
export const useWs = () => {
  const c = useContext(WorkspaceCtx);
  if (!c) throw new Error("WorkspaceCtx missing");
  return c;
};

export function useNames() {
  const { state } = useWs();
  const map = new Map<string, { name: string; color: string; kind: "human" | "agent" | "system" }>();
  for (const m of state.members) map.set(m.userId, { name: m.name, color: m.color, kind: "human" });
  for (const a of state.agents) map.set(a.id, { name: a.name, color: agentColor(a.key), kind: "agent" });
  return (id: string) => map.get(id) ?? { name: id === "system" ? "System" : id, color: "var(--muted-foreground)", kind: "system" as const };
}

export const canVote = (s: State) => s.me.role !== "observer";

const KIND_LABEL: Record<string, string> = {
  preview: "Preview approval",
  change: "Requirement change",
  rebuild: "Updated Builder task",
  build_output: "Builder output",
  release: "Final release",
};

export function ApprovalCard({ a, compact }: { a: State["approvals"][number]; compact?: boolean }) {
  const { state, run, go } = useWs();
  const name = useNames();
  const [comment, setComment] = useState("");
  const mine = a.votes.find((v) => v.userId === state.me.id);
  const approvals = a.votes.filter((v) => v.vote === "approve").length;
  const rec = a.recommendation as { verdict: string; rationale: string } | null;
  const payload = a.payload as Record<string, string>;
  const stale = a.contextVersion < state.project.contextVersion && a.status === "pending";

  return (
    <div className={cn("rounded-xl border bg-surface p-3", a.status === "pending" ? "border-amber-200" : "border-slate-200")}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{KIND_LABEL[a.kind] ?? a.kind}</div>
          <div className="font-medium leading-snug text-slate-900">{a.title}</div>
        </div>
        <StatusBadge status={a.status} />
      </div>
      {!compact && <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{a.summary}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
        {stale && <Badge tone="amber" title="Context changed after this request was created">context moved on</Badge>}
        <span>{approvals}/{a.requiredApprovals} human approvals</span>
        <span className="flex -space-x-1">
          {a.votes.map((v) => (
            <span key={v.id} title={`${name(v.userId).name}: ${v.vote}`}>
              <Avatar name={name(v.userId).name} color={name(v.userId).color} size={18} ring />
            </span>
          ))}
        </span>
      </div>
      {rec && (
        <div className="mt-2 flex gap-2 rounded-lg bg-violet-50 p-2 text-xs text-violet-900">
          <Bot size={14} className="mt-0.5 shrink-0" />
          <div>
            <span className="font-medium">Bunty recommends “{rec.verdict}”</span> — advisory only, humans decide. {!compact && rec.rationale}
          </div>
        </div>
      )}
      {a.status === "pending" && canVote(state) && (
        <div className="mt-2.5 space-y-2">
          {!compact && <input className={cn(inputCls, "py-1.5 text-xs")} placeholder="Optional comment or requested change…" value={comment} onChange={(e) => setComment(e.target.value)} />}
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="success" onClick={() => run({ type: "vote", requestId: a.id, vote: "approve", comment: comment || undefined }, "Approval recorded")}>
              <ThumbsUp size={12} /> {mine?.vote === "approve" ? "Approved" : "Approve"}
            </Button>
            <Button size="sm" onClick={() => run({ type: "vote", requestId: a.id, vote: "revise", comment: comment || undefined }, "Revision requested")}>
              <RotateCcw size={12} /> Request changes
            </Button>
            <Button size="sm" variant="danger" onClick={() => run({ type: "vote", requestId: a.id, vote: "reject", comment: comment || undefined }, "Rejected")}>
              <ThumbsDown size={12} /> Reject
            </Button>
            {a.kind === "change" && payload.impactId && (
              <Button size="sm" variant="ghost" onClick={() => go("ripple", `impact=${payload.impactId}`)}>Ripple effect →</Button>
            )}
            {a.kind === "preview" && <Button size="sm" variant="ghost" onClick={() => go("workspace")}>Open preview →</Button>}
          </div>
          {mine && <div className="text-[11px] text-slate-500">You voted “{mine.vote}”. Waiting for the other human.</div>}
        </div>
      )}
    </div>
  );
}

export function ChatPanel() {
  const { state, run } = useWs();
  const name = useNames();
  const { text: msg, setText: setMsg, typing, lastEditor } = useLiveDraft("chat");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [state.chat.length]);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3 py-2 scroll-thin">
        {state.chat.length === 0 && <div className="py-6 text-center text-xs text-slate-500">Ask Bunty what changed, or describe what you want to build.</div>}
        {state.chat.map((c) => {
          const who = name(c.authorId);
          const ai = c.role !== "human";
          const meta = c.meta as { source?: string; recovery?: unknown };
          return (
            <div key={c.id} className={cn("flex gap-2", !ai && c.authorId === state.me.id && "flex-row-reverse")}>
              {ai ? <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white" style={{ background: who.color }}><Bot size={13} /></span> : <Avatar name={who.name} color={who.color} size={24} />}
              <div className={cn("max-w-[85%] rounded-xl px-2.5 py-1.5 text-xs leading-relaxed", ai ? "bg-slate-100 text-slate-800" : c.authorId === state.me.id ? "bg-indigo-600 text-white" : "bg-surface ring-1 ring-slate-200")}>
                <div className="mb-0.5 flex items-center gap-1.5 text-[10px] opacity-75">
                  <span className="font-medium">{who.name}</span>· {timeAgo(c.createdAt)} {ai && <SourceBadge source={meta.source} />}
                </div>
                <div className="whitespace-pre-wrap">{c.body}</div>
              </div>
            </div>
          );
        })}
        <div ref={end} />
      </div>
      <DraftStatus typing={typing} lastEditor={lastEditor} className="px-3 pt-1.5" />
      <form
        className="flex gap-1.5 border-t border-slate-100 p-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!msg.trim()) return;
          const m = msg;
          setMsg("");
          await run({ type: "chat", message: m });
        }}
      >
        <input className={cn(inputCls, "py-1.5 text-xs")} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Message Bunty…" aria-label="Message Bunty" />
        <Button size="sm" variant="primary" type="submit" aria-label="Send"><Send size={12} /></Button>
      </form>
    </div>
  );
}

export function ConflictAlerts() {
  const { state, go } = useWs();
  const q = state.tasks.filter((t) => t.status === "quarantined" && !state.tasks.some((n) => n.type === t.type && n.createdAt > t.createdAt && n.status === "completed"));
  const conflicts = state.impacts.filter((i) => i.status === "conflict");
  const behind = state.agents.filter((a) => a.contextVersion < state.project.contextVersion && a.status === "working");
  if (!q.length && !conflicts.length && !behind.length) return null;
  return (
    <div className="space-y-1.5">
      {q.map((t) => (
        <button key={t.id} onClick={() => go("agents", `task=${t.id}`)} className="flex w-full gap-2 rounded-lg border border-rose-200 bg-rose-50 p-2 text-left text-xs text-rose-900">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span><b>Quarantined:</b> {t.title}. {t.staleReason}</span>
        </button>
      ))}
      {conflicts.map((c) => (
        <button key={c.id} onClick={() => go("ripple", `impact=${c.id}`)} className="flex w-full gap-2 rounded-lg border border-rose-200 bg-rose-50 p-2 text-left text-xs text-rose-900">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span><b>Edit conflict</b> on {c.requirementKey}: proposal preserved — rebase or discard.</span>
        </button>
      ))}
      {behind.map((a) => (
        <div key={a.id} className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>{a.name} is working on context v{a.contextVersion}; latest is v{state.project.contextVersion}. Its output will be checked before it can be used.</span>
        </div>
      ))}
    </div>
  );
}

export function Comments({ targetType, targetId }: { targetType: string; targetId: string }) {
  const { state, run } = useWs();
  const name = useNames();
  const [body, setBody] = useState("");
  const list = state.comments.filter((c) => c.targetType === targetType && c.targetId === targetId);
  return (
    <div className="space-y-2">
      {list.map((c) => (
        <div key={c.id} className="flex gap-2 text-xs">
          <Avatar name={name(c.authorId).name} color={name(c.authorId).color} size={20} />
          <div>
            <span className="font-medium">{name(c.authorId).name}</span> <span className="text-slate-400">{timeAgo(c.createdAt)}</span>
            <div className="text-slate-700">{c.body}</div>
          </div>
        </div>
      ))}
      <form
        className="flex gap-1.5"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!body.trim()) return;
          await run({ type: "comment", targetType, targetId, body });
          setBody("");
        }}
      >
        <input className={cn(inputCls, "py-1.5 text-xs")} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a comment (use @Aisha or @Daniel to mention)" />
        <Button size="sm" type="submit"><MessageSquare size={12} /></Button>
      </form>
    </div>
  );
}

export function SimulatedNote({ children }: { children: React.ReactNode }) {
  return <Badge tone="amber" title="This event is simulated and labelled as such">SIMULATED · {children}</Badge>;
}

export function Done({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center gap-1 text-xs text-emerald-700"><CheckCircle2 size={13} />{children}</span>;
}

/** Open the product as a website, or download it as a runnable project (backend + frontend + README). */
export function SiteButtons({ query }: { query: string }) {
  const { state } = useWs();
  const href = (download: boolean) =>
    `/api/projects/${state.project.id}/site?${query}${download ? "&format=project" : ""}&t=${encodeURIComponent(getToken() ?? "")}`;
  return (
    <>
      <Button size="sm" title="Open the generated website in a new tab" onClick={() => void window.open(href(false), "_blank", "noopener")}>
        <ExternalLink size={13} /> Open website
      </Button>
      <Button size="sm" title="Download the full project (Node.js backend, frontend, README) as a .zip and run it locally with npm start" onClick={() => window.location.assign(href(true))}>
        <Download size={13} /> Download project
      </Button>
    </>
  );
}

// ---------- Live prompting ----------

const tabId = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 12) : Math.random().toString(36).slice(2, 14);

/**
 * A prompt box shared by everyone in the project: keystrokes stream to the
 * others (throttled) and their typing appears here. Last write wins; while
 * you are typing, incoming text waits so it never eats your keystrokes.
 */
export function useLiveDraft(field: Draft["field"]) {
  const { drafts, act, state } = useWs();
  const remote = drafts[field];
  const [text, setLocal] = useState(remote?.text ?? "");
  const lastLocal = useRef(0);
  const seen = useRef(remote?.at ?? 0);
  const pending = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, tick] = useState(0);

  useEffect(() => {
    if (!remote || remote.at <= seen.current) return;
    seen.current = remote.at;
    if (remote.clientId === tabId) return; // our own echo
    if (remote.text !== "" && Date.now() - lastLocal.current < 800) return; // we're mid-typing; our next send wins
    setLocal(remote.text);
  }, [remote]);

  const flush = useCallback(() => {
    timer.current = null;
    if (pending.current === null) return;
    const t = pending.current;
    pending.current = null;
    void act({ type: "draft", field, text: t, clientId: tabId }).catch(() => {});
  }, [act, field]);

  const setText = useCallback(
    (v: string) => {
      setLocal(v);
      lastLocal.current = Date.now();
      pending.current = v;
      timer.current ??= setTimeout(flush, 150);
    },
    [flush],
  );

  // Re-render while someone else is typing so the indicator fades out on its own.
  const typing = remote && remote.clientId !== tabId && remote.clientId !== "" && Date.now() - remote.at < 2500 ? remote : null;
  useEffect(() => {
    if (!typing) return;
    const t = setTimeout(() => tick((n) => n + 1), Math.max(100, 2600 - (Date.now() - typing.at)));
    return () => clearTimeout(t);
  }, [typing]);

  const lastEditor = remote && remote.text && remote.userId !== state.me.id && text === remote.text ? remote : null;
  return { text, setText, typing, lastEditor };
}

/** "Daniel is typing…" / "Shared draft · last edited by Daniel" next to a live prompt box. */
export function DraftStatus({ typing, lastEditor, className }: { typing: Draft | null; lastEditor: Draft | null; className?: string }) {
  const who = typing ?? lastEditor;
  if (!who) return null;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[11px] text-slate-500", className)} aria-live="polite">
      <span className={cn("h-2 w-2 rounded-full", typing && "animate-pulse-soft")} style={{ background: who.color }} />
      {typing ? `${who.name.split(" ")[0]} is typing…` : `Shared draft · last edited by ${who.name.split(" ")[0]}`}
    </span>
  );
}
