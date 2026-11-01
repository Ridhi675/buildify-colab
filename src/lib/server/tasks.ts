// Agent task runner. Tasks run as real concurrent async jobs in the server
// process. Every phase boundary is a safe point: the runner re-reads the task to
// honour pause/stop, and every write is guarded by the agent epoch so work from
// before an agent restart can never be committed.

import { db, j, type Tx } from "../db";
import { checkStale, fingerprint, type Fingerprint } from "../engine/context";
import { applyDesignFeedback, deriveTheme, rebuildSpec } from "../engine/spec";
import * as ai from "../ai/agents";
import type { AppSpec, ImpactResult, SimplifyResult } from "../types";
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
  reqsAtContext,
  SYSTEM,
  type Actor,
} from "./core";
import { changed } from "./realtime";
import { referenceNotes } from "./references";

export const PHASES: Record<string, string[]> = {
  simplify: ["Reading request", "Extracting requirements", "Checking for ambiguity"],
  acceptance: ["Loading approved context", "Drafting acceptance checks", "Listing risks"],
  build_plan: ["Loading approved context", "Mapping components", "Estimating effort"],
  preview: ["Loading approved context", "Composing layout and theme", "Drawing the preview"],
  build: ["Loading approved context", "Planning components", "Generating components", "Assembling artifact"],
  validate: ["Loading builder output", "Running acceptance checks", "Writing recommendation"],
  impact: ["Reading dependency analysis", "Looking for missed consequences"],
};
/** Index of the phase in which the actual AI/rules work happens. */
const WORK_PHASE: Record<string, number> = { simplify: 1, acceptance: 1, build_plan: 1, preview: 1, build: 2, validate: 1, impact: 1 };
export const DELEGABLE = new Set(["acceptance", "build_plan", "validate"]);
/** Task types whose output depends on requirement versions and must pass a stale check. */
const CONTEXT_BOUND = new Set(["acceptance", "build_plan", "preview", "build"]);

const stepMs = () => Number(process.env.BC_AGENT_STEP_MS ?? 2500);
const workTimeout = () => Number(process.env.BC_TASK_TIMEOUT_MS ?? 120_000);
/** A full build is paced slower so humans can change requirements while it is in flight. */
const pacing = (type: string, input: string) => (type === "build" && !j.parse<{ affected?: unknown }>(input, {}).affected ? Number(process.env.BC_BUILD_PACING ?? 5) : 1);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const g = globalThis as unknown as { __bcActive?: Map<string, number> };
const active = (g.__bcActive ??= new Map<string, number>()); // taskId -> epoch currently executing it

export function isActive(taskId: string) {
  return active.has(taskId);
}

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

export async function createTask(
  tx: Tx,
  projectId: string,
  agentKey: "reviewer" | "builder",
  type: string,
  title: string,
  input: Record<string, unknown>,
  createdById: string,
  requirementKeys?: string[],
  parentTaskId?: string,
) {
  const agent = await tx.agent.findUniqueOrThrow({ where: { projectId_key: { projectId, key: agentKey } } });
  const p = await tx.project.findUniqueOrThrow({ where: { id: projectId } });
  const reqs = await loadReqs(tx, projectId);
  const keys = requirementKeys ?? reqs.filter((r) => r.status === "approved").map((r) => r.key);
  return tx.agentTask.create({
    data: {
      projectId,
      agentId: agent.id,
      type,
      title,
      input: j.str(input),
      baseContextVersion: p.contextVersion,
      requirementKeys: j.str(keys),
      depFingerprint: j.str(fingerprint(reqs, keys)),
      epoch: agent.epoch,
      createdById,
      parentTaskId,
    },
  });
}

