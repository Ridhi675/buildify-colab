"use client";

import { Rows3 } from "lucide-react";
import { useState } from "react";
import { cn, timeAgo } from "../../client";
import { agentColor } from "../../effects";
import { Card, CardHeader, Tabs } from "../../ui";
import { useWs } from "../shared";

type Event = ReturnType<typeof useWs>["state"]["activity"][number];

/** Who did what, in order: one lane per person and agent, one column per step. */
export function SwimlaneView() {
  const { state } = useWs();
  const [range, setRange] = useState<"recent" | "all">("recent");
  const events = [...state.activity].reverse(); // oldest → newest
  const shown = range === "recent" ? events.slice(-40) : events;

  const lanes = [
    ...state.members.map((m) => ({ id: m.userId, name: m.name.split(" ")[0], sub: m.title, color: m.color })),
    ...state.agents.map((a) => ({ id: a.id, name: a.name, sub: a.key === "reviewer" ? "Reviewer AI" : "Builder AI", color: agentColor(a.key) })),
  ];
  const laneOf = (e: Event) => (lanes.some((l) => l.id === e.actorId) ? e.actorId : "system");
  if (shown.some((e) => laneOf(e) === "system")) lanes.push({ id: "system", name: "System", sub: "checks & events", color: "#94a3b8" });

  return (
    <div className="mx-auto max-w-6xl">
      <Card>
        <CardHeader
          icon={<Rows3 size={16} />}
          title="Swimlane"
          subtitle="Each row is a person or agent; each column is one step, oldest on the left."
          actions={<Tabs value={range} onChange={setRange} items={[{ value: "recent", label: "Last 40" }, { value: "all", label: "All" }]} />}
        />
        {shown.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Nothing has happened yet.</div>
        ) : (
          <div className="flex">
            <div className="shrink-0 border-r border-border">
              {lanes.map((l) => (
                <div key={l.id} className="flex h-20 w-36 items-center gap-2 border-b border-border px-3 last:border-b-0">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: l.color }} />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{l.name}</div>
                    <div className="truncate text-[11px] text-muted-foreground">{l.sub}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="min-w-0 flex-1 overflow-x-auto scroll-thin" ref={(el) => { if (el) el.scrollLeft = el.scrollWidth; }}>
              <div className="relative" style={{ width: shown.length * 132 + 16 }}>
                {lanes.map((l) => (
                  <div key={l.id} className="relative h-20 border-b border-border last:border-b-0">
                    <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
                    {shown.map((e, i) =>
                      laneOf(e) === l.id ? (
                        <div
                          key={e.id}
                          className={cn("absolute top-1/2 w-[124px] -translate-y-1/2 rounded-lg border bg-surface px-2 py-1.5 text-[11px] leading-tight shadow-sm", e.simulated && "border-dashed")}
                          style={{ left: 8 + i * 132, borderColor: l.color }}
                          title={`${e.actorName}: ${e.action}${e.target ? ` · ${e.target}` : ""}${e.outcome ? ` → ${e.outcome}` : ""}\n${new Date(e.createdAt).toLocaleString()}`}
                        >
                          <div className="line-clamp-2 font-medium text-foreground">{e.action}</div>
                          <div className="mt-0.5 truncate text-muted-foreground">{timeAgo(e.createdAt)}</div>
                        </div>
                      ) : null,
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
