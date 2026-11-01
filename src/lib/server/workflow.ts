// Human-facing workflows: requirements, previews, approvals, ripple-effect
// changes, versions, checkpoints, restore, comments and Reviewer chat.

import { db, j, type Tx } from "../db";
import { analyzeImpact } from "../engine/impact";
import { diffRequirements } from "../engine/context";
import { diffSpecs } from "../engine/spec";
import { reviewerChat } from "../ai/agents";
import type { AppSpec, ImpactResult, ReqLite } from "../types";
import {
  activity,
  agentActor,
  commitContext,
  createCheckpoint,
  loadReqs,
  mutate,
  nextReqKey,
  notify,
  policy,
  type Actor,
} from "./core";
import { createTask, proposeRebuild, startTask } from "./tasks";
import { HttpError } from "./auth";

// ---------------------------------------------------------------------------
// Requirements
// ---------------------------------------------------------------------------

/** Human request → Reviewer simplification task (runs asynchronously). */
export async function submitRequest(projectId: string, actor: Actor, request: string) {
  const t = await mutate(projectId, "request submitted", async (tx) => {
    await tx.chatMessage.create({ data: { projectId, authorId: actor.id, role: "human", body: request } });
    await activity(tx, projectId, actor, "Described product request", { target: request.slice(0, 80) });
    return createTask(tx, projectId, "reviewer", "simplify", "Simplify human request", { request, requestedBy: actor.name }, actor.id, []);
  });
  startTask(t.id);
  return { taskId: t.id };
}

export async function decideProposed(projectId: string, actor: Actor, keys: string[], decision: "approve" | "reject") {
  return mutate(projectId, "requirements decided", async (tx) => {
    const rows = await tx.requirement.findMany({ where: { projectId, key: { in: keys }, status: "proposed" } });
    if (!rows.length) throw new HttpError(409, "Those requirements were already decided by someone else");
    for (const r of rows) {
      await tx.requirement.update({ where: { id: r.id }, data: { status: decision === "approve" ? "approved" : "rejected" } });
      const rev = { title: r.title, description: r.description, priority: r.priority, status: decision === "approve" ? "approved" : "rejected", acceptance: r.acceptanceCriteria, authorId: actor.id, reason: `${decision}d by ${actor.name}`, contextVersion: 0 };
      await tx.requirementRevision.upsert({
        where: { requirementId_version: { requirementId: r.id, version: r.version } },
        create: { requirementId: r.id, version: r.version, ...rev },
        update: rev,
      });
    }
    if (decision === "reject") {
      await activity(tx, projectId, actor, `Rejected ${rows.length} proposed requirement(s)`, { target: rows.map((r) => r.key).join(", ") });
      return { contextVersion: null };
    }
    const decisionRow = await tx.decision.create({
      data: {
        projectId,
        title: rows.length > 1 ? `${rows.length} requirements approved` : `${rows[0].key} approved`,
        summary: rows.map((r) => `${r.key}: ${r.title}`).join("; "),
        reason: "Reviewer interpretation accepted by a human",
        kind: "requirements",
        proposedById: rows[0].authorId,
        approvedByIds: j.str([actor.id]),
        contextVersion: 0,
        affectedRequirements: j.str(rows.map((r) => r.key)),
        affectedComponents: j.str([...new Set(rows.flatMap((r) => j.parse<string[]>(r.components, [])))]),
        agentContributions: j.str(["Bunty simplified the request"]),
      },
    });
    const cv = await commitContext(tx, projectId, `Approved ${rows.map((r) => r.key).join(", ")}`, actor.id, decisionRow.id);
    await tx.requirementRevision.updateMany({ where: { requirementId: { in: rows.map((r) => r.id) }, contextVersion: 0 }, data: { contextVersion: cv } });
    await tx.decision.update({ where: { id: decisionRow.id }, data: { contextVersion: cv } });
    if ((await tx.requirement.count({ where: { projectId, status: "proposed" } })) === 0)
      await createCheckpoint(tx, projectId, "requirements_approved", `Requirements approved (context v${cv})`, actor.id);
    await activity(tx, projectId, actor, `Approved ${rows.length} requirement(s)`, { target: rows.map((r) => r.key).join(", "), outcome: `context v${cv}` });
    await notify(tx, projectId, "context", `Context v${cv} committed`, `${rows.length} requirement(s) approved by ${actor.name}`, "context-commit");
    return { contextVersion: cv };
  });
}

