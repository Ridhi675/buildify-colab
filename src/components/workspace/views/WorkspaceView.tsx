"use client";

import { ArrowUp, Check, ChevronLeft, ChevronRight, Edit3, FileText, Lock, MessageSquare, Pencil, Plus, Sparkles, Wand2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { AppSpec, SpecComponent } from "@/lib/types";
import { AppRenderer } from "../../AppRenderer";
import { cn, timeAgo, type State } from "../../client";
import { agentColor, onGlowMove, OrbitLogo } from "../../effects";
import { Avatar, Badge, Button, Card, CardHeader, Empty, Field, inputCls, Modal, SourceBadge, StatusBadge, Tabs } from "../../ui";
import { Comments, useNames, useWs } from "../shared";

type Req = State["requirements"][number];

export function WorkspaceView() {
  const { state } = useWs();
  const current = state.versions.find((v) => v.id === state.project.currentArtifactVerId);
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <RequestPanel />
      <RequirementsBoard />
      {current ? <Canvas spec={current.spec as AppSpec} label={`Shared product · artifact v${current.number}`} changed={current.changedComponents} /> : (
        <Card className="p-5">
          <Empty icon={<FileText size={28} />} title="No shared artifact yet">Approve requirements, then generate and approve a preview in Preview Studio. The approved preview becomes artifact v1.</Empty>
        </Card>
      )}
    </div>
  );
}

