"use client";

import { Eye, GitCompare, RefreshCw, Sparkles } from "lucide-react";
import { useState } from "react";
import { diffSpecs } from "@/lib/engine/spec";
import type { AppSpec, TextualSpec } from "@/lib/types";
import { AppRenderer } from "../../AppRenderer";
import { cn } from "../../client";
import { Badge, Button, Card, CardHeader, Empty, inputCls, SourceBadge, StatusBadge, Tabs } from "../../ui";
import { ApprovalCard, Comments, useWs } from "../shared";

export function PreviewStudio() {
  const { state, run } = useWs();
  const previews = state.previews;
  const [selId, setSelId] = useState<string | null>(null);
  const [device, setDevice] = useState<"auto" | "mobile" | "desktop">("auto");
  const [compare, setCompare] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const sel = previews.find((p) => p.id === selId) ?? previews[previews.length - 1];
  const other = previews.find((p) => p.id === compare);
  const running = state.tasks.find((t) => t.type === "preview" && ["queued", "running"].includes(t.status));
  const approval = state.approvals.find((a) => a.kind === "preview" && (a.payload as { previewId?: string }).previewId === sel?.id);
  const approved = state.requirements.filter((r) => r.status === "approved").length;
  const m = state.metrics;
  const readOnly = state.me.role === "observer";

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <Card>
        <CardHeader
          icon={<Eye size={16} />}
          title="Preview Studio"
          subtitle="A lightweight visual + textual preview, rendered from structured JSON. The Builder cannot start full generation until a preview is approved."
          actions={
            <Button variant="primary" disabled={!approved || !!running || readOnly} onClick={() => run({ type: "request_preview", feedback: feedback || undefined }, "Reviewer is composing a preview")}>
              {previews.length ? <RefreshCw size={14} /> : <Sparkles size={14} />} {previews.length ? "Regenerate preview" : "Generate preview"}
            </Button>
          }
        />
        <div className="flex flex-wrap items-center gap-2 p-4">
          {previews.map((p) => (
            <button key={p.id} onClick={() => setSelId(p.id)} className={cn("flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs", sel?.id === p.id ? "border-indigo-400 bg-indigo-50" : "border-slate-200 bg-white")}>
              Preview #{p.number} <StatusBadge status={p.status} />
            </button>
          ))}
          {running && <Badge tone="indigo"><span className="animate-pulse-soft">●</span> {running.phaseLabel}</Badge>}
          {!approved && <span className="text-xs text-slate-500">Approve at least one requirement first.</span>}
          {previews.length > 0 && <input className={cn(inputCls, "ml-auto max-w-xs py-1.5 text-xs")} placeholder="Feedback for the next preview…" value={feedback} onChange={(e) => setFeedback(e.target.value)} />}
        </div>
      </Card>

      {!sel ? (
        <Card className="p-5"><Empty icon={<Eye size={28} />} title="No preview yet">Generate a preview to see layout, navigation, theme, typography and the user journey before any expensive build.</Empty></Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <Card>
            <CardHeader
              title={<span className="flex items-center gap-2">Visual preview #{sel.number} <SourceBadge source={sel.source} /> <Badge>context v{sel.contextVersion}</Badge></span>}
              actions={<Tabs value={device} onChange={setDevice} items={[{ value: "auto", label: "Auto" }, { value: "mobile", label: "Mobile" }, { value: "desktop", label: "Desktop" }]} />}
            />
            <div className="bg-slate-100 p-4"><AppRenderer spec={sel.spec as AppSpec} device={device} /></div>
            <ThemeFacts spec={sel.spec as AppSpec} />
          </Card>
          <div className="space-y-5">
            {approval && <ApprovalCard a={approval} />}
            <TextualPanel t={sel.textual as TextualSpec} />
            <Card>
              <CardHeader title="Comments on this preview" />
              <div className="p-4"><Comments targetType="preview" targetId={sel.id} /></div>
            </Card>
          </div>
        </div>
      )}

      {previews.length > 1 && sel && (
        <Card>
          <CardHeader icon={<GitCompare size={16} />} title="Compare preview versions" actions={
            <select className={cn(inputCls, "w-48 py-1 text-xs")} value={compare ?? ""} onChange={(e) => setCompare(e.target.value || null)}>
              <option value="">Compare #{sel.number} with…</option>
              {previews.filter((p) => p.id !== sel.id).map((p) => <option key={p.id} value={p.id}>Preview #{p.number}</option>)}
            </select>
          } />
          {other && (
            <div className="space-y-1 p-4 text-sm">
              {diffSpecs(other.spec as AppSpec, sel.spec as AppSpec).map((d, i) => (
                <div key={i} className={cn("rounded px-2 py-1", d.kind === "added" ? "bg-emerald-50 text-emerald-800" : d.kind === "removed" ? "bg-rose-50 text-rose-800" : "bg-amber-50 text-amber-900")}>
                  {d.kind === "added" ? "+" : d.kind === "removed" ? "−" : "~"} {d.detail}
                </div>
              ))}
              {diffSpecs(other.spec as AppSpec, sel.spec as AppSpec).length === 0 && <div className="text-slate-500">No visual differences.</div>}
            </div>
          )}
        </Card>
      )}

      <Card>
        <CardHeader title="Cost & efficiency" subtitle="Counts are measured from persisted tasks and runs. Cost is estimated from token usage with configurable pricing; no savings are claimed." />
        <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4 lg:grid-cols-8">
          <Stat label="Preview requests" value={m.previewRequests} />
          <Stat label="Rejected previews" value={m.rejectedPreviews} />
          <Stat label="Build requests" value={m.buildRequests} />
          <Stat label="Rebuild attempts" value={m.rebuildAttempts} />
          <Stat label="LLM runs" value={m.llmRuns} />
          <Stat label="Rules-engine runs" value={m.rulesRuns} />
          <Stat label="Tokens in / out" value={`${m.tokensIn} / ${m.tokensOut}`} />
          <Stat label="Est. API cost" value={`$${m.costUsd.toFixed(4)}`} />
        </div>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-slate-50 p-2.5">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function ThemeFacts({ spec }: { spec: AppSpec }) {
  const t = spec.theme;
  return (
    <div className="flex flex-wrap gap-1.5 border-t border-slate-100 p-3">
      <Badge>{t.layout}</Badge>
      <Badge>{t.mode} theme</Badge>
      <Badge>text {Math.round(t.fontScale * 100)}%</Badge>
      <Badge>{t.contrast} contrast</Badge>
      <Badge>{t.motion} motion</Badge>
      <Badge>{spec.navigation.style} navigation</Badge>
      <Badge><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: t.primary }} /> {t.primary}</Badge>
    </div>
  );
}

function TextualPanel({ t }: { t: TextualSpec }) {
  if (!t) return null;
  const section = (title: string, items: string[]) => (
    <div>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</div>
      <ul className="list-disc space-y-0.5 pl-4 text-xs text-slate-700">{items.map((x, i) => <li key={i}>{x}</li>)}</ul>
    </div>
  );
  return (
    <Card>
      <CardHeader title="Textual preview" />
      <div className="space-y-3 p-4">
        <p className="text-sm text-slate-800">{t.summary}</p>
        <div className="text-xs"><b>Audience:</b> {t.audience}</div>
        {section("Main features", t.features)}
        {section("Functional requirements", t.functionalRequirements)}
        {section("Pages", t.pages.map((p) => `${p.name}: ${p.description}`))}
        {section("User journey", t.journey)}
        {section("Technical assumptions", t.assumptions)}
      </div>
    </Card>
  );
}