/** Edit a still-proposed requirement in place, with optimistic version check. */
export async function editProposed(projectId: string, actor: Actor, key: string, expectedVersion: number, patch: { title: string; description: string; priority: string }) {
  return mutate(projectId, "requirement edited", async (tx) => {
    const r = await tx.requirement.findUniqueOrThrow({ where: { projectId_key: { projectId, key } } });
    if (r.status !== "proposed") throw new HttpError(409, `${key} is ${r.status}; propose a change instead so its impact can be reviewed`);
    if (r.version !== expectedVersion) throw new HttpError(409, `${key} changed while you were editing (now v${r.version}). Your text is kept in the form — review and save again.`, { current: r });
    await tx.requirement.update({ where: { id: r.id }, data: { ...patch, version: r.version + 1 } });
    await tx.requirementRevision.create({ data: { requirementId: r.id, version: r.version + 1, title: patch.title, description: patch.description, priority: patch.priority, status: "proposed", acceptance: r.acceptanceCriteria, authorId: actor.id, reason: "Edited interpretation", contextVersion: 0 } });
    await activity(tx, projectId, actor, "Edited proposed requirement", { target: key });
  });
}

export async function addRequirement(projectId: string, actor: Actor, data: { title: string; description: string; category: string; priority: string }) {
  return mutate(projectId, "requirement added", async (tx) => {
    const key = await nextReqKey(tx, projectId);
    await tx.requirement.create({ data: { projectId, key, ...data, authorId: actor.id, source: "human", status: "proposed", acceptanceCriteria: j.str([`${data.title} is visible and testable`]) } });
    await activity(tx, projectId, actor, "Proposed requirement", { target: `${key}: ${data.title}` });
    return { key };
  });
}

// ---------------------------------------------------------------------------
// Ripple Effect: requirement change proposals
// ---------------------------------------------------------------------------

export async function proposeChange(
  projectId: string,
  actor: Actor,
  args: { key: string; title: string; description: string; baseVersion?: number; reason: string; replaces?: string },
) {
  let impactTaskId = "";
  const res = await mutate(projectId, "change proposed", async (tx) => {
    const p = await tx.project.findUniqueOrThrow({ where: { id: projectId } });
    const r = await tx.requirement.findUnique({ where: { projectId_key: { projectId, key: args.key } } });
    if (!r || r.status !== "approved") throw new HttpError(404, `${args.key} is not an approved requirement`);

    const reqs = await loadReqs(tx, projectId);
    const [reqDeps, comps, compDeps, tasks] = await Promise.all([
      tx.requirementDependency.findMany({ where: { projectId } }),
      tx.component.findMany({ where: { projectId } }),
      tx.componentDependency.findMany({ where: { projectId } }),
      tx.agentTask.findMany({ where: { projectId }, include: { agent: true } }),
    ]);
    const result = analyzeImpact({
      appName: p.name,
      changedKey: args.key,
      newTitle: args.title,
      newDescription: args.description,
      requirements: reqs,
      reqDeps,
      components: comps,
      compDeps,
      tasks: tasks.map((t) => ({ id: t.id, title: t.title, status: t.status, agentKey: t.agent.key, requirementKeys: j.parse<string[]>(t.requirementKeys, []) })),
    });

    // Server-side version check: the proposer edited an older version.
    const conflict = args.baseVersion !== undefined && args.baseVersion !== r.version;
    if (args.replaces) await tx.impactAnalysis.updateMany({ where: { id: args.replaces, projectId }, data: { status: "modified" } });
    if (args.replaces) await tx.approvalRequest.updateMany({ where: { projectId, kind: "change", status: "pending", payload: { contains: args.replaces } }, data: { status: "superseded", resolvedAt: new Date() } });

    const ia = await tx.impactAnalysis.create({
      data: {
        projectId,
        requirementKey: args.key,
        previousText: `${r.title} — ${r.description}`,
        proposedText: `${args.title} — ${args.description}`,
        proposedTitle: args.title,
        severity: result.severity,
        result: j.str(result),
        status: conflict ? "conflict" : "pending",
        baseContextVersion: p.contextVersion,
        createdById: actor.id,
      },
    });
    await tx.impactAnalysis.update({ where: { id: ia.id }, data: { result: j.str({ ...result, baseVersion: args.baseVersion ?? r.version, reason: args.reason }) } });

    if (conflict) {
      await activity(tx, projectId, actor, "Change conflicts with a newer version", { target: args.key, outcome: `edited v${args.baseVersion}, current v${r.version}` });
      await notify(tx, projectId, "conflict", `Edit conflict on ${args.key}`, `${actor.name} edited v${args.baseVersion} but ${args.key} is now v${r.version}. The proposal was preserved for resolution.`);
      return { impactId: ia.id, conflict: true };
    }

    const pol = await policy(tx, projectId);
    const required = result.severity === "low" ? pol.minor : pol.major;
    await tx.approvalRequest.create({
      data: {
        projectId,
        kind: "change",
        title: `Change ${args.key}: ${args.title}`,
        summary: `${result.severity.toUpperCase()} impact — ${result.affectedComponents.length} components affected, ${result.unaffectedComponents.length} unaffected, ${result.staleTasks.length} in-flight task(s) would become stale. Reason: ${args.reason}`,
        payload: j.str({ impactId: ia.id }),
        requiredApprovals: required,
        contextVersion: p.contextVersion,
        createdById: actor.id,
      },
    });
    const t = await createTask(tx, projectId, "reviewer", "impact", `Supplement impact analysis for ${args.key}`, { impactId: ia.id }, actor.id, []);
    impactTaskId = t.id;
    await activity(tx, projectId, actor, `Proposed change to ${args.key}`, { target: args.title, outcome: `${result.severity} impact` });
    await notify(tx, projectId, "important", `Change to ${args.key} needs ${required} approval(s)`, `${actor.name}: “${args.title}”. ${result.affectedComponents.length} components affected.`);
    return { impactId: ia.id, conflict: false };
  });
  if (impactTaskId) startTask(impactTaskId);
  return res;
}