function RequestPanel() {
  const { state, run } = useWs();
  const [text, setText] = useState("");
  const simplify = state.tasks.filter((t) => t.type === "simplify");
  const running = simplify.find((t) => t.status === "running" || t.status === "queued");
  const requests = [...new Set(state.requirements.map((r) => r.originalRequest).filter(Boolean))] as string[];
  const readOnly = state.me.role === "observer";
  const actors = [...state.members.map((m) => m.color), ...state.agents.map((a) => agentColor(a.key))];
  const submit = async () => {
    await run({ type: "submit_request", request: text }, "Sent to Bunty");
    setText("");
  };
  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-border bg-surface/80 px-5 pb-6 pt-10 shadow-md backdrop-blur-xl sm:px-10">
      {/* Soft backdrop: grid + slow colour drift, decorative only. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="aurora glow-1 -left-16 -top-24 h-72 w-72" />
        <div className="aurora glow-2 -right-10 -top-20 h-64 w-80" />
        <div className="absolute inset-0 overflow-hidden"><div className="bg-grid bg-grid-drift" /></div>
      </div>
      <div className="relative mx-auto flex max-w-2xl flex-col items-center text-center">
        <OrbitLogo colors={actors} size={92} />
        <h2 className="mt-6 text-3xl font-semibold tracking-[-0.035em] text-foreground sm:text-4xl">Describe the product</h2>
        <p className="mt-2 max-w-lg text-sm text-muted-foreground">Plain language is fine — Bunty turns it into structured, testable requirements you can edit or reject.</p>

        <div className="glow-card mt-7 w-full rounded-3xl border border-border bg-surface text-left shadow-md" onPointerMove={onGlowMove}>
          <textarea
            className="block min-h-[96px] w-full resize-none rounded-t-3xl bg-transparent px-5 pt-5 text-[15px] text-foreground outline-none placeholder:text-muted-foreground/70 disabled:cursor-not-allowed"
            placeholder="e.g. Build a healthcare app for elderly users. Make it easy to navigate and lightweight."
            aria-label="Describe the product"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && text.trim() && !readOnly) void submit();
            }}
            disabled={readOnly}
          />
          <div className="flex flex-wrap items-center gap-2 px-4 pb-4 pt-2">
            {state.project.isDemo && !requests.length && (
              <button
                type="button"
                onClick={() => setText("Build a healthcare appointment-booking app where patients pick a doctor and a time slot and get reminders. Desktop-first web app with a dark visual theme.")}
                className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-border-strong hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
              >
                Use demo request
              </button>
            )}
            {running && <Badge tone="indigo"><span className="animate-pulse-soft">●</span> Bunty: {running.phaseLabel}</Badge>}
            <Button variant="primary" className="ml-auto" disabled={!text.trim() || readOnly} onClick={submit}>
              <Wand2 size={15} /> Simplify with Bunty <ArrowUp size={15} />
            </Button>
          </div>
        </div>
        <div className="mt-3 text-[11px] text-muted-foreground">Ctrl/Cmd + Enter to send</div>
      </div>
    </section>
  );
}

function RequirementsBoard() {
  const { state, run, locks } = useWs();
  const [editing, setEditing] = useState<Req | null>(null);
  const [changing, setChanging] = useState<Req | null>(null);
  const [adding, setAdding] = useState(false);
  const proposed = state.requirements.filter((r) => r.status === "proposed");
  const approved = state.requirements.filter((r) => r.status === "approved");
  const requests = [...new Set(proposed.map((r) => r.originalRequest).filter(Boolean))] as string[];
  const readOnly = state.me.role === "observer";

  const openChange = async (r: Req) => {
    const res = (await run({ type: "lock", target: r.key })) as { ok: boolean; holder?: { name: string } } | null;
    if (res && !res.ok) {
      if (!confirm(`${res.holder?.name} is currently editing ${r.key}. Continue anyway? Your proposal will be version-checked so nothing is overwritten.`)) return;
    }
    setChanging(r);
  };

  return (
    <Card>
      <CardHeader
        icon={<FileText size={16} />}
        title="Requirements"
        subtitle={`${approved.length} approved · ${proposed.length} awaiting a human decision · context v${state.project.contextVersion}`}
        actions={!readOnly && <Button size="sm" onClick={() => setAdding(true)}><Plus size={13} /> Add</Button>}
      />
      {proposed.length > 0 && (
        <div className="border-b border-slate-100 bg-amber-50/40 p-4">
          <div className="mb-3 grid gap-4 lg:grid-cols-[1fr_2fr]">
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Original request</div>
              {requests.map((q, i) => <blockquote key={i} className="rounded-lg border-l-4 border-indigo-300 bg-surface p-3 text-sm italic text-slate-700">“{q}”</blockquote>)}
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Bunty's interpretation</span>
                {!readOnly && <Button size="sm" variant="success" onClick={() => run({ type: "decide_requirements", keys: proposed.map((r) => r.key), decision: "approve" }, "Requirements approved")}><Check size={12} /> Approve all</Button>}
              </div>
              <div className="space-y-2">
                {proposed.map((r) => (
                  <ReqRow key={r.id} r={r}>
                    {!readOnly && (
                      <>
                        <Button size="sm" variant="success" onClick={() => run({ type: "decide_requirements", keys: [r.key], decision: "approve" })}><Check size={12} /></Button>
                        <Button size="sm" onClick={() => setEditing(r)}><Pencil size={12} /></Button>
                        <Button size="sm" variant="danger" onClick={() => run({ type: "decide_requirements", keys: [r.key], decision: "reject" })}><X size={12} /></Button>
                      </>
                    )}
                  </ReqRow>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="space-y-2 p-4">
        {approved.length === 0 && !proposed.length && <Empty title="No requirements yet">Describe the product above to get started.</Empty>}
        {approved.length > 0 && (
          <ReqCarousel count={approved.length}>
            {approved.map((r) => {
              const lock = locks.find((l) => l.target === r.key && l.userId !== state.me.id);
              return (
                <div key={r.id} data-card className="w-[min(82vw,340px)] shrink-0 snap-start">
                  <ReqRow r={r} lock={lock?.name} card>
                    {!readOnly && <Button size="sm" onClick={() => openChange(r)}><Edit3 size={12} /> Propose change</Button>}
                  </ReqRow>
                </div>
              );
            })}
          </ReqCarousel>
        )}
        {state.requirements.some((r) => r.status === "rejected") && (
          <div className="pt-2 text-xs text-slate-400">Rejected: {state.requirements.filter((r) => r.status === "rejected").map((r) => `${r.key} ${r.title}`).join(" · ")}</div>
        )}
      </div>
      <EditProposed r={editing} onClose={() => setEditing(null)} />
      <ProposeChange r={changing} onClose={() => { if (changing) void run({ type: "lock", target: changing.key, release: true }); setChanging(null); }} />
      <AddRequirement open={adding} onClose={() => setAdding(false)} />
    </Card>
  );
}

function ReqRow({ r, children, lock, card }: { r: Req; children?: React.ReactNode; lock?: string; card?: boolean }) {
  const name = useNames();
  const [open, setOpen] = useState(false);
  const author = name(r.authorId);
  return (
    <div className={cn("rounded-lg border bg-surface p-3", card && "flex h-full flex-col rounded-2xl p-4", lock ? "border-rose-300" : "border-slate-200")}>
      <div className={cn("flex items-start gap-3", card && "flex-1 flex-col gap-2")}>
        <span className="mt-0.5 font-mono text-[11px] text-slate-400">{r.key}</span>
        <button className="min-w-0 flex-1 text-left" onClick={() => setOpen((o) => !o)}>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-medium text-slate-900">{r.title}</span>
            <Badge tone={r.priority === "must" ? "rose" : r.priority === "high" ? "amber" : "slate"}>{r.priority}</Badge>
            <Badge>{r.category}</Badge>
            <Badge tone="indigo">v{r.version}</Badge>
            {r.status !== "approved" && <StatusBadge status={r.status} />}
          </div>
          <div className="mt-0.5 text-sm text-slate-600">{r.description}</div>
        </button>
        <div className={cn("flex shrink-0 gap-1", card && "mt-auto pt-1")}>{children}</div>
      </div>
      {lock && <div className="mt-2 flex items-center gap-1.5 text-xs font-medium text-rose-700"><Lock size={12} /> {lock} is currently editing {r.key}</div>}
      {open && (
        <div className={cn("mt-3 grid gap-3 border-t border-slate-100 pt-3 text-xs", !card && "sm:grid-cols-2")}>
          <div>
            <div className="mb-1 font-semibold text-slate-500">Acceptance criteria</div>
            <ul className="list-disc space-y-0.5 pl-4 text-slate-700">{r.acceptanceCriteria.map((a, i) => <li key={i}>{a}</li>)}</ul>
          </div>
          <div className="space-y-1 text-slate-600">
            <div><b>Author:</b> {author.name} {r.source === "reviewer" && <Badge tone="violet">AI interpretation</Badge>}</div>
            <div><b>Created:</b> {new Date(r.createdAt).toLocaleString()}</div>
            <div><b>Affected components:</b> {r.components.join(", ") || "—"}</div>
            <div><b>History:</b> {r.revisions.map((v) => `v${v.version} (${v.status}${v.reason ? `: ${v.reason}` : ""})`).join(" → ") || "—"}</div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Horizontal row of requirement cards. Left/right arrow keys and the mouse
 * wheel move along the row; up/down arrows are left alone so the page scrolls.
 * At either end the wheel hands scrolling back to the page.
 */
function ReqCarousel({ count, children }: { count: number; children: React.ReactNode }) {
  const row = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ start: true, end: false });

  const step = () => {
    const card = row.current?.querySelector<HTMLElement>("[data-card]");
    return card ? card.offsetWidth + 12 : 320;
  };
  const by = (dir: 1 | -1) => row.current?.scrollBy({ left: dir * step(), behavior: "smooth" });

  useEffect(() => {
    const el = row.current;
    if (!el) return;
    const update = () => setEdge({ start: el.scrollLeft <= 2, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2 });
    const wheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const atStart = el.scrollLeft <= 0 && e.deltaY < 0;
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1 && e.deltaY > 0;
      if (atStart || atEnd) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    el.addEventListener("wheel", wheel, { passive: false });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      el.removeEventListener("wheel", wheel);
      window.removeEventListener("resize", update);
    };
  }, [count]);

  return (
    <div className="relative">
      <div className="mb-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{count} approved · use ← → or scroll to move along</span>
        <span className="flex gap-1">
          <Button size="sm" variant="ghost" aria-label="Previous requirements" disabled={edge.start} onClick={() => by(-1)}><ChevronLeft size={14} /></Button>
          <Button size="sm" variant="ghost" aria-label="Next requirements" disabled={edge.end} onClick={() => by(1)}><ChevronRight size={14} /></Button>
        </span>
      </div>
      <div
        ref={row}
        role="region"
        aria-label="Approved requirements"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget && (e.target as HTMLElement).closest("input, textarea, select, [contenteditable]")) return;
          if (e.key === "ArrowRight") (e.preventDefault(), by(1));
          if (e.key === "ArrowLeft") (e.preventDefault(), by(-1));
        }}
        className="scroll-thin -mx-1 flex snap-x snap-mandatory items-stretch gap-3 overflow-x-auto px-1 pb-3 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
      >
        {children}
      </div>
    </div>
  );
}

