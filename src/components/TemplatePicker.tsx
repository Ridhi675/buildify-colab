"use client";

// Grid of website templates with a live thumbnail of each (drawn by the same safe renderer).

import { Check } from "lucide-react";
import { useMemo } from "react";
import { deriveSpec } from "@/lib/engine/spec";
import { TEMPLATE_KEYS, TEMPLATES, type TemplateKey } from "@/lib/engine/templates";
import { AppRenderer } from "./AppRenderer";
import { cn } from "./client";

export function TemplatePicker({ value, onChange, disabled }: { value: TemplateKey; onChange: (t: TemplateKey) => void; disabled?: boolean }) {
  const samples = useMemo(() => Object.fromEntries(TEMPLATE_KEYS.map((k) => [k, deriveSpec([], TEMPLATES[k].sampleName, k)])), []);
  return (
    <div role="radiogroup" aria-label="Website template" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {TEMPLATE_KEYS.map((k) => {
        const t = TEMPLATES[k];
        const on = value === k;
        return (
          // A div, not a button: the thumbnail is a rendered app that contains buttons of its own.
          <div
            key={k}
            role="radio"
            aria-checked={on}
            aria-disabled={disabled}
            aria-label={`${t.name}: ${t.description}`}
            tabIndex={disabled ? -1 : on || (k === "auto" && !TEMPLATE_KEYS.includes(value)) ? 0 : -1}
            onClick={() => !disabled && onChange(k)}
            onKeyDown={(e) => {
              if (disabled) return;
              const i = TEMPLATE_KEYS.indexOf(k);
              const move = (d: number) => {
                const next = TEMPLATE_KEYS[(i + d + TEMPLATE_KEYS.length) % TEMPLATE_KEYS.length];
                onChange(next);
                (e.currentTarget.parentElement?.children[TEMPLATE_KEYS.indexOf(next)] as HTMLElement | undefined)?.focus();
              };
              if (e.key === " " || e.key === "Enter") (e.preventDefault(), onChange(k));
              else if (e.key === "ArrowRight" || e.key === "ArrowDown") (e.preventDefault(), move(1));
              else if (e.key === "ArrowLeft" || e.key === "ArrowUp") (e.preventDefault(), move(-1));
            }}
            className={cn(
              "group cursor-pointer overflow-hidden rounded-2xl border text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              disabled && "cursor-not-allowed opacity-60",
              on ? "border-accent ring-2 ring-accent/40" : "border-border hover:border-border-strong",
            )}
          >
            <div className="pointer-events-none relative h-24 overflow-hidden bg-muted/50" aria-hidden inert>
              {k === "auto" ? (
                <div className="flex h-full items-center justify-center text-3xl">✨</div>
              ) : (
                <div style={{ width: 760, transform: "scale(0.3)", transformOrigin: "top left" }}>
                  <AppRenderer spec={samples[k]} device="desktop" />
                </div>
              )}
              {on && <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-accent-foreground"><Check size={12} /></span>}
            </div>
            <div className="space-y-0.5 p-2.5">
              <div className="text-sm font-medium leading-tight">{t.name}</div>
              <div className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">{t.description}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
