"use client";

import { AlertTriangle, Bot, CheckCircle2, Code2, Database, GitBranch, Palette, TestTube2, Waves } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { ImpactResult } from "@/lib/types";
import { cn, timeAgo, type State } from "../../client";
import { Badge, Button, Card, CardHeader, Empty, Field, inputCls, Modal, StatusBadge } from "../../ui";
import { ContextGraph } from "../ContextGraph";
import { ApprovalCard, useNames, useWs } from "../shared";

type Impact = State["impacts"][number];

export function RippleView() {
  const { state } = useWs();
  const params = useSearchParams();
  const [sel, setSel] = useState<string | null>(params.get("impact"));
  useEffect(() => setSel(params.get("impact")), [params]);
  const impact = state.impacts.find((i) => i.id === sel) ?? state.impacts[0];

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <Card>
        <CardHeader icon={<Waves size={16} />} title="Ripple Effect — impact analysis" subtitle="When a requirement changes, see everything it touches before anything is committed. Deterministic dependency checks first; AI suggestions are labelled “inferred”." />
        <div className="flex flex-wrap gap-2 p-3">
          {state.impacts.map((i) => (
            <button key={i.id} onClick={() => setSel(i.id)} className={cn("flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs", impact?.id === i.id ? "border-indigo-400 bg-indigo-50" : "border-slate-200 bg-white")}>
              <span className="font-mono">{i.requirementKey}</span> {i.proposedTitle.slice(0, 32)} <StatusBadge status={i.status} />
            </button>
          ))}
          {!state.impacts.length && <span className="text-xs text-slate-500">No change proposals yet. Use “Propose change” on an approved requirement in the Workspace.</span>}
        </div>
      </Card>
      {impact ? <ImpactPanel impact={impact} /> : <Card className="p-5"><Empty icon={<Waves size={28} />} title="Nothing has rippled yet">Propose a change to an approved requirement to see its ripple effect here.</Empty></Card>}
    </div>
  );
}

const CAT = [
  { key: "frontend", label: "Frontend", icon: Code2 },
  { key: "design", label: "Design", icon: Palette },
  { key: "backend", label: "Backend", icon: Database },
  { key: "testing", label: "Testing", icon: TestTube2 },
] as const;

