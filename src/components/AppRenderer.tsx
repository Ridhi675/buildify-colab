"use client";

// Safe renderer for the shared product artifact. It only maps known component
// types from structured JSON to React — generated code is never executed.

import { Bell, Calendar, CheckCircle2, ChevronRight, HelpCircle, Home, Phone, Stethoscope, User } from "lucide-react";
import { useState } from "react";
import type { AppSpec, SpecComponent } from "@/lib/types";
import { initials, pair, plan, product, quote } from "@/lib/engine/items";
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
  const booking = spec.pages.some((p) => p.components.some((x) => x.type === "booking-form"));
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
          {booking && <Stethoscope size={18 * fs} />} {spec.appName}
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
              <Block key={c.key} c={c} fs={fs} colors={colors} pad={pad} reduced={t.motion === "reduced"} onSelect={onSelect} highlight={hl(c.key)} comments={commentCounts[c.key]} booking={booking} onNext={() => setPage((p) => Math.min(p + 1, spec.pages.length - 1))} />
            ))}
          </div>
        </main>
      </div>
      {spec.navigation.style === "bottom-tabs" && nav}
    </div>
  );
}

function Field({ label, fs, colors }: { label: string; fs: number; colors: Colors }) {
  return (
    <div>
      <div style={{ fontSize: 12 * fs, color: colors.muted, marginBottom: 2 }}>{label}</div>
      <div className="rounded-lg" style={{ height: 32 * fs, border: `1.5px solid ${colors.border}`, background: colors.surface }} />
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

function Block({ c, fs, colors, pad, reduced, onSelect, highlight, comments, booking, onNext }: { c: SpecComponent; fs: number; colors: Colors; pad: number; reduced: boolean; onSelect?: (c: SpecComponent) => void; highlight?: Highlight; comments?: number; booking: boolean; onNext: () => void }) {
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
  const body = c.body ? <p style={{ fontSize: 13 * fs, color: colors.muted, lineHeight: 1.5 }}>{c.body}</p> : null;
  const heading = <h3 className="font-semibold" style={{ fontSize: 16 * fs }}>{c.title}</h3>;

  let content: React.ReactNode;
  switch (c.type) {
    case "hero":
    case "cta":
      content = (
        <div className="space-y-3">
          <h2 className="font-bold" style={{ fontSize: 22 * fs, lineHeight: 1.2 }}>{c.title}</h2>
          {body}
          <div className="flex flex-wrap gap-2">
            {btn(booking ? "Book appointment" : "Get started", true, onNext)}
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
          <div className="pt-1">{btn(c.type === "booking-form" ? "Confirm booking" : "Save", true, onNext)}</div>
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
    // ---- template sections (layouts adapted from Start Bootstrap, MIT) ----
    case "product-grid":
      content = (
        <div className="space-y-2">
          {heading}
          <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))" }}>
            {c.items.map((it, i) => {
              const p = product(it);
              return (
                <div key={i} className="relative space-y-1 rounded-lg p-2 text-center" style={{ border: `1px solid ${colors.border}`, background: colors.bg, fontSize: 12 * fs }}>
                  {p.sale && <span className="absolute right-3 top-3 rounded-full px-1.5 text-[10px] font-bold" style={{ background: colors.text, color: colors.bg }}>Sale</span>}
                  <div className="flex aspect-[4/3] items-center justify-center rounded-md text-lg font-extrabold" style={{ background: `${colors.primary}1f`, color: colors.primary }}>{initials(p.name)}</div>
                  <div className="font-semibold">{p.name}</div>
                  <div className="font-semibold">{p.sale && <s style={{ color: colors.muted, fontWeight: 400 }}>{p.price}</s>} {p.sale ?? p.price}</div>
                  {btn("Add to cart", false)}
                </div>
              );
            })}
          </div>
        </div>
      );
      break;
    case "cart":
    case "checkout":
      content = (
        <div className="space-y-2">
          {heading}
          {body}
          <div className="rounded-lg p-2" style={{ border: `1px dashed ${colors.border}`, fontSize: 12 * fs, color: colors.muted }}>Cart items and total appear here</div>
          {c.type === "checkout" && c.items.map((f, i) => <Field key={i} label={f} fs={fs} colors={colors} />)}
          {btn(c.type === "cart" ? "Checkout" : "Place order", true, onNext)}
        </div>
      );
      break;
    case "menu":
    case "hours":
    case "schedule":
      content = (
        <div className="space-y-1">
          {heading}
          {body}
          {c.items.map((it, i) => {
            const p = c.type === "menu" ? product(it) : null;
            const r = c.type === "hours" ? pair(it, /\s+·\s+/) : pair(it);
            return (
              <div key={i} className="flex justify-between gap-3 py-1.5" style={{ borderBottom: `1px dashed ${colors.border}`, fontSize: 13 * fs }}>
                {p ? (
                  <>
                    <span><b>{p.name}</b>{p.note && <span className="block" style={{ color: colors.muted, fontSize: 11 * fs }}>{p.note}</span>}</span>
                    <b>{p.price}</b>
                  </>
                ) : c.type === "schedule" ? (
                  <span className="flex gap-3"><b style={{ color: colors.primary, minWidth: 48 * fs }}>{r.a}</b>{r.b}</span>
                ) : (
                  <>
                    <span>{r.a}</span>
                    <b>{r.b}</b>
                  </>
                )}
              </div>
            );
          })}
        </div>
      );
      break;
    case "team":
    case "testimonials":
      content = (
        <div className="space-y-2">
          {heading}
          <div className="grid gap-2 text-center" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", fontSize: 12 * fs }}>
            {c.items.map((it, i) => {
              const q = c.type === "testimonials" ? quote(it) : null;
              const r = pair(it);
              const who = q ? q.who : r.a;
              return (
                <div key={i} className="space-y-1 rounded-lg p-2" style={{ border: `1px solid ${colors.border}`, background: colors.bg }}>
                  <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full font-bold text-white" style={{ background: colors.primary }}>{initials(who || "?")}</div>
                  {q ? <><p>“{q.text}”</p><div style={{ color: colors.muted }}>{q.who}</div></> : <><b>{r.a}</b><div style={{ color: colors.muted }}>{r.b}</div></>}
                </div>
              );
            })}
          </div>
        </div>
      );
      break;
    case "gallery":
      content = (
        <div className="space-y-2">
          {heading}
          <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", fontSize: 12 * fs }}>
            {c.items.map((it, i) => {
              const r = pair(it);
              return (
                <div key={i} className="overflow-hidden rounded-lg" style={{ border: `1px solid ${colors.border}`, background: colors.bg }}>
                  <div className="aspect-[4/3]" style={{ background: `linear-gradient(${45 + i * 40}deg, ${colors.primary}, ${colors.primary}55)` }} />
                  <div className="p-1.5"><b className="block">{r.a}</b><span style={{ color: colors.muted }}>{r.b}</span></div>
                </div>
              );
            })}
          </div>
        </div>
      );
      break;
    case "pricing":
      content = (
        <div className="space-y-2">
          {heading}
          {body}
          <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", fontSize: 12 * fs }}>
            {c.items.map((it, i) => {
              const p = plan(it);
              return (
                <div key={i} className="space-y-1 rounded-lg p-2" style={{ border: `${i === 1 ? 2 : 1}px solid ${i === 1 ? colors.primary : colors.border}`, background: colors.bg }}>
                  <b>{p.name}</b>
                  <div className="text-lg font-extrabold">{p.price}</div>
                  <ul className="list-disc pl-4" style={{ color: colors.muted }}>{p.features.map((f, j) => <li key={j}>{f}</li>)}</ul>
                </div>
              );
            })}
          </div>
        </div>
      );
      break;
    case "contact":
      content = (
        <div className="space-y-2">
          {heading}
          {body}
          {c.items.map((f, i) => <Field key={i} label={f} fs={fs} colors={colors} />)}
          <div className="pt-1">{btn("Send", true)}</div>
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