/** Conflict resolution: re-run a preserved proposal against the latest version. */
export async function rebaseChange(projectId: string, actor: Actor, impactId: string) {
  const ia = await db.impactAnalysis.findFirstOrThrow({ where: { id: impactId, projectId } });
  const r = await db.requirement.findUniqueOrThrow({ where: { projectId_key: { projectId, key: ia.requirementKey } } });
  const reason = j.parse<{ reason?: string }>(ia.result, {}).reason ?? "Rebased proposal";
  const desc = ia.proposedText.split(" — ").slice(1).join(" — ") || ia.proposedText;
  return proposeChange(projectId, actor, { key: ia.requirementKey, title: ia.proposedTitle, description: desc, baseVersion: r.version, reason: `${reason} (rebased onto v${r.version})`, replaces: ia.id });
}

export async function discardChange(projectId: string, actor: Actor, impactId: string) {
  return mutate(projectId, "change discarded", async (tx) => {
    await tx.impactAnalysis.updateMany({ where: { id: impactId, projectId }, data: { status: "rejected" } });
    await activity(tx, projectId, actor, "Discarded change proposal");
  });
}

async function applyChange(tx: Tx, projectId: string, impactId: string, approvers: string[], actor: Actor) {
  const ia = await tx.impactAnalysis.findUniqueOrThrow({ where: { id: impactId } });
  const result = j.parse<ImpactResult & { baseVersion: number; reason?: string }>(ia.result, {} as ImpactResult & { baseVersion: number });
  const r = await tx.requirement.findUniqueOrThrow({ where: { projectId_key: { projectId, key: ia.requirementKey } } });
  if (r.version !== result.baseVersion) {
    await tx.impactAnalysis.update({ where: { id: ia.id }, data: { status: "conflict" } });
    await notify(tx, projectId, "conflict", `Approved change to ${r.key} was not applied`, `${r.key} changed to v${r.version} after this analysis. Rebase the proposal to continue — nothing was overwritten.`);
    return false;
  }
  const desc = ia.proposedText.split(" — ").slice(1).join(" — ") || ia.proposedText;
  const version = r.version + 1;
  await tx.requirement.update({ where: { id: r.id }, data: { title: ia.proposedTitle, description: desc, version } });
  const decision = await tx.decision.create({
    data: {
      projectId,
      title: `${r.key} changed: ${ia.proposedTitle}`,
      summary: `“${r.title}” → “${ia.proposedTitle}”`,
      reason: result.reason ?? "Requirement change",
      kind: "change",
      proposedById: ia.createdById,
      approvedByIds: j.str(approvers),
      contextVersion: 0,
      affectedRequirements: j.str(result.affectedRequirements.map((x) => x.key)),
      affectedComponents: j.str(result.affectedComponents.map((x) => x.key)),
      agentContributions: j.str(["Dependency engine computed impact", ...(result.inferred?.length ? ["Bunty added inferred consequences"] : [])]),
    },
  });
  const cv = await commitContext(tx, projectId, `${r.key} v${version}: ${ia.proposedTitle}`, actor.id, decision.id);
  await tx.decision.update({ where: { id: decision.id }, data: { contextVersion: cv } });
  await tx.requirementRevision.create({ data: { requirementId: r.id, version, title: ia.proposedTitle, description: desc, priority: r.priority, status: "approved", acceptance: r.acceptanceCriteria, authorId: ia.createdById, reason: result.reason, contextVersion: cv } });
  await tx.impactAnalysis.update({ where: { id: ia.id }, data: { status: "approved" } });

  // Queued work that hasn't started yet is superseded; running work is left alone
  // and will be quarantined by the stale check when it returns.
  const staleIds = result.staleTasks.map((t) => t.id);
  await tx.agentTask.updateMany({ where: { id: { in: staleIds }, status: { in: ["queued", "paused"] } }, data: { status: "superseded", staleReason: `Superseded by ${r.key} v${version}`, phaseLabel: "Superseded" } });
  const running = await tx.agentTask.count({ where: { id: { in: staleIds }, status: "running" } });
  await tx.impactAnalysis.updateMany({ where: { projectId, requirementKey: r.key, status: "pending", id: { not: ia.id } }, data: { status: "conflict" } });

  await activity(tx, projectId, actor, `Committed ${r.key} v${version}`, { outcome: `context v${cv}; ${running} running task(s) now stale` });
  await notify(tx, projectId, "context", `Requirement changed: ${r.key}`, `“${ia.proposedTitle}”. Agents notified; context v${cv}.`, "context-commit");
  const builderBusy = await tx.agentTask.count({ where: { projectId, type: "build", status: "running" } });
  const hasArtifact = !!(await tx.project.findUniqueOrThrow({ where: { id: projectId } })).currentArtifactVerId;
  if (!builderBusy && hasArtifact) await proposeRebuild(tx, projectId, `${r.key} changed.`);
  return true;
}

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

