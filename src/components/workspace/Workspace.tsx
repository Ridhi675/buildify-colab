"use client";

import { Activity, Bell, Bot, History, LayoutDashboard, Link2, Settings, Sparkles, Waves } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn, getToken, timeAgo, useProject } from "../client";
import { Avatar, Badge, Button, StatusBadge } from "../ui";
import { agentColor } from "../effects";
import { BrandIcon } from "../brand";
import { CursorBackground } from "../landing/Background";
import { ThemeToggle } from "../theme";
import { ConflictAlerts, useWs, WorkspaceCtx, type Ctx } from "./shared";
import { ChatDock } from "./ChatDock";
import { WorkspaceView } from "./views/WorkspaceView";
import { AgentsView } from "./views/AgentsView";
import { RippleView } from "./views/RippleView";
import { TimelineView } from "./views/TimelineView";
import { ActivityView } from "./views/ActivityView";
import { SettingsView } from "./views/SettingsView";
import { DemoGuide } from "./DemoGuide";
import { InviteDialog } from "./InviteDialog";

const NAV = [
  { key: "workspace", label: "Workspace", icon: LayoutDashboard },
  { key: "agents", label: "Agents", icon: Bot },
  { key: "ripple", label: "Ripple", icon: Waves },
  { key: "checkpoints", label: "Checkpoints", icon: History },
  { key: "history", label: "History", icon: Activity },
];

// Old view names still open the right page (bookmarks, notifications, the demo guide).
const ALIAS: Record<string, string> = { preview: "workspace", graph: "history", swimlane: "history", timeline: "checkpoints", activity: "history" };

