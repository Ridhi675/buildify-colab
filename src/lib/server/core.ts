// Shared server helpers: activity log, grouped notifications, context versions.

import type { Requirement } from "@prisma/client";
import { db, j, type Tx } from "../db";
import { snapshotRequirements } from "../engine/context";
import type { ReqLite } from "../types";
import { changed } from "./realtime";

export interface Actor {
  id: string;
  name: string;
  kind: "human" | "agent" | "system";
}

export const SYSTEM: Actor = { id: "system", name: "System", kind: "system" };

export const POLICY_DEFAULT = { major: 2, minor: 1, release: 2 };

export function toReqLite(r: Requirement): ReqLite {
  return {
    key: r.key,
    title: r.title,
    description: r.description,
    category: r.category,
    priority: r.priority,
    status: r.status,
    version: r.version,
    components: j.parse<string[]>(r.components, []),
    acceptanceCriteria: j.parse<string[]>(r.acceptanceCriteria, []),
  };
}

export async function loadReqs(tx: Tx, projectId: string): Promise<ReqLite[]> {
  const rows = await tx.requirement.findMany({ where: { projectId }, orderBy: { key: "asc" } });
  return rows.map(toReqLite);
}

export async function reqsAtContext(tx: Tx, projectId: string, number: number): Promise<ReqLite[]> {
  const cv = await tx.contextVersion.findUnique({ where: { projectId_number: { projectId, number } } });
  if (!cv) return loadReqs(tx, projectId);
  return j.parse<{ requirements: ReqLite[] }>(cv.snapshot, { requirements: [] }).requirements;
}

export async function activity(
  tx: Tx,
  projectId: string,
  actor: Actor,
  action: string,
  opts: { target?: string; outcome?: string; simulated?: boolean } = {},
) {
  const p = await tx.project.findUnique({ where: { id: projectId }, select: { contextVersion: true } });
  await tx.activityEvent.create({
    data: {
      projectId,
      actorId: actor.id,
      actorName: actor.name,
      actorKind: actor.kind,
      action,
      target: opts.target,
      outcome: opts.outcome,
      simulated: opts.simulated ?? false,
      contextVersion: p?.contextVersion ?? 0,
    },
  });
}

/** Grouped notifications: same groupKey within 10 minutes increments a counter instead of spamming. */
export async function notify(
  tx: Tx,
  projectId: string,
  category: "important" | "conflict" | "completed" | "waiting" | "context",
  title: string,
  body: string,
  groupKey?: string,
) {
  if (groupKey) {
    const recent = await tx.notification.findFirst({
      where: { projectId, groupKey, updatedAt: { gt: new Date(Date.now() - 10 * 60_000) } },
      orderBy: { updatedAt: "desc" },
    });
    if (recent) {
      const count = recent.count + 1;
      await tx.notification.update({
        where: { id: recent.id },
        data: { count, title: title.replace("{n}", String(count)), body, readBy: "[]" },
      });
      return;
    }
  }
  await tx.notification.create({ data: { projectId, category, title: title.replace("{n}", "1"), body, groupKey } });
}

/** Snapshot approved requirements into a new immutable ContextVersion. */
export async function commitContext(tx: Tx, projectId: string, reason: string, authorId: string, decisionId?: string) {
  const reqs = await loadReqs(tx, projectId);
  const p = await tx.project.update({ where: { id: projectId }, data: { contextVersion: { increment: 1 } } });
  await tx.contextVersion.create({
    data: {
      projectId,
      number: p.contextVersion,
      snapshot: j.str({ requirements: snapshotRequirements(reqs) }),
      reason,
      authorId,
      decisionId,
    },
  });
  await syncRequirementDeps(tx, projectId, reqs);
  return p.contextVersion;
}

/**
 * Deterministic requirement dependencies (design rules, not AI guesses):
 * presentation requirements depend on the audience; features depend on data rules;
 * reminders depend on scheduling.
 */
export async function syncRequirementDeps(tx: Tx, projectId: string, reqs: ReqLite[]) {
  const live = reqs.filter((r) => r.status === "approved");
  const audience = live.find((r) => r.category === "audience");
  const data = live.filter((r) => r.category === "data");
  const scheduling = live.find((r) => /schedul|booking|appointment/i.test(r.title));
  const edges: { fromKey: string; toKey: string; kind: string }[] = [];
  for (const r of live) {
    if (audience && r.key !== audience.key && ["layout", "theme", "accessibility"].includes(r.category))
      edges.push({ fromKey: r.key, toKey: audience.key, kind: "presentation follows audience" });
    if (r.category === "feature") for (const d of data) edges.push({ fromKey: r.key, toKey: d.key, kind: "feature uses data" });
    if (scheduling && r.key !== scheduling.key && /remind|confirm/i.test(r.title))
      edges.push({ fromKey: r.key, toKey: scheduling.key, kind: "extends scheduling" });
  }
  await tx.requirementDependency.deleteMany({ where: { projectId, inferred: false } });
  if (edges.length) await tx.requirementDependency.createMany({ data: edges.map((e) => ({ ...e, projectId })) });
}

export async function nextReqKey(tx: Tx, projectId: string) {
  const n = await tx.requirement.count({ where: { projectId } });
  return `REQ-${String(n + 1).padStart(3, "0")}`;
}

export async function createCheckpoint(tx: Tx, projectId: string, milestone: string, label: string, createdById: string) {
  const p = await tx.project.findUniqueOrThrow({ where: { id: projectId } });
  const reqs = await loadReqs(tx, projectId);
  const tasks = await tx.agentTask.findMany({ where: { projectId }, select: { id: true, title: true, status: true, phase: true } });
  const agents = await tx.agent.findMany({ where: { projectId }, select: { key: true, status: true, epoch: true, contextVersion: true } });
  return tx.checkpoint.create({
    data: {
      projectId,
      milestone,
      label,
      contextVersion: p.contextVersion,
      requirementsSnapshot: j.str(snapshotRequirements(reqs)),
      artifactVersionId: p.currentArtifactVerId,
      taskStatuses: j.str(tasks),
      agentMeta: j.str(agents),
      createdById,
    },
  });
}

export async function agentActor(tx: Tx, projectId: string, key: "reviewer" | "builder"): Promise<Actor & { agentId: string }> {
  const a = await tx.agent.findUniqueOrThrow({ where: { projectId_key: { projectId, key } } });
  return { id: a.id, agentId: a.id, name: a.name, kind: "agent" };
}

export async function policy(tx: Tx, projectId: string) {
  const p = await tx.project.findUniqueOrThrow({ where: { id: projectId }, select: { approvalPolicy: true } });
  return { ...POLICY_DEFAULT, ...j.parse<Partial<typeof POLICY_DEFAULT>>(p.approvalPolicy, {}) };
}

/** Run a unit of work in a transaction, then broadcast a state change. */
export async function mutate<T>(projectId: string, reason: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const out = await db.$transaction((tx) => fn(tx), { timeout: 20_000 });
  changed(projectId, reason);
  return out;
}
