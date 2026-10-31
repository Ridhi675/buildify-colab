"use client";

import { CheckCircle2, ChevronDown, ChevronUp, Circle, RotateCcw, X } from "lucide-react";
import { useState } from "react";
import { cn } from "../client";
import { Badge, Button } from "../ui";
import { useWs } from "./shared";

interface Step {
  n: number;
  title: string;
  who: string;
  official?: string;
  how: string;
  view: string;
  done: boolean;
}

export function DemoGuide({ onClose }: { onClose: () => void }) {
  const { state, presence, go, run, view } = useWs();
  const [open, setOpen] = useState(true);
  const [seen, setSeen] = useState<Record<number, boolean>>({});
  const online = (id: string) => presence.some((p) => p.userId === id && p.connections > 0);
  const tasks = state.tasks;
  const has = (pred: (t: (typeof tasks)[number]) => boolean) => tasks.some(pred);
  const audienceImpact = state.impacts.find((i) => /elderly|senior/i.test(i.proposedText));
  const quarantinedBuild = has((t) => t.type === "build" && t.status === "quarantined");
  const builderRecovered = state.chat.some((c) => c.role === "builder" && (c.meta as { recovery?: unknown }).recovery);
  const rebuildDone = state.versions.some((v) => v.number >= 2 && v.label.startsWith("Rebuilt"));
  const firstQuarantine = tasks.filter((t) => t.status === "quarantined").map((t) => t.updatedAt).sort()[0];

  const steps: Step[] = [
    { n: 1, title: "Both humans join the workspace", who: "Aisha + Daniel", official: "1", how: "Open a second browser tab, choose the other person. Avatars turn green.", view: "workspace", done: online("u_aisha") && online("u_daniel") },
    { n: 2, title: "Aisha requests an appointment-booking app", who: "Aisha", official: "1", how: "Workspace → “Use demo request” → Simplify with Bunty.", view: "workspace", done: has((t) => t.type === "simplify") },
    { n: 3, title: "Bunty simplifies into requirements", who: "Bunty → humans", how: "Review the interpretation beside the original request; edit or reject any line, then Approve all.", view: "workspace", done: state.requirements.some((r) => r.status === "approved") },
    { n: 4, title: "Preview Studio generates visual + textual spec", who: "Any human", how: "Preview Studio → Generate preview.", view: "preview", done: state.previews.length > 0 },
    { n: 5, title: "Both humans approve the preview", who: "Aisha + Daniel", official: "1", how: "Each human clicks Approve. Two approvals are required — the Builder is blocked until then.", view: "preview", done: state.previews.some((p) => p.status === "approved") },
    { n: 6, title: "Reviewer and Builder work in parallel", who: "Agents", official: "2", how: "Reviewer writes acceptance tests while Builder builds. Watch both in the Agent Control Centre.", view: "agents", done: has((t) => t.type === "acceptance") && has((t) => t.type === "build") },
    { n: 7, title: "Daniel changes the audience to elderly patients", who: "Daniel", official: "3", how: "While the Builder is still running: Workspace → audience requirement → Propose change → “Fill demo change”.", view: "workspace", done: !!audienceImpact },
    { n: 8, title: "Ripple Effect shows the impact", who: "Both humans", official: "3", how: "Review affected/unaffected components and stale tasks, then both approve the change.", view: "ripple", done: audienceImpact?.status === "approved" },
    { n: 9, title: "Outdated Builder output is quarantined", who: "System", official: "4", how: "When the Builder finishes, its output is checked against context and quarantined — never committed.", view: "agents", done: quarantinedBuild },
    { n: 10, title: "Restart the Builder; it recovers context", who: "Any human", official: "5", how: "Agent Control Centre → Builder → Restart agent. Read the recovery report.", view: "agents", done: builderRecovered },
    { n: 11, title: "Reviewer's updated task is approved", who: "Any human", official: "6", how: "Approve “Rebuild on context vN” — the Reviewer prepared it; humans decide.", view: "workspace", done: state.approvals.some((a) => a.kind === "rebuild" && a.status === "approved") },
    { n: 12, title: "Reviewer validates; human approval requested", who: "Reviewer → humans", official: "6", how: "Reviewer runs acceptance checks on the rebuild and recommends — a human must accept.", view: "workspace", done: state.approvals.some((a) => a.kind === "build_output" && a.createdAt > (firstQuarantine ?? "")) },
    { n: 13, title: "Builder's updated artifact is accepted", who: "Human", official: "7", how: "Approve the build output. Only affected components were regenerated.", view: "workspace", done: rebuildDone },
    { n: 14, title: "Time Machine records the new version", who: "System", how: "Decision Time Machine shows each decision, who approved it and why.", view: "timeline", done: rebuildDone && state.decisions.some((d) => d.kind === "build") },
    { n: 15, title: "Compare old and new versions", who: "Humans", how: "Time Machine → Compare → v1 vs v2.", view: "timeline", done: !!seen[15] },
    { n: 16, title: "Safe restore to an earlier checkpoint", who: "Human", how: "Time Machine → Checkpoints → “Preview approved” → Restore. A new version is created; history is kept.", view: "timeline", done: state.decisions.some((d) => d.kind === "restore") },
    { n: 17, title: "Show the final shared artifact", who: "Everyone", official: "7", how: "Workspace shows the current artifact. Optionally request the final release (two approvals).", view: "workspace", done: state.project.phase === "released" || !!seen[17] },
  ];
  const next = steps.find((s) => !s.done);
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <div className="fixed bottom-4 left-4 z-40 w-[360px] max-w-[calc(100vw-32px)] rounded-2xl border border-slate-200 bg-surface shadow-2xl">
      <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
        <div className="flex-1">
          <div className="text-sm font-semibold">Demo guide · CareConnect</div>
          <div className="text-[11px] text-slate-500">{doneCount}/{steps.length} steps · detected from live project state</div>
        </div>
        <button className="rounded p-1 text-slate-500 hover:bg-slate-100" onClick={() => setOpen((o) => !o)} aria-label="Collapse">{open ? <ChevronDown size={15} /> : <ChevronUp size={15} />}</button>
        <button className="rounded p-1 text-slate-500 hover:bg-slate-100" onClick={onClose} aria-label="Close"><X size={15} /></button>
      </div>
      <div className="h-1 bg-slate-100"><div className="h-1 bg-indigo-500 transition-all" style={{ width: `${(doneCount / steps.length) * 100}%` }} /></div>
      {open && (
        <div className="max-h-[48vh] overflow-y-auto p-2 scroll-thin">
          {steps.map((s) => (
            <div key={s.n} className={cn("rounded-lg p-2", next?.n === s.n && "bg-indigo-50 ring-1 ring-indigo-200")}>
              <div className="flex items-start gap-2">
                {s.done ? <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-600" /> : <Circle size={15} className="mt-0.5 shrink-0 text-slate-300" />}
                <div className="min-w-0 flex-1">
                  <div className={cn("text-xs font-medium", s.done ? "text-slate-500" : "text-slate-900")}>{s.n}. {s.title}</div>
                  {next?.n === s.n && (
                    <div className="mt-1 space-y-1.5">
                      <div className="text-[11px] text-slate-600"><b>{s.who}:</b> {s.how}</div>
                      <div className="flex gap-1.5">
                        {view !== s.view && <Button size="sm" variant="primary" onClick={() => go(s.view, s.n === 15 ? "mode=compare" : undefined)}>Go there</Button>}
                        {(s.n === 15 || s.n === 17) && <Button size="sm" onClick={() => setSeen({ ...seen, [s.n]: true })}>Mark shown</Button>}
                      </div>
                    </div>
                  )}
                </div>
                {s.official && <Badge tone="violet" title="Official hackathon demo step">req {s.official}</Badge>}
              </div>
            </div>
          ))}
          <div className="mt-2 flex items-center justify-between border-t border-slate-100 px-1 pt-2">
            <span className="text-[10px] text-slate-500">Agent phases are paced at {state.metrics.stepDelayMs}ms for visibility.</span>
            {state.me.role !== "observer" && <Button size="sm" variant="ghost" onClick={() => confirm("Reset the CareConnect demo for everyone? All demo history will be wiped.") && run({ type: "reset_demo" }, "Demo reset")}><RotateCcw size={12} /> Reset demo</Button>}
          </div>
        </div>
      )}
    </div>
  );
}
