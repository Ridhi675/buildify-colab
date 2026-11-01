"use client";

import { ArrowRight, Bot, FolderPlus, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api, setToken } from "@/components/client";
import { onGlowMove } from "@/components/effects";
import { MotionProvider, Reveal, SmoothScroll } from "@/components/landing/motion";
import { Navbar, PillCta } from "@/components/landing/Navbar";
import { PromptCard, SuggestionChips } from "@/components/landing/PromptCard";
import { CursorBackground } from "@/components/landing/Background";
import { Pipeline } from "@/components/landing/Pipeline";
import { AiDuo } from "@/components/landing/AiDuo";
import { BrandIcon, BrandName } from "@/components/brand";
import { FeatureScroller, SectionHeading, TerminalDemo } from "@/components/landing/Sections";
import { AuthCard } from "@/components/landing/AuthCard";
import { Avatar, Badge, Button, Field, inputCls, Modal } from "@/components/ui";
import { TemplatePicker } from "@/components/TemplatePicker";
import type { TemplateKey } from "@/lib/engine/templates";

interface U { id: string; name: string; title: string; color: string; email?: string | null; demo?: boolean }
interface P { id: string; name: string; description: string; isDemo: boolean; phase: string; contextVersion: number; updatedAt: string; _count: { requirements: number; decisions: number } }

// Example ideas for the suggestion chips: [chip label, project name, description].
const IDEAS: [string, string, string][] = [
  ["Clinic booking", "Clinic Booking", "Patients pick a doctor and a time slot and get reminders."],
  ["Tool library", "Neighborhood Tool Library", "Neighbours lend and borrow tools, with pickup times and reminders."],
  ["Team retro board", "Team Retro Board", "A board where a team collects, groups and votes on retrospective notes."],
  ["Event planner", "Community Event Planner", "Plan local events, collect RSVPs and share updates with attendees."],
];

