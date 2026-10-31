"use client";

import { useState } from "react";
import { api, setToken } from "../client";
import { onGlowMove } from "../effects";
import { Button, Field, inputCls, Tabs } from "../ui";

export interface SessionUser {
  id: string;
  name: string;
  title: string;
  color: string;
  email: string | null;
  demo: boolean;
}

/** Sign in or create an account. Calls onDone once the session token is stored. */
export function AuthCard({ onDone, intro }: { onDone: (u: SessionUser) => void | Promise<void>; intro?: string }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [form, setForm] = useState({ name: "", title: "", email: "", password: "" });
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    setErr(null);
    try {
      const body = mode === "signup" ? { mode, name: form.name, title: form.title || undefined, email: form.email, password: form.password } : { mode, email: form.email, password: form.password };
      const r = await api<{ token: string; user: SessionUser }>("/api/session", body);
      setToken(r.token);
      await onDone(r.user);
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <div onPointerMove={onGlowMove} className="glow-card mx-auto w-full max-w-md rounded-3xl border border-border bg-surface/85 p-6 text-left shadow-lg backdrop-blur-xl sm:p-8">
      <div className="mb-5 flex justify-center">
        <Tabs value={mode} onChange={(m) => (setMode(m), setErr(null))} items={[{ value: "login", label: "Sign in" }, { value: "signup", label: "Create account" }]} />
      </div>
      {intro && <p className="mb-4 text-center text-sm text-muted-foreground">{intro}</p>}
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          return submit();
        }}
      >
        {mode === "signup" && (
          <>
            <Field label="Your name"><input className={inputCls} value={form.name} onChange={set("name")} autoComplete="name" required minLength={2} /></Field>
            <Field label="Role or title (optional)"><input className={inputCls} value={form.title} onChange={set("title")} placeholder="e.g. Product Designer" /></Field>
          </>
        )}
        <Field label="Email"><input className={inputCls} type="email" value={form.email} onChange={set("email")} autoComplete="email" required /></Field>
        <Field label="Password" hint={mode === "signup" ? "At least 8 characters." : undefined}>
          <input className={inputCls} type="password" value={form.password} onChange={set("password")} autoComplete={mode === "signup" ? "new-password" : "current-password"} required minLength={mode === "signup" ? 8 : 1} />
        </Field>
        {err && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}
        <Button type="submit" variant="primary" className="w-full">
          {mode === "signup" ? "Create account" : "Sign in"}
        </Button>
      </form>
    </div>
  );
}
