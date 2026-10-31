"use client";

import {
  Activity, Bell, Bot, Clock, Eye, GitCompare, History, LayoutDashboard, Layers, Link2, Maximize2, Minimize2,
  Network, Settings, Sparkles, CheckSquare, X, Waves, Wifi, WifiOff, Workflow, ListChecks,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn, getToken, timeAgo, useProject } from "../client";
import { Avatar, Badge, Button, StatusBadge } from "../ui";
import { ApprovalCard, ChatPanel, ConflictAlerts, useWs, WorkspaceCtx, type Ctx } from "./shared";
import { WorkspaceView } from "./views/WorkspaceView";
import { PreviewStudio } from "./views/PreviewStudio";
import { AgentsView } from "./views/AgentsView";
import { RippleView } from "./views/RippleView";
import { GraphView } from "./views/GraphView";
import { TimelineView } from "./views/TimelineView";
import { ActivityView } from "./views/ActivityView";
import { SettingsView } from "./views/SettingsView";
import { DemoGuide } from "./DemoGuide";

const NAV = [
  { key: "workspace", label: "Workspace", icon: LayoutDashboard },
  { key: "preview", label: "Preview Studio", icon: Eye },
  { key: "agents", label: "AI Agent Control", icon: Bot },
  { key: "ripple", label: "Ripple Effect", icon: Waves },
  { key: "graph", label: "Context Graph", icon: Network },
  { key: "timeline", label: "Decision Time Machine", icon: History },
  { key: "activity", label: "Activity", icon: Activity },
  { key: "settings", label: "Settings", icon: Settings },
];

