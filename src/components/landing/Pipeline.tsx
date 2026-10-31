"use client";

import { ClipboardList, Code2, Eye, FlaskConical, Lightbulb, Rocket, Waves } from "lucide-react";
import { Fragment } from "react";

// The real ReBrix flow, in order. Each step lights up in turn (CSS only).
const STEPS = [
  { icon: Lightbulb, label: "Describe" },
  { icon: ClipboardList, label: "Requirements" },
  { icon: Eye, label: "Preview" },
  { icon: Code2, label: "Build" },
  { icon: FlaskConical, label: "Test" },
  { icon: Waves, label: "Ripple" },
  { icon: Rocket, label: "Release" },
];
const STEP_S = 0.8; // seconds per step; the cycle is STEPS.length * STEP_S (matches 5.6s in globals.css)

export function Pipeline() {
  return (
    <ol aria-label="How a product moves through ReBrix" className="mx-auto flex w-full max-w-5xl items-start">
      {STEPS.map((s, i) => (
        <Fragment key={s.label}>
          <li className="flex shrink-0 flex-col items-center gap-2">
            <span
              className="pipe-node flex h-11 w-11 items-center justify-center rounded-2xl border border-border bg-surface/70 text-muted-foreground backdrop-blur sm:h-14 sm:w-14"
              style={{ ["--delay" as string]: `${i * STEP_S}s` }}
            >
              <s.icon size={20} strokeWidth={1.75} />
            </span>
            <span className="hidden text-[11px] font-medium text-muted-foreground sm:block">{s.label}</span>
          </li>
          {i < STEPS.length - 1 && (
            <li aria-hidden className="relative mt-[22px] h-px flex-1 bg-border-strong sm:mt-7">
              <span className="pipe-pulse absolute inset-0" style={{ animationDelay: `${i * STEP_S + 0.35}s` }}>
                <span className="absolute -top-[2px] right-0 h-[5px] w-4 rounded-full bg-accent shadow-[0_0_12px_var(--accent)]" />
              </span>
            </li>
          )}
        </Fragment>
      ))}
    </ol>
  );
}
