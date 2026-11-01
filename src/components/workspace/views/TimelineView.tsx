"use client";

import { ArrowRight, Flag, GitCompare, History, RotateCcw, Save } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { AppSpec, ReqLite } from "@/lib/types";
import { AppRenderer } from "../../AppRenderer";
import { cn, timeAgo, type State } from "../../client";
import { Avatar, Badge, Button, Card, CardHeader, Empty, Field, inputCls, Modal, StatusBadge, Tabs } from "../../ui";
import { useNames, useWs } from "../shared";

type Version = State["versions"][number];
type Decision = State["decisions"][number];
interface Diff {
  spec: { kind: string; area: string; detail: string }[];
  requirements: { kind: string; key: string; detail: string }[];
  decisions?: { id: string; title: string; reason: string; proposedById: string; approvedByIds: string[]; createdAt: string }[];
  staleTasks?: number;
}

export function TimelineView() {
  const { state } = useWs();
  const params = useSearchParams();
  const [mode, setMode] = useState<"inspect" | "compare" | "restore">((params.get("mode") as "compare") ?? "inspect");
  useEffect(() => setMode((params.get("mode") as "compare") ?? "inspect"), [params]);
  const [selId, setSelId] = useState<string | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const versions = state.versions;
  const sel = versions.find((v) => v.id === selId) ?? versions.find((v) => v.id === state.project.currentArtifactVerId) ?? versions[versions.length - 1];

  if (!versions.length && !state.decisions.length)
    return <div className="mx-auto max-w-6xl"><Card className="p-5"><Empty icon={<History size={28} />} title="No decisions yet">Approved decisions and artifact versions will appear here as a navigable timeline.</Empty></Card></div>;

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <Card>
        <CardHeader icon={<History size={16} />} title="Versions and decisions" subtitle="Every significant approved decision, the exact saved prototype for each version, and safe restore that never erases history." actions={<Tabs value={mode} onChange={setMode} items={[{ value: "inspect", label: "Inspect" }, { value: "compare", label: "Compare" }, { value: "restore", label: "Restore" }]} />} />
        <div className="flex gap-3 overflow-x-auto p-4 scroll-thin">
          {versions.map((v, i) => (
            <div key={v.id} className="flex items-center gap-3">
              <button onClick={() => setSelId(v.id)} className={cn("w-56 shrink-0 rounded-xl border p-3 text-left transition", sel?.id === v.id ? "border-indigo-400 bg-indigo-50 shadow-sm" : "border-slate-200 bg-surface hover:border-slate-300")}>
                <div className="flex items-center justify-between">
                  <span className="text-lg font-bold">v{v.number}</span>
                  {v.id === state.project.currentArtifactVerId ? <Badge tone="emerald">current</Badge> : <Badge>historical</Badge>}
                </div>
                <div className="mt-1 line-clamp-2 text-xs font-medium text-slate-800">{v.label}</div>
                <div className="mt-1 text-[11px] text-slate-500">{timeAgo(v.createdAt)}</div>
                {v.derivedFromId && <div className="text-[11px] text-violet-700">derived from v{versions.find((x) => x.id === v.derivedFromId)?.number}</div>}
              </button>
              {i < versions.length - 1 && <ArrowRight size={16} className="shrink-0 text-slate-300" />}
            </div>
          ))}
        </div>
      </Card>

      {mode === "compare" ? <Compare versions={versions} /> : (
        <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
          <DecisionList onOpen={setDecision} />
          {sel ? <VersionView v={sel} restoreMode={mode === "restore"} /> : <Card className="p-5 text-sm text-slate-500">No artifact versions yet.</Card>}
        </div>
      )}
      <Checkpoints />
      <DecisionModal d={decision} onClose={() => setDecision(null)} />
    </div>
  );
}