export default function Home() {
  const [users, setUsers] = useState<U[]>([]);
  const [me, setMe] = useState<U | null>(null);
  const [projects, setProjects] = useState<P[]>([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<{ name: string; description: string; healthcare: boolean; template: TemplateKey }>({ name: "", description: "", healthcare: false, template: "auto" });
  const [err, setErr] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [needIdentity, setNeedIdentity] = useState(false);
  const identityRef = useRef<HTMLElement>(null);

  const load = async () => {
    const s = await api<{ users: U[]; me: U | null }>("/api/session");
    setUsers(s.users);
    setMe(s.me);
    if (s.me) setProjects((await api<{ projects: P[] }>("/api/projects")).projects);
  };
  useEffect(() => {
    void load().catch((e) => setErr(e.message));
  }, []);

  const signIn = async (id: string) => {
    const r = await api<{ token: string }>("/api/session", { userId: id });
    setToken(r.token);
    setNeedIdentity(false);
    await load();
  };

  const toIdentity = () => {
    setNeedIdentity(true);
    identityRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  // The prompt card feeds the existing "New project" form; nothing new is sent to the server.
  const openCreate = (patch: Partial<typeof form> = {}) => {
    if (!me) return toIdentity();
    setForm((f) => ({ ...f, ...patch }));
    setCreating(true);
  };

  const demo = projects.find((p) => p.isDemo);
  const links = [
    { href: "#start", label: "Product" },
    { href: me ? "#projects" : "#identity", label: me ? "Projects" : "Get started" },
    { href: "#features", label: "Features" },
    { href: "#demo", label: "How it works" },
  ];

  return (
    <MotionProvider>
      <SmoothScroll />
      <div className="relative min-h-screen overflow-x-clip">
        <CursorBackground />

        <Navbar
          links={links}
          account={me && (
            <span className="flex items-center px-1" title={`${me.name} — ${me.title}`}>
              <Avatar name={me.name} color={me.color} size={30} />
            </span>
          )}
          onSignOut={me ? () => (setToken(null), setMe(null)) : undefined}
          cta={me ? (demo ? <PillCta href={`/p/${demo.id}`}>Open {demo.name}</PillCta> : <PillCta onClick={() => openCreate()}>New project</PillCta>) : <PillCta onClick={toIdentity}>Get started</PillCta>}
        />

        <main className="relative z-10">
          {/* ---------- Hero ---------- */}
          <section id="start" className="mx-auto flex max-w-7xl scroll-mt-28 flex-col items-center px-4 pb-16 pt-32 text-center sm:pt-40">
            <div className="fade-up flex flex-col items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-surface/70 text-accent shadow-xs backdrop-blur">
                <BrandIcon size={24} />
              </span>
              <BrandName className="text-3xl sm:text-4xl" />
            </div>
            <h1 className="mt-6 text-[3rem] font-extrabold leading-[0.95] tracking-[-0.06em] sm:text-6xl md:text-[4.5rem] lg:text-[5.25rem]">
              <span className="text-gradient block pb-1">Rethink. Rebuild.</span>
              <span className="text-gradient-dim block pb-2">Together.</span>
            </h1>
            <p className="mt-7 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-xl">
              A multiplayer AI workspace where humans and intelligent agents collaborate, adapt and bring ideas to life.
            </p>

            <div className="fade-up mt-14 w-full [animation-delay:120ms]">
              <Pipeline />
            </div>

            <div className="fade-up mt-16 w-full max-w-2xl [animation-delay:200ms]">
              <PromptCard
                value={prompt}
                onChange={setPrompt}
                placeholder="Describe the product you want to build…"
                onSubmit={() => openCreate({ description: prompt.trim() })}
                onPlus={() => openCreate()}
                toggle={{ label: "Healthcare kit", on: form.healthcare, onChange: (healthcare) => setForm((f) => ({ ...f, healthcare })), title: "Use the healthcare booking component catalogue" }}
              />
              <div className="mt-5">
                <SuggestionChips
                  items={IDEAS.map((i) => i[0])}
                  onPick={(label) => {
                    const idea = IDEAS.find((i) => i[0] === label)!;
                    setPrompt(idea[2]);
                    setForm((f) => ({ ...f, name: idea[1] }));
                  }}
                />
              </div>
            </div>
          </section>

          <AiDuo />

          {err && <div role="alert" className="mx-auto mb-6 max-w-3xl rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{err}</div>}

          {/* ---------- Identity / projects ---------- */}
          {!me ? (
            <section id="identity" ref={identityRef} className="mx-auto max-w-5xl scroll-mt-28 px-4 py-16">
              <SectionHeading eyebrow="Get started" title="Sign in to start building">
                Each person signs in with their own account, on their own computer. Create a project, then invite your teammates with a link.
              </SectionHeading>
              {needIdentity && (
                <div role="status" className="animate-in mx-auto mb-5 w-fit rounded-full bg-accent-soft px-4 py-1.5 text-sm font-medium text-accent">Sign in first — your idea stays in the box above.</div>
              )}
              <Reveal>
                <AuthCard onDone={() => load()} />
              </Reveal>

              <Reveal className="mx-auto mt-14 max-w-4xl">
                <div className="mb-4 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  <span className="h-px flex-1 bg-border" /> Or explore the CareConnect demo as <span className="h-px flex-1 bg-border" />
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  {users.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => signIn(u.id)}
                      onPointerMove={onGlowMove}
                      className="glow-card group flex w-full items-center gap-3 rounded-2xl border border-border bg-surface/70 p-4 text-left shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      <Avatar name={u.name} color={u.color} size={36} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold tracking-tight">{u.name}</div>
                        <div className="text-xs text-muted-foreground">{u.title}</div>
                      </div>
                      <ArrowRight size={16} className="text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-accent" />
                    </button>
                  ))}
                </div>
                <p className="mt-3 text-center text-xs text-muted-foreground">Demo people are shared by everyone who opens the demo. Use your own account for real work.</p>
              </Reveal>
              <div className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground"><Bot size={14} /> Bunty and Babli join every project automatically.</div>
            </section>
          ) : (
            <section id="projects" className="mx-auto max-w-6xl scroll-mt-28 px-4 py-16">
              <Reveal className="mb-8 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Your workspace</div>
                  <h2 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">Projects</h2>
                </div>
                <Button variant="primary" onClick={() => setCreating(true)}><FolderPlus size={15} /> New project</Button>
              </Reveal>
              {projects.length === 0 && (
                <Reveal className="rounded-3xl border border-dashed border-border bg-surface/50 p-10 text-center backdrop-blur">
                  <div className="text-lg font-semibold tracking-tight">No projects yet</div>
                  <p className="mx-auto mt-1.5 max-w-md text-sm text-muted-foreground">Create one and you start as its founder. To join a teammate&apos;s project, open the invite link they sent you.</p>
                  <Button variant="primary" className="mt-5" onClick={() => setCreating(true)}><FolderPlus size={15} /> New project</Button>
                </Reveal>
              )}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {projects.map((p, i) => (
                  <Reveal key={p.id} delay={i * 0.05} className="h-full">
                    <Link href={`/p/${p.id}`} onPointerMove={onGlowMove} className="glow-card group flex h-full flex-col rounded-3xl border border-border bg-surface p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-lg font-semibold tracking-tight">{p.name}</div>
                        {p.isDemo && <Badge tone="violet">Demo</Badge>}
                      </div>
                      <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">{p.description || "No description"}</p>
                      <div className="mt-auto flex flex-wrap gap-1.5 pt-5">
                        <Badge><span className="font-mono">context v{p.contextVersion}</span></Badge>
                        <Badge>{p._count.requirements} requirements</Badge>
                        <Badge>{p._count.decisions} decisions</Badge>
                        <Badge tone="indigo">{p.phase}</Badge>
                      </div>
                    </Link>
                  </Reveal>
                ))}
              </div>
            </section>
          )}

          {/* ---------- Features: scroll down, they slide sideways ---------- */}
          <FeatureScroller
            heading={
              <SectionHeading align="left" eyebrow="Features" title="Every decision understood">
                Built for two people and two agents working on one product at the same time. Keep scrolling.
              </SectionHeading>
            }
          />

          {/* ---------- Product demo ---------- */}
          <section id="demo" className="mx-auto max-w-4xl scroll-mt-28 px-4 py-20">
            <SectionHeading eyebrow="How it works" title="One change, followed end to end">
              A requirement changes while the Builder is mid-build. Here is what the workspace does about it.
            </SectionHeading>
            <TerminalDemo />
          </section>

          <footer className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 border-t border-border px-4 py-10 text-xs text-muted-foreground sm:flex-row">
            <span className="flex items-center gap-2"><Users size={14} /> ReBrix — Rethink. Rebuild. Together.</span>
            <span>A product by TIET students</span>
          </footer>
        </main>
      </div>

      {me && !demo ? null : me && demo ? (
        <Link href={`/p/${demo.id}`} aria-label="Ask Bunty in the demo workspace" title="Ask Bunty" className="glow-btn fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-lg transition hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:bottom-7 sm:right-7 sm:h-16 sm:w-16">
          <Bot size={24} />
        </Link>
      ) : (
        <button onClick={toIdentity} aria-label="Sign in to talk to Bunty" title="Ask Bunty" className="glow-btn fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-lg transition hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:bottom-7 sm:right-7 sm:h-16 sm:w-16">
          <Bot size={24} />
        </button>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title="New project" wide>
        <div className="space-y-4">
          <Field label="Name"><input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Neighborhood Tool Library" /></Field>
          <Field label="One-line description"><input className={inputCls} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <div className="space-y-1.5">
            <div className="text-sm font-medium" id="template-label">Template</div>
            <TemplatePicker value={form.template} onChange={(template) => setForm({ ...form, template })} />
          </div>
          <p className="text-xs text-muted-foreground">Layouts adapted from Start Bootstrap&apos;s free templates (MIT). You can change the template later in Settings.</p>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setCreating(false)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={form.name.trim().length < 2}
              onClick={async () => {
                const r = await api<{ id: string }>("/api/projects", form);
                window.location.href = `/p/${r.id}`;
              }}
            >
              Create
            </Button>
          </div>
        </div>
      </Modal>
    </MotionProvider>
  );
}
