"use client";

import { BrainCircuit, Code2 } from "lucide-react";
import { onGlowMove } from "../effects";
import { BrandName } from "../brand";
import { Reveal } from "./motion";

const DUO = [
  {
    name: "Bunty",
    role: "AI Strategist",
    body: "The thoughtful planner who reviews requirements, spots conflicts and coordinates the team.",
    icon: BrainCircuit,
    color: "var(--agent-reviewer)",
  },
  {
    name: "Babli",
    role: "AI Builder",
    body: "The creative problem-solver who writes code, builds features and implements approved changes.",
    icon: Code2,
    color: "var(--agent-builder)",
  },
];

/** "Meet your AI duo": the two agents that join every project. */
export function AiDuo() {
  return (
    <section id="duo" className="mx-auto max-w-5xl scroll-mt-28 px-4 py-12">
      <Reveal className="rounded-[2rem] border border-border bg-surface/70 p-5 shadow-md backdrop-blur-xl sm:p-7">
        <div className="mb-5 flex items-center justify-between gap-3">
          <BrandName className="text-xl" />
          <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold text-foreground/80">Meet your AI duo</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {DUO.map((a) => (
            <article
              key={a.name}
              onPointerMove={onGlowMove}
              className="glow-card rounded-3xl border p-6"
              style={{ background: `color-mix(in oklab, ${a.color} 12%, var(--surface))`, borderColor: `color-mix(in oklab, ${a.color} 30%, transparent)` }}
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl text-white shadow-sm" style={{ background: a.color }}>
                <a.icon size={20} />
              </span>
              <h3 className="mt-4 text-2xl font-bold tracking-tight text-foreground">{a.name}</h3>
              <div className="mt-1 text-sm font-semibold" style={{ color: `color-mix(in oklab, ${a.color} 80%, var(--foreground))` }}>{a.role}</div>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{a.body}</p>
            </article>
          ))}
        </div>
        <p className="mt-5 text-center text-sm text-muted-foreground">Two minds. One mission. Infinite possibilities.</p>
      </Reveal>
    </section>
  );
}