function DecisionList({ onOpen }: { onOpen: (d: Decision) => void }) {
  const { state } = useWs();
  const name = useNames();
  return (
    <Card>
      <CardHeader title="Decisions" subtitle="Click a decision for the full explanation" />
      <ol className="max-h-[640px] space-y-0 overflow-y-auto p-4 scroll-thin">
        {[...state.decisions].reverse().map((d) => {
          const v = state.versions.find((x) => x.decisionId === d.id);
          return (
            <li key={d.id} className="relative border-l-2 border-slate-200 pb-4 pl-4 last:pb-0">
              <span className={cn("absolute -left-[7px] top-1 h-3 w-3 rounded-full ring-2 ring-surface", d.kind === "change" ? "bg-amber-500" : d.kind === "restore" ? "bg-violet-500" : d.kind === "release" ? "bg-emerald-600" : "bg-indigo-500")} />
              <button onClick={() => onOpen(d)} className="w-full text-left">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium text-slate-900">{d.title}</span>
                  <Badge>{d.kind}</Badge>
                  {v && <Badge tone="emerald">→ v{v.number}</Badge>}
                  
                </div>
                <div className="mt-0.5 text-xs text-slate-600">{d.reason}</div>
                <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500">
                  <Avatar name={name(d.proposedById).name} color={name(d.proposedById).color} size={16} /> {name(d.proposedById).name}
                  <span>· approved by {d.approvedByIds.map((x) => name(x).name.split(" ")[0]).join(" & ") || "—"}</span>
                  <span>· {new Date(d.createdAt).toLocaleString()}</span>
                </div>
              </button>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

function VersionView({ v, restoreMode }: { v: Version; restoreMode: boolean }) {
  const { state } = useWs();
  const [restore, setRestore] = useState(false);
  const reqs = v.requirementsSnapshot as ReqLite[];
  const isCurrent = v.id === state.project.currentArtifactVerId;
  return (
    <Card>
      <CardHeader
        title={<span>Artifact v{v.number} — {v.label}</span>}
        subtitle={isCurrent ? "This is the current version." : `Historical snapshot saved ${new Date(v.createdAt).toLocaleString()} (context v${v.contextVersion}). Rendered from its own saved spec, not the latest.`}
        actions={!isCurrent && state.me.role !== "observer" && <Button size="sm" variant={restoreMode ? "primary" : "secondary"} onClick={() => setRestore(true)}><RotateCcw size={12} /> Restore this version</Button>}
      />
      <div className="space-y-4 p-4">
        {v.changedComponents.length > 0 && <div className="flex flex-wrap gap-1 text-xs">Changed in this version: {v.changedComponents.map((c) => <Badge key={c} tone="amber">{c}</Badge>)}</div>}
        <div className="rounded-xl bg-slate-100 p-3"><AppRenderer spec={v.spec as AppSpec} highlights={v.changedComponents.map((k) => ({ key: k, tone: "changed" as const }))} /></div>
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase text-slate-500">Saved requirements ({reqs.length})</div>
          <div className="space-y-0.5 text-xs">{reqs.map((r) => <div key={r.key}><span className="font-mono text-slate-400">{r.key} v{r.version}</span> {r.title}</div>)}</div>
        </div>
      </div>
      <RestoreModal open={restore} onClose={() => setRestore(false)} target={{ artifactVersionId: v.id }} label={`v${v.number}`} />
    </Card>
  );
}

function Compare({ versions }: { versions: Version[] }) {
  const { state, act, toast, go } = useWs();
  const name = useNames();
  const [a, setA] = useState(versions[versions.length - 2]?.id ?? "");
  const [b, setB] = useState(versions[versions.length - 1]?.id ?? "");
  const [diff, setDiff] = useState<Diff | null>(null);
  const va = versions.find((v) => v.id === a);
  const vb = versions.find((v) => v.id === b);
  // Versions can arrive after this opens (a build gets approved): fill in any empty pick.
  useEffect(() => {
    if (versions.length < 2) return;
    if (!versions.some((v) => v.id === a)) setA(versions[versions.length - 2].id);
    if (!versions.some((v) => v.id === b)) setB(versions[versions.length - 1].id);
  }, [versions, a, b]);
  useEffect(() => {
    if (!a || !b || a === b) return setDiff(null);
    act<Diff>({ type: "compare", a, b }).then(setDiff).catch((e) => toast(e.message, "err"));
  }, [a, b, act, toast]);
  const tone = (k: string) => (k === "added" ? "bg-emerald-50 text-emerald-900" : k === "removed" ? "bg-rose-50 text-rose-900" : "bg-amber-50 text-amber-900");

  if (versions.length < 2)
    return (
      <Card>
        <CardHeader icon={<GitCompare size={16} />} title="Compare versions" />
        <div className="p-5">
          <Empty icon={<GitCompare size={28} />} title={versions.length ? "Only one version so far" : "No versions to compare yet"}>
            A version is saved each time a build is approved, and you need two to compare. {versions.length ? "You have v1." : "This project has none yet."}
            {state.previews.length > 1 && (
              <span className="mt-3 block">
                <Button size="sm" variant="primary" onClick={() => go("workspace")}><GitCompare size={13} /> Compare your {state.previews.length} previews instead</Button>
              </span>
            )}
          </Empty>
        </div>
      </Card>
    );

  return (
    <Card>
      <CardHeader icon={<GitCompare size={16} />} title="Compare versions" actions={
        <div className="flex items-center gap-2">
          <select className={cn(inputCls, "w-40 py-1 text-xs")} value={a} onChange={(e) => setA(e.target.value)}>{versions.map((v) => <option key={v.id} value={v.id}>v{v.number} — {v.label.slice(0, 20)}</option>)}</select>
          <ArrowRight size={14} />
          <select className={cn(inputCls, "w-40 py-1 text-xs")} value={b} onChange={(e) => setB(e.target.value)}>{versions.map((v) => <option key={v.id} value={v.id}>v{v.number} — {v.label.slice(0, 20)}</option>)}</select>
        </div>
      } />
      {va && vb && (
        <div className="space-y-5 p-4">
          <div className="grid gap-4 md:grid-cols-2">
            {[va, vb].map((v) => (
              <div key={v.id}>
                <div className="mb-1 text-xs font-semibold">v{v.number} · {v.label}</div>
                <div className="rounded-xl bg-slate-100 p-3"><AppRenderer spec={v.spec as AppSpec} device="mobile" highlights={v === vb ? v.changedComponents.map((k) => ({ key: k, tone: "changed" as const })) : []} /></div>
              </div>
            ))}
          </div>
          {diff && (
            <div className="grid gap-4 lg:grid-cols-3">
              <div>
                <div className="mb-1 text-[11px] font-semibold uppercase text-slate-500">Visual & component differences</div>
                <div className="space-y-1">{diff.spec.map((d, i) => <div key={i} className={cn("rounded px-2 py-1 text-xs", tone(d.kind))}><b>{d.kind === "added" ? "Added" : d.kind === "removed" ? "Removed" : "Changed"}</b> · {d.detail}</div>)}{!diff.spec.length && <div className="text-xs text-slate-500">No visual differences.</div>}</div>
              </div>
              <div>
                <div className="mb-1 text-[11px] font-semibold uppercase text-slate-500">Requirement differences</div>
                <div className="space-y-1">{diff.requirements.map((d, i) => <div key={i} className={cn("rounded px-2 py-1 text-xs", tone(d.kind))}><b>{d.key}</b> {d.kind}: {d.detail}</div>)}{!diff.requirements.length && <div className="text-xs text-slate-500">Same requirements.</div>}</div>
              </div>
              <div>
                <div className="mb-1 text-[11px] font-semibold uppercase text-slate-500">Who changed it and why</div>
                <div className="space-y-2">{(diff.decisions ?? []).map((d) => (
                  <div key={d.id} className="rounded-lg border border-slate-200 p-2 text-xs">
                    <div className="font-medium">{d.title}</div>
                    <div className="text-slate-600">{d.reason}</div>
                    <div className="text-slate-400">proposed by {name(d.proposedById).name}, approved by {d.approvedByIds.map((x) => name(x).name).join(", ")}</div>
                  </div>
                ))}</div>
              </div>
            </div>
          )}
          {a === b && <div className="text-xs text-slate-500">Pick two different versions.</div>}
        </div>
      )}
    </Card>
  );
}

function Checkpoints() {
  const { state, run } = useWs();
  const name = useNames();
  const [label, setLabel] = useState("");
  const [restore, setRestore] = useState<State["checkpoints"][number] | null>(null);
  const readOnly = state.me.role === "observer";
  return (
    <Card>
      <CardHeader icon={<Flag size={16} />} title="Checkpoints" subtitle="Persistent snapshots of context, requirements, artifact reference, task statuses and agent metadata." actions={!readOnly && (
        <form className="flex gap-1.5" onSubmit={async (e) => { e.preventDefault(); if (label.trim()) { await run({ type: "checkpoint", label }, "Checkpoint saved"); setLabel(""); } }}>
          <input className={cn(inputCls, "w-48 py-1 text-xs")} placeholder="Checkpoint label" value={label} onChange={(e) => setLabel(e.target.value)} />
          <Button size="sm" type="submit"><Save size={12} /> Create</Button>
        </form>
      )} />
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="px-4 py-2">Milestone</th><th>Label</th><th>Context</th><th>Artifact</th><th>Tasks</th><th>By</th><th>When</th><th /></tr></thead>
          <tbody>
            {state.checkpoints.map((c) => {
              const v = state.versions.find((x) => x.id === c.artifactVersionId);
              return (
                <tr key={c.id} className="border-t border-slate-100">
                  <td className="px-4 py-2"><Badge>{c.milestone.replace(/_/g, " ")}</Badge></td>
                  <td>{c.label}</td>
                  <td>v{c.contextVersion}</td>
                  <td>{v ? `v${v.number}` : "—"}</td>
                  <td>{(c.taskStatuses as unknown[]).length}</td>
                  <td>{name(c.createdById).name}</td>
                  <td className="text-slate-500">{timeAgo(c.createdAt)}</td>
                  <td className="pr-4 text-right">{!readOnly && <Button size="sm" variant="ghost" onClick={() => setRestore(c)}><RotateCcw size={12} /> Restore</Button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {restore && <RestoreModal open onClose={() => setRestore(null)} target={{ checkpointId: restore.id }} label={`checkpoint “${restore.label}”`} />}
    </Card>
  );
}

function RestoreModal({ open, onClose, target, label }: { open: boolean; onClose: () => void; target: { artifactVersionId?: string; checkpointId?: string }; label: string }) {
  const { act, run } = useWs();
  const [diff, setDiff] = useState<Diff | null>(null);
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (open) act<Diff>({ type: "restore_preview", ...target }).then(setDiff).catch(() => setDiff(null));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Modal open={open} onClose={onClose} title={`Restore ${label}?`} wide>
      <div className="space-y-4 text-sm">
        <p className="text-slate-600">Restoring creates a <b>new</b> version and a new context version derived from this snapshot. Later versions and the audit history are kept.</p>
        {!diff ? <div className="text-xs text-slate-500">Calculating what would change…</div> : (
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase text-slate-500">Affected components & design</div>
              {diff.spec.length ? diff.spec.map((d, i) => <div key={i} className="text-xs">• {d.detail}</div>) : <div className="text-xs text-slate-500">No visual change.</div>}
            </div>
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase text-slate-500">Requirements that will change</div>
              {diff.requirements.length ? diff.requirements.map((d, i) => <div key={i} className="text-xs">• <b>{d.key}</b> {d.kind}: {d.detail}</div>) : <div className="text-xs text-slate-500">Requirements unchanged.</div>}
              {!!diff.staleTasks && <div className="mt-2 text-xs text-amber-800">{diff.staleTasks} in-flight task(s) may become stale and will be quarantined if their output no longer matches.</div>}
            </div>
          </div>
        )}
        <Field label="Reason (recorded in the decision log)"><input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Compare against the original direction" /></Field>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!reason.trim()} onClick={async () => { const r = await run({ type: "restore", ...target, reason }, "Restored as a new version"); if (r) onClose(); }}>Confirm restore</Button>
        </div>
      </div>
    </Modal>
  );
}

function DecisionModal({ d, onClose }: { d: Decision | null; onClose: () => void }) {
  const { state } = useWs();
  const name = useNames();
  if (!d) return null;
  const after = state.decisions.filter((x) => x.createdAt > d.createdAt).slice(0, 3);
  const afterActs = state.activity.filter((a) => a.createdAt > d.createdAt).slice(-5).reverse();
  // Requirement changes notify both agents; otherwise list the agents that contributed.
  const agents = d.kind === "change" ? state.agents : state.agents.filter((a) => d.agentContributions.some((c) => c.includes(a.name.split(" ")[0])));
  return (
    <Modal open onClose={onClose} title={d.title}>
      <div className="space-y-3 text-sm">
        <div className="flex flex-wrap gap-1.5"><Badge>{d.kind}</Badge><StatusBadge status={d.status} /></div>
        <Row k="Who proposed it">{name(d.proposedById).name}</Row>
        <Row k="Who approved it">{d.approvedByIds.map((x) => name(x).name).join(", ") || "—"}</Row>
        <Row k="Why">{d.reason}</Row>
        <Row k="What changed">{d.summary}</Row>
        <Row k="Requirements">{d.affectedRequirements.join(", ") || "—"}</Row>
        <Row k="Components">{d.affectedComponents.join(", ") || "—"}</Row>
        <Row k="Agents affected">{agents.map((a) => a.name).join(", ") || "—"}{d.agentContributions.length ? ` — ${d.agentContributions.join("; ")}` : ""}</Row>
        <Row k="What happened next">
          <ul className="list-disc pl-4">{after.map((x) => <li key={x.id}>{x.title}</li>)}{!after.length && afterActs.map((a) => <li key={a.id}>{a.actorName}: {a.action}</li>)}{!after.length && !afterActs.length && <li>Nothing yet.</li>}</ul>
        </Row>
      </div>
    </Modal>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return <div className="grid grid-cols-[130px_1fr] gap-2 text-xs"><div className="font-semibold text-slate-500">{k}</div><div className="text-slate-800">{children}</div></div>;
}
