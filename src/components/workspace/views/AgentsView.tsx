"use client";

import { Bot, CornerUpRight, Pause, Play, Power, RotateCw, Search, Share2, Square } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { cn, timeAgo, type State } from "../../client";
import { agentColor } from "../../effects";
import { Badge, Button, Card, CardHeader, Field, inputCls, Modal, SourceBadge, StatusBadge } from "../../ui";
import { SimulatedNote, useNames, useWs } from "../shared";

type Task = State["tasks"][number];
const DELEGABLE = new Set(["acceptance", "build_plan", "validate"]);

export function AgentsView() {
  const { state } = useWs();
  const params = useSearchParams();
  const [inspect, setInspect] = useState<string | null>(params.get("task"));
  useEffect(() => setInspect(params.get("task")), [params]);
  const task = state.tasks.find((t) => t.id === inspect) ?? null;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
        {state.agents.map((a) => <AgentCard key={a.id} agent={a} onInspect={setInspect} />)}
      </div>
      <Card>
        <CardHeader title="All agent tasks" subtitle="Every task records the context version and requirement versions it was started with. Output is checked against the latest context before it can be used." />
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
              <tr><th className="px-4 py-2">Task</th><th>Agent</th><th>Status</th><th>Phase</th><th>Context</th><th>Attempts</th><th>Updated</th><th /></tr>
            </thead>
            <tbody>
              {state.tasks.map((t) => (
                <tr key={t.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                  <td className="px-4 py-2 font-medium text-slate-800">{t.title}<div className="font-mono text-[10px] text-slate-400">{t.type}</div></td>
                  <td>{state.agents.find((a) => a.id === t.agentId)?.name}</td>
                  <td><StatusBadge status={t.status} /></td>
                  <td className="max-w-[200px] truncate text-slate-600">{t.phaseLabel}</td>
                  <td><Badge tone={t.baseContextVersion < state.project.contextVersion && ["running", "queued", "paused"].includes(t.status) ? "amber" : "slate"}>v{t.baseContextVersion}</Badge></td>
                  <td>{t.attempts}/{t.maxAttempts}</td>
                  <td className="text-slate-500">{timeAgo(t.updatedAt)}</td>
                  <td className="pr-4 text-right"><Button size="sm" variant="ghost" onClick={() => setInspect(t.id)}><Search size={12} /> Inspect</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!state.tasks.length && <div className="p-6 text-center text-xs text-slate-400">No tasks yet.</div>}
        </div>
      </Card>
      <InspectModal task={task} onClose={() => setInspect(null)} />
    </div>
  );
}

function AgentCard({ agent, onInspect }: { agent: State["agents"][number]; onInspect: (id: string) => void }) {
  const { state, run } = useWs();
  const [redirect, setRedirect] = useState<Task | null>(null);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const tasks = state.tasks.filter((t) => t.agentId === agent.id);
  const current = tasks.find((t) => t.id === agent.currentTaskId) ?? tasks.find((t) => ["running", "paused", "queued"].includes(t.status));
  const lastFailed = tasks.find((t) => ["failed", "quarantined", "cancelled"].includes(t.status));
  const actions = state.activity.filter((a) => a.actorId === agent.id).slice(0, 5);
  const pendingMine = state.approvals.filter((a) => a.status === "pending" && a.createdById === agent.id).length;
  const recovery = [...state.chat].reverse().find((c) => c.authorId === agent.id && (c.meta as { recovery?: unknown }).recovery);
  const behind = agent.contextVersion < state.project.contextVersion;
  const color = agentColor(agent.key);
  const readOnly = state.me.role === "observer";
  const ctl = (t: Task, op: string, ok: string) => run({ type: "task_control", taskId: t.id, op }, ok);

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3 border-b border-slate-100 p-4" style={{ background: `${color}0d` }}>
        <span className="flex h-11 w-11 items-center justify-center rounded-xl text-white shadow" style={{ background: color }}><Bot size={22} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-base font-semibold">{agent.name} <StatusBadge status={agent.status} /></div>
          <div className="text-xs text-slate-500">{agent.role} · epoch {agent.epoch} · last activity {timeAgo(agent.lastActivityAt)}</div>
        </div>
        <div className="text-right text-xs">
          <Badge tone={behind ? "amber" : "emerald"}>context v{agent.contextVersion}{behind ? ` (latest v${state.project.contextVersion})` : ""}</Badge>
          {pendingMine > 0 && <div className="mt-1 text-amber-700">{pendingMine} proposal(s) awaiting humans</div>}
        </div>
      </div>
      <div className="space-y-4 p-4">
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Current task</div>
          {current ? (
            <div className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium">{current.title}</div>
                <StatusBadge status={current.status} />
              </div>
              <PhaseBar t={current} />
              <div className="mt-1 text-xs text-slate-500">{current.phaseLabel}{current.control ? ` · ${current.control} requested` : ""}</div>
              {!readOnly && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {current.status === "running" && <Button size="sm" onClick={() => ctl(current, "pause", "Pausing at next safe boundary")}><Pause size={12} /> Pause</Button>}
                  {current.status === "paused" && <Button size="sm" variant="primary" onClick={() => ctl(current, "resume", "Resuming from persisted context")}><Play size={12} /> Resume</Button>}
                  {["running", "paused", "queued"].includes(current.status) && <Button size="sm" variant="danger" onClick={() => ctl(current, "stop", "Stopping — late output will be discarded")}><Square size={12} /> Stop</Button>}
                  <Button size="sm" onClick={() => setRedirect(current)}><CornerUpRight size={12} /> Redirect</Button>
                  {DELEGABLE.has(current.type) && ["queued", "paused"].includes(current.status) && <Button size="sm" onClick={() => run({ type: "task_delegate", taskId: current.id }, "Delegated")}><Share2 size={12} /> Delegate</Button>}
                  <Button size="sm" variant="ghost" onClick={() => onInspect(current.id)}><Search size={12} /> Inspect</Button>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-200 p-3 text-xs text-slate-500">Idle. {agent.lastAction}</div>
          )}
        </div>
        {lastFailed && !current && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
            <div className="flex items-center justify-between gap-2"><b>{lastFailed.title}</b><StatusBadge status={lastFailed.status} /></div>
            <div className="mt-1">{lastFailed.staleReason ?? lastFailed.error ?? lastFailed.phaseLabel}</div>
            {!readOnly && (
              <div className="mt-2 flex gap-1.5">
                <Button size="sm" disabled={lastFailed.attempts >= lastFailed.maxAttempts} onClick={() => ctl(lastFailed, "retry", "Retrying on latest context")}><RotateCw size={12} /> Retry ({lastFailed.attempts}/{lastFailed.maxAttempts})</Button>
                {DELEGABLE.has(lastFailed.type) && lastFailed.status === "failed" && <Button size="sm" onClick={() => run({ type: "task_delegate", taskId: lastFailed.id }, "Delegated")}><Share2 size={12} /> Delegate</Button>}
                <Button size="sm" variant="ghost" onClick={() => onInspect(lastFailed.id)}><Search size={12} /> Inspect</Button>
              </div>
            )}
          </div>
        )}
        {recovery && (
          <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 text-xs text-violet-900">
            <div className="mb-1 font-semibold">Last recovery report · {timeAgo(recovery.createdAt)}</div>
            {recovery.body}
          </div>
        )}
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Recent actions</div>
          <ul className="space-y-1 text-xs text-slate-600">
            {actions.map((a) => <li key={a.id}><span className="text-slate-400">{timeAgo(a.createdAt)}</span> · {a.action}{a.outcome ? ` — ${a.outcome}` : ""}</li>)}
            {!actions.length && <li className="text-slate-400">No actions yet.</li>}
          </ul>
        </div>
        {!readOnly && (
          <div className="flex items-center justify-between border-t border-slate-100 pt-3">
            <span className="text-[11px] text-slate-500">Restart discards in-memory work and rebuilds context from the project store.</span>
            <Button size="sm" variant="danger" onClick={() => setConfirmRestart(true)}><Power size={12} /> Restart agent</Button>
          </div>
        )}
      </div>
      <Modal open={confirmRestart} onClose={() => setConfirmRestart(false)} title={`Restart ${agent.name}?`}>
        <div className="space-y-3 text-sm">
          <SimulatedNote>agent crash</SimulatedNote>
          <p>This simulates an agent crash: the agent&apos;s in-memory work is discarded (its epoch increments, so any late output from the old run is rejected). It then recovers <b>only</b> from persisted project state — context version, approved requirements, decisions, task checkpoints and pending approvals. Hidden model reasoning is not restored.</p>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setConfirmRestart(false)}>Cancel</Button>
            <Button variant="danger" onClick={async () => { await run({ type: "agent_restart", agent: agent.key }, `${agent.name} recovered context`); setConfirmRestart(false); }}>Restart and recover</Button>
          </div>
        </div>
      </Modal>
      <RedirectModal task={redirect} onClose={() => setRedirect(null)} />
    </Card>
  );
}

