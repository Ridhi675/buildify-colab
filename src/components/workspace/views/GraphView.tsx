"use client";

import { Brain, Network, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { timeAgo } from "../../client";
import { Badge, Button, Card, CardHeader, StatusBadge, Tabs } from "../../ui";
import { ContextGraph, Legend, type GNode } from "../ContextGraph";
import { useNames, useWs } from "../shared";

export function GraphView() {
  const { state } = useWs();
  const [tab, setTab] = useState<"graph" | "memory">("graph");
  const [opts, setOpts] = useState({ tasks: true, decisions: true });
  const [sel, setSel] = useState<GNode | null>(null);
  const memoOpts = useMemo(() => opts, [opts]);

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <Card>
        <CardHeader
          icon={<Network size={16} />}
          title="Shared Context Centre"
          subtitle="Authoritative project memory. Both agents load context from here — the Reviewer is never the only source of truth."
          actions={<Tabs value={tab} onChange={setTab} items={[{ value: "graph", label: "Knowledge graph" }, { value: "memory", label: "Memory & timeline" }]} />}
        />
        {tab === "graph" && (
          <div className="flex flex-wrap items-center gap-3 px-4 py-2.5">
            <Legend />
            <label className="ml-auto flex items-center gap-1 text-xs"><input type="checkbox" checked={opts.tasks} onChange={(e) => setOpts({ ...opts, tasks: e.target.checked })} /> agents & tasks</label>
            <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={opts.decisions} onChange={(e) => setOpts({ ...opts, decisions: e.target.checked })} /> decisions & versions</label>
          </div>
        )}
      </Card>
      {tab === "graph" ? (
        <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
          <ContextGraph state={state} onSelect={setSel} height={640} opts={memoOpts} />
          <NodeDetails node={sel} />
        </div>
      ) : (
        <Memory />
      )}
    </div>
  );
}

function NodeDetails({ node }: { node: GNode | null }) {
  const { state } = useWs();
  const name = useNames();
  if (!node) return <Card className="p-4 text-xs text-slate-500">Click a node to see its details and related activity.</Card>;
  const d = node.data as Record<string, unknown>;
  const needle = String(d.key ?? d.title ?? d.name ?? "").toLowerCase();
  const related = state.activity.filter((a) => needle && `${a.action} ${a.target ?? ""} ${a.outcome ?? ""}`.toLowerCase().includes(needle)).slice(0, 8);
  const rows: [string, React.ReactNode][] = [];
  if (node.kind === "requirement") rows.push(["Description", String(d.description)], ["Version", `v${d.version}`], ["Priority", String(d.priority)], ["Author", name(String(d.authorId)).name]);
  else if (node.kind === "agent") rows.push(["Role", String(d.role)], ["Status", <StatusBadge key="s" status={String(d.status)} />], ["Context", `v${d.contextVersion}`]);
  else if (node.kind === "task") rows.push(["Status", <StatusBadge key="s" status={String(d.status)} />], ["Base context", `v${d.baseContextVersion}`], ["Phase", String(d.phaseLabel)], ...(d.staleReason ? [["Stale", String(d.staleReason)] as [string, string]] : []));
  else if (node.kind === "decision") rows.push(["Summary", String(d.summary)], ["Reason", String(d.reason)], ["Proposed by", name(String(d.proposedById)).name], ["Approved by", (d.approvedByIds as string[]).map((x) => name(x).name).join(", ")]);
  else if (node.kind === "version") rows.push(["Label", String(d.label)], ["Context", `v${d.contextVersion}`], ["Changed", (d.changedComponents as string[]).join(", ") || "—"]);
  else rows.push(["Category", String(d.category)], ["Description", String(d.description ?? "")]);
  return (
    <Card>
      <CardHeader title={node.label} subtitle={<Badge>{node.kind}</Badge>} />
      <div className="space-y-2 p-4 text-xs">
        {rows.map(([k, v]) => <div key={k}><span className="font-semibold text-slate-500">{k}:</span> {v}</div>)}
        <div className="pt-2">
          <div className="mb-1 text-[11px] font-semibold uppercase text-slate-500">Related activity</div>
          {related.length ? related.map((a) => <div key={a.id} className="py-0.5"><span className="text-slate-400">{timeAgo(a.createdAt)}</span> {a.actorName}: {a.action}</div>) : <div className="text-slate-400">None recorded.</div>}
        </div>
      </div>
    </Card>
  );
}

function Memory() {
  const { state, run } = useWs();
  const name = useNames();
  const approved = state.requirements.filter((r) => r.status === "approved");
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <Card>
        <CardHeader icon={<Brain size={16} />} title="Project memory" subtitle={`Current approved state · context v${state.project.contextVersion}`} />
        <div className="space-y-2 p-4 text-xs">
          {approved.map((r) => <div key={r.id}><span className="font-mono text-slate-400">{r.key} v{r.version}</span> <b>{r.title}</b><div className="text-slate-600">{r.description}</div></div>)}
          <div className="border-t border-slate-100 pt-2 text-slate-500">Constraints: approval policy — major {state.project.policy.major}, minor {state.project.policy.minor}, release {state.project.policy.release} human approval(s).</div>
        </div>
      </Card>
      <Card>
        <CardHeader title="Agent context viewer" subtitle="Which context version each agent received" actions={<Button size="sm" onClick={() => run({ type: "presence", view: "graph" }, "Context refreshed from the store")}><RefreshCw size={12} /> Refresh</Button>} />
        <div className="space-y-3 p-4 text-xs">
          {state.agents.map((a) => {
            const behind = a.contextVersion < state.project.contextVersion;
            const active = state.tasks.filter((t) => t.agentId === a.id && ["running", "paused", "queued"].includes(t.status));
            return (
              <div key={a.id} className="rounded-lg border border-slate-200 p-2.5">
                <div className="flex items-center justify-between"><b>{a.name}</b><Badge tone={behind ? "amber" : "emerald"}>v{a.contextVersion}{behind ? " — behind" : " — current"}</Badge></div>
                {active.map((t) => <div key={t.id} className="mt-1 text-slate-600">{t.title}: started on v{t.baseContextVersion}</div>)}
                {behind && <div className="mt-1 text-amber-800">Its next task will load v{state.project.contextVersion}; any in-flight output will be stale-checked.</div>}
              </div>
            );
          })}
        </div>
      </Card>
      <Card>
        <CardHeader title="Context timeline" subtitle="Immutable context versions" />
        <ol className="max-h-[520px] space-y-2 overflow-y-auto p-4 text-xs scroll-thin">
          {state.contextVersions.map((c) => (
            <li key={c.id} className="border-l-2 border-indigo-200 pl-3">
              <div className="flex items-center gap-1.5"><Badge tone="indigo">v{c.number}</Badge><span className="text-slate-400">{timeAgo(c.createdAt)}</span></div>
              <div className="mt-0.5 text-slate-700">{c.reason}</div>
              <div className="text-slate-400">by {name(c.authorId).name} · {(c.snapshot as { requirements: unknown[] }).requirements.length} requirements</div>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