/** Fire-and-forget start; safe to call repeatedly. */
export function startTask(taskId: string) {
  void runTask(taskId).catch((e) => console.error("[runner]", taskId, e));
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function guarded(taskId: string, epoch: number, data: Parameters<typeof db.agentTask.updateMany>[0]["data"]) {
  const r = await db.agentTask.updateMany({ where: { id: taskId, epoch }, data });
  return r.count === 1;
}

async function appendLog(runId: string, line: string) {
  const run = await db.agentRun.findUnique({ where: { id: runId } });
  if (!run) return;
  const log = j.parse<{ at: string; line: string }[]>(run.log, []);
  log.push({ at: new Date().toISOString(), line });
  await db.agentRun.update({ where: { id: runId }, data: { log: j.str(log) } });
}

export async function runTask(taskId: string) {
  const task0 = await db.agentTask.findUnique({ where: { id: taskId }, include: { agent: true } });
  if (!task0 || task0.status !== "queued") return;
  const epoch = task0.agent.epoch;
  if (task0.epoch !== epoch || active.get(taskId) === epoch) return;
  active.set(taskId, epoch);
  const { projectId } = task0;
  const project = await db.project.findUniqueOrThrow({ where: { id: projectId } });
  const attempt = task0.attempts + 1;

  const claimed = await guarded(taskId, epoch, { status: "running", attempts: attempt, control: null, error: null });
  if (!claimed) {
    active.delete(taskId);
    return;
  }
  await db.agent.update({
    where: { id: task0.agentId },
    data: { status: "working", currentTaskId: taskId, lastActivityAt: new Date(), lastAction: `Started: ${task0.title}`, contextVersion: Math.max(task0.agent.contextVersion, task0.baseContextVersion) },
  });
  const run = await db.agentRun.create({
    data: { taskId, agentId: task0.agentId, attempt, status: "running", contextVersion: task0.baseContextVersion, source: "rules" },
  });
  await appendLog(run.id, `Attempt ${attempt} on context v${task0.baseContextVersion} (agent epoch ${epoch})${task0.phase ? `, resuming after phase ${task0.phase}` : ""}`);
  changed(projectId, "task started");

  const phases = PHASES[task0.type] ?? ["Working"];
  let scratch = j.parse<Record<string, unknown>>(task0.output, {});
  let endState: "completed" | "paused" | "cancelled" | "interrupted" | "failed" = "completed";

  try {
    for (let i = task0.phase; i < phases.length; i++) {
      // ---- safe boundary ----
      const [t, a] = await Promise.all([
        db.agentTask.findUnique({ where: { id: taskId } }),
        db.agent.findUnique({ where: { id: task0.agentId } }),
      ]);
      if (!t || !a || a.epoch !== epoch || t.epoch !== epoch) {
        endState = "interrupted";
        break;
      }
      if (t.control === "stop") {
        endState = "cancelled";
        break;
      }
      if (t.control === "pause") {
        endState = "paused";
        break;
      }
      await guarded(taskId, epoch, { phaseLabel: phases[i] });
      await db.agent.update({ where: { id: a.id }, data: { lastActivityAt: new Date(), lastAction: `${phases[i]} — ${t.title}` } });
      await appendLog(run.id, `Phase ${i + 1}/${phases.length}: ${phases[i]}`);
      changed(projectId, "task phase");

      if (i === WORK_PHASE[task0.type]) {
        const out = await withTimeout(doWork(task0, project.name), workTimeout());
        scratch = { ...scratch, ...out.scratch };
        await db.agentRun.update({
          where: { id: run.id },
          data: { source: out.source, model: out.model, tokensIn: out.tokensIn, tokensOut: out.tokensOut, costUsd: out.costUsd },
        });
        if (out.note) await appendLog(run.id, out.note);
        if (!(await guarded(taskId, epoch, { output: j.str(scratch) }))) {
          endState = "interrupted";
          break;
        }
      }
      if (stepMs() > 0) await sleep(stepMs() * pacing(task0.type, task0.input));
      if (!(await guarded(taskId, epoch, { phase: i + 1 }))) {
        endState = "interrupted";
        break;
      }
    }

    if (endState === "completed") {
      // ---- final boundary: late output from a stopped or restarted run is rejected ----
      const t = await db.agentTask.findUnique({ where: { id: taskId }, include: { agent: true } });
      if (!t || t.agent.epoch !== epoch || t.epoch !== epoch) endState = "interrupted";
      else if (t.control === "stop") endState = "cancelled";
      else await commitTask(t.id, epoch, scratch, run.id);
    }
  } catch (e) {
    endState = "failed";
    const msg = (e as Error).message;
    await guarded(taskId, epoch, { status: "failed", error: msg, phaseLabel: "Failed" });
    await appendLog(run.id, `Failed: ${msg}`);
    await mutate(projectId, "task failed", async (tx) => {
      const actor: Actor = { id: task0.agentId, name: task0.agent.name, kind: "agent" };
      await activity(tx, projectId, actor, "Task failed", { target: task0.title, outcome: msg });
      await notify(tx, projectId, "waiting", `${actor.name} needs help`, `${task0.title} failed: ${msg}. Retry is available.`);
    });
  }

  if (endState === "paused") {
    await guarded(taskId, epoch, { status: "paused", control: null, phaseLabel: "Paused at safe boundary" });
  } else if (endState === "cancelled") {
    await guarded(taskId, epoch, { status: "cancelled", control: null, phaseLabel: "Stopped — output discarded" });
  }
  await db.agentRun.update({ where: { id: run.id }, data: { status: endState, endedAt: new Date() } });
  await appendLog(run.id, `Run ended: ${endState}`);
  if (active.get(taskId) === epoch) active.delete(taskId);

  const agent = await db.agent.findUnique({ where: { id: task0.agentId } });
  if (agent && agent.epoch === epoch && agent.currentTaskId === taskId) {
    const next = await db.agentTask.findFirst({ where: { agentId: agent.id, status: "running", id: { not: taskId } } });
    await db.agent.update({
      where: { id: agent.id },
      data: { status: endState === "paused" ? "paused" : next ? "working" : "idle", currentTaskId: next?.id ?? (endState === "paused" ? taskId : null), lastActivityAt: new Date() },
    });
  }
  changed(projectId, `task ${endState}`);
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timed out after ${Math.round(ms / 1000)}s`)), ms);
    p.then((v) => (clearTimeout(t), resolve(v)), (e) => (clearTimeout(t), reject(e)));
  });
}

type TaskRow = NonNullable<Awaited<ReturnType<typeof db.agentTask.findUnique>>>;

interface WorkOut {
  scratch: Record<string, unknown>;
  source: "llm" | "rules";
  model?: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  note?: string;
}

/** Every piece of preview feedback in the project, oldest first (generation notes + "request changes" comments). */
async function designFeedback(projectId: string, extra?: unknown): Promise<string[]> {
  const previews = await db.preview.findMany({ where: { projectId }, orderBy: { number: "asc" }, select: { feedback: true, createdAt: true } });
  // References and preview feedback apply in the order they happened: the newest wins.
  const all = [...(await referenceNotes(projectId)), ...previews.flatMap((p) => j.parse<string[]>(p.feedback, []).map((text) => ({ at: p.createdAt, text })))]
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .map((n) => n.text);
  return typeof extra === "string" && extra.trim() ? [...all, extra.trim()] : all;
}

async function doWork(task: TaskRow, appName: string): Promise<WorkOut> {
  const input = j.parse<Record<string, unknown>>(task.input, {});
  // Agents work from the context version they were started with — not the live state.
  const reqs = await reqsAtContext(db, task.projectId, task.baseContextVersion);
  const pack = <T,>(o: ai.AiOutput<T>, scratch: Record<string, unknown>) => ({ scratch, source: o.source, model: o.model, tokensIn: o.tokensIn, tokensOut: o.tokensOut, costUsd: o.costUsd, note: o.note });

  switch (task.type) {
    case "simplify": {
      const comps = await db.component.findMany({ where: { projectId: task.projectId } });
      const o = await ai.simplifyRequest(String(input.request ?? ""), comps.map((c) => c.key));
      return pack(o, { result: o.data, source: o.source });
    }
    case "acceptance": {
      const o = await ai.acceptancePlan(reqs);
      return pack(o, { result: o.data, source: o.source });
    }
    case "build_plan": {
      const comps = await db.component.findMany({ where: { projectId: task.projectId } });
      const o = await ai.buildPlan(reqs, comps.map(({ key, name, category }) => ({ key, name, category })));
      return pack(o, { result: o.data, source: o.source });
    }
    case "preview": {
      const spec = await ai.generateSpec(reqs, appName, undefined, await designFeedback(task.projectId, input.feedback));
      return pack(spec, { result: { spec: spec.data }, source: spec.source });
    }
    case "build": {
      const affected = Array.isArray(input.affected) ? new Set(input.affected as string[]) : undefined;
      const base = input.baseArtifactVersionId
        ? await db.artifactVersion.findUnique({ where: { id: String(input.baseArtifactVersionId) } })
        : null;
      const o = await ai.generateSpec(reqs, appName, affected, await designFeedback(task.projectId));
      let spec = o.data;
      let changedKeys: string[] = [];
      if (base) {
        const prev = j.parse<AppSpec>(base.spec, spec);
        const r = rebuildSpec(prev, spec, affected ?? new Set(spec.pages.flatMap((p) => p.components.map((c) => c.key))));
        spec = r.spec;
        changedKeys = r.changed;
      }
      return pack(o, { result: { spec, changed: changedKeys, partial: !!affected }, source: o.source });
    }
    case "validate": {
      const bt = await db.agentTask.findUnique({ where: { id: String(input.builderTaskId) } });
      const spec = j.parse<{ result?: { spec: AppSpec } }>(bt?.output, {}).result?.spec;
      if (!spec) throw new Error("Builder output not found");
      const current = await loadReqs(db, task.projectId); // validate against the CURRENT context
      const { applied } = applyDesignFeedback(deriveTheme(current), await designFeedback(task.projectId));
      const v = ai.validateSpec(spec, current, applied);
      return { scratch: { result: v, source: "rules" }, source: "rules" as const, tokensIn: 0, tokensOut: 0, costUsd: 0 };
    }
    case "impact": {
      const ia = await db.impactAnalysis.findUnique({ where: { id: String(input.impactId) } });
      if (!ia) throw new Error("Impact analysis not found");
      const o = await ai.impactSupplement(j.parse<ImpactResult>(ia.result, {} as ImpactResult), ia.previousText, ia.proposedText);
      return pack(o, { result: o.data, source: o.source });
    }
  }
  throw new Error(`Unknown task type ${task.type}`);
}

// ---------------------------------------------------------------------------
// Commit (with stale detection)
// ---------------------------------------------------------------------------

async function commitTask(taskId: string, epoch: number, scratch: Record<string, unknown>, runId: string) {
  const task = await db.agentTask.findUniqueOrThrow({ where: { id: taskId }, include: { agent: true } });
  const { projectId } = task;
  const toStart: string[] = [];

  await mutate(projectId, "task committed", async (tx) => {
    const actor: Actor = { id: task.agentId, name: task.agent.name, kind: "agent" };
    const current = await loadReqs(tx, projectId);

    if (CONTEXT_BOUND.has(task.type)) {
      const check = checkStale(j.parse<Fingerprint>(task.depFingerprint, {}), current);
      if (check.stale) {
        await tx.agentTask.updateMany({ where: { id: taskId, epoch }, data: { status: "quarantined", staleReason: check.reason, phaseLabel: "Quarantined — stale context" } });
        await activity(tx, projectId, actor, "Output quarantined (stale context)", { target: task.title, outcome: check.reason ?? undefined });
        await notify(tx, projectId, "conflict", `${task.agent.name} output is based on outdated requirements`, check.reason ?? "");
        await appendLogTx(tx, runId, `Stale check FAILED: ${check.reason}`);
        await tx.agent.update({ where: { id: task.agentId }, data: { lastActivityAt: new Date(), lastAction: `Output quarantined: ${task.title}` } });
        if (task.type === "build") await proposeRebuild(tx, projectId, `${task.agent.name}'s build used context v${task.baseContextVersion}; requirements changed since.`);
        return;
      }
      await appendLogTx(tx, runId, `Stale check passed against context v${(await tx.project.findUniqueOrThrow({ where: { id: projectId } })).contextVersion}`);
    }

    await tx.agentTask.updateMany({ where: { id: taskId, epoch }, data: { status: "completed", phaseLabel: "Completed" } });
    const result = scratch.result as unknown;

    switch (task.type) {
      case "simplify": {
        const r = result as SimplifyResult;
        const input = j.parse<{ request?: string }>(task.input, {});
        for (const q of r.requirements) {
          await tx.requirement.create({
            data: {
              projectId,
              key: await nextReqKey(tx, projectId),
              title: q.title,
              description: q.description,
              category: q.category,
              priority: q.priority,
              acceptanceCriteria: j.str(q.acceptanceCriteria),
              components: j.str(q.components),
              originalRequest: input.request,
              authorId: task.agentId,
              source: "reviewer",
              status: "proposed",
            },
          });
        }
        await tx.chatMessage.create({
          data: {
            projectId,
            authorId: task.agentId,
            role: "reviewer",
            body:
              `I turned the request into ${r.requirements.length} structured requirements. Please review, edit or reject each one.` +
              (r.ambiguities.length ? `\n\nOpen questions:\n• ${r.ambiguities.join("\n• ")}` : ""),
            meta: j.str({ source: scratch.source }),
          },
        });
        await activity(tx, projectId, actor, "Simplified request into requirements", { outcome: `${r.requirements.length} proposed` });
        await notify(tx, projectId, "important", "Requirements ready for review", `${r.requirements.length} proposed requirements need a human decision.`);
        break;
      }
      case "acceptance":
      case "build_plan": {
        await activity(tx, projectId, actor, task.type === "acceptance" ? "Wrote acceptance test plan" : "Wrote implementation plan", { target: task.title });
        await notify(tx, projectId, "completed", "Agents completed {n} task(s)", `${task.agent.name}: ${task.title}`, "agent-completed");
        break;
      }
      case "preview": {
        const { spec } = result as { spec: AppSpec };
        const fb = String(j.parse<{ feedback?: string }>(task.input, {}).feedback ?? "").trim();
        const n = (await tx.preview.count({ where: { projectId } })) + 1;
        const p = await tx.project.findUniqueOrThrow({ where: { id: projectId } });
        const preview = await tx.preview.create({
          data: { projectId, number: n, spec: j.str(spec), textual: "{}", contextVersion: task.baseContextVersion, source: String(scratch.source ?? "rules"), feedback: j.str(fb ? [fb] : []) },
        });
        const pol = await policy(tx, projectId);
        await tx.approvalRequest.create({
          data: {
            projectId,
            kind: "preview",
            title: `Approve preview #${n}`,
            summary: `Preview generated from the approved requirements. The Builder cannot start full generation until this is approved.`,
            payload: j.str({ previewId: preview.id }),
            requiredApprovals: pol.major,
            contextVersion: p.contextVersion,
            recommendation: j.str({ verdict: "approve", rationale: "Preview covers every approved requirement." }),
            createdById: task.agentId,
          },
        });
        await tx.project.update({ where: { id: projectId }, data: { phase: "preview" } });
        await createCheckpoint(tx, projectId, "preview_generated", `Preview #${n} generated`, task.agentId);
        await activity(tx, projectId, actor, `Generated preview #${n}`, { outcome: "awaiting approval" });
        await notify(tx, projectId, "important", "Preview needs approval", `Preview #${n} is ready. ${pol.major} human approval(s) required.`);
        break;
      }
      case "build": {
        const v = await createTask(tx, projectId, "reviewer", "validate", `Validate build: ${task.title}`, { builderTaskId: task.id }, task.agentId, undefined, task.id);
        toStart.push(v.id);
        await activity(tx, projectId, actor, "Submitted build output for validation", { target: task.title });
        await notify(tx, projectId, "completed", "Agents completed {n} task(s)", `${task.agent.name}: ${task.title}`, "agent-completed");
        break;
      }
      case "validate": {
        const v = result as ai.Validation;
        const input = j.parse<{ builderTaskId: string }>(task.input, { builderTaskId: "" });
        const bt = await tx.agentTask.findUniqueOrThrow({ where: { id: input.builderTaskId } });
        const out = j.parse<{ result: { spec: AppSpec; changed: string[]; partial: boolean } }>(bt.output, { result: { spec: {} as AppSpec, changed: [], partial: false } });
        await tx.agentTask.update({ where: { id: bt.id }, data: { validation: j.str(v) } });
        const pol = await policy(tx, projectId);
        const p = await tx.project.findUniqueOrThrow({ where: { id: projectId } });
        await tx.approvalRequest.create({
          data: {
            projectId,
            kind: "build_output",
            title: out.result.partial ? `Accept rebuild (${out.result.changed.length} component changes)` : "Accept built artifact",
            summary: `${v.summary} Built on context v${bt.baseContextVersion}.`,
            payload: j.str({ builderTaskId: bt.id }),
            requiredApprovals: out.result.partial ? pol.minor : pol.major,
            contextVersion: p.contextVersion,
            recommendation: j.str({ verdict: v.passed ? "approve" : "revise", rationale: v.summary }),
            createdById: task.agentId,
          },
        });
        await createCheckpoint(tx, projectId, "validation_completed", "Reviewer validated build output", task.agentId);
        await activity(tx, projectId, actor, "Validated builder output", { outcome: v.passed ? "passed" : "issues found" });
        await notify(tx, projectId, "important", "Build output needs approval", v.summary);
        break;
      }
      case "impact": {
        const input = j.parse<{ impactId: string }>(task.input, { impactId: "" });
        const ia = await tx.impactAnalysis.findUnique({ where: { id: input.impactId } });
        if (ia) {
          const r = j.parse<ImpactResult>(ia.result, {} as ImpactResult);
          r.inferred = (result as { notes: { area: string; note: string }[] }).notes;
          await tx.impactAnalysis.update({ where: { id: ia.id }, data: { result: j.str(r) } });
        }
        await activity(tx, projectId, actor, "Added inferred consequences to impact analysis");
        break;
      }
    }
    await tx.agent.update({ where: { id: task.agentId }, data: { lastActivityAt: new Date(), lastAction: `Completed: ${task.title}` } });
  });
  for (const id of toStart) startTask(id);
}

