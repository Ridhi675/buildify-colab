"use client";

import { Blocks } from "lucide-react";
import { cn } from "./client";

// Agent colours live in globals.css (--agent-reviewer / --agent-builder).
export const agentColor = (key: string) => (key === "reviewer" ? "var(--agent-reviewer)" : "var(--agent-builder)");

/** Pointer-follow position for `.glow-card` (see globals.css). */
export function onGlowMove(e: React.PointerEvent<HTMLElement>) {
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  el.style.setProperty("--gx", `${e.clientX - r.left}px`);
  el.style.setProperty("--gy", `${e.clientY - r.top}px`);
}

/** Logo mark with the project's actors orbiting it. Decorative only. */
export function OrbitLogo({ colors, size = 96, className }: { colors: string[]; size?: number; className?: string }) {
  const n = Math.max(colors.length, 1);
  return (
    <div aria-hidden className={cn("relative shrink-0", className)} style={{ width: size, height: size }}>
      <span className="halo absolute inset-[22%] rounded-[30%] bg-accent/35" />
      <div className="orbit absolute inset-0 rounded-full border border-dashed border-border-strong">
        {colors.map((c, i) => (
          <span key={i} className="absolute left-1/2 top-1/2" style={{ transform: `rotate(${(i * 360) / n}deg) translateY(-${size / 2}px)` }}>
            <span className="orbit-counter -ml-[7px] -mt-[7px] block h-3.5 w-3.5 rounded-full shadow-sm ring-2 ring-surface" style={{ background: c }} />
          </span>
        ))}
      </div>
      <div className="absolute inset-[24%] flex items-center justify-center rounded-[30%] bg-accent text-accent-foreground shadow-md">
        <Blocks size={size * 0.24} />
      </div>
    </div>
  );
}