export async function requestPreview(projectId: string, actor: Actor, feedback?: string) {
  const t = await mutate(projectId, "preview requested", async (tx) => {
    const approved = await tx.requirement.count({ where: { projectId, status: "approved" } });
    if (!approved) throw new HttpError(400, "Approve at least one requirement before generating a preview");
    await tx.approvalRequest.updateMany({ where: { projectId, kind: "preview", status: "pending" }, data: { status: "superseded", resolvedAt: new Date() } });
    await activity(tx, projectId, actor, "Requested preview", { outcome: feedback ? `feedback: ${feedback}` : undefined });
    return createTask(tx, projectId, "reviewer", "preview", "Generate preview", { feedback }, actor.id);
  });
  startTask(t.id);
  return { taskId: t.id };
}

// ---------------------------------------------------------------------------
// Approvals
// ---------------------------------------------------------------------------

export async function vote(projectId: string, actor: Actor & { role: string }, requestId: string, v: "approve" | "reject" | "revise", comment?: string) {
  const toStart: string[] = [];
  const res = await mutate(projectId, "vote", async (tx) => {
    if (actor.kind !== "human") throw new HttpError(403, "Only humans can approve");
    if (actor.role === "observer") throw new HttpError(403, "Observers can comment but not vote");
    const ar = await tx.approvalRequest.findFirstOrThrow({ where: { id: requestId, projectId }, include: { votes: true } });
    if (ar.status !== "pending") throw new HttpError(409, `This request is already ${ar.status.replace("_", " ")}`);
    await tx.approvalVote.upsert({
      where: { requestId_userId: { requestId, userId: actor.id } },
      create: { requestId, userId: actor.id, vote: v, comment },
      update: { vote: v, comment },
    });
    const votes = await tx.approvalVote.findMany({ where: { requestId } });
    const approvals = votes.filter((x) => x.vote === "approve");
    let status = "pending";
    if (votes.some((x) => x.vote === "reject")) status = "rejected";
    else if (votes.some((x) => x.vote === "revise")) status = "revision_requested";
    else if (approvals.length >= ar.requiredApprovals) status = "approved";

    await activity(tx, projectId, actor, `Voted ${v}`, { target: ar.title, outcome: status === "pending" ? `${approvals.length}/${ar.requiredApprovals} approvals` : status });
    if (comment) await tx.comment.create({ data: { projectId, authorId: actor.id, targetType: "approval", targetId: ar.id, body: comment } });
    if (status === "pending") {
      await notify(tx, projectId, "important", `${ar.title}: ${approvals.length}/${ar.requiredApprovals} approvals`, `${actor.name} voted ${v}. Waiting for another human.`);
      return { status };
    }
    await tx.approvalRequest.update({ where: { id: ar.id }, data: { status, resolvedAt: new Date() } });
    const payload = j.parse<Record<string, string>>(ar.payload, {});
    const approvers = approvals.map((x) => x.userId);

    if (status === "approved") {
      const started = await onApproved(tx, projectId, ar.kind, payload, approvers, actor);
      toStart.push(...started);
    } else {
      await onRejected(tx, projectId, ar.kind, payload, status, comment);
    }
    return { status };
  });
  for (const id of toStart) startTask(id);
  return res;
}

