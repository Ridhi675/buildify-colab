// In-process pub/sub + presence. One Next.js server process = one hub.
// Clients subscribe over Server-Sent Events and re-fetch state on "changed".

export interface PresenceEntry {
  userId: string;
  name: string;
  color: string;
  view: string;
  editing: string | null;
  focus: string | null;
  lastSeen: number;
  connections: number;
}

export interface BusEvent {
  type: "changed" | "presence" | "cursor" | "toast";
  [k: string]: unknown;
}

type Listener = (e: BusEvent) => void;

interface Hub {
  listeners: Map<string, Set<Listener>>;
  presence: Map<string, Map<string, PresenceEntry>>;
  locks: Map<string, Map<string, { userId: string; name: string; at: number }>>;
}

const g = globalThis as unknown as { __bcHub?: Hub };
const hub: Hub = (g.__bcHub ??= { listeners: new Map(), presence: new Map(), locks: new Map() });

export function subscribe(projectId: string, fn: Listener) {
  if (!hub.listeners.has(projectId)) hub.listeners.set(projectId, new Set());
  hub.listeners.get(projectId)!.add(fn);
  return () => hub.listeners.get(projectId)?.delete(fn);
}

export function publish(projectId: string, e: BusEvent) {
  for (const fn of hub.listeners.get(projectId) ?? []) {
    try {
      fn(e);
    } catch {
      /* listener gone */
    }
  }
}

export const changed = (projectId: string, reason: string) => publish(projectId, { type: "changed", reason });

const LOCK_TTL = 60_000;
const PRESENCE_TTL = 45_000;

export function presenceList(projectId: string): PresenceEntry[] {
  const m = hub.presence.get(projectId);
  if (!m) return [];
  const now = Date.now();
  return [...m.values()].map((p) => ({ ...p, connections: now - p.lastSeen > PRESENCE_TTL ? 0 : p.connections }));
}

export function touchPresence(projectId: string, p: Partial<PresenceEntry> & { userId: string; name: string; color: string }, delta = 0) {
  if (!hub.presence.has(projectId)) hub.presence.set(projectId, new Map());
  const m = hub.presence.get(projectId)!;
  const cur = m.get(p.userId) ?? { userId: p.userId, name: p.name, color: p.color, view: "workspace", editing: null, focus: null, lastSeen: 0, connections: 0 };
  const next = { ...cur, ...p, lastSeen: Date.now(), connections: Math.max(0, cur.connections + delta) };
  if (next.connections === 0) {
    next.editing = null;
    releaseLocks(projectId, p.userId);
  }
  m.set(p.userId, next);
  publish(projectId, { type: "presence", presence: presenceList(projectId), locks: lockList(projectId) });
}

export function lockList(projectId: string) {
  const m = hub.locks.get(projectId);
  if (!m) return [];
  const now = Date.now();
  for (const [k, v] of m) if (now - v.at > LOCK_TTL) m.delete(k);
  return [...m.entries()].map(([target, v]) => ({ target, ...v }));
}

/** Soft edit lock. Returns the current holder if someone else holds it. */
export function acquireLock(projectId: string, target: string, userId: string, name: string) {
  if (!hub.locks.has(projectId)) hub.locks.set(projectId, new Map());
  const m = hub.locks.get(projectId)!;
  const cur = m.get(target);
  if (cur && cur.userId !== userId && Date.now() - cur.at < LOCK_TTL) return { ok: false as const, holder: cur };
  m.set(target, { userId, name, at: Date.now() });
  publish(projectId, { type: "presence", presence: presenceList(projectId), locks: lockList(projectId) });
  return { ok: true as const };
}

export function releaseLock(projectId: string, target: string, userId: string) {
  const m = hub.locks.get(projectId);
  if (m?.get(target)?.userId === userId) m.delete(target);
  publish(projectId, { type: "presence", presence: presenceList(projectId), locks: lockList(projectId) });
}

function releaseLocks(projectId: string, userId: string) {
  const m = hub.locks.get(projectId);
  if (!m) return;
  for (const [k, v] of m) if (v.userId === userId) m.delete(k);
}
