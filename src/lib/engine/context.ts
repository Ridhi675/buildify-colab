// Version fingerprints and stale-work detection. Pure functions: easy to test.

import type { ReqLite } from "../types";

export type Fingerprint = Record<string, number>; // requirement key -> version

export function fingerprint(reqs: ReqLite[], keys: string[]): Fingerprint {
  const fp: Fingerprint = {};
  for (const k of [...keys].sort()) {
    const r = reqs.find((x) => x.key === k);
    fp[k] = r && r.status !== "superseded" && r.status !== "rejected" ? r.version : -1;
  }
  return fp;
}

export interface StaleCheck {
  stale: boolean;
  changed: { key: string; from: number; to: number; title: string }[];
  reason: string | null;
}

/**
 * Compare the dependency versions a task was started with against the current
 * authoritative requirement versions. Any difference makes the output stale.
 */
export function checkStale(base: Fingerprint, current: ReqLite[]): StaleCheck {
  const changed: StaleCheck["changed"] = [];
  for (const [key, from] of Object.entries(base)) {
    const r = current.find((x) => x.key === key);
    const to = r && r.status !== "superseded" && r.status !== "rejected" ? r.version : -1;
    if (to !== from) changed.push({ key, from, to, title: r?.title ?? key });
  }
  if (!changed.length) return { stale: false, changed, reason: null };
  const reason =
    "Output is based on outdated requirements: " +
    changed
      .map((c) => (c.to === -1 ? `${c.key} was removed` : `${c.key} “${c.title}” changed (v${c.from} → v${c.to})`))
      .join("; ") +
    ".";
  return { stale: true, changed, reason };
}

export function snapshotRequirements(reqs: ReqLite[]) {
  return reqs
    .filter((r) => r.status === "approved")
    .map(({ key, title, description, category, priority, version, components, acceptanceCriteria }) => ({
      key, title, description, category, priority, version, components, acceptanceCriteria, status: "approved",
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

/** Requirement-level diff between two snapshots, phrased for non-technical readers. */
export function diffRequirements(a: ReqLite[], b: ReqLite[]) {
  const out: { kind: "added" | "removed" | "modified"; key: string; detail: string }[] = [];
  const ma = new Map(a.map((r) => [r.key, r]));
  const mb = new Map(b.map((r) => [r.key, r]));
  for (const [k, r] of mb) {
    const o = ma.get(k);
    if (!o) out.push({ kind: "added", key: k, detail: r.title });
    else if (o.version !== r.version || o.title !== r.title || o.description !== r.description)
      out.push({ kind: "modified", key: k, detail: `“${o.title}” → “${r.title}”` });
  }
  for (const [k, r] of ma) if (!mb.has(k)) out.push({ kind: "removed", key: k, detail: r.title });
  return out;
}