async function onRejected(tx: Tx, projectId: string, kind: string, payload: Record<string, string>, status: string, comment?: string) {
  if (kind === "preview") {
    const prev = await tx.preview.findUniqueOrThrow({ where: { id: payload.previewId } });
    // Keep the feedback the preview was generated with; the next regenerate reads all of it.
    const feedback = [...j.parse<string[]>(prev.feedback, []), ...(comment ? [comment] : [])];
    const pv = await tx.preview.update({ where: { id: prev.id }, data: { status: status === "rejected" ? "rejected" : "changes_requested", feedback: j.str(feedback) } });
    await notify(tx, projectId, "waiting", `Preview #${pv.number} ${status === "rejected" ? "rejected" : "needs changes"}`, comment ?? "Reviewer can regenerate with feedback.");
  } else if (kind === "change") {
    await tx.impactAnalysis.update({ where: { id: payload.impactId }, data: { status: "rejected" } });
  } else if (kind === "build_output") {
    await tx.agentTask.update({ where: { id: payload.builderTaskId }, data: { phaseLabel: status === "rejected" ? "Output rejected by humans" : "Revision requested" } });
    await notify(tx, projectId, "waiting", "Builder output not accepted", comment ?? "Use Redirect or Retry in Agents.");
  }
}

async function onApproved(tx: Tx, projectId: string, kind: string, payload: Record<string, string>, approvers: string[], actor: Actor): Promise<string[]> {
  const toStart: string[] = [];
  const p = await tx.project.findUniqueOrThrow({ where: { id: projectId } });
  const reviewer = await agentActor(tx, projectId, "reviewer");
  const builder = await agentActor(tx, projectId, "builder");

  if (kind === "preview") {
    const pv = await tx.preview.update({ where: { id: payload.previewId }, data: { status: "approved" } });
    const artifact = (await tx.artifact.findFirst({ where: { projectId } })) ?? (await tx.artifact.create({ data: { projectId, name: p.name } }));
    const decision = await tx.decision.create({
      data: { projectId, title: `Preview #${pv.number} approved`, summary: "Preview accepted as the build target", reason: "Preview-first gate passed", kind: "preview", proposedById: reviewer.id, approvedByIds: j.str(approvers), contextVersion: p.contextVersion, agentContributions: j.str(["Bunty generated the preview"]) },
    });
    const av = await createArtifactVersion(tx, projectId, artifact.id, `Approved preview #${pv.number}`, pv.spec, actor.id, decision.id, null, ["initial version"]);
    await tx.project.update({ where: { id: projectId }, data: { currentArtifactVerId: av.id, phase: "build" } });
    await createCheckpoint(tx, projectId, "preview_approved", `Preview #${pv.number} approved`, actor.id);
    // Distinct parallel contributions: Reviewer writes acceptance tests while Builder builds.
    const a = await createTask(tx, projectId, "reviewer", "acceptance", "Write acceptance test plan", {}, reviewer.id);
    const b = await createTask(tx, projectId, "builder", "build", "Build full prototype from approved preview", { baseArtifactVersionId: av.id }, reviewer.id);
    toStart.push(a.id, b.id);
    await createCheckpoint(tx, projectId, "build_started", "Build started", actor.id);
    await activity(tx, projectId, reviewer, "Started Reviewer + Builder in parallel", { outcome: "acceptance tests ‖ full build" });
  } else if (kind === "change") {
    await applyChange(tx, projectId, payload.impactId, approvers, actor);
  } else if (kind === "rebuild") {
    const pl = payload as unknown as { affected: string[]; baseArtifactVersionId: string | null };
    const t = await createTask(tx, projectId, "builder", "build", `Rebuild ${pl.affected.length || "all"} affected component(s)`, { affected: pl.affected.length ? pl.affected : undefined, baseArtifactVersionId: pl.baseArtifactVersionId }, reviewer.id);
    toStart.push(t.id);
    await activity(tx, projectId, builder, "Accepted approved rebuild task", { outcome: `context v${p.contextVersion}` });
  } else if (kind === "build_output") {
    const bt = await tx.agentTask.findUniqueOrThrow({ where: { id: payload.builderTaskId } });
    // Re-check staleness at commit time: requirements may have changed during review.
    const { checkStale } = await import("../engine/context");
    const check = checkStale(j.parse(bt.depFingerprint, {}), await loadReqs(tx, projectId));
    if (check.stale) {
      await tx.agentTask.update({ where: { id: bt.id }, data: { status: "quarantined", staleReason: check.reason } });
      await notify(tx, projectId, "conflict", "Approved output was stale and was not committed", check.reason ?? "");
      await proposeRebuild(tx, projectId, "Requirements changed while the output was under review.");
      return toStart;
    }
    const out = j.parse<{ result: { spec: AppSpec; changed: string[]; partial: boolean } }>(bt.output, { result: { spec: {} as AppSpec, changed: [], partial: false } });
    const artifact = (await tx.artifact.findFirst({ where: { projectId } })) ?? (await tx.artifact.create({ data: { projectId, name: p.name } }));
    const prev = p.currentArtifactVerId ? await tx.artifactVersion.findUnique({ where: { id: p.currentArtifactVerId } }) : null;
    const decision = await tx.decision.create({
      data: {
        projectId,
        title: out.result.partial ? `Rebuilt ${out.result.changed.length} component change(s)` : "Full prototype built",
        summary: out.result.changed.length ? `Changed: ${out.result.changed.join(", ")}` : "Built from approved preview",
        reason: out.result.partial ? "Impact-aware rebuild after requirement change" : "Build of approved preview",
        kind: "build",
        proposedById: builder.id,
        approvedByIds: j.str(approvers),
        contextVersion: p.contextVersion,
        affectedComponents: j.str(out.result.changed),
        agentContributions: j.str(["Babli generated components", "Bunty validated against acceptance checks"]),
      },
    });
    const av = await createArtifactVersion(tx, projectId, artifact.id, decision.title, j.str(out.result.spec), builder.id, decision.id, prev?.id ?? null, out.result.changed);
    await tx.project.update({ where: { id: projectId }, data: { currentArtifactVerId: av.id, phase: "review" } });
    await createCheckpoint(tx, projectId, "build_completed", `Build completed — v${av.number}`, actor.id);
    await activity(tx, projectId, actor, `Artifact v${av.number} accepted`, { outcome: decision.title });
  } else if (kind === "release") {
    await tx.decision.create({
      data: { projectId, title: "Final release approved", summary: `Artifact ${payload.artifactVersionId ? "version accepted" : ""} released`, reason: "Both humans approved the release", kind: "release", proposedById: payload.requestedBy ?? actor.id, approvedByIds: j.str(approvers), contextVersion: p.contextVersion },
    });
    await tx.project.update({ where: { id: projectId }, data: { phase: "released" } });
    await createCheckpoint(tx, projectId, "release_approved", "Final release approved", actor.id);
    await activity(tx, projectId, actor, "Final release approved");
  }
  return toStart;
}