async function appendLogTx(tx: Tx, runId: string, line: string) {
  const run = await tx.agentRun.findUnique({ where: { id: runId } });
  if (!run) return;
  const log = j.parse<{ at: string; line: string }[]>(run.log, []);
  log.push({ at: new Date().toISOString(), line });
  await tx.agentRun.update({ where: { id: runId }, data: { log: j.str(log) } });
}

/**
 * Reviewer prepares an updated Builder task after requirements changed. Builder
 * never starts it on its own: a human approval is required.
 */
export async function proposeRebuild(tx: Tx, projectId: string, why: string) {
  const existing = await tx.approvalRequest.findFirst({ where: { projectId, kind: "rebuild", status: "pending" } });
  const p = await tx.project.findUniqueOrThrow({ where: { id: projectId } });
  const current = p.currentArtifactVerId ? await tx.artifactVersion.findUnique({ where: { id: p.currentArtifactVerId } }) : null;
  const impacts = await tx.impactAnalysis.findMany({
    where: { projectId, status: "approved", baseContextVersion: { gte: current?.contextVersion ?? 0 } },
  });
  const affected = [...new Set(impacts.flatMap((i) => j.parse<ImpactResult>(i.result, {} as ImpactResult).affectedComponents?.map((c) => c.key) ?? []))];
  const payload = { affected, baseArtifactVersionId: current?.id ?? null, contextVersion: p.contextVersion };
  const reviewer = await agentActor(tx, projectId, "reviewer");
  const summary = `${why} Reviewer proposes rebuilding ${affected.length ? affected.length + " affected component(s)" : "the artifact"} on context v${p.contextVersion}; unaffected components stay unchanged.`;
  if (existing) {
    await tx.approvalRequest.update({ where: { id: existing.id }, data: { payload: j.str(payload), summary, contextVersion: p.contextVersion } });
    return existing;
  }
  const pol = await policy(tx, projectId);
  const ar = await tx.approvalRequest.create({
    data: {
      projectId,
      kind: "rebuild",
      title: `Rebuild on context v${p.contextVersion}`,
      summary,
      payload: j.str(payload),
      requiredApprovals: pol.minor,
      contextVersion: p.contextVersion,
      recommendation: j.str({ verdict: "approve", rationale: "Keeps the artifact consistent with the latest approved requirements." }),
      createdById: reviewer.id,
    },
  });
  await activity(tx, projectId, reviewer, "Prepared updated Builder task", { outcome: "awaiting human approval" });
  await notify(tx, projectId, "important", "Rebuild proposal needs approval", summary);
  return ar;
}