export function Workspace({ projectId, view }: { projectId: string; view: string }) {
  const router = useRouter();
  const { state, error, connected, presence, locks, cursors, act } = useProject(projectId);
  const [toasts, setToasts] = useState<{ id: number; msg: string; tone: "ok" | "err" }[]>([]);
  const [focus, setFocus] = useState(false);
  const [drawer, setDrawer] = useState<null | "notifications" | "mentions">(null);
  const [panel, setPanel] = useState(false);
  const [follow, setFollow] = useState<string | null>(null);
  const [guide, setGuideState] = useState(true);
  useEffect(() => {
    try {
      if (localStorage.getItem("bc_guide") === "hidden") setGuideState(false);
    } catch {
      /* storage blocked */
    }
  }, []);
  const setGuide = (v: boolean | ((g: boolean) => boolean)) =>
    setGuideState((g) => {
      const next = typeof v === "function" ? v(g) : v;
      try {
        localStorage.setItem("bc_guide", next ? "shown" : "hidden");
      } catch {
        /* storage blocked */
      }
      return next;
    });
  const mainRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!getToken()) router.replace("/");
  }, [router]);

  const toast = useCallback((msg: string, tone: "ok" | "err" = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "err" ? 6000 : 2500);
  }, []);

  const go = useCallback((v: string, query?: string) => router.push(`/p/${projectId}/${v}${query ? `?${query}` : ""}`), [router, projectId]);

  const run = useCallback(
    async (a: Record<string, unknown>, ok?: string) => {
      try {
        const r = await act(a);
        if (ok) toast(ok);
        return r;
      } catch (e) {
        toast((e as Error).message, "err");
        return null;
      }
    },
    [act, toast],
  );

  // Presence: tell others which view I'm on.
  useEffect(() => {
    if (state) void act({ type: "presence", view }).catch(() => {});
  }, [view, !!state]); // eslint-disable-line react-hooks/exhaustive-deps

  // Follow another user's screen.
  useEffect(() => {
    if (!follow) return;
    const p = presence.find((x) => x.userId === follow);
    if (p && p.connections > 0 && p.view && p.view !== view) go(p.view);
  }, [follow, presence, view, go]);

  // Keyboard shortcuts.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || !e.shiftKey) return;
      const k = e.key.toLowerCase();
      if (k === "n") (e.preventDefault(), setDrawer((d) => (d === "notifications" ? null : "notifications")));
      if (k === "m") (e.preventDefault(), setDrawer((d) => (d === "mentions" ? null : "mentions")));
      if (k === "a") (e.preventDefault(), go("activity"));
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [go]);

  // Live cursors (throttled).
  const last = useRef(0);
  const onMove = (e: React.MouseEvent) => {
    const now = Date.now();
    if (now - last.current < 90 || !mainRef.current) return;
    last.current = now;
    const r = mainRef.current.getBoundingClientRect();
    void act({ type: "cursor", x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top + mainRef.current.scrollTop) / r.height, view }).catch(() => {});
  };

  const ctx: Ctx | null = useMemo(
    () => (state ? { state, act, run, presence, locks, cursors, go, view, toast } : null),
    [state, act, run, presence, locks, cursors, go, view, toast],
  );

  if (error && !state)
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="font-medium">{error}</div>
        <Link href="/" className="text-indigo-600 underline">Back to projects</Link>
      </div>
    );
  if (!state || !ctx)
    return <div className="flex min-h-screen items-center justify-center text-slate-500"><span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />Loading workspace…</div>;

  const online = (id: string) => presence.some((p) => p.userId === id && p.connections > 0);
  const pending = state.approvals.filter((a) => a.status === "pending");
  const current = state.versions.find((v) => v.id === state.project.currentArtifactVerId);
  const building = state.tasks.find((t) => t.type === "build" && t.status === "running");
  const unread = state.notifications.filter((n) => !n.readBy.includes(state.me.id)).length;
  const approved = state.requirements.filter((r) => r.status === "approved");

  return (
    <WorkspaceCtx.Provider value={ctx}>
      <div className="flex h-screen flex-col overflow-hidden">
        {/* ---------- Top toolbar ---------- */}
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-3">
          <Link href="/" className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white" title="All projects"><Layers size={17} /></Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2 font-semibold">
              <span className="truncate">{state.project.name}</span>
              <StatusBadge status={state.project.phase} />
            </div>
            <div className="hidden truncate text-xs text-slate-500 sm:block">{state.project.description}</div>
          </div>
          <div className="ml-2 hidden items-center gap-1.5 md:flex">
            <Badge tone="indigo" title="Latest committed context version">context v{state.project.contextVersion}</Badge>
            <Badge tone={current ? "emerald" : "slate"}>{current ? `artifact v${current.number}` : "no artifact yet"}</Badge>
            {building ? <Badge tone="indigo"><span className="animate-pulse-soft">●</span> building · {building.phaseLabel}</Badge> : <Badge>build idle</Badge>}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <div className="flex items-center -space-x-1.5">
              {state.members.map((m) => {
                const p = presence.find((x) => x.userId === m.userId);
                return (
                  <button key={m.userId} onClick={() => m.userId !== state.me.id && setFollow((f) => (f === m.userId ? null : m.userId))} title={`${m.name} (${m.title}) — ${online(m.userId) ? `online, on ${p?.view ?? "?"}` : "offline"}${m.userId !== state.me.id ? ". Click to follow." : ""}`} className={cn("rounded-full", follow === m.userId && "ring-2 ring-indigo-500 ring-offset-1")}>
                    <Avatar name={m.name} color={m.color} online={online(m.userId)} ring />
                  </button>
                );
              })}
              {state.agents.map((a) => (
                <span key={a.id} title={`${a.name}: ${a.status}`} className="relative inline-flex h-7 w-7 items-center justify-center rounded-full text-white ring-2 ring-white" style={{ background: a.key === "reviewer" ? "#7c3aed" : "#0891b2" }}>
                  <Bot size={14} />
                  <span className={cn("absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white", a.status === "working" ? "bg-indigo-500 animate-pulse-soft" : a.status === "paused" ? "bg-amber-500" : "bg-emerald-500")} />
                </span>
              ))}
            </div>
            {follow && <Badge tone="indigo">following {state.members.find((m) => m.userId === follow)?.name.split(" ")[0]}</Badge>}
            <span title={connected ? "Realtime connected" : "Reconnecting…"} className={connected ? "text-emerald-600" : "text-amber-600"}>{connected ? <Wifi size={16} /> : <WifiOff size={16} />}</span>
            <Button size="sm" variant="ghost" title="Share link" onClick={() => (navigator.clipboard?.writeText(window.location.href.split("?")[0]), toast("Link copied — collaborators pick their identity on open"))}><Link2 size={14} /><span className="hidden lg:inline">Share</span></Button>
            <Button size="sm" variant="ghost" title="Compare versions" onClick={() => go("timeline", "mode=compare")}><GitCompare size={14} /><span className="hidden lg:inline">Compare</span></Button>
            <Button size="sm" variant="ghost" title="Restore a version" onClick={() => go("timeline", "mode=restore")}><Clock size={14} /><span className="hidden lg:inline">Restore</span></Button>
            <button onClick={() => setPanel(true)} title="Pending approvals and Reviewer AI" className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100 xl:hidden">
              <CheckSquare size={17} />
              {pending.length > 0 && <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white">{pending.length}</span>}
            </button>
            <button onClick={() => setDrawer((d) => (d ? null : "notifications"))} title="Notifications (Ctrl+Shift+N)" className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100">
              <Bell size={17} />
              {unread > 0 && <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">{unread}</span>}
            </button>
            <button onClick={() => setFocus((f) => !f)} title="Focus mode" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100">{focus ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>
            <Avatar name={state.me.name} color={state.me.color} />
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          {/* ---------- Left sidebar ---------- */}
          {!focus && (
            <aside className="hidden w-60 shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-white p-2 scroll-thin md:flex">
              <nav className="space-y-0.5">
                {NAV.map((n) => {
                  const viewers = presence.filter((p) => p.view === n.key && p.connections > 0 && p.userId !== state.me.id);
                  const badge = n.key === "ripple" ? state.impacts.filter((i) => i.status === "pending" || i.status === "conflict").length : n.key === "agents" ? state.tasks.filter((t) => t.status === "running").length : 0;
                  return (
                    <button key={n.key} onClick={() => go(n.key)} className={cn("flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition", view === n.key ? "bg-indigo-50 font-medium text-indigo-700" : "text-slate-600 hover:bg-slate-50")}>
                      <n.icon size={16} />
                      <span className="flex-1 text-left">{n.label}</span>
                      {viewers.map((v) => <span key={v.userId} className="h-2 w-2 rounded-full" style={{ background: v.color }} title={`${v.name} is here`} />)}
                      {badge > 0 && <span className="rounded-full bg-indigo-600 px-1.5 text-[10px] font-semibold text-white">{badge}</span>}
                    </button>
                  );
                })}
              </nav>
              <SideSection title="Requirements" icon={<ListChecks size={13} />} onClick={() => go("workspace")}>
                {approved.length === 0 && <div className="px-2 text-xs text-slate-400">None approved yet</div>}
                {approved.map((r) => {
                  const lock = locks.find((l) => l.target === r.key && l.userId !== state.me.id);
                  return (
                    <div key={r.id} className="flex items-center gap-1.5 truncate px-2 py-0.5 text-xs text-slate-600" title={r.description}>
                      <span className="font-mono text-[10px] text-slate-400">{r.key}</span>
                      <span className="truncate">{r.title}</span>
                      {lock && <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" title={`${lock.name} is editing`} />}
                    </div>
                  );
                })}
              </SideSection>
              <SideSection title={`Components (${state.components.length})`} icon={<Workflow size={13} />} onClick={() => go("graph")}>
                <div className="flex flex-wrap gap-1 px-2">
                  {["frontend", "design", "backend", "testing"].map((c) => <Badge key={c}>{state.components.filter((x) => x.category === c).length} {c}</Badge>)}
                </div>
              </SideSection>
              <SideSection title="Versions" icon={<History size={13} />} onClick={() => go("timeline")}>
                {[...state.versions].reverse().slice(0, 6).map((v) => (
                  <div key={v.id} className="flex items-center gap-1.5 truncate px-2 py-0.5 text-xs text-slate-600">
                    <span className={cn("font-mono text-[10px]", v.id === state.project.currentArtifactVerId ? "text-emerald-600" : "text-slate-400")}>v{v.number}</span>
                    <span className="truncate">{v.label}</span>
                  </div>
                ))}
                {state.versions.length === 0 && <div className="px-2 text-xs text-slate-400">No versions yet</div>}
              </SideSection>
              <div className="mt-auto pt-3">
                <Button size="sm" variant="ghost" className="w-full" onClick={() => setGuide((g) => !g)}><Sparkles size={13} /> {guide ? "Hide" : "Show"} demo guide</Button>
              </div>
            </aside>
          )}

          {/* ---------- Central workspace ---------- */}
          <main ref={mainRef} onMouseMove={onMove} className="relative min-w-0 flex-1 overflow-y-auto p-4 scroll-thin lg:p-6">
            {view === "workspace" && <WorkspaceView />}
            {view === "preview" && <PreviewStudio />}
            {view === "agents" && <AgentsView />}
            {view === "ripple" && <RippleView />}
            {view === "graph" && <GraphView />}
            {view === "timeline" && <TimelineView />}
            {view === "activity" && <ActivityView />}
            {view === "settings" && <SettingsView />}
            <CursorLayer />
          </main>

          {/* ---------- Right sidebar ---------- */}
          {!focus && (
            <aside className="hidden w-[340px] shrink-0 flex-col border-l border-slate-200 bg-white xl:flex">
              <div className="max-h-[50%] space-y-3 overflow-y-auto border-b border-slate-100 p-3 scroll-thin">
                <ConflictAlerts />
                <div>
                  <div className="mb-1.5 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Pending approvals <Badge tone={pending.length ? "amber" : "slate"}>{pending.length}</Badge>
                  </div>
                  <div className="space-y-2">
                    {pending.length === 0 && <div className="text-xs text-slate-400">Nothing waiting for a human decision.</div>}
                    {pending.map((a) => <ApprovalCard key={a.id} a={a} compact />)}
                  </div>
                </div>
                <div>
                  <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Agents</div>
                  {state.agents.map((a) => {
                    const t = state.tasks.find((x) => x.id === a.currentTaskId);
                    return (
                      <button key={a.id} onClick={() => go("agents")} className="mb-1.5 flex w-full items-start gap-2 rounded-lg p-1.5 text-left hover:bg-slate-50">
                        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white" style={{ background: a.key === "reviewer" ? "#7c3aed" : "#0891b2" }}><Bot size={13} /></span>
                        <div className="min-w-0 flex-1 text-xs">
                          <div className="flex items-center gap-1.5 font-medium">{a.name} <StatusBadge status={a.status} /> <span className="text-slate-400">ctx v{a.contextVersion}</span></div>
                          <div className="truncate text-slate-500">{t ? `${t.phaseLabel} — ${t.title}` : a.lastAction ?? "Idle"}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex items-center gap-1.5 px-3 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-500"><Bot size={13} /> Reviewer AI</div>
              <ChatPanel />
            </aside>
          )}
        </div>

        {panel && (
          <div className="fixed inset-0 z-50 bg-slate-900/30 xl:hidden" onClick={() => setPanel(false)}>
            <div className="animate-in absolute bottom-0 right-0 top-0 flex w-[360px] max-w-full flex-col bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5 font-semibold">Approvals & Reviewer AI<button onClick={() => setPanel(false)} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Close"><X size={15} /></button></div>
              <div className="max-h-[55%] space-y-2 overflow-y-auto border-b border-slate-100 p-3 scroll-thin">
                <ConflictAlerts />
                {pending.length === 0 && <div className="text-xs text-slate-400">Nothing waiting for a human decision.</div>}
                {pending.map((a) => <ApprovalCard key={a.id} a={a} />)}
              </div>
              <ChatPanel />
            </div>
          </div>
        )}
        {drawer && <NotificationDrawer mode={drawer} onClose={() => setDrawer(null)} />}
        {guide && state.project.isDemo && <DemoGuide onClose={() => setGuide(false)} />}

        <div className="pointer-events-none fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2">
          {toasts.map((t) => (
            <div key={t.id} className={cn("animate-in pointer-events-auto rounded-lg px-3.5 py-2 text-sm font-medium shadow-lg", t.tone === "err" ? "bg-rose-600 text-white" : "bg-slate-900 text-white")}>{t.msg}</div>
          ))}
        </div>
      </div>
    </WorkspaceCtx.Provider>
  );
}

function SideSection({ title, icon, children, onClick }: { title: string; icon: React.ReactNode; children: React.ReactNode; onClick: () => void }) {
  return (
    <div className="mt-4">
      <button onClick={onClick} className="mb-1 flex w-full items-center gap-1.5 px-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-800">{icon}{title}</button>
      {children}
    </div>
  );
}

function CursorLayer() {
  const { cursors, view, state } = useWs();
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <>
      {Object.values(cursors)
        .filter((c) => c.userId !== state.me.id && c.view === view && Date.now() - c.at < 5000)
        .map((c) => (
          <div key={c.userId} className="pointer-events-none absolute z-40 transition-all duration-100" style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%` }}>
            <svg width="16" height="16" viewBox="0 0 16 16"><path d="M1 1l5 14 2-6 6-2z" fill={c.color} stroke="white" strokeWidth="1" /></svg>
            <span className="ml-3 rounded px-1.5 py-0.5 text-[10px] font-medium text-white" style={{ background: c.color }}>{c.name.split(" ")[0]}</span>
          </div>
        ))}
    </>
  );
}

function NotificationDrawer({ mode, onClose }: { mode: "notifications" | "mentions"; onClose: () => void }) {
  const { state, run } = useWs();
  const [filter, setFilter] = useState<string>(mode === "mentions" ? "mention" : "all");
  useEffect(() => setFilter(mode === "mentions" ? "mention" : "all"), [mode]);
  const tone = { important: "amber", conflict: "rose", completed: "emerald", waiting: "sky", context: "indigo" } as const;
  const list = state.notifications.filter((n) => (filter === "all" ? true : filter === "mention" ? n.groupKey?.startsWith("mention") : n.category === filter));
  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div className="animate-in absolute right-3 top-14 w-[380px] max-w-[calc(100vw-24px)] rounded-xl border border-slate-200 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
          <div className="font-semibold">Notifications</div>
          <Button size="sm" variant="ghost" onClick={() => run({ type: "mark_read" })}>Mark all read</Button>
        </div>
        <div className="flex flex-wrap gap-1 border-b border-slate-100 px-3 py-2">
          {["all", "important", "conflict", "completed", "waiting", "context", "mention"].map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={cn("rounded-md px-2 py-0.5 text-[11px] font-medium capitalize", filter === f ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600")}>{f}</button>
          ))}
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-2 scroll-thin">
          {list.length === 0 && <div className="p-6 text-center text-xs text-slate-400">Nothing here.</div>}
          {list.map((n) => (
            <div key={n.id} className={cn("rounded-lg p-2.5", !n.readBy.includes(state.me.id) && "bg-indigo-50/50")}>
              <div className="flex items-center gap-1.5">
                <Badge tone={tone[n.category as keyof typeof tone] ?? "slate"}>{n.category.toUpperCase()}</Badge>
                {n.count > 1 && <Badge>×{n.count}</Badge>}
                <span className="ml-auto text-[10px] text-slate-400">{timeAgo(n.updatedAt)}</span>
              </div>
              <div className="mt-1 text-sm font-medium">{n.title}</div>
              <div className="text-xs text-slate-600">{n.body}</div>
            </div>
          ))}
        </div>
        <div className="border-t border-slate-100 px-4 py-2 text-[10px] text-slate-400">Ctrl/Cmd+Shift+N notifications · +M mentions · +A activity</div>
      </div>
    </div>
  );
}
