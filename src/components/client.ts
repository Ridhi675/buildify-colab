"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ProjectState } from "@/lib/server/state";
import type { Draft } from "@/lib/server/realtime";

export type { Draft };

// Per-tab identity: sessionStorage lets two tabs act as two different humans.
const KEY = "bc_token";

export function getToken() {
  if (typeof window === "undefined") return null;
  try {
    const own = sessionStorage.getItem(KEY);
    if (own) return own;
    // A new tab inherits the last identity once, then keeps it even if another tab switches.
    const inherited = localStorage.getItem(KEY);
    if (inherited) sessionStorage.setItem(KEY, inherited);
    return inherited;
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) {
      sessionStorage.setItem(KEY, token);
      localStorage.setItem(KEY, token);
    } else {
      sessionStorage.removeItem(KEY);
      localStorage.removeItem(KEY);
    }
  } catch {
    /* storage blocked */
  }
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public data?: unknown) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", "x-bc-token": getToken() ?? "" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? `Request failed (${res.status})`, data.data);
  return data as T;
}

export interface Invite {
  id: string;
  token: string;
  role: string;
  uses: number;
  createdById: string;
  createdAt: string;
}
export type State = ProjectState & {
  me: { id: string; name: string; color: string; title: string; role: string; email: string | null; demo: boolean };
  /** Active invite links; empty for observers. */
  invites: Invite[];
};
export type Presence = State["presence"][number];
export type Lock = State["locks"][number];
export interface Cursor {
  userId: string;
  name: string;
  color: string;
  x: number;
  y: number;
  view: string;
  at: number;
}

/** Project state + realtime subscription (SSE). Re-fetches on every server "changed" event. */
export function useProject(projectId: string) {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [presence, setPresence] = useState<Presence[]>([]);
  const [locks, setLocks] = useState<Lock[]>([]);
  const [cursors, setCursors] = useState<Record<string, Cursor>>({});
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflight = useRef(false);
  const again = useRef(false);

  const refresh = useCallback(async () => {
    if (inflight.current) {
      again.current = true;
      return;
    }
    inflight.current = true;
    try {
      const s = await api<State>(`/api/projects/${projectId}/state`);
      setState(s);
      setPresence(s.presence);
      setLocks(s.locks);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      inflight.current = false;
      if (again.current) {
        again.current = false;
        void refresh();
      }
    }
  }, [projectId]);

  useEffect(() => {
    void refresh();
    const es = new EventSource(`/api/projects/${projectId}/stream?t=${encodeURIComponent(getToken() ?? "")}`);
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (m) => {
      const e = JSON.parse(m.data);
      if (e.type === "changed") {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => void refresh(), 120);
      } else if (e.type === "presence") {
        setPresence(e.presence);
        setLocks(e.locks);
      } else if (e.type === "cursor") {
        setCursors((c) => ({ ...c, [e.userId]: { ...e, at: Date.now() } }));
      } else if (e.type === "drafts") {
        setDrafts(Object.fromEntries((e.drafts as Draft[]).map((d) => [d.field, d])));
      } else if (e.type === "draft") {
        setDrafts((d) => ({ ...d, [e.draft.field]: e.draft }));
      }
    };
    // Safety net: periodic refresh in case an event was missed while reconnecting.
    const poll = setInterval(() => void refresh(), 15_000);
    return () => {
      es.close();
      clearInterval(poll);
    };
  }, [projectId, refresh]);

  const act = useCallback(
    async <T = unknown,>(action: Record<string, unknown>) => api<T>(`/api/projects/${projectId}/action`, action),
    [projectId],
  );

  return { state, error, connected, presence, locks, cursors, drafts, refresh, act };
}

export function timeAgo(d: string | Date) {
  const s = Math.max(0, (Date.now() - new Date(d).getTime()) / 1000);
  if (s < 10) return "just now";
  if (s < 60) return `${Math.round(s)}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return new Date(d).toLocaleDateString();
}

export function cn(...xs: (string | false | null | undefined)[]) {
  return xs.filter(Boolean).join(" ");
}