// ---------------------------------------------------------------------------
// Controls (Agents view)
// ---------------------------------------------------------------------------

export async function controlTask(projectId: string, actor: Actor, taskId: string, op: "pause" | "resume" | "stop" | "retry") {
  const toStart: string[] = [];
  const res = await mutate(projectId, `task ${op}`, async (tx) => {
    const t = await tx.agentTask.findFirstOrThrow({ where: { id: taskId, projectId }, include: { agent: true } });
    let outcome = "";
    if (op === "pause") {
      if (t.status === "running") (await tx.agentTask.update({ where: { id: t.id }, data: { control: "pause" } }), (outcome = "will pause at next safe boundary"));
      else if (t.status === "queued") (await tx.agentTask.update({ where: { id: t.id }, data: { status: "paused" } }), (outcome = "paused"));
      else throw new Error(`Cannot pause a ${t.status} task`);
    } else if (op === "resume") {
      if (t.status !== "paused") throw new Error(`Cannot resume a ${t.status} task`);
      await tx.agentTask.update({ where: { id: t.id }, data: { status: "queued", control: null, epoch: t.agent.epoch } });
      toStart.push(t.id);
      outcome = `resuming after phase ${t.phase} from persisted context`;
    } else if (op === "stop") {
      if (t.status === "running") (await tx.agentTask.update({ where: { id: t.id }, data: { control: "stop" } }), (outcome = "stopping; any late output will be discarded"));
      else if (["queued", "paused"].includes(t.status)) (await tx.agentTask.update({ where: { id: t.id }, data: { status: "cancelled", phaseLabel: "Stopped — output discarded" } }), (outcome = "cancelled"));
      else throw new Error(`Cannot stop a ${t.status} task`);
    } else if (op === "retry") {
      if (!["failed", "cancelled", "quarantined"].includes(t.status)) throw new Error(`Cannot retry a ${t.status} task`);
      if (t.attempts >= t.maxAttempts) throw new Error(`Retry limit reached (${t.maxAttempts} attempts)`);
      // Retry refreshes context so a quarantined task is re-run against the latest requirements.
      const reqs = await loadReqs(tx, projectId);
      const keys = j.parse<string[]>(t.requirementKeys, []);
      const p = await tx.project.findUniqueOrThrow({ where: { id: projectId } });
      await tx.agentTask.update({
        where: { id: t.id },
        data: { status: "queued", control: null, phase: 0, phaseLabel: "Queued (retry)", output: null, error: null, staleReason: null, epoch: t.agent.epoch, baseContextVersion: p.contextVersion, depFingerprint: j.str(fingerprint(reqs, keys)) },
      });
      toStart.push(t.id);
      outcome = `retry ${t.attempts + 1}/${t.maxAttempts} on context v${p.contextVersion}`;
    }
    await activity(tx, projectId, actor, `${op[0].toUpperCase()}${op.slice(1)} task`, { target: t.title, outcome });
    return { outcome };
  });
  for (const id of toStart) startTask(id);
  return res;
}

