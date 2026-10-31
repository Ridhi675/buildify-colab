"use client";

import { X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "./client";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success";

export function Button({
  variant = "secondary",
  size = "md",
  className,
  busy,
  onClick,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md"; busy?: boolean }) {
  const [running, setRunning] = useState(false);
  const styles: Record<Variant, string> = {
    primary: "glow-btn bg-accent text-accent-foreground shadow-sm hover:brightness-110",
    secondary: "bg-surface text-foreground border border-border shadow-xs hover:bg-muted",
    ghost: "text-muted-foreground hover:bg-muted hover:text-foreground",
    danger: "bg-surface text-rose-700 border border-rose-200 hover:bg-rose-50",
    success: "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700",
  };
  const isBusy = busy || running;
  return (
    <button
      {...rest}
      disabled={rest.disabled || isBusy}
      onClick={async (e) => {
        if (!onClick) return;
        const r = onClick(e) as unknown;
        if (r instanceof Promise) {
          setRunning(true);
          try {
            await r;
          } finally {
            setRunning(false);
          }
        }
      }}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-full font-medium transition disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        size === "sm" ? "h-8 px-3 text-xs" : "h-10 px-4 text-sm",
        styles[variant],
        className,
      )}
    >
      {isBusy && <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  );
}

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={cn("rounded-2xl border border-border bg-surface shadow-sm", className)}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, icon, actions }: { title: ReactNode; subtitle?: ReactNode; icon?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
      <div className="flex min-w-0 items-start gap-2.5">
        {icon && <div className="mt-0.5 text-muted-foreground">{icon}</div>}
        <div className="min-w-0">
          <div className="font-semibold tracking-tight text-foreground">{title}</div>
          {subtitle && <div className="mt-0.5 text-xs text-muted-foreground">{subtitle}</div>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
    </div>
  );
}

const TONES = {
  slate: "bg-muted text-muted-foreground ring-border",
  indigo: "bg-accent-soft text-accent ring-accent/20",
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  rose: "bg-rose-50 text-rose-700 ring-rose-200",
  sky: "bg-sky-50 text-sky-700 ring-sky-200",
  violet: "bg-violet-50 text-violet-700 ring-violet-200",
} as const;
export type Tone = keyof typeof TONES;

export function Badge({ tone = "slate", children, className, title }: { tone?: Tone; children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset", TONES[tone], className)}>
      {children}
    </span>
  );
}

export const STATUS_TONE: Record<string, Tone> = {
  approved: "emerald", completed: "emerald", idle: "slate", working: "indigo", running: "indigo", queued: "sky",
  pending: "amber", proposed: "amber", paused: "amber", waiting: "amber", revision_requested: "amber", changes_requested: "amber",
  rejected: "rose", failed: "rose", cancelled: "slate", quarantined: "rose", conflict: "rose", stopped: "slate",
  superseded: "slate", modified: "slate", restarting: "violet", high: "rose", medium: "amber", low: "emerald", released: "emerald",
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONE[status] ?? "slate"}>{status.replace(/_/g, " ")}</Badge>;
}

export function Avatar({ name, color, size = 28, online, ring }: { name: string; color: string; size?: number; online?: boolean; ring?: boolean }) {
  const initials = name.split(" ").map((p) => p[0]).slice(0, 2).join("");
  return (
    <span className="relative inline-flex shrink-0" title={`${name}${online === undefined ? "" : online ? " — online" : " — offline"}`}>
      <span
        className={cn("inline-flex items-center justify-center rounded-full font-semibold text-white", ring && "ring-2 ring-surface")}
        style={{ width: size, height: size, background: color, fontSize: size * 0.38 }}
      >
        {initials}
      </span>
      {online !== undefined && (
        <span className={cn("absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-surface", online ? "bg-emerald-500" : "bg-border-strong")} />
      )}
    </span>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-overlay p-4 pt-[8vh] backdrop-blur-sm" onMouseDown={onClose}>
      <div role="dialog" aria-modal className={cn("animate-in w-full rounded-3xl border border-border bg-surface text-foreground shadow-lg", wide ? "max-w-4xl" : "max-w-lg")} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="font-semibold tracking-tight">{title}</div>
          <button aria-label="Close" onClick={onClose} className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
            <X size={16} />
          </button>
        </div>
        <div data-lenis-prevent className="max-h-[75vh] overflow-y-auto p-6 scroll-thin">{children}</div>
      </div>
    </div>
  );
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border px-6 py-10 text-center">
      {icon && <div className="text-muted-foreground/70">{icon}</div>}
      <div className="font-medium text-foreground">{title}</div>
      {children && <div className="max-w-md text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <div className="mb-1.5 text-xs font-medium text-muted-foreground">{label}</div>
      {children}
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </label>
  );
}

export const inputCls =
  "w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-foreground shadow-xs outline-none transition placeholder:text-muted-foreground/70 focus:border-accent/50 focus:ring-4 focus:ring-accent/10";

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode }[] }) {
  return (
    <div className="inline-flex rounded-full bg-muted p-1" role="tablist">
      {items.map((i) => (
        <button
          key={i.value}
          role="tab"
          aria-selected={value === i.value}
          onClick={() => onChange(i.value)}
          className={cn("rounded-full px-3 py-1 text-xs font-medium transition", value === i.value ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
        >
          {i.label}
        </button>
      ))}
    </div>
  );
}

export function SourceBadge({ source }: { source?: string }) {
  if (!source) return null;
  return source === "llm" ? (
    <Badge tone="violet" title="Generated by the configured LLM">LLM</Badge>
  ) : (
    <Badge tone="slate" title="Generated by the deterministic rules engine (no LLM key configured or LLM unavailable)">Rules engine</Badge>
  );
}