async function createArtifactVersion(tx: Tx, projectId: string, artifactId: string, label: string, spec: string, authorId: string, decisionId: string | null, derivedFromId: string | null, changed: string[]) {
  const p = await tx.project.findUniqueOrThrow({ where: { id: projectId } });
  const number = (await tx.artifactVersion.count({ where: { projectId } })) + 1;
  const reqs = await loadReqs(tx, projectId);
  const { snapshotRequirements } = await import("../engine/context");
  return tx.artifactVersion.create({
    data: { artifactId, projectId, number, label, spec, contextVersion: p.contextVersion, requirementsSnapshot: j.str(snapshotRequirements(reqs)), changedComponents: j.str(changed), decisionId, derivedFromId, authorId },
  });
}

export async function requestRelease(projectId: string, actor: Actor) {
  return mutate(projectId, "release requested", async (tx) => {
    const p = await tx.project.findUniqueOrThrow({ where: { id: projectId } });
    if (!p.currentArtifactVerId) throw new HttpError(400, "No artifact to release yet");
    const pol = await policy(tx, projectId);
    await tx.approvalRequest.create({
      data: { projectId, kind: "release", title: "Approve final release", summary: "Release the current artifact version as the agreed product.", payload: j.str({ artifactVersionId: p.currentArtifactVerId, requestedBy: actor.id }), requiredApprovals: pol.release, contextVersion: p.contextVersion, createdById: actor.id },
    });
    await activity(tx, projectId, actor, "Requested final release");
    await notify(tx, projectId, "important", "Final release needs approval", `${pol.release} human approvals required.`);
  });
}

// ---------------------------------------------------------------------------
// Decision Time Machine: compare + restore
// ---------------------------------------------------------------------------

export async function compareVersions(projectId: string, aId: string, bId: string) {
  const [a, b] = await Promise.all([
    db.artifactVersion.findFirstOrThrow({ where: { id: aId, projectId } }),
    db.artifactVersion.findFirstOrThrow({ where: { id: bId, projectId } }),
  ]);
  const decisions = await db.decision.findMany({
    where: { projectId, createdAt: { gt: a.createdAt < b.createdAt ? a.createdAt : b.createdAt, lte: a.createdAt < b.createdAt ? b.createdAt : a.createdAt } },
    orderBy: { createdAt: "asc" },
  });
  return {
    spec: diffSpecs(j.parse<AppSpec>(a.spec, {} as AppSpec), j.parse<AppSpec>(b.spec, {} as AppSpec)),
    requirements: diffRequirements(j.parse<ReqLite[]>(a.requirementsSnapshot, []), j.parse<ReqLite[]>(b.requirementsSnapshot, [])),
    decisions: decisions.map((d) => ({ id: d.id, title: d.title, reason: d.reason, proposedById: d.proposedById, approvedByIds: j.parse<string[]>(d.approvedByIds, []), createdAt: d.createdAt })),
  };
}

/**
 * Restore never rewrites history: it creates a NEW artifact version and a NEW
 * context version derived from the old snapshot.
 */