export async function redirectTask(projectId: string, actor: Actor, taskId: string, instructions: string) {
  let newId = "";
  await mutate(projectId, "task redirect", async (tx) => {
    const t = await tx.agentTask.findFirstOrThrow({ where: { id: taskId, projectId }, include: { agent: true } });
    if (t.status === "running") await tx.agentTask.update({ where: { id: t.id }, data: { control: "stop" } });
    else if (["queued", "paused"].includes(t.status)) await tx.agentTask.update({ where: { id: t.id }, data: { status: "superseded", phaseLabel: "Redirected" } });
    const input = { ...j.parse<Record<string, unknown>>(t.input, {}), instructions };
    const n = await createTask(tx, projectId, t.agent.key as "reviewer" | "builder", t.type, `${t.title} (redirected)`, input, actor.id, undefined, t.id);
    newId = n.id;
    await activity(tx, projectId, actor, "Redirected task", { target: t.title, outcome: `new instructions: ${instructions}` });
  });
  startTask(newId);
  return { taskId: newId };
}

export async function delegateTask(projectId: string, actor: Actor, taskId: string) {
  return mutate(projectId, "task delegate", async (tx) => {
    const t = await tx.agentTask.findFirstOrThrow({ where: { id: taskId, projectId }, include: { agent: true } });
    if (!DELEGABLE.has(t.type)) throw new Error(`${t.type} tasks can only be done by the ${t.agent.name}`);
    if (!["queued", "paused", "failed"].includes(t.status)) throw new Error(`Cannot delegate a ${t.status} task`);
    const other = await tx.agent.findFirstOrThrow({ where: { projectId, id: { not: t.agentId } } });
    await tx.agentTask.update({ where: { id: t.id }, data: { agentId: other.id, epoch: other.epoch, status: t.status === "failed" ? "queued" : t.status } });
    await activity(tx, projectId, actor, "Delegated task", { target: t.title, outcome: `${t.agent.name} → ${other.name}` });
    return { to: other.name, taskId: t.id, start: t.status !== "paused" };
  }).then((r) => {
    if (r.start) startTask(r.taskId);
    return r;
  });
}