function PhaseBar({ t }: { t: Task }) {
  const n = t.phases.length || 1;
  return (
    <div className="mt-2 flex gap-1" title={t.phases.join(" → ")}>
      {t.phases.map((p, i) => (
        <div key={i} className={cn("h-1.5 flex-1 rounded-full", i < t.phase ? "bg-emerald-500" : i === t.phase && t.status === "running" ? "animate-pulse-soft bg-indigo-500" : "bg-slate-200")} />
      ))}
      <span className="ml-1 text-[10px] tabular-nums text-slate-500">{Math.min(t.phase, n)}/{n}</span>
    </div>
  );
}

function RedirectModal({ task, onClose }: { task: Task | null; onClose: () => void }) {
  const { run } = useWs();
  const [text, setText] = useState("");
  return (
    <Modal open={!!task} onClose={onClose} title="Redirect task">
      <div className="space-y-3">
        <p className="text-sm text-slate-600">The current task is stopped (its output will not be used) and replaced by a new task on the <b>latest</b> context with your instructions.</p>
        <Field label="New instructions"><textarea className={inputCls} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Focus on the booking flow first" /></Field>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!text.trim()} onClick={async () => { await run({ type: "task_redirect", taskId: task!.id, instructions: text }, "Redirected"); setText(""); onClose(); }}>Redirect</Button>
        </div>
      </div>
    </Modal>
  );
}