export async function restore(projectId: string, actor: Actor, args: { artifactVersionId?: string; checkpointId?: string; reason: string }) {
  return mutate(projectId, "restore", async (tx) => {
    let source: { spec: string; reqs: ReqLite[]; label: string; artifactVersionId: string | null };
    if (args.checkpointId) {
      const cp = await tx.checkpoint.findFirstOrThrow({ where: { id: args.checkpointId, projectId } });
      const av = cp.artifactVersionId ? await tx.artifactVersion.findUnique({ where: { id: cp.artifactVersionId } }) : null;
      source = { spec: av?.spec ?? "", reqs: j.parse<ReqLite[]>(cp.requirementsSnapshot, []), label: `checkpoint “${cp.label}”`, artifactVersionId: av?.id ?? null };
    } else {
      const av = await tx.artifactVersion.findFirstOrThrow({ where: { id: args.artifactVersionId, projectId } });
      source = { spec: av.spec, reqs: j.parse<ReqLite[]>(av.requirementsSnapshot, []), label: `version v${av.number}`, artifactVersionId: av.id };
    }
    // Restore requirements: changed ones get a new revision; missing ones are superseded.
    const live = await tx.requirement.findMany({ where: { projectId, status: "approved" } });
    const want = new Map(source.reqs.map((r) => [r.key, r]));
    const touched: string[] = [];
    for (const r of live) {
      const s = want.get(r.key);
      if (!s) {
        await tx.requirement.update({ where: { id: r.id }, data: { status: "superseded", version: r.version + 1 } });
        touched.push(r.key);
      } else if (s.title !== r.title || s.description !== r.description) {
        await tx.requirement.update({ where: { id: r.id }, data: { title: s.title, description: s.description, version: r.version + 1 } });
        await tx.requirementRevision.create({ data: { requirementId: r.id, version: r.version + 1, title: s.title, description: s.description, priority: r.priority, status: "approved", acceptance: r.acceptanceCriteria, authorId: actor.id, reason: `Restored from ${source.label}`, contextVersion: 0 } });
        touched.push(r.key);
      }
    }
    for (const [key, s] of want) {
      if (!live.some((r) => r.key === key)) {
        const existing = await tx.requirement.findUnique({ where: { projectId_key: { projectId, key } } });
        if (existing) await tx.requirement.update({ where: { id: existing.id }, data: { status: "approved", title: s.title, description: s.description, version: existing.version + 1 } });
        touched.push(key);
      }
    }
    const decision = await tx.decision.create({
      data: { projectId, title: `Restored ${source.label}`, summary: touched.length ? `Requirements restored: ${touched.join(", ")}` : "Artifact restored; requirements unchanged", reason: args.reason, kind: "restore", proposedById: actor.id, approvedByIds: j.str([actor.id]), contextVersion: 0, affectedRequirements: j.str(touched) },
    });
    const cv = await commitContext(tx, projectId, `Restored ${source.label}`, actor.id, decision.id);
    await tx.decision.update({ where: { id: decision.id }, data: { contextVersion: cv } });
    await tx.requirementRevision.updateMany({ where: { requirement: { projectId }, contextVersion: 0, reason: { startsWith: "Restored" } }, data: { contextVersion: cv } });
    let newVersion: number | null = null;
    if (source.spec) {
      const artifact = await tx.artifact.findFirstOrThrow({ where: { projectId } });
      const p = await tx.project.findUniqueOrThrow({ where: { id: projectId } });
      const av = await createArtifactVersion(tx, projectId, artifact.id, `Restored from ${source.label}`, source.spec, actor.id, decision.id, source.artifactVersionId, ["restored"]);
      await tx.project.update({ where: { id: projectId }, data: { currentArtifactVerId: av.id } });
      newVersion = av.number;
      void p;
    }
    await tx.approvalRequest.updateMany({ where: { projectId, status: "pending", kind: { in: ["rebuild", "build_output"] } }, data: { status: "superseded", resolvedAt: new Date() } });
    await createCheckpoint(tx, projectId, "restored", `Restored ${source.label}`, actor.id);
    await activity(tx, projectId, actor, `Restored ${source.label}`, { outcome: `new version v${newVersion ?? "-"}, context v${cv}; history kept` });
    await notify(tx, projectId, "context", `Restored ${source.label}`, `Created v${newVersion} and context v${cv}. Later versions are kept.`);
    return { contextVersion: cv, artifactVersion: newVersion };
  });
}

