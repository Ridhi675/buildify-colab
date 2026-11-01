"use client";

import { AlertTriangle, ArrowRight, Bot, CheckCircle2, ChevronDown, Database, Eye, LayoutTemplate, ListChecks, Palette, RotateCcw, ShieldCheck, Waves } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { ImpactResult } from "@/lib/types";
import { cn, timeAgo, type State } from "../../client";
import { Badge, Button, Card, CardHeader, Empty, Field, inputCls, Modal, StatusBadge, type Tone } from "../../ui";
import { ApprovalCard, useNames, useWs } from "../shared";

type Impact = State["impacts"][number];

// Plain words for people who don't build software.
const STATUS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "Waiting for approval", tone: "amber" },
  approved: { label: "Approved", tone: "emerald" },
  rejected: { label: "Rejected", tone: "rose" },
  conflict: { label: "Out of date", tone: "rose" },
  superseded: { label: "Replaced", tone: "slate" },
  modified: { label: "Replaced", tone: "slate" },
};
const SIZE: Record<string, { label: string; tone: Tone }> = {
  high: { label: "Big change", tone: "rose" },
  medium: { label: "Medium change", tone: "amber" },
  low: { label: "Small change", tone: "emerald" },
};
const AREAS = [
  { key: "frontend", label: "Screens & pages", icon: LayoutTemplate },
  { key: "design", label: "Look & feel", icon: Palette },
  { key: "backend", label: "Data & logic behind the scenes", icon: Database },
  { key: "testing", label: "Checks & tests", icon: ShieldCheck },
] as const;
const AGENT: Record<string, string> = { reviewer: "Bunty", builder: "Babli" };

function Friendly({ status }: { status: string }) {
  const s = STATUS[status];
  return s ? <Badge tone={s.tone}>{s.label}</Badge> : <StatusBadge status={status} />;
}

export function RippleView() {
  const { state } = useWs();
  const params = useSearchParams();
  const [sel, setSel] = useState<string | null>(params.get("impact"));
  useEffect(() => setSel(params.get("impact")), [params]);
  const impact = state.impacts.find((i) => i.id === sel) ?? state.impacts[0];

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <Card>
        <CardHeader
          icon={<Waves size={16} />}
          title="Ripple Effect — what happens if we change this?"
          subtitle="Before anything changes, see what a change would affect. Nothing is applied until enough people approve it."
        />
        <div className="flex flex-wrap gap-2 p-3">
          {state.impacts.map((i) => (
            <button
              key={i.id}
              onClick={() => setSel(i.id)}
              className={cn("flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition", impact?.id === i.id ? "border-accent/50 bg-accent-soft text-foreground" : "border-border bg-surface text-muted-foreground hover:text-foreground")}
            >
              {i.proposedTitle.slice(0, 40)} <Friendly status={i.status} />
            </button>
          ))}
          {!state.impacts.length && <span className="text-xs text-muted-foreground">No changes proposed yet. In the Workspace, click “Propose change” on an approved requirement.</span>}
        </div>
      </Card>
      {impact ? <ImpactPanel impact={impact} /> : <Card className="p-5"><Empty icon={<Waves size={28} />} title="Nothing to show yet">Propose a change to an approved requirement and its effects will appear here.</Empty></Card>}
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">{icon}{title}</div>
      {children}
    </div>
  );
}

