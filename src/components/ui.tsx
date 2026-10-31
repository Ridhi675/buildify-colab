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
    primary: "bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm",
    secondary: "bg-white text-slate-800 border border-slate-200 hover:bg-slate-50 shadow-sm",
    ghost: "text-slate-600 hover:bg-slate-100",
    danger: "bg-white text-rose-700 border border-rose-200 hover:bg-rose-50",
    success: "bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm",
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
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500",
        size === "sm" ? "h-7 px-2.5 text-xs" : "h-9 px-3.5 text-sm",
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
    <div {...rest} className={cn("rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]", className)}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, icon, actions }: { title: ReactNode; subtitle?: ReactNode; icon?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
      <div className="flex min-w-0 items-start gap-2.5">
        {icon && <div className="mt-0.5 text-slate-500">{icon}</div>}
        <div className="min-w-0">
          <div className="font-semibold text-slate-900">{title}</div>
          {subtitle && <div className="mt-0.5 text-xs text-slate-500">{subtitle}</div>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
    </div>
  );
}

const TONES = {
  slate: "bg-slate-100 text-slate-700 ring-slate-200",
  indigo: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  rose: "bg-rose-50 text-rose-700 ring-rose-200",
  sky: "bg-sky-50 text-sky-700 ring-sky-200",
  violet: "bg-violet-50 text-violet-700 ring-violet-200",
} as const;
export type Tone = keyof typeof TONES;

export function Badge({ tone = "slate", children, className, title }: { tone?: Tone; children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset", TONES[tone], className)}>
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
        className={cn("inline-flex items-center justify-center rounded-full font-semibold text-white", ring && "ring-2 ring-white")}
        style={{ width: size, height: size, background: color, fontSize: size * 0.38 }}
      >
        {initials}
      </span>
      {online !== undefined && (
        <span className={cn("absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white", online ? "bg-emerald-500" : "bg-slate-300")} />
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
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 pt-[8vh]" onMouseDown={onClose}>
      <div role="dialog" aria-modal className={cn("animate-in w-full rounded-2xl bg-white shadow-2xl", wide ? "max-w-4xl" : "max-w-lg")} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <div className="font-semibold">{title}</div>
          <button aria-label="Close" onClick={onClose} className="rounded-md p-1 text-slate-500 hover:bg-slate-100">
            <X size={16} />
          </button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto p-5 scroll-thin">{children}</div>
      </div>
    </div>
  );
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 px-6 py-10 text-center">
      {icon && <div className="text-slate-400">{icon}</div>}
      <div className="font-medium text-slate-700">{title}</div>
      {children && <div className="max-w-md text-sm text-slate-500">{children}</div>}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <div className="mb-1 text-xs font-medium text-slate-600">{label}</div>
      {children}
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </label>
  );
}

export const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100";

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode }[] }) {
  return (
    <div className="inline-flex rounded-lg bg-slate-100 p-0.5" role="tablist">
      {items.map((i) => (
        <button
          key={i.value}
          role="tab"
          aria-selected={value === i.value}
          onClick={() => onChange(i.value)}
          className={cn("rounded-md px-2.5 py-1 text-xs font-medium transition", value === i.value ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900")}
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
