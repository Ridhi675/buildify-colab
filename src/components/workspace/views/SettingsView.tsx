"use client";

import { Cpu, Rocket, ShieldCheck, Users } from "lucide-react";
import { useState } from "react";
import { agentColor } from "../../effects";
import { Avatar, Badge, Button, Card, CardHeader, Field, inputCls } from "../../ui";
import { ApprovalCard, useWs } from "../shared";

export function SettingsView() {
  const { state, run } = useWs();
  const [pol, setPol] = useState(state.project.policy);
  const ai = state.ai;
  const release = state.approvals.find((a) => a.kind === "release");
  const readOnly = state.me.role === "observer";
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <Card>
        <CardHeader icon={<Users size={16} />} title="Participants" />
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          {state.members.map((m) => (
            <div key={m.userId} className="flex items-center gap-3 rounded-lg border border-slate-200 p-3">
              <Avatar name={m.name} color={m.color} />
              <div><div className="font-medium">{m.name}</div><div className="text-xs text-slate-500">{m.title} · {m.role === "observer" ? "can view, comment and ask the Reviewer" : "can approve"}</div></div>
            </div>
          ))}
          {state.agents.map((a) => (
            <div key={a.id} className="flex items-center gap-3 rounded-lg border border-slate-200 p-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: agentColor(a.key) }}>AI</span>
              <div><div className="font-medium">{a.name}</div><div className="text-xs text-slate-500">{a.role} · can recommend, never approve</div></div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader icon={<ShieldCheck size={16} />} title="Approval policy" subtitle="How many human approvals each kind of decision needs." />
        <div className="grid gap-3 p-4 sm:grid-cols-4">
          {(["major", "minor", "release"] as const).map((k) => (
            <Field key={k} label={k === "major" ? "Major (previews, medium/high-impact changes)" : k === "minor" ? "Minor (low-impact changes, rebuilds)" : "Final release"}>
              <select className={inputCls} disabled={readOnly} value={pol[k]} onChange={(e) => setPol({ ...pol, [k]: Number(e.target.value) })}><option value={1}>1 human</option><option value={2}>2 humans</option></select>
            </Field>
          ))}
          <div className="flex items-end"><Button variant="primary" disabled={readOnly} onClick={() => run({ type: "set_policy", ...pol }, "Policy saved")}>Save policy</Button></div>
        </div>
      </Card>

      <Card>
        <CardHeader icon={<Cpu size={16} />} title="AI provider" />
        <div className="space-y-2 p-4 text-sm">
          <div className="flex flex-wrap gap-1.5">
            <Badge tone={ai.enabled ? "violet" : "slate"}>{ai.enabled ? "LLM enabled" : "LLM not configured"}</Badge>
            <Badge>{ai.provider}</Badge>
            <Badge>{ai.model}</Badge>
            <Badge>${ai.pricing.inPerMTok}/MTok in · ${ai.pricing.outPerMTok}/MTok out</Badge>
          </div>
          <p className="text-xs text-slate-600">
            {ai.enabled
              ? "Agents call the configured model with schema-validated structured output, bounded retries and timeouts. If a call fails, the deterministic rules engine is used and the output is labelled “Rules engine”."
              : "Set ANTHROPIC_API_KEY, or LLM_PROVIDER=ollama for local models, in .env to enable LLM-generated interpretations, copy and inferred impact notes. Until then every agent output is produced by the deterministic rules engine and labelled as such — nothing is presented as AI-generated when it isn't."}
          </p>
          <p className="text-xs text-slate-500">Agent phases are paced at {state.metrics.stepDelayMs}ms (BC_AGENT_STEP_MS) so humans can see and interrupt work during a live demo.</p>
        </div>
      </Card>

      <Card>
        <CardHeader icon={<Rocket size={16} />} title="Final release" subtitle="Release the current artifact as the agreed product." actions={!readOnly && <Button disabled={!state.project.currentArtifactVerId || state.approvals.some((a) => a.kind === "release" && a.status === "pending")} onClick={() => run({ type: "request_release" }, "Release requested")}>Request final release</Button>} />
        <div className="p-4">{release ? <ApprovalCard a={release} /> : <div className="text-xs text-slate-500">No release requested yet.</div>}</div>
      </Card>
    </div>
  );
}