function ImpactPanel({ impact }: { impact: Impact }) {
  const { state, run, go } = useWs();
  const name = useNames();
  const r = impact.result as ImpactResult & { baseVersion?: number; reason?: string };
  const [modify, setModify] = useState(false);
  const [showGraph, setShowGraph] = useState(true);
  const approval = state.approvals.find((a) => a.kind === "change" && (a.payload as { impactId?: string }).impactId === impact.id);
  const readOnly = state.me.role === "observer";
  const highlight = useMemo(() => new Set([...r.affectedRequirements.map((x) => `req:${x.key}`), ...r.affectedComponents.map((c) => `comp:${c.key}`), ...r.staleTasks.map((t) => `task:${t.id}`)]), [r]);

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          <div className="space-y-4 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="indigo" className="font-mono">{impact.requirementKey}</Badge>
              <StatusBadge status={impact.status} />
              <Badge tone={impact.severity === "high" ? "rose" : impact.severity === "medium" ? "amber" : "emerald"}>{impact.severity} impact</Badge>
              <Badge tone={r.confidence === "high" ? "emerald" : r.confidence === "medium" ? "amber" : "rose"} title="How much of the impact is explained by explicit dependencies">{r.confidence} confidence</Badge>
              <span className="text-xs text-slate-500">by {name(impact.createdById).name} · {timeAgo(impact.createdAt)} · based on context v{impact.baseContextVersion}</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-[11px] font-semibold uppercase text-slate-500">Previous requirement</div>
                <div className="mt-1 text-sm text-slate-700 line-through decoration-rose-400/60">{impact.previousText}</div>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <div className="text-[11px] font-semibold uppercase text-emerald-700">Proposed requirement</div>
                <div className="mt-1 text-sm font-medium text-emerald-900">{impact.proposedText}</div>
              </div>
            </div>
            {r.reason && <div className="text-sm text-slate-600"><b>Why:</b> {r.reason}</div>}
            {impact.status === "conflict" && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
                <AlertTriangle size={16} /> This proposal was made against an older version of {impact.requirementKey}. It was preserved, not applied.
                {!readOnly && (
                  <span className="ml-auto flex gap-1.5">
                    <Button size="sm" variant="primary" onClick={() => run({ type: "rebase_change", impactId: impact.id }, "Re-analyzed against the latest version")}>Rebase onto latest</Button>
                    <Button size="sm" onClick={() => run({ type: "discard_change", impactId: impact.id }, "Discarded")}>Discard</Button>
                  </span>
                )}
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {CAT.map((c) => {
                const items = r.categories[c.key];
                return (
                  <div key={c.key} className={cn("rounded-xl border p-3", items.length ? "border-amber-200 bg-amber-50/60" : "border-slate-200")}>
                    <div className="flex items-center gap-1.5 text-xs font-semibold"><c.icon size={14} /> {c.label}</div>
                    {items.length ? <ul className="mt-1.5 space-y-0.5 text-xs text-slate-700">{items.map((x) => <li key={x}>• {x}</li>)}</ul> : <div className="mt-1.5 flex items-center gap-1 text-xs text-emerald-700"><CheckCircle2 size={12} /> No change needed</div>}
                  </div>
                );
              })}
              <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold"><Bot size={14} /> AI Agents</div>
                <ul className="mt-1.5 space-y-1 text-xs text-slate-700">{r.agents.map((a) => <li key={a.key}><b className="capitalize">{a.key}:</b> {a.effect}</li>)}</ul>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <div className="mb-1 text-[11px] font-semibold uppercase text-slate-500">Affected components ({r.affectedComponents.length})</div>
                <ul className="space-y-1 text-xs">
                  {r.affectedComponents.map((c) => <li key={c.key} className="flex gap-1.5"><Badge>{c.category}</Badge><span><b>{c.name}</b> <span className="text-slate-500">— {c.reason}</span></span></li>)}
                </ul>
              </div>
              <div className="space-y-3">
                <div>
                  <div className="mb-1 text-[11px] font-semibold uppercase text-slate-500">Unaffected — preserved ({r.unaffectedComponents.length})</div>
                  <div className="flex flex-wrap gap-1">{r.unaffectedComponents.map((c) => <Badge key={c.key} tone="emerald">{c.name}</Badge>)}</div>
                </div>
                <div>
                  <div className="mb-1 text-[11px] font-semibold uppercase text-slate-500">Outdated / stale tasks ({r.staleTasks.length})</div>
                  {r.staleTasks.length ? r.staleTasks.map((t) => <div key={t.id} className="text-xs text-rose-800">⚠ {t.title} <span className="text-slate-500">({t.agentKey}, {t.status})</span></div>) : <div className="text-xs text-slate-500">None in flight.</div>}
                </div>
                <div className="text-sm"><b>Estimated effort:</b> ≈ {r.effortHours} hours <span className="text-xs text-slate-500">(heuristic per component category)</span></div>
              </div>
            </div>

            {r.specDiff?.length > 0 && (
              <div>
                <div className="mb-1 text-[11px] font-semibold uppercase text-slate-500">What users will notice (simulated rebuild)</div>
                <div className="grid gap-1 sm:grid-cols-2">{r.specDiff.map((d, i) => <div key={i} className="rounded bg-slate-50 px-2 py-1 text-xs">{d}</div>)}</div>
              </div>
            )}

            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase text-slate-500">Proposed update plan</div>
              <ol className="list-decimal space-y-0.5 pl-5 text-sm text-slate-700">{r.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
            </div>

            <div className="rounded-xl border border-dashed border-violet-300 bg-violet-50/40 p-3">
              <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase text-violet-700"><Bot size={13} /> Inferred by Reviewer AI (not from dependency data)</div>
              {r.inferred?.length ? <ul className="space-y-0.5 text-xs text-slate-700">{r.inferred.map((x, i) => <li key={i}><Badge tone="violet">inferred</Badge> <b>{x.area}:</b> {x.note}</li>)}</ul> : <div className="text-xs text-slate-500">Reviewer is still looking, or found nothing to add.</div>}
            </div>

            <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
              {!readOnly && impact.status === "pending" && <Button onClick={() => setModify(true)}>Modify requirement</Button>}
              <Button variant="ghost" onClick={() => go("agents")}>Inspect affected tasks →</Button>
              <Button variant="ghost" onClick={() => setShowGraph((g) => !g)}><GitBranch size={14} /> {showGraph ? "Hide" : "View"} dependency graph</Button>
            </div>
          </div>
        </Card>
        <div className="space-y-4">
          {approval ? <ApprovalCard a={approval} /> : <Card className="p-4 text-xs text-slate-500">No approval request for this analysis.</Card>}
          <Card className="p-4 text-xs leading-relaxed text-slate-600">
            <b>How this is computed.</b> 1) Requirement dependencies are walked from {impact.requirementKey}. 2) Requirement→component links and component dependencies are walked. 3) The rules engine rebuilds the preview with the proposed text and diffs it. Only what the AI adds is marked inferred. Nothing changes until the required humans approve.
          </Card>
        </div>
      </div>
      {showGraph && (
        <Card>
          <CardHeader title="Dependency graph" subtitle="Highlighted: affected requirements, components and stale tasks. Faded: unaffected." />
          <div className="p-3"><ContextGraph state={state} highlight={highlight} dim height={480} opts={{ decisions: false }} /></div>
        </Card>
      )}
      <ModifyModal open={modify} onClose={() => setModify(false)} impact={impact} />
    </div>
  );
}

function ModifyModal({ open, onClose, impact }: { open: boolean; onClose: () => void; impact: Impact }) {
  const { state, run } = useWs();
  const req = state.requirements.find((r) => r.key === impact.requirementKey);
  const desc = impact.proposedText.split(" — ").slice(1).join(" — ");
  const [f, setF] = useState({ title: impact.proposedTitle, description: desc, reason: (impact.result as { reason?: string }).reason ?? "" });
  return (
    <Modal open={open} onClose={onClose} title={`Modify proposed change to ${impact.requirementKey}`}>
      <div className="space-y-3">
        <Field label="Title"><input className={inputCls} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Description"><textarea className={inputCls} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Field label="Reason"><input className={inputCls} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={async () => { await run({ type: "propose_change", key: impact.requirementKey, baseVersion: req?.version, replaces: impact.id, ...f }, "Re-analyzed"); onClose(); }}>Re-analyze</Button>
        </div>
      </div>
    </Modal>
  );
}