function EditProposed({ r, onClose }: { r: Req | null; onClose: () => void }) {
  const { act, toast } = useWs();
  const [f, setF] = useState({ title: "", description: "", priority: "medium" });
  const [err, setErr] = useState<string | null>(null);
  const [base, setBase] = useState(0);
  const [loaded, setLoaded] = useState<string | null>(null);
  if (r && loaded !== r.id) {
    setLoaded(r.id);
    setF({ title: r.title, description: r.description, priority: r.priority });
    setBase(r.version);
    setErr(null);
  }
  return (
    <Modal open={!!r} onClose={() => (setLoaded(null), onClose())} title={`Edit interpretation ${r?.key ?? ""}`}>
      <div className="space-y-3">
        {err && <div className="rounded-lg bg-rose-50 p-2.5 text-xs text-rose-800">{err}</div>}
        <Field label="Title"><input className={inputCls} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Description"><textarea className={inputCls} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Field label="Priority">
          <select className={inputCls} value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>{["must", "high", "medium", "low"].map((p) => <option key={p}>{p}</option>)}</select>
        </Field>
        <div className="flex justify-end gap-2">
          <Button onClick={() => (setLoaded(null), onClose())}>Cancel</Button>
          <Button variant="primary" onClick={async () => {
            try {
              await act({ type: "edit_proposed", key: r!.key, expectedVersion: base, ...f });
              toast("Saved");
              setLoaded(null);
              onClose();
            } catch (e) {
              const cur = (e as { data?: { current?: { version: number } } }).data?.current;
              setErr((e as Error).message);
              if (cur) setBase(cur.version); // your text is kept; saving again is a deliberate overwrite
            }
          }}>Save</Button>
        </div>
      </div>
    </Modal>
  );
}

