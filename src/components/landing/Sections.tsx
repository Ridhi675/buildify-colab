"use client";

import { Bot, CheckCircle2, History, RotateCw, ShieldCheck, ShieldOff, Users, Waves } from "lucide-react";
import { m, useMotionValueEvent, useScroll, useTransform } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "../client";
import { onGlowMove } from "../effects";
import { Reveal } from "./motion";

export function SectionHeading({ eyebrow, title, children, align = "center" }: { eyebrow: string; title: string; children?: ReactNode; align?: "center" | "left" }) {
  return (
    <Reveal className={align === "center" ? "mx-auto mb-10 max-w-2xl text-center" : "max-w-xl"}>
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">{eyebrow}</div>
      <h2 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-foreground sm:text-[2.6rem] sm:leading-[1.1]">{title}</h2>
      {children && <p className="mt-3 text-base text-muted-foreground">{children}</p>}
    </Reveal>
  );
}

/* Small decorative visuals (aria-hidden) — CSS and tokens only. */
function RippleVisual() {
  const nodes = [
    { x: 50, y: 50, hot: true },
    { x: 20, y: 24 }, { x: 80, y: 22, hot: true }, { x: 16, y: 74, hot: true }, { x: 84, y: 76 }, { x: 52, y: 88 },
  ];
  return (
    <div aria-hidden className="relative h-48 w-full max-w-sm">
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        {nodes.slice(1).map((n, i) => (
          <line key={i} x1="50" y1="50" x2={n.x} y2={n.y} stroke="var(--border-strong)" strokeWidth="0.4" strokeDasharray={n.hot ? undefined : "1.5 1.5"} vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      {[0, 1, 2].map((i) => (
        <span key={i} className="halo absolute left-1/2 top-1/2 -ml-10 -mt-10 h-20 w-20 rounded-full border border-accent/50" style={{ animationDelay: `${i * 1.05}s` }} />
      ))}
      {nodes.map((n, i) => (
        <span
          key={i}
          className={cn("absolute -ml-2 -mt-2 h-4 w-4 rounded-full border-2 shadow-sm", i === 0 ? "border-accent bg-accent" : n.hot ? "border-accent bg-accent-soft" : "border-border-strong bg-surface")}
          style={{ left: `${n.x}%`, top: `${n.y}%` }}
        />
      ))}
    </div>
  );
}

function ApprovalVisual() {
  return (
    <div aria-hidden className="flex items-center gap-3 rounded-2xl border border-border bg-surface-muted px-4 py-3">
      <span className="flex -space-x-2">
        <span className="h-8 w-8 rounded-full bg-rose-600 ring-2 ring-surface" />
        <span className="h-8 w-8 rounded-full bg-blue-600 ring-2 ring-surface" />
      </span>
      <span className="text-sm font-semibold text-foreground">2 / 2</span>
      <CheckCircle2 size={18} className="text-emerald-600" />
    </div>
  );
}

function AgentsVisual() {
  return (
    <div aria-hidden className="w-full max-w-[220px] space-y-3">
      {[
        { c: "var(--agent-reviewer)", w: "72%" },
        { c: "var(--agent-builder)", w: "48%" },
      ].map((a, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white" style={{ background: a.c }}><Bot size={13} /></span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <m.div className="h-full rounded-full" style={{ background: a.c }} initial={{ width: "8%" }} whileInView={{ width: a.w }} viewport={{ once: true }} transition={{ duration: 1.4, delay: 0.2 + i * 0.25, ease: "easeOut" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function QuarantineVisual() {
  return (
    <div aria-hidden className="w-full max-w-[220px] rounded-2xl border border-rose-300/60 p-3 text-xs" style={{ background: "repeating-linear-gradient(135deg, color-mix(in oklab, var(--accent) 7%, transparent) 0 6px, transparent 6px 12px)" }}>
      <div className="font-mono text-[11px] text-muted-foreground">build · ctx v3</div>
      <div className="mt-1 font-semibold text-foreground">Output quarantined</div>
      <div className="text-muted-foreground">latest context is v4</div>
    </div>
  );
}

function TimelineVisual() {
  return (
    <div aria-hidden className="flex w-full max-w-md items-center">
      {["v1", "v2", "v3", "v4"].map((v, i) => (
        <div key={v} className="flex flex-1 items-center">
          <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full border font-mono text-[11px]", i === 3 ? "border-accent bg-accent text-accent-foreground" : "border-border-strong bg-surface text-muted-foreground")}>{v}</span>
          {i < 3 && <span className="h-px flex-1 bg-border-strong" />}
        </div>
      ))}
    </div>
  );
}

function RecoveryVisual() {
  return (
    <div aria-hidden className="flex items-center gap-3 font-mono text-xs">
      <span className="rounded-xl border border-border px-3 py-2 text-muted-foreground line-through">epoch 3</span>
      <RotateCw size={18} className="text-accent" />
      <span className="rounded-xl border border-accent/50 bg-accent-soft px-3 py-2 text-accent">epoch 4 · ctx v4</span>
    </div>
  );
}

function SafeVisual() {
  return (
    <div aria-hidden className="grid w-full max-w-xs grid-cols-2 gap-3 text-[11px]">
      <pre className="rounded-xl border border-border bg-surface-muted p-3 font-mono leading-relaxed text-muted-foreground">{`{ "type": "form",\n  "title": "Book" }`}</pre>
      <div className="flex flex-col gap-1.5 rounded-xl border border-border p-3">
        <span className="h-2 w-2/3 rounded-full bg-border-strong" />
        <span className="h-6 rounded-md border border-border" />
        <span className="h-6 w-1/2 rounded-md bg-accent" />
      </div>
    </div>
  );
}

const FEATURES: { icon: typeof Waves; title: string; body: string; visual: ReactNode }[] = [
  { icon: Waves, title: "Ripple Effect", body: "Change one requirement and see every component, test and task it touches before anything is committed. Dependency checks come first; AI suggestions are labelled “inferred”.", visual: <RippleVisual /> },
  { icon: Users, title: "Two-human approvals", body: "The founder and the designer both sign off on previews, changes and releases. AI agents advise, but never vote.", visual: <ApprovalVisual /> },
  { icon: Bot, title: "Agents in parallel", body: "The Reviewer writes acceptance tests while the Builder builds — each on a recorded version of the shared context.", visual: <AgentsVisual /> },
  { icon: ShieldOff, title: "Stale work quarantined", body: "Output built on old requirements is held back, explained, and replaced by an updated task for humans to approve.", visual: <QuarantineVisual /> },
  { icon: History, title: "Decision Time Machine", body: "Every decision is recorded. Compare any two versions side by side and restore safely.", visual: <TimelineVisual /> },
  { icon: RotateCw, title: "Recovers after restart", body: "Restarting an agent bumps its epoch, so work from before the restart can never commit. It reloads the context and carries on.", visual: <RecoveryVisual /> },
  { icon: ShieldCheck, title: "Safe previews", body: "Previews and builds are structured specs drawn by a whitelist renderer — no generated code ever runs. Works without an API key, too.", visual: <SafeVisual /> },
];

function FeaturePanel({ f, i, className }: { f: (typeof FEATURES)[number]; i: number; className?: string }) {
  return (
    <article onPointerMove={onGlowMove} className={cn("glow-card flex flex-col overflow-hidden rounded-3xl border border-border bg-surface/80 p-6 shadow-md backdrop-blur sm:p-8", className)}>
      <div className="flex min-h-[160px] flex-1 items-center justify-center">{f.visual}</div>
      <div className="mt-6 flex items-start gap-4">
        <span className="font-mono text-sm text-accent">{String(i + 1).padStart(2, "0")}</span>
        <div>
          <h3 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-foreground sm:text-2xl"><f.icon size={20} className="text-accent" /> {f.title}</h3>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground sm:text-[15px]">{f.body}</p>
        </div>
      </div>
    </article>
  );
}

/**
 * Features that scroll sideways as you scroll down. On wide screens the
 * section pins and the vertical scroll drives the horizontal track; on
 * phones the panels simply stack and fade in.
 */
export function FeatureScroller({ heading }: { heading: ReactNode }) {
  const section = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [pin, setPin] = useState(false);
  const [dist, setDist] = useState(0);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setPin(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!pin) return;
    const measure = () => track.current && setDist(Math.max(0, track.current.scrollWidth - window.innerWidth));
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [pin]);

  const { scrollYProgress } = useScroll({ target: section, offset: ["start start", "end end"] });
  const x = useTransform(scrollYProgress, (v) => -v * dist);
  useMotionValueEvent(scrollYProgress, "change", (v) => setActive(Math.min(FEATURES.length - 1, Math.round(v * (FEATURES.length - 1)))));

  if (!pin)
    return (
      <section ref={section} id="features" className="relative mx-auto max-w-6xl scroll-mt-28 px-4 py-20">
        {heading}
        <div className="mt-10 grid gap-4">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title}><FeaturePanel f={f} i={i} /></Reveal>
          ))}
        </div>
      </section>
    );

  return (
    <section ref={section} id="features" className="relative" style={{ height: `calc(100vh + ${dist}px)` }}>
      <div className="sticky top-0 flex h-screen flex-col justify-center overflow-hidden pt-20">
        <div className="mx-auto mb-8 flex w-full max-w-6xl items-end justify-between gap-6 px-6">
          {heading}
          <div className="hidden shrink-0 pb-2 font-mono text-sm text-muted-foreground lg:block">
            <span className="text-foreground">{String(active + 1).padStart(2, "0")}</span> / {String(FEATURES.length).padStart(2, "0")}
          </div>
        </div>
        <m.div ref={track} style={{ x }} className="flex w-max gap-6 pl-[max(1.5rem,calc((100vw-72rem)/2+1.5rem))] pr-[12vw]">
          {FEATURES.map((f, i) => (
            <FeaturePanel key={f.title} f={f} i={i} className={cn("h-[min(60vh,500px)] w-[min(72vw,620px)] shrink-0 transition-opacity duration-500", i === active ? "opacity-100" : "opacity-60")} />
          ))}
        </m.div>
        <div className="mx-auto mt-8 w-full max-w-6xl px-6">
          <div className="h-px bg-border">
            <m.div className="h-px origin-left bg-accent" style={{ scaleX: scrollYProgress }} />
          </div>
        </div>
      </div>
    </section>
  );
}

const LOG: { who: string; tone: "prompt" | "reviewer" | "builder" | "human" | "warn" | "ok"; text: string }[] = [
  { who: "$", tone: "prompt", text: 'request "Clinic appointment booking with reminders"' },
  { who: "reviewer", tone: "reviewer", text: "simplified into 6 requirements · R-01 … R-06" },
  { who: "aisha", tone: "human", text: "approved preview   daniel  approved preview   (2/2)" },
  { who: "builder", tone: "builder", text: "building artifact v1 on context v3 …" },
  { who: "daniel", tone: "human", text: 'changed R-02 audience → "elderly patients"' },
  { who: "ripple", tone: "warn", text: "4 components affected · 1 running task now stale" },
  { who: "builder", tone: "warn", text: "output quarantined — built on v3, latest is v4" },
  { who: "reviewer", tone: "reviewer", text: "prepared an updated build task for approval" },
  { who: "builder", tone: "ok", text: "rebuilt artifact v2 on context v4 · validated ✓" },
];

const TONE: Record<(typeof LOG)[number]["tone"], string> = {
  prompt: "text-[var(--terminal-accent)]",
  reviewer: "text-[var(--agent-reviewer)]",
  builder: "text-[var(--agent-builder)]",
  human: "text-[var(--terminal-fg)]",
  warn: "text-amber-400",
  ok: "text-emerald-400",
};

/** Terminal-style walkthrough of one run. Illustrative, and labelled so. */
export function TerminalDemo() {
  return (
    <Reveal>
      <div onPointerMove={onGlowMove} className="glow-card overflow-hidden rounded-3xl border border-border shadow-lg" style={{ background: "var(--terminal-bg)" }}>
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
          <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
          <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
          <span className="h-3 w-3 rounded-full bg-[#28c840]" />
          <span className="ml-3 truncate font-mono text-xs text-[var(--terminal-muted)]">careconnect — agent log</span>
          <span className="ml-auto rounded-full border border-white/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[var(--terminal-muted)]">Illustrative</span>
        </div>
        <m.ol
          className="space-y-2 overflow-x-auto p-5 font-mono text-[12.5px] leading-relaxed sm:p-6 sm:text-[13px]"
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "0px 0px -80px 0px" }}
          variants={{ show: { transition: { staggerChildren: 0.32 } } }}
        >
          {LOG.map((l, i) => (
            <m.li key={i} className="flex gap-3 whitespace-nowrap" variants={{ hidden: { opacity: 0, x: -6 }, show: { opacity: 1, x: 0 } }}>
              <span className={cn("w-16 shrink-0 text-right", TONE[l.tone])}>{l.who}</span>
              <span className={cn(l.tone === "warn" || l.tone === "ok" ? TONE[l.tone] : "text-[var(--terminal-fg)]")}>{l.text}</span>
            </m.li>
          ))}
          <m.li className="flex gap-3" variants={{ hidden: { opacity: 0 }, show: { opacity: 1 } }}>
            <span className="w-16 shrink-0 text-right text-[var(--terminal-accent)]">$</span>
            <span className="caret text-[var(--terminal-fg)]" />
          </m.li>
        </m.ol>
      </div>
    </Reveal>
  );
}
