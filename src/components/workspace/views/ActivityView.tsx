"use client";

import { Activity, Bot, User } from "lucide-react";
import { useState } from "react";
import { cn, timeAgo } from "../../client";
import { Badge, Card, CardHeader, Tabs } from "../../ui";
import { SimulatedNote, useWs } from "../shared";

export function ActivityView() {
  const { state } = useWs();
  const [who, setWho] = useState<"all" | "human" | "agent" | "system">("all");
  const list = state.activity.filter((a) => who === "all" || a.actorKind === who);
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <Card>
        <CardHeader icon={<Activity size={16} />} title="Activity" subtitle="Everything that happened — actor, action, affected item, context version and outcome. Ctrl/Cmd+Shift+A opens this view." actions={<Tabs value={who} onChange={setWho} items={[{ value: "all", label: "All" }, { value: "human", label: "Humans" }, { value: "agent", label: "Agents" }, { value: "system", label: "System" }]} />} />
        <ol className="divide-y divide-slate-100">
          {list.map((a) => {
            const member = state.members.find((m) => m.userId === a.actorId);
            return (
              <li key={a.id} className="flex items-start gap-3 px-4 py-2.5">
                <span className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white")} style={{ background: member?.color ?? (a.actorKind === "agent" ? "var(--agent-reviewer)" : "#94a3b8") }}>
                  {a.actorKind === "agent" ? <Bot size={14} /> : <User size={14} />}
                </span>
                <div className="min-w-0 flex-1 text-sm">
                  <div><b>{a.actorName}</b> {a.action.charAt(0).toLowerCase() + a.action.slice(1)}{a.target ? <> · <span className="text-slate-600">{a.target}</span></> : null}</div>
                  {a.outcome && <div className="text-xs text-slate-500">→ {a.outcome}</div>}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-[11px] text-slate-400" title={new Date(a.createdAt).toLocaleString()}>{timeAgo(a.createdAt)}</span>
                  <div className="flex gap-1">
                    {a.simulated && <SimulatedNote>event</SimulatedNote>}
                    <Badge>ctx v{a.contextVersion}</Badge>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </Card>
    </div>
  );
}