function ProposeChange({ r, onClose }: { r: Req | null; onClose: () => void }) {
  const { run, go } = useWs();
  const [f, setF] = useState({ title: "", description: "", reason: "" });
  const [loaded, setLoaded] = useState<string | null>(null);
  if (r && loaded !== r.id) {
    setLoaded(r.id);
    setF({ title: r.title, description: r.description, reason: "" });
  }
  const close = () => (setLoaded(null), onClose());
  return (
    <Modal open={!!r} onClose={close} title={`Propose a change to ${r?.key ?? ""}`}>
      <div className="space-y-3">
        <div className="rounded-lg bg-slate-50 p-2.5 text-xs text-slate-600">Current (v{r?.version}): <b>{r?.title}</b> — {r?.description}</div>
        <Field label="New title"><input className={inputCls} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="New description"><textarea className={inputCls} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Field label="Why?" hint="Shown to everyone in the decision log."><input className={inputCls} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
        {r?.category === "audience" && (
          <Button size="sm" variant="ghost" onClick={() => setF({ title: "Elderly patients on mobile phones", description: "Elderly patients (65+) booking on their phones: mobile-first, large readable text, high contrast, simple navigation", reason: "Our pilot clinic's patients are mostly seniors using phones" })}>Fill demo change (elderly, mobile-first)</Button>
        )}
        <div className="flex justify-end gap-2">
          <Button onClick={close}>Cancel</Button>
          <Button variant="primary" disabled={!f.reason.trim() || !f.title.trim()} onClick={async () => {
            const res = (await run({ type: "propose_change", key: r!.key, baseVersion: r!.version, ...f })) as { impactId: string; conflict: boolean } | null;
            if (res) {
              close();
              go("ripple", `impact=${res.impactId}`);
            }
          }}>Analyze impact</Button>
        </div>
      </div>
    </Modal>
  );
}