/**
 * Restart an agent: discard its in-memory work (epoch bump), then rebuild its
 * working context purely from persisted project state. Interrupted tasks resume
 * from their last safe boundary — or restart on fresh context if they are stale.
 * Hidden model reasoning is not (and cannot be) restored.
 */
export async function restartAgent(projectId: string, actor: Actor, agentKey: "reviewer" | "builder") {
  const toStart: string[] = [];
  const report = await mutate(projectId, "agent restart", async (tx) => {
    const a = await tx.agent.findUniqueOrThrow({ where: { projectId_key: { projectId, key: agentKey } } });
    const epoch = a.epoch + 1;
    await tx.agent.update({ where: { id: a.id }, data: { epoch, status: "restarting", currentTaskId: null, contextVersion: 0, lastAction: "Restarting — in-memory state discarded" } });
    await tx.agentRun.updateMany({ where: { agentId: a.id, status: "running" }, data: { status: "interrupted", endedAt: new Date() } });

    // --- recovery from persistent state ---
    const p = await tx.project.findUniqueOrThrow({ where: { id: projectId } });
    const reqs = await loadReqs(tx, projectId);
    const approved = reqs.filter((r) => r.status === "approved");
    const open = await tx.agentTask.findMany({ where: { agentId: a.id, status: { in: ["running", "queued", "paused"] } } });
    const resumed: string[] = [];
    const refreshed: string[] = [];
    for (const t of open) {
      const check = checkStale(j.parse<Fingerprint>(t.depFingerprint, {}), reqs);
      if (check.stale && CONTEXT_BOUND.has(t.type)) {
        const keys = j.parse<string[]>(t.requirementKeys, []);
        await tx.agentTask.update({ where: { id: t.id }, data: { status: "queued", control: null, epoch, phase: 0, output: null, phaseLabel: "Recovered — restarting on latest context", baseContextVersion: p.contextVersion, depFingerprint: j.str(fingerprint(reqs, keys)) } });
        refreshed.push(t.title);
      } else {
        await tx.agentTask.update({ where: { id: t.id }, data: { status: "queued", control: null, epoch, phaseLabel: `Recovered — resuming after phase ${t.phase}` } });
        resumed.push(t.title);
      }
      toStart.push(t.id);
    }
    const quarantined = await tx.agentTask.count({ where: { agentId: a.id, status: "quarantined" } });
    const pending = await tx.approvalRequest.findMany({ where: { projectId, status: "pending" }, select: { title: true } });
    const latestDecision = await tx.decision.findFirst({ where: { projectId }, orderBy: { createdAt: "desc" } });

    const recovery = {
      contextVersion: p.contextVersion,
      requirements: approved.map((r) => `${r.key} v${r.version}: ${r.title}`),
      resumed,
      refreshed,
      quarantined,
      pendingApprovals: pending.map((x) => x.title),
      latestDecision: latestDecision?.title ?? null,
      currentArtifactVersionId: p.currentArtifactVerId,
    };
    await tx.agent.update({ where: { id: a.id }, data: { status: "idle", contextVersion: p.contextVersion, lastActivityAt: new Date(), lastAction: `Recovered context v${p.contextVersion}` } });
    await tx.chatMessage.create({
      data: {
        projectId,
        authorId: a.id,
        role: agentKey,
        body:
          `Restarted and recovered context v${p.contextVersion} from the project store: ${approved.length} approved requirements` +
          (latestDecision ? `, latest decision “${latestDecision.title}”` : "") +
          `. ${resumed.length} task(s) resume from their last safe step, ${refreshed.length} restart on the latest requirements, ${quarantined} quarantined output(s) are kept out of the product.`,
        meta: j.str({ recovery }),
      },
    });
    await activity(tx, projectId, actor, `Restarted ${a.name}`, { outcome: `recovered context v${p.contextVersion}`, simulated: true });
    await notify(tx, projectId, "context", `${a.name} recovered context v${p.contextVersion}`, `${approved.length} requirements, ${pending.length} pending approvals.`);
    return recovery;
  });
  for (const id of toStart) startTask(id);
  return report;
}

/** After a server restart no runner owns "running" tasks; mark them recoverable. */
export async function reconcileOrphans(projectId: string) {
  const running = await db.agentTask.findMany({ where: { projectId, status: "running" } });
  const orphans = running.filter((t) => !active.has(t.id) && Date.now() - t.updatedAt.getTime() > 15_000);
  if (!orphans.length) return;
  for (const t of orphans) {
    await db.agentTask.update({ where: { id: t.id }, data: { status: "paused", control: null, phaseLabel: `Interrupted (server restart) — resume after phase ${t.phase}` } });
    await db.agentRun.updateMany({ where: { taskId: t.id, status: "running" }, data: { status: "interrupted", endedAt: new Date() } });
  }
  await db.agent.updateMany({ where: { projectId, status: "working" }, data: { status: "idle", currentTaskId: null } });
  await db.activityEvent.create({ data: { projectId, actorId: SYSTEM.id, actorName: SYSTEM.name, actorKind: "system", action: "Detected interrupted tasks after server restart", outcome: `${orphans.length} task(s) paused for resume`, contextVersion: 0 } });
}

export { commitContext };