export function Workspace({ projectId, view: rawView }: { projectId: string; view: string }) {
  const view = ALIAS[rawView] ?? rawView;
  const router = useRouter();
  const { state, error, connected, presence, locks, cursors, drafts, act } = useProject(projectId);
  const [toasts, setToasts] = useState<{ id: number; msg: string; tone: "ok" | "err" }[]>([]);
  const [drawer, setDrawer] = useState<null | "notifications" | "mentions">(null);
  const [follow, setFollow] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
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

  const go = useCallback((v: string, query?: string) => router.push(`/p/${projectId}/${ALIAS[v] ?? v}${query ? `?${query}` : ""}`), [router, projectId]);

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
      if (k === "a") (e.preventDefault(), go("history"));
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
    () => (state ? { state, act, run, presence, locks, cursors, drafts, connected, go, view, toast } : null),
    [state, act, run, presence, locks, cursors, drafts, connected, go, view, toast],
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
  const unread = state.notifications.filter((n) => !n.readBy.includes(state.me.id)).length;

  return (
    <WorkspaceCtx.Provider value={ctx}>
      <div className="relative flex h-screen flex-col overflow-hidden">
        <CursorBackground />
        {/* ---------- Title bar + navigation ---------- */}
        <header className="relative z-30 min-w-0 shrink-0 border-b border-border/70 bg-surface-glass backdrop-blur-xl">
          <div className="flex h-14 items-center gap-3 px-4">
            <Link href="/" className="glow-btn flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" title="All projects"><BrandIcon size={17} /></Link>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 font-semibold tracking-tight">
                <span className="truncate">{state.project.name}</span>
                <StatusBadge status={state.project.phase} />
              </div>
              <div className="hidden truncate text-xs text-muted-foreground sm:block">{state.project.description}</div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <div className="mr-1 flex items-center -space-x-1.5">
                {state.members.map((m) => {
                  const p = presence.find((x) => x.userId === m.userId);
                  return (
                    <button key={m.userId} onClick={() => m.userId !== state.me.id && setFollow((f) => (f === m.userId ? null : m.userId))} title={`${m.name} (${m.title}) — ${online(m.userId) ? `online, on ${p?.view ?? "?"}` : "offline"}${m.userId !== state.me.id ? ". Click to follow." : ""}`} className={cn("rounded-full", follow === m.userId && "ring-2 ring-accent ring-offset-1 ring-offset-surface")}>
                      <Avatar name={m.name} color={m.color} online={online(m.userId)} ring />
                    </button>
                  );
                })}
                {state.agents.map((a) => (
                  <span key={a.id} title={`${a.name}: ${a.status}`} className="relative inline-flex h-7 w-7 items-center justify-center rounded-full text-white ring-2 ring-surface" style={{ background: agentColor(a.key) }}>
                    <Bot size={14} />
                    <span className={cn("absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-surface", a.status === "working" ? "bg-accent animate-pulse-soft" : a.status === "paused" ? "bg-amber-500" : "bg-emerald-500")} />
                  </span>
                ))}
              </div>
              {follow && <Badge tone="indigo">following {state.members.find((m) => m.userId === follow)?.name.split(" ")[0]}</Badge>}
              <Button size="sm" variant="ghost" title="Invite people" onClick={() => setSharing(true)}><Link2 size={14} /><span className="hidden md:inline">Invite</span></Button>
              <Button size="sm" variant="ghost" title="Settings" aria-current={view === "settings" ? "page" : undefined} onClick={() => go("settings")} className={cn(view === "settings" && "bg-muted text-foreground")}>
                <Settings size={14} /><span className="hidden md:inline">Settings</span>
              </Button>
              <IconBtn onClick={() => setDrawer((d) => (d ? null : "notifications"))} title="Notifications (Ctrl+Shift+N)" count={unread} countClass="bg-rose-500"><Bell size={17} /></IconBtn>
              <ThemeToggle />
              <Avatar name={state.me.name} color={state.me.color} />
            </div>
          </div>

          {/* Navigation: one quiet pill row that scrolls sideways on small screens. */}
          <div className="flex items-center gap-3 px-4 pb-2.5">
            <nav aria-label="Workspace views" className="scroll-thin -mx-1 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-1 py-0.5">
              {NAV.map((n) => {
                const viewers = presence.filter((p) => p.view === n.key && p.connections > 0 && p.userId !== state.me.id);
                const badge = n.key === "ripple" ? state.impacts.filter((i) => i.status === "pending" || i.status === "conflict").length : n.key === "agents" ? state.tasks.filter((t) => t.status === "running").length : 0;
                const active = view === n.key;
                return (
                  <button
                    key={n.key}
                    onClick={() => go(n.key)}
                    title={n.label}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex shrink-0 items-center gap-2 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
                      active ? "bg-accent/15 text-accent ring-1 ring-inset ring-accent/40" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <n.icon size={15} />
                    <span>{n.label}</span>
                    {viewers.map((v) => <span key={v.userId} className="h-2 w-2 rounded-full ring-1 ring-surface" style={{ background: v.color }} title={`${v.name} is here`} />)}
                    {badge > 0 && <span className={cn("rounded-full px-1.5 text-[10px] font-semibold", active ? "bg-accent text-accent-foreground" : "bg-accent-soft text-accent")}>{badge}</span>}
                  </button>
                );
              })}
            </nav>
            {state.project.isDemo && <Button size="sm" variant="ghost" className="hidden shrink-0 lg:inline-flex" onClick={() => setGuide((g) => !g)}><Sparkles size={13} /> {guide ? "Hide" : "Show"} guide</Button>}
          </div>
        </header>

        <div className="relative z-10 flex min-h-0 flex-1">
          <main ref={mainRef} onMouseMove={onMove} className="relative min-w-0 flex-1 overflow-y-auto p-4 scroll-thin lg:p-8">
            <div className="mx-auto mb-4 max-w-5xl empty:hidden"><ConflictAlerts /></div>
            {view === "workspace" && <WorkspaceView />}
            {view === "agents" && <AgentsView />}
            {view === "ripple" && <RippleView />}
            {view === "checkpoints" && <TimelineView />}
            {view === "history" && <ActivityView />}
            {view === "settings" && <SettingsView />}
            <CursorLayer />
          </main>
          <ChatDock />
        </div>
        {drawer && <NotificationDrawer mode={drawer} onClose={() => setDrawer(null)} />}
        <InviteDialog open={sharing} onClose={() => setSharing(false)} />
        {guide && state.project.isDemo && <DemoGuide onClose={() => setGuide(false)} />}

        <div className="pointer-events-none fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2">
          {toasts.map((t) => (
            <div key={t.id} className={cn("animate-in pointer-events-auto rounded-full px-4 py-2 text-sm font-medium shadow-lg", t.tone === "err" ? "bg-rose-600 text-white" : "bg-primary text-primary-foreground")}>{t.msg}</div>
          ))}
        </div>
      </div>
    </WorkspaceCtx.Provider>
  );
}

function IconBtn({ children, count = 0, countClass, className, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { count?: number; countClass?: string }) {
  return (
    <button {...rest} className={cn("relative rounded-full p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring", className)}>
      {children}
      {count > 0 && <span className={cn("absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white", countClass)}>{count}</span>}
    </button>
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
            <svg width="16" height="16" viewBox="0 0 16 16"><path d="M1 1l5 14 2-6 6-2z" fill={c.color} stroke="var(--background)" strokeWidth="1.25" /></svg>
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
      <div className="animate-in absolute right-3 top-24 w-[380px] max-w-[calc(100vw-24px)] rounded-2xl border border-border bg-surface shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
          <div className="font-semibold">Notifications</div>
          <Button size="sm" variant="ghost" onClick={() => run({ type: "mark_read" })}>Mark all read</Button>
        </div>
        <div className="flex flex-wrap gap-1 border-b border-slate-100 px-3 py-2">
          {["all", "important", "conflict", "completed", "waiting", "context", "mention"].map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={cn("rounded-md px-2 py-0.5 text-[11px] font-medium capitalize", filter === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>{f}</button>
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
