"use client";

// Safe renderer for the shared product artifact. It only maps known component
// types from structured JSON to React — generated code is never executed.

import { Bell, Calendar, CheckCircle2, ChevronRight, HelpCircle, Home, Phone, Stethoscope, User } from "lucide-react";
import { useState } from "react";
import type { AppSpec, SpecComponent } from "@/lib/types";
import { cn } from "./client";

export interface Highlight {
  key: string;
  tone: "changed" | "selected" | "editing";
  label?: string;
}

export function AppRenderer({
  spec,
  device = "auto",
  onSelect,
  highlights = [],
  commentCounts = {},
}: {
  spec: AppSpec;
  device?: "auto" | "mobile" | "desktop";
  onSelect?: (c: SpecComponent) => void;
  highlights?: Highlight[];
  commentCounts?: Record<string, number>;
}) {
  const [page, setPage] = useState(0);
  const t = spec.theme;
  const mobile = device === "mobile" || (device === "auto" && t.layout === "mobile-first");
  const dark = t.mode === "dark";
  const hc = t.contrast === "high";
  const fs = t.fontScale;
  const pad = t.density === "spacious" ? 20 : t.density === "comfortable" ? 16 : 12;
  const current = spec.pages[Math.min(page, spec.pages.length - 1)];

  const colors = {
    bg: dark ? "#0b1220" : "#ffffff",
    surface: dark ? "#111a2e" : hc ? "#ffffff" : "#f8fafc",
    text: dark ? "#e5e7eb" : hc ? "#000000" : "#0f172a",
    muted: dark ? "#94a3b8" : hc ? "#1f2937" : "#64748b",
    border: dark ? "#1e293b" : hc ? "#111827" : "#e2e8f0",
    primary: t.primary,
  };
  const hl = (k: string) => highlights.find((h) => h.key === k);
  const icons = [Home, Calendar, CheckCircle2, HelpCircle, User];

  const nav = (
    <nav
      data-component="nav"
      onClick={() => onSelect?.({ key: "nav", type: "nav", title: "Navigation", body: spec.navigation.style, items: spec.navigation.items, requirementKeys: [] })}
      className={cn("relative flex", spec.navigation.style === "bottom-tabs" ? "justify-around" : "gap-1", onSelect && "cursor-pointer")}
      style={{ borderTop: spec.navigation.style === "bottom-tabs" ? `1px solid ${colors.border}` : undefined, borderBottom: spec.navigation.style !== "bottom-tabs" ? `1px solid ${colors.border}` : undefined, padding: 8, background: colors.bg, outline: outlineFor(hl("nav") ?? hl("navigation")) }}
    >
      {spec.pages.map((p, i) => {
        const Icon = icons[i] ?? Home;
        const active = i === page;
        return (
          <button
            key={p.key}
            onClick={(e) => {
              e.stopPropagation();
              setPage(i);
            }}
            className="flex items-center gap-1.5 rounded-lg font-medium"
            style={{
              flexDirection: spec.navigation.style === "bottom-tabs" ? "column" : "row",
              padding: spec.navigation.style === "bottom-tabs" ? `${6 * fs}px ${10 * fs}px` : `${6 * fs}px ${12 * fs}px`,
              fontSize: (spec.navigation.style === "bottom-tabs" ? 11 : 13) * fs,
              color: active ? colors.primary : colors.muted,
              background: active && spec.navigation.style !== "bottom-tabs" ? `${colors.primary}14` : "transparent",
            }}
          >
            <Icon size={16 * fs} />
            {p.name}
          </button>
        );
      })}
      {hl("nav") && <HighlightTag h={hl("nav")!} />}
    </nav>
  );

  return (
    <div className={cn("mx-auto overflow-hidden border shadow-xl", mobile ? "w-[390px] max-w-full rounded-[28px]" : "w-full rounded-xl")} style={{ background: colors.bg, color: colors.text, borderColor: dark ? "#1e293b" : "#cbd5e1" }}>
      <div className="flex items-center justify-between" style={{ padding: `${10}px ${pad}px`, background: colors.primary, color: "#fff" }}>
        <div className="flex items-center gap-2 font-semibold" style={{ fontSize: 15 * fs }}>
          <Stethoscope size={18 * fs} /> {spec.appName}
        </div>
        {!mobile && <div style={{ fontSize: 12 * fs, opacity: 0.9 }}>{spec.tagline}</div>}
      </div>
      {spec.navigation.style !== "bottom-tabs" && nav}
      <div className={cn(!mobile && spec.navigation.style === "sidebar" && "flex")}>
        <main className="flex-1" style={{ padding: pad, minHeight: mobile ? 520 : 380 }}>
          <div className="mb-3" style={{ fontSize: 12 * fs, color: colors.muted }}>
            {current.purpose}
          </div>
          <div className={cn("grid gap-3", !mobile && current.components.length > 1 && "md:grid-cols-2")}>
            {current.components.map((c) => (
              <Block key={c.key} c={c} fs={fs} colors={colors} pad={pad} reduced={t.motion === "reduced"} onSelect={onSelect} highlight={hl(c.key)} comments={commentCounts[c.key]} onNext={() => setPage((p) => Math.min(p + 1, spec.pages.length - 1))} />
            ))}
          </div>
        </main>
      </div>
      {spec.navigation.style === "bottom-tabs" && nav}
    </div>
  );
}

