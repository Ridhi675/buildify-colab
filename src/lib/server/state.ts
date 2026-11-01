// Full project state for the client. One snapshot keeps both browsers consistent:
// every mutation broadcasts "changed" and clients re-fetch this.

import { db, j } from "../db";
import { llmStatus } from "../ai/llm";
import { lockList, presenceList } from "./realtime";
import { isActive, reconcileOrphans, PHASES } from "./tasks";
import { POLICY_DEFAULT } from "./core";
import type { AppSpec, TextualSpec } from "../types";

export async function getState(projectId: string) {
  await reconcileOrphans(projectId);
  const p = await db.project.findUniqueOrThrow({
    where: { id: projectId },
    include: {
      members: { include: { user: true } },
      requirements: { include: { revisions: { orderBy: { version: "asc" } } }, orderBy: { key: "asc" } },
      components: { orderBy: { key: "asc" } },
      contextVersions: { orderBy: { number: "desc" }, select: { id: true, number: true, reason: true, authorId: true, decisionId: true, createdAt: true, snapshot: true } },
      decisions: { orderBy: { createdAt: "asc" } },
      agents: { orderBy: { key: "desc" } },
      tasks: { orderBy: { createdAt: "desc" }, take: 60, include: { runs: { orderBy: { attempt: "asc" } } } },
      impacts: { orderBy: { createdAt: "desc" }, take: 30 },
      previews: { orderBy: { number: "asc" } },
      checkpoints: { orderBy: { createdAt: "desc" } },
      approvals: { orderBy: { createdAt: "desc" }, take: 40, include: { votes: true } },
      comments: { orderBy: { createdAt: "asc" } },
      notifications: { orderBy: { updatedAt: "desc" }, take: 40 },
      activity: { orderBy: { createdAt: "desc" }, take: 150 },
      chat: { orderBy: { createdAt: "asc" }, take: 150 },
      // Everything except the full file, which only preview generation needs.
      references: { orderBy: { createdAt: "asc" }, select: { id: true, name: true, kind: true, thumb: true, palette: true, accent: true, mode: true, layout: true, note: true, createdById: true, createdAt: true } },
    },
  });
  const [reqDeps, compDeps, versions] = await Promise.all([
    db.requirementDependency.findMany({ where: { projectId } }),
    db.componentDependency.findMany({ where: { projectId } }),
    db.artifactVersion.findMany({ where: { projectId }, orderBy: { number: "asc" } }),
  ]);
  const runs = p.tasks.flatMap((t) => t.runs);

  return {
    project: {
      id: p.id,
      name: p.name,
      description: p.description,
      isDemo: p.isDemo,
      contextVersion: p.contextVersion,
      currentArtifactVerId: p.currentArtifactVerId,
      phase: p.phase,
      policy: { ...POLICY_DEFAULT, ...j.parse(p.approvalPolicy, {}) },
    },
    members: p.members.map((m) => ({ userId: m.userId, role: m.role, name: m.user.name, title: m.user.title, color: m.user.color })),
    references: p.references.map((r) => ({ ...r, palette: j.parse<string[]>(r.palette, []) })),
    presence: presenceList(projectId),
    locks: lockList(projectId),
    requirements: p.requirements.map((r) => ({
      ...r,
      acceptanceCriteria: j.parse<string[]>(r.acceptanceCriteria, []),
      components: j.parse<string[]>(r.components, []),
      revisions: r.revisions.map((v) => ({ ...v, acceptance: j.parse<string[]>(v.acceptance, []) })),
    })),
    reqDeps,
    components: p.components,
    compDeps,
    contextVersions: p.contextVersions.map((c) => ({ ...c, snapshot: j.parse(c.snapshot, { requirements: [] }) })),
    decisions: p.decisions.map((d) => ({
      ...d,
      approvedByIds: j.parse<string[]>(d.approvedByIds, []),
      affectedRequirements: j.parse<string[]>(d.affectedRequirements, []),
      affectedComponents: j.parse<string[]>(d.affectedComponents, []),
      agentContributions: j.parse<string[]>(d.agentContributions, []),
    })),
    agents: p.agents,
    tasks: p.tasks.map((t) => ({
      ...t,
      input: j.parse(t.input, {}),
      output: j.parse(t.output, null),
      validation: j.parse(t.validation, null),
      requirementKeys: j.parse<string[]>(t.requirementKeys, []),
      depFingerprint: j.parse<Record<string, number>>(t.depFingerprint, {}),
      phases: PHASES[t.type] ?? [],
      live: isActive(t.id),
      runs: t.runs.map((r) => ({ ...r, log: j.parse(r.log, []) })),
    })),
    impacts: p.impacts.map((i) => ({ ...i, result: j.parse(i.result, {}) })),
    previews: p.previews.map((v) => ({ ...v, spec: j.parse<AppSpec>(v.spec, {} as AppSpec), textual: j.parse<TextualSpec>(v.textual, {} as TextualSpec), feedback: j.parse<string[]>(v.feedback, []) })),
    versions: versions.map((v) => ({ ...v, spec: j.parse<AppSpec>(v.spec, {} as AppSpec), requirementsSnapshot: j.parse(v.requirementsSnapshot, []), changedComponents: j.parse<string[]>(v.changedComponents, []) })),
    checkpoints: p.checkpoints.map((c) => ({ ...c, requirementsSnapshot: j.parse(c.requirementsSnapshot, []), taskStatuses: j.parse(c.taskStatuses, []), agentMeta: j.parse(c.agentMeta, []) })),
    approvals: p.approvals.map((a) => ({ ...a, payload: j.parse(a.payload, {}), recommendation: j.parse(a.recommendation, null) })),
    comments: p.comments,
    notifications: p.notifications.map((n) => ({ ...n, readBy: j.parse<string[]>(n.readBy, []) })),
    activity: p.activity,
    chat: p.chat.map((c) => ({ ...c, meta: j.parse(c.meta, {}) })),
    ai: llmStatus(),
    metrics: {
      previewRequests: p.tasks.filter((t) => t.type === "preview").length,
      buildRequests: p.tasks.filter((t) => t.type === "build").length,
      rebuildAttempts: p.tasks.filter((t) => t.type === "build" && j.parse<{ affected?: string[] }>(t.input, {}).affected).length,
      rejectedPreviews: p.previews.filter((v) => v.status === "rejected" || v.status === "changes_requested").length,
      quarantined: p.tasks.filter((t) => t.status === "quarantined").length,
      llmRuns: runs.filter((r) => r.source === "llm").length,
      rulesRuns: runs.filter((r) => r.source === "rules").length,
      tokensIn: runs.reduce((s, r) => s + r.tokensIn, 0),
      tokensOut: runs.reduce((s, r) => s + r.tokensOut, 0),
      costUsd: runs.reduce((s, r) => s + r.costUsd, 0),
      stepDelayMs: Number(process.env.BC_AGENT_STEP_MS ?? 2500),
    },
  };
}

export type ProjectState = Awaited<ReturnType<typeof getState>>;