function ImpactPanel({ impact }: { impact: Impact }) {
  const { state, run, go } = useWs();
  const name = useNames();
  const r = impact.result as ImpactResult & { baseVersion?: number; reason?: string };
  const [modify, setModify] = useState(false);
  const approval = state.approvals.find((a) => a.kind === "change" && (a.payload as { impactId?: string }).impactId === impact.id);
  const readOnly = state.me.role === "observer";
  const size = SIZE[impact.severity] ?? SIZE.medium;
  const touched = r.affectedComponents.length;
  const kept = r.unaffectedComponents.length;
  const redo = r.staleTasks.length;

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <div className="space-y-6 p-5 sm:p-6">
            {/* 1. The change itself */}
            <div>
              <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Friendly status={impact.status} />
                <span>Proposed by {name(impact.createdById).name} · {timeAgo(impact.createdAt)}</span>
              </div>
              <div className="grid items-stretch gap-3 sm:grid-cols-[1fr_auto_1fr]">
                <div className="rounded-2xl border border-border bg-surface-muted p-4">
                  <div className="text-xs font-semibold text-muted-foreground">Today</div>
                  <div className="mt-1 text-sm text-foreground/70 line-through decoration-rose-400/60">{impact.previousText}</div>
                </div>
                <ArrowRight size={18} className="hidden self-center text-muted-foreground sm:block" />
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                  <div className="text-xs font-semibold text-emerald-700">After the change</div>
                  <div className="mt-1 text-sm font-medium text-emerald-900">{impact.proposedText}</div>
                </div>
              </div>
              {r.reason && <p className="mt-3 text-sm text-muted-foreground"><b className="text-foreground">Why:</b> {r.reason}</p>}
            </div>

            {impact.status === "conflict" && (
              <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
                <AlertTriangle size={16} className="shrink-0" />
                <span>Someone edited this requirement after this change was proposed. The proposal is saved, but it hasn’t been applied.</span>
                {!readOnly && (
                  <span className="ml-auto flex gap-1.5">
                    <Button size="sm" variant="primary" onClick={() => run({ type: "rebase_change", impactId: impact.id }, "Checked again against the latest version")}>Check again with the latest version</Button>
                    <Button size="sm" onClick={() => run({ type: "discard_change", impactId: impact.id }, "Discarded")}>Discard</Button>
                  </span>
                )}
              </div>
            )}

            {/* 2. One-sentence summary */}
            <div className="rounded-2xl border border-border bg-surface p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={size.tone}>{size.label}</Badge>
                <span className="text-xs text-muted-foreground">About {r.effortHours} hour{r.effortHours === 1 ? "" : "s"} of work (rough estimate)</span>
              </div>
              <p className="mt-2 text-[15px] leading-relaxed text-foreground">
                This change affects <b>{touched} part{touched === 1 ? "" : "s"}</b> of the app and leaves <b>{kept}</b> as they are.
                {redo ? <> <b>{redo} piece{redo === 1 ? "" : "s"} of work in progress</b> will be redone with the new version.</> : " No work in progress needs redoing."}
              </p>
            </div>

            {/* 3. What users will notice */}
            <Section icon={<Eye size={16} className="text-accent" />} title="What people using the app will notice">
              {r.specDiff?.length ? (
                <ul className="space-y-1.5">{r.specDiff.map((d, i) => <li key={i} className="flex gap-2 rounded-xl bg-surface-muted px-3 py-2 text-sm"><span className="text-accent">•</span>{d.replace(/^[~+\-−]\s*/, "")}</li>)}</ul>
              ) : (
                <p className="text-sm text-muted-foreground">Nothing visible changes for the people using the app.</p>
              )}
            </Section>

            {/* 4. Which parts change and which stay the same */}
            <Section icon={<ListChecks size={16} className="text-accent" />} title="Which parts of the app change">
              <div className="grid gap-3 sm:grid-cols-2">
                {AREAS.map((a) => {
                  const parts = r.affectedComponents.filter((c) => c.category === a.key);
                  return (
                    <div key={a.key} className={cn("rounded-2xl border p-3", parts.length ? "border-amber-200 bg-amber-50/60" : "border-border")}>
                      <div className="flex items-center gap-2 text-sm font-medium"><a.icon size={15} /> {a.label}</div>
                      {parts.length ? (
                        <ul className="mt-1.5 space-y-0.5 text-sm text-foreground/80">{parts.map((c) => <li key={c.key}>• {c.name}</li>)}</ul>
                      ) : (
                        <div className="mt-1.5 flex items-center gap-1.5 text-sm text-emerald-700"><CheckCircle2 size={14} /> No change</div>
                      )}
                    </div>
                  );
                })}
              </div>
              {kept > 0 && (
                <div className="mt-3 text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">Stays exactly the same:</span>{" "}
                  {r.unaffectedComponents.slice(0, 8).map((c) => c.name).join(", ")}
                  {kept > 8 && ` and ${kept - 8} more`}
                </div>
              )}
            </Section>

            {/* 5. Work that gets redone, and what the agents do */}
            <Section icon={<RotateCcw size={16} className="text-accent" />} title="What happens to work already in progress">
              {redo ? (
                <ul className="space-y-1.5 text-sm">
                  {r.staleTasks.map((t) => (
                    <li key={t.id} className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-rose-900">
                      {AGENT[t.agentKey] ?? t.agentKey} was working on “{t.title}”. That work was based on the old version, so it will be set aside and redone.
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Nothing is in progress that depends on this, so no work is lost.</p>
              )}
              {r.agents.length > 0 && (
                <ul className="mt-3 space-y-1 text-sm text-foreground/80">
                  {r.agents.map((a) => <li key={a.key} className="flex gap-2"><Bot size={15} className="mt-0.5 shrink-0 text-accent" /><span><b>{AGENT[a.key] ?? a.key}:</b> {a.effect}</span></li>)}
                </ul>
              )}
            </Section>

            {/* 6. Next steps */}
            {r.steps.length > 0 && (
              <Section icon={<ArrowRight size={16} className="text-accent" />} title="If it’s approved, here’s what happens next">
                <ol className="list-decimal space-y-1 pl-5 text-sm text-foreground/80">{r.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
              </Section>
            )}

            {/* 7. Bunty's own thoughts, clearly marked as a guess */}
            {r.inferred?.length ? (
              <div className="rounded-2xl border border-dashed border-violet-300 bg-violet-50/50 p-4">
                <div className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-violet-800"><Bot size={15} /> Bunty’s extra thoughts <Badge tone="violet">a guess</Badge></div>
                <ul className="space-y-1 text-sm text-foreground/80">{r.inferred.map((x, i) => <li key={i}><b>{x.area}:</b> {x.note}</li>)}</ul>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              {!readOnly && impact.status === "pending" && <Button onClick={() => setModify(true)}>Edit the proposed change</Button>}
              <Button variant="ghost" onClick={() => go("agents")}>See Bunty and Babli’s work →</Button>
            </div>

            {/* Everything technical stays available, folded away. */}
            <details className="group rounded-2xl border border-border">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground">
                <ChevronDown size={15} className="transition group-open:rotate-180" /> Technical details
              </summary>
              <div className="space-y-3 border-t border-border p-4 text-xs text-muted-foreground">
                <div className="flex flex-wrap gap-1.5">
                  <Badge className="font-mono">{impact.requirementKey}</Badge>
                  <Badge>{impact.severity} impact</Badge>
                  <Badge title="How much of the impact is explained by explicit dependencies">{r.confidence} confidence</Badge>
                  <Badge>based on context v{impact.baseContextVersion}</Badge>
                </div>
                <div>
                  <div className="mb-1 font-semibold text-foreground">Affected components and why</div>
                  <ul className="space-y-0.5">{r.affectedComponents.map((c) => <li key={c.key}><Badge>{c.category}</Badge> <b>{c.name}</b> — {c.reason}</li>)}</ul>
                </div>
                {redo > 0 && (
                  <div>
                    <div className="mb-1 font-semibold text-foreground">Outdated tasks</div>
                    {r.staleTasks.map((t) => <div key={t.id}>{t.title} ({t.agentKey}, {t.status})</div>)}
                  </div>
                )}
                <p>
                  How this is worked out: requirement dependencies are followed from {impact.requirementKey}, then requirement → component links and component dependencies. The rules engine rebuilds the preview with the proposed text and compares it. Only Bunty’s additions are marked as guesses. Effort is a rough estimate per type of component.
                </p>
              </div>
            </details>
          </div>
        </Card>

        <div className="space-y-4">
          {approval ? <ApprovalCard a={approval} /> : <Card className="p-4 text-sm text-muted-foreground">No approval is needed for this one.</Card>}
          <Card className="p-4 text-sm leading-relaxed text-muted-foreground">
            <b className="text-foreground">How ReBrix works this out.</b> It follows the links between your requirements and the parts of the app that use them, so it can tell what a change touches. Bunty may add extra thoughts, which are always marked as a guess. Nothing changes until enough people approve.
          </Card>
        </div>
      </div>
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
    <Modal open={open} onClose={onClose} title="Edit the proposed change">
      <div className="space-y-3">
        <Field label="Title"><input className={inputCls} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Description"><textarea className={inputCls} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Field label="Why"><input className={inputCls} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={async () => { await run({ type: "propose_change", key: impact.requirementKey, baseVersion: req?.version, replaces: impact.id, ...f }, "Checked again"); onClose(); }}>Check the effects again</Button>
        </div>
      </div>
    </Modal>
  );
}