function AddRequirement({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { run } = useWs();
  const [f, setF] = useState({ title: "", description: "", category: "feature", priority: "medium" });
  return (
    <Modal open={open} onClose={onClose} title="Add requirement">
      <div className="space-y-3">
        <Field label="Title"><input className={inputCls} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Description"><textarea className={inputCls} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category"><select className={inputCls} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{["audience", "layout", "theme", "accessibility", "feature", "performance", "data"].map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Priority"><select className={inputCls} value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>{["must", "high", "medium", "low"].map((c) => <option key={c}>{c}</option>)}</select></Field>
        </div>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!f.title || !f.description} onClick={async () => { await run({ type: "add_requirement", ...f }, "Proposed — needs approval"); onClose(); }}>Propose</Button>
        </div>
      </div>
    </Modal>
  );
}

export function Canvas({ spec, label, changed = [] }: { spec: AppSpec; label: string; changed?: string[] }) {
  const { state, locks, run } = useWs();
  const [device, setDevice] = useState<"auto" | "mobile" | "desktop">("auto");
  const [sel, setSel] = useState<SpecComponent | null>(null);
  const counts: Record<string, number> = {};
  for (const c of state.comments) if (c.targetType === "component") counts[c.targetId] = (counts[c.targetId] ?? 0) + 1;
  const highlights = [
    ...changed.filter((k) => k !== "initial version").map((k) => ({ key: k, tone: "changed" as const })),
    ...locks.filter((l) => l.userId !== state.me.id).map((l) => ({ key: l.target, tone: "editing" as const, label: `${l.name.split(" ")[0]} editing` })),
    ...(sel ? [{ key: sel.key, tone: "selected" as const }] : []),
  ];
  const linked = sel ? state.requirements.filter((r) => r.status === "approved" && (sel.requirementKeys.includes(r.key) || r.components.includes(sel.key))) : [];
  const comp = sel ? state.components.find((c) => c.key === sel.key) : null;
  return (
    <Card>
      <CardHeader
        icon={<MessageSquare size={16} />}
        title={label}
        subtitle="Click any component to inspect it, see which requirements drive it, and comment. Amber outline = changed in this version."
        actions={<Tabs value={device} onChange={setDevice} items={[{ value: "auto", label: "Auto" }, { value: "mobile", label: "Mobile" }, { value: "desktop", label: "Desktop" }]} />}
      />
      <div className="grid gap-4 p-4 lg:grid-cols-[1fr_280px]">
        <div className="rounded-xl bg-slate-100 p-4">
          <AppRenderer spec={spec} device={device} highlights={highlights} commentCounts={counts} onSelect={(c) => { setSel(c); void run({ type: "presence", view: "workspace", focus: c.key }); }} />
        </div>
        <div className="space-y-3">
          {!sel ? (
            <div className="rounded-xl border border-dashed border-slate-200 p-4 text-xs text-slate-500">Select a component in the prototype.</div>
          ) : (
            <div className="space-y-3 rounded-xl border border-slate-200 p-3">
              <div>
                <div className="font-semibold">{sel.title}</div>
                <div className="font-mono text-[11px] text-slate-400">{sel.key}{comp ? ` · ${comp.category}` : ""}</div>
              </div>
              <div className="text-xs text-slate-600">{comp?.description ?? sel.body}</div>
              <div>
                <div className="mb-1 text-[11px] font-semibold uppercase text-slate-500">Driven by</div>
                {linked.length ? linked.map((r) => <div key={r.key} className="text-xs"><span className="font-mono text-slate-400">{r.key}</span> {r.title}</div>) : <div className="text-xs text-slate-400">No linked requirement</div>}
              </div>
              <div>
                <div className="mb-1 text-[11px] font-semibold uppercase text-slate-500">Comments</div>
                <Comments targetType="component" targetId={sel.key} />
              </div>
            </div>
          )}
          <PeopleHere />
        </div>
      </div>
    </Card>
  );
}

function PeopleHere() {
  const { presence, state } = useWs();
  const others = presence.filter((p) => p.userId !== state.me.id && p.connections > 0);
  if (!others.length) return <div className="text-[11px] text-slate-400">Only you are here. Open another tab as the other human to collaborate live.</div>;
  return (
    <div className="space-y-1">
      {others.map((p) => (
        <div key={p.userId} className="flex items-center gap-2 text-xs text-slate-600">
          <Avatar name={p.name} color={p.color} size={18} online />
          <span>{p.name.split(" ")[0]} is on <b>{p.view}</b>{p.focus ? <> · looking at <span className="font-mono">{p.focus}</span></> : null} <span className="text-slate-400">{timeAgo(new Date(p.lastSeen))}</span></span>
        </div>
      ))}
    </div>
  );
}