function InspectModal({ task, onClose }: { task: Task | null; onClose: () => void }) {
  const name = useNames();
  if (!task) return null;
  const out = task.output as { result?: unknown; source?: string } | null;
  return (
    <Modal open onClose={onClose} title={`Inspect: ${task.title}`} wide>
      <div className="space-y-4 text-sm">
        <div className="flex flex-wrap gap-1.5">
          <StatusBadge status={task.status} />
          <Badge>{task.type}</Badge>
          <Badge tone="indigo">base context v{task.baseContextVersion}</Badge>
          <Badge>epoch {task.epoch}</Badge>
          <Badge>attempts {task.attempts}/{task.maxAttempts}</Badge>
          <SourceBadge source={out?.source} />
        </div>
        {task.staleReason && <div className="rounded-lg bg-rose-50 p-3 text-xs text-rose-900"><b>Why it was quarantined:</b> {task.staleReason}</div>}
        {task.error && <div className="rounded-lg bg-rose-50 p-3 text-xs text-rose-900"><b>Error:</b> {task.error}</div>}
        <div className="grid gap-4 md:grid-cols-2">
          <Section title="Inputs"><pre className="max-h-40 overflow-auto rounded-lg bg-slate-50 p-2 text-[11px]">{JSON.stringify(task.input, null, 2)}</pre></Section>
          <Section title="Dependency versions (fingerprint)">
            <div className="flex flex-wrap gap-1">{Object.entries(task.depFingerprint).map(([k, v]) => <Badge key={k}>{k}@v{v}</Badge>)}</div>
            <div className="mt-1 text-[11px] text-slate-500">Created by {name(task.createdById).name}</div>
          </Section>
        </div>
        <Section title="Runs & action log">
          {task.runs.map((r) => (
            <div key={r.id} className="mb-2 rounded-lg border border-slate-200 p-2 text-xs">
              <div className="flex flex-wrap items-center gap-1.5"><b>Attempt {r.attempt}</b> <StatusBadge status={r.status} /> <SourceBadge source={r.source} /> {r.model && <Badge>{r.model}</Badge>}</div>
              <ul className="mt-1 space-y-0.5 font-mono text-[11px] text-slate-600">
                {(r.log as { at: string; line: string }[]).map((l, i) => <li key={i}><span className="text-slate-400">{new Date(l.at).toLocaleTimeString()}</span> {l.line}</li>)}
              </ul>
            </div>
          ))}
          {!task.runs.length && <div className="text-xs text-slate-400">Not started.</div>}
        </Section>
        {task.validation && <Section title="Validation"><pre className="max-h-48 overflow-auto rounded-lg bg-slate-50 p-2 text-[11px]">{JSON.stringify(task.validation, null, 2)}</pre></Section>}
        <Section title="Structured output"><pre className="max-h-72 overflow-auto rounded-xl bg-[var(--terminal-bg)] p-3 text-[11px] text-[var(--terminal-fg)]">{out?.result ? JSON.stringify(out.result, null, 2) : "—"}</pre></Section>
        <p className="text-[11px] text-slate-500">Shown: inputs, context version, actions, output and validation. Hidden model reasoning is not stored or displayed.</p>
      </div>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</div>
      {children}
    </div>
  );
}
