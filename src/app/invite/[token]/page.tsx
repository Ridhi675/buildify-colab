"use client";

import { ArrowRight, LogOut } from "lucide-react";
import { BrandIcon, BrandName } from "@/components/brand";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, setToken } from "@/components/client";
import { AuthCard, type SessionUser } from "@/components/landing/AuthCard";
import { CursorBackground } from "@/components/landing/Background";
import { ThemeToggle } from "@/components/theme";
import { Avatar, Badge, Button } from "@/components/ui";

interface InviteInfo {
  project: { id: string; name: string; description: string };
  role: string;
  invitedBy: string;
}

const ROLE_TEXT: Record<string, string> = {
  founder: "can approve, change requirements and invite others",
  designer: "can approve, change requirements and invite others",
  observer: "can view, comment and ask Bunty",
};

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [me, setMe] = useState<SessionUser | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([api<InviteInfo>(`/api/invites/${token}`), api<{ me: SessionUser | null }>("/api/session")])
      .then(([i, s]) => (setInfo(i), setMe(s.me)))
      .catch((e) => setErr(e.message))
      .finally(() => setLoaded(true));
  }, [token]);

  const join = async () => {
    setErr(null);
    try {
      const r = await api<{ projectId: string }>(`/api/invites/${token}`, {});
      router.push(`/p/${r.projectId}`);
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <div className="relative min-h-screen overflow-x-clip">
      <CursorBackground />
      <header className="relative z-10 mx-auto flex max-w-5xl items-center justify-between px-4 py-5">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface text-accent"><BrandIcon size={16} /></span>
          <BrandName />
        </Link>
        <ThemeToggle />
      </header>

      <main className="relative z-10 mx-auto flex max-w-xl flex-col items-center px-4 pb-20 pt-10 text-center">
        {!loaded && <div className="mt-20 text-muted-foreground">Loading invite…</div>}

        {loaded && !info && (
          <div className="mt-16 rounded-3xl border border-border bg-surface/80 p-8 backdrop-blur">
            <div className="text-lg font-semibold">This invite can’t be used</div>
            <p className="mt-2 text-sm text-muted-foreground">{err ?? "The link is invalid or has been revoked."} Ask your teammate for a new link.</p>
            <Link href="/" className="mt-5 inline-block text-sm font-medium text-accent hover:underline">Go to ReBrix →</Link>
          </div>
        )}

        {info && (
          <>
            <Badge tone="indigo">You’re invited</Badge>
            <h1 className="text-gradient mt-5 text-4xl font-extrabold tracking-[-0.05em] sm:text-5xl">{info.project.name}</h1>
            {info.project.description && <p className="mt-3 text-muted-foreground">{info.project.description}</p>}
            <p className="mt-4 text-sm text-muted-foreground">
              {info.invitedBy} invited you as <span className="font-semibold capitalize text-foreground">{info.role}</span> — you {ROLE_TEXT[info.role] ?? "can collaborate"}.
            </p>

            <div className="mt-10 w-full">
              {me && !me.demo ? (
                <div className="mx-auto max-w-md rounded-3xl border border-border bg-surface/85 p-6 shadow-lg backdrop-blur-xl">
                  <div className="flex items-center justify-center gap-3">
                    <Avatar name={me.name} color={me.color} size={36} />
                    <div className="text-left text-sm">
                      <div className="font-semibold">{me.name}</div>
                      <div className="text-muted-foreground">{me.email}</div>
                    </div>
                  </div>
                  {err && <div role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}
                  <Button variant="primary" className="mt-5 w-full" onClick={join}>Join {info.project.name} <ArrowRight size={15} /></Button>
                  <button onClick={() => (setToken(null), setMe(null))} className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                    <LogOut size={12} /> Not you? Sign out
                  </button>
                </div>
              ) : (
                <AuthCard
                  intro={me?.demo ? "You’re using a demo person. Sign in with your own account to join." : "Sign in or create an account to join."}
                  onDone={async (u) => {
                    setMe(u);
                    await join();
                  }}
                />
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