export async function restorePreview(projectId: string, args: { artifactVersionId?: string; checkpointId?: string }) {
  const p = await db.project.findUniqueOrThrow({ where: { id: projectId } });
  const cur = p.currentArtifactVerId ? await db.artifactVersion.findUnique({ where: { id: p.currentArtifactVerId } }) : null;
  let targetSpec = "";
  let targetReqs: ReqLite[] = [];
  if (args.checkpointId) {
    const cp = await db.checkpoint.findFirstOrThrow({ where: { id: args.checkpointId, projectId } });
    const av = cp.artifactVersionId ? await db.artifactVersion.findUnique({ where: { id: cp.artifactVersionId } }) : null;
    targetSpec = av?.spec ?? "";
    targetReqs = j.parse<ReqLite[]>(cp.requirementsSnapshot, []);
  } else {
    const av = await db.artifactVersion.findFirstOrThrow({ where: { id: args.artifactVersionId, projectId } });
    targetSpec = av.spec;
    targetReqs = j.parse<ReqLite[]>(av.requirementsSnapshot, []);
  }
  const liveReqs = (await loadReqs(db, projectId)).filter((r) => r.status === "approved");
  return {
    spec: cur && targetSpec ? diffSpecs(j.parse<AppSpec>(cur.spec, {} as AppSpec), j.parse<AppSpec>(targetSpec, {} as AppSpec)) : [],
    requirements: diffRequirements(liveReqs, targetReqs),
    staleTasks: await db.agentTask.count({ where: { projectId, status: { in: ["running", "queued", "paused"] } } }),
  };
}

export async function manualCheckpoint(projectId: string, actor: Actor, label: string) {
  return mutate(projectId, "checkpoint", async (tx) => {
    const cp = await createCheckpoint(tx, projectId, "manual", label, actor.id);
    await activity(tx, projectId, actor, "Created checkpoint", { target: label });
    return { id: cp.id };
  });
}

// ---------------------------------------------------------------------------
// Comments, chat, policy
// ---------------------------------------------------------------------------

export async function addComment(projectId: string, actor: Actor, targetType: string, targetId: string, body: string) {
  return mutate(projectId, "comment", async (tx) => {
    await tx.comment.create({ data: { projectId, authorId: actor.id, targetType, targetId, body } });
    await activity(tx, projectId, actor, "Commented", { target: `${targetType} ${targetId}` });
    const members = await tx.projectMember.findMany({ where: { projectId }, include: { user: true } });
    for (const m of members) {
      const first = m.user.name.split(" ")[0];
      if (m.userId !== actor.id && new RegExp(`@${first}\\b`, "i").test(body))
        await notify(tx, projectId, "important", `@${first} mentioned by ${actor.name}`, body.slice(0, 140), `mention-${m.userId}`);
    }
  });
}

export async function chat(projectId: string, actor: Actor, message: string) {
  await mutate(projectId, "chat", async (tx) => {
    await tx.chatMessage.create({ data: { projectId, authorId: actor.id, role: "human", body: message } });
  });
  const reqs = await loadReqs(db, projectId);
  const recent = (await db.activityEvent.findMany({ where: { projectId }, orderBy: { createdAt: "desc" }, take: 8 })).map((a) => `${a.actorName}: ${a.action}${a.outcome ? ` (${a.outcome})` : ""}`);
  const out = await reviewerChat(message, reqs, recent);
  const reviewer = await agentActor(db, projectId, "reviewer");
  await mutate(projectId, "chat reply", async (tx) => {
    await tx.chatMessage.create({ data: { projectId, authorId: reviewer.id, role: "reviewer", body: out.data.reply, meta: j.str({ source: out.source, intent: out.data.intent }) } });
  });
  if (out.data.intent === "new_request") {
    const t = await mutate(projectId, "request submitted", async (tx) => {
      await activity(tx, projectId, actor, "Described product request", { target: message.slice(0, 80) });
      return createTask(tx, projectId, "reviewer", "simplify", "Simplify human request", { request: message, requestedBy: actor.name }, actor.id, []);
    });
    startTask(t.id);
  } else if (out.data.intent === "change_requirement" && out.data.requirementKey) {
    const r = reqs.find((x) => x.key === out.data.requirementKey && x.status === "approved");
    if (r) await proposeChange(projectId, actor, { key: r.key, title: out.data.newTitle || r.title, description: out.data.newDescription || r.description, baseVersion: r.version, reason: `Requested in chat: “${message}”` });
  }
  return { intent: out.data.intent, source: out.source };
}

export async function setPolicy(projectId: string, actor: Actor, pol: { major: number; minor: number; release: number }) {
  return mutate(projectId, "policy", async (tx) => {
    await tx.project.update({ where: { id: projectId }, data: { approvalPolicy: j.str(pol) } });
    await activity(tx, projectId, actor, "Changed approval policy", { outcome: `major ${pol.major}, minor ${pol.minor}, release ${pol.release}` });
  });
}

export async function markRead(projectId: string, userId: string) {
  const ns = await db.notification.findMany({ where: { projectId } });
  for (const n of ns) {
    const r = j.parse<string[]>(n.readBy, []);
    if (!r.includes(userId)) await db.notification.update({ where: { id: n.id }, data: { readBy: j.str([...r, userId]) } });
  }
}