function outlineFor(h?: Highlight) {
  if (!h) return undefined;
  return h.tone === "changed" ? "3px solid #f59e0b" : h.tone === "editing" ? "3px dashed #e11d48" : "3px solid #6366f1";
}

function HighlightTag({ h }: { h: Highlight }) {
  const bg = h.tone === "changed" ? "#f59e0b" : h.tone === "editing" ? "#e11d48" : "#6366f1";
  return (
    <span className="pointer-events-none absolute -top-2.5 right-2 z-10 rounded px-1.5 py-0.5 text-[10px] font-semibold text-white shadow" style={{ background: bg }}>
      {h.label ?? (h.tone === "changed" ? "changed" : h.tone === "editing" ? "being edited" : "selected")}
    </span>
  );
}

type Colors = { bg: string; surface: string; text: string; muted: string; border: string; primary: string };

function Block({ c, fs, colors, pad, reduced, onSelect, highlight, comments, onNext }: { c: SpecComponent; fs: number; colors: Colors; pad: number; reduced: boolean; onSelect?: (c: SpecComponent) => void; highlight?: Highlight; comments?: number; onNext: () => void }) {
  const [picked, setPicked] = useState<number | null>(null);
  const btn = (label: string, primary = true, onClick?: () => void) => (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      className={cn("rounded-lg font-semibold", !reduced && "transition-transform active:scale-[0.98]")}
      style={{ minHeight: 36 * fs, padding: `0 ${14 * fs}px`, fontSize: 13 * fs, background: primary ? colors.primary : "transparent", color: primary ? "#fff" : colors.primary, border: `1.5px solid ${colors.primary}` }}
    >
      {label}
    </button>
  );
  const body = <p style={{ fontSize: 13 * fs, color: colors.muted, lineHeight: 1.5 }}>{c.body}</p>;

  let content: React.ReactNode;
  switch (c.type) {
    case "hero":
    case "cta":
      content = (
        <div className="space-y-3">
          <h2 className="font-bold" style={{ fontSize: 22 * fs, lineHeight: 1.2 }}>{c.title}</h2>
          {body}
          <div className="flex flex-wrap gap-2">
            {btn("Book appointment", true, onNext)}
            {c.items[0] && <span className="flex items-center gap-1" style={{ fontSize: 12 * fs, color: colors.muted }}>{c.items[0].startsWith("Call") ? <Phone size={14 * fs} /> : null}{c.items[0]}</span>}
          </div>
        </div>
      );
      break;
    case "doctor-list":
    case "list":
    case "feature-list":
      content = (
        <div className="space-y-2">
          <h3 className="font-semibold" style={{ fontSize: 16 * fs }}>{c.title}</h3>
          {body}
          {c.items.map((it, i) => (
            <button key={i} onClick={(e) => (e.stopPropagation(), setPicked(i))} className="flex w-full items-center justify-between rounded-lg text-left" style={{ padding: `${8 * fs}px ${10 * fs}px`, border: `1.5px solid ${picked === i ? colors.primary : colors.border}`, background: colors.surface, fontSize: 13 * fs }}>
              <span className="flex items-center gap-2"><User size={14 * fs} style={{ color: colors.primary }} />{it}</span>
              <ChevronRight size={14 * fs} />
            </button>
          ))}
        </div>
      );
      break;
    case "slot-picker":
      content = (
        <div className="space-y-2">
          <h3 className="font-semibold" style={{ fontSize: 16 * fs }}>{c.title}</h3>
          {body}
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${fs >= 1.5 ? 1 : 3}, minmax(0,1fr))` }}>
            {c.items.map((s, i) => (
              <button key={i} onClick={(e) => (e.stopPropagation(), setPicked(i))} className="rounded-lg font-medium" style={{ minHeight: 34 * fs, fontSize: 13 * fs, border: `1.5px solid ${picked === i ? colors.primary : colors.border}`, background: picked === i ? colors.primary : colors.surface, color: picked === i ? "#fff" : colors.text }}>
                {s}
              </button>
            ))}
          </div>
        </div>
      );
      break;
    case "booking-form":
    case "form":
      content = (
        <div className="space-y-2">
          <h3 className="font-semibold" style={{ fontSize: 16 * fs }}>{c.title}</h3>
          {body}
          {c.items.map((f, i) => (
            <div key={i}>
              <div style={{ fontSize: 12 * fs, color: colors.muted, marginBottom: 2 }}>{f}</div>
              <div className="rounded-lg" style={{ height: 32 * fs, border: `1.5px solid ${colors.border}`, background: colors.surface }} />
            </div>
          ))}
          <div className="pt-1">{btn("Confirm booking", true, onNext)}</div>
        </div>
      );
      break;
    case "confirmation":
      content = (
        <div className="space-y-2 text-center">
          <CheckCircle2 className="mx-auto" size={40 * fs} style={{ color: "#16a34a" }} />
          <h3 className="font-bold" style={{ fontSize: 18 * fs }}>{c.title}</h3>
          {body}
        </div>
      );
      break;
    case "reminders":
      content = (
        <div className="space-y-2">
          <h3 className="flex items-center gap-2 font-semibold" style={{ fontSize: 16 * fs }}><Bell size={16 * fs} />{c.title}</h3>
          {c.items.map((r, i) => (
            <label key={i} className="flex items-center gap-2" style={{ fontSize: 13 * fs }}>
              <input type="checkbox" defaultChecked style={{ width: 16 * fs, height: 16 * fs, accentColor: colors.primary }} /> {r}
            </label>
          ))}
        </div>
      );
      break;
    default:
      content = (
        <div className="space-y-2">
          <h3 className="font-semibold" style={{ fontSize: 16 * fs }}>{c.title}</h3>
          {body}
          {c.items.length > 0 && <ul className="list-disc pl-5" style={{ fontSize: 13 * fs }}>{c.items.map((x, i) => <li key={i}>{x}</li>)}</ul>}
        </div>
      );
  }

  return (
    <section
      data-component={c.key}
      onClick={() => onSelect?.(c)}
      className={cn("relative rounded-xl", onSelect && "cursor-pointer hover:brightness-[0.98]")}
      style={{ padding: pad, background: colors.surface, border: `1px solid ${colors.border}`, outline: outlineFor(highlight), outlineOffset: 2 }}
    >
      {highlight && <HighlightTag h={highlight} />}
      {!!comments && (
        <span className="absolute right-2 top-2 rounded-full bg-indigo-600 px-1.5 text-[10px] font-semibold text-white">{comments} 💬</span>
      )}
      {content}
    </section>
  );
}
