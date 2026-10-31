"use client";

import { ArrowRight, Bot, FolderPlus, Layers, LogOut, Sparkles, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, setToken } from "@/components/client";
import { Avatar, Badge, Button, Card, Field, inputCls, Modal } from "@/components/ui";

interface U { id: string; name: string; title: string; color: string }
interface P { id: string; name: string; description: string; isDemo: boolean; phase: string; contextVersion: number; updatedAt: string; _count: { requirements: number; decisions: number } }

export default function Home() {
  const [users, setUsers] = useState<U[]>([]);
  const [me, setMe] = useState<U | null>(null);
  const [projects, setProjects] = useState<P[]>([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", healthcare: false });
  const [err, setErr] = useState<string | null>(null);

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
    await load();
  };

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2 font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white"><Layers size={17} /></span>
            Buildify CoLab
          </div>
          {me && (
            <div className="flex items-center gap-3">
              <Avatar name={me.name} color={me.color} />
              <div className="hidden text-sm sm:block">
                <div className="font-medium">{me.name}</div>
                <div className="text-xs text-slate-500">{me.title}</div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => (setToken(null), setMe(null))}><LogOut size={14} /> Switch</Button>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-10">
        <div className="mb-10 max-w-2xl">
          <Badge tone="indigo"><Sparkles size={12} /> Preview-first multiplayer AI workspace</Badge>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Two humans. Two AI agents. One shared product.</h1>
          <p className="mt-3 text-base text-slate-600">Describe a product, approve a lightweight preview, let a Reviewer AI and a Builder AI work in parallel — and see exactly what changed, why, and what happens next.</p>
        </div>
        {err && <div className="mb-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{err}</div>}

        {!me ? (
          <Card className="p-6">
            <div className="mb-1 flex items-center gap-2 font-semibold"><Users size={16} /> Choose who you are in this browser tab</div>
            <p className="mb-5 text-sm text-slate-500">Identity is per tab. Open a second tab (or another browser) and pick the other person to collaborate in real time.</p>
            <div className="grid gap-3 sm:grid-cols-3">
              {users.map((u) => (
                <button key={u.id} onClick={() => signIn(u.id)} className="group flex items-center gap-3 rounded-xl border border-slate-200 p-4 text-left transition hover:border-indigo-300 hover:bg-indigo-50/40">
                  <Avatar name={u.name} color={u.color} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{u.name}</div>
                    <div className="text-xs text-slate-500">{u.title}</div>
                  </div>
                  <ArrowRight size={16} className="text-slate-400 group-hover:text-indigo-600" />
                </button>
              ))}
            </div>
            <div className="mt-5 flex items-center gap-2 text-xs text-slate-500"><Bot size={14} /> Reviewer AI and Builder AI join every project automatically.</div>
          </Card>
        ) : (
          <>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Projects</h2>
              <Button variant="primary" onClick={() => setCreating(true)}><FolderPlus size={15} /> New project</Button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((p) => (
                <Link key={p.id} href={`/p/${p.id}`} className="group">
                  <Card className="h-full p-5 transition group-hover:border-indigo-300 group-hover:shadow-md">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-semibold text-slate-900">{p.name}</div>
                      {p.isDemo && <Badge tone="violet">Demo</Badge>}
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-slate-500">{p.description || "No description"}</p>
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      <Badge>context v{p.contextVersion}</Badge>
                      <Badge>{p._count.requirements} requirements</Badge>
                      <Badge>{p._count.decisions} decisions</Badge>
                      <Badge tone="indigo">{p.phase}</Badge>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          </>
        )}
      </main>

      <Modal open={creating} onClose={() => setCreating(false)} title="New project">
        <div className="space-y-4">
          <Field label="Name"><input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Neighborhood Tool Library" /></Field>
          <Field label="One-line description"><input className={inputCls} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.healthcare} onChange={(e) => setForm({ ...form, healthcare: e.target.checked })} /> Use the healthcare booking component catalogue</label>
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
    </div>
  );
}
