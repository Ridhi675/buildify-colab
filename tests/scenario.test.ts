// End-to-end demo scenario against a real (test) database, using the real
// task runner and workflows. No LLM key: agents use the deterministic engine.

import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { DEMO_ID, resetDemo } from "@/lib/server/seed";
import * as wf from "@/lib/server/workflow";
import { controlTask, createTask, restartAgent, startTask } from "@/lib/server/tasks";
import { getState } from "@/lib/server/state";
import { dispatch } from "@/lib/server/actions";
import type { Actor } from "@/lib/server/core";

const aisha: Actor = { id: "u_aisha", name: "Aisha Rao", kind: "human" };
const daniel: Actor = { id: "u_daniel", name: "Daniel Okafor", kind: "human" };
const P = DEMO_ID;

async function settle(timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const busy = await db.agentTask.count({ where: { projectId: P, status: { in: ["queued", "running"] } } });
    if (!busy) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("tasks did not settle");
}
const pending = (kind: string) => db.approvalRequest.findFirstOrThrow({ where: { projectId: P, kind, status: "pending" }, orderBy: { createdAt: "desc" } });

describe("CareConnect demo scenario", () => {
  beforeAll(async () => {
    await resetDemo();
  });

  it("1-2. two humans share a project; Reviewer simplifies the request", async () => {
    const members = await db.projectMember.findMany({ where: { projectId: P } });
    expect(members.filter((m) => m.role !== "observer")).toHaveLength(2);
    await wf.submitRequest(P, aisha, "Build a healthcare appointment-booking app where patients pick a doctor and a time and get reminders. Desktop-first web app with a dark theme.");
    await settle();
    const proposed = await db.requirement.findMany({ where: { projectId: P, status: "proposed" } });
    expect(proposed.length).toBeGreaterThanOrEqual(4);
    expect(proposed.every((r) => r.originalRequest)).toBe(true);
  });

  it("rejects stale concurrent edits of a proposed requirement", async () => {
    const r = await db.requirement.findFirstOrThrow({ where: { projectId: P, status: "proposed" } });
    await wf.editProposed(P, aisha, r.key, r.version, { title: r.title, description: r.description + " (edited)", priority: r.priority });
    await expect(wf.editProposed(P, daniel, r.key, r.version, { title: "Other", description: "x", priority: "low" })).rejects.toThrow(/changed while you were editing/);
  });

  it("3-5. requirements approved, preview generated, two-human approval gate", async () => {
    const keys = (await db.requirement.findMany({ where: { projectId: P, status: "proposed" } })).map((r) => r.key);
    const { contextVersion } = await wf.decideProposed(P, daniel, keys, "approve");
    expect(contextVersion).toBe(1);
    await wf.requestPreview(P, aisha);
    await settle();
    const ar = await pending("preview");
    expect(ar.requiredApprovals).toBe(2);
    expect(await db.agentTask.count({ where: { projectId: P, type: "build" } })).toBe(0); // gate holds

    await expect(wf.vote(P, { id: "u_guest", name: "Sam", kind: "human", role: "observer" }, ar.id, "approve")).rejects.toThrow(/Observers/);
    expect((await wf.vote(P, { ...aisha, role: "founder" }, ar.id, "approve")).status).toBe("pending");
    // Approval with the second human starts Reviewer + Builder in parallel.
    process.env.BC_AGENT_STEP_MS = "40";
    expect((await wf.vote(P, { ...daniel, role: "designer" }, ar.id, "approve")).status).toBe("approved");
    // Poll until both agents are running at once (task claims take a few DB writes; slow disks need more than a fixed sleep).
    let running: { agent: { key: string } }[] = [];
    for (const end = Date.now() + 3000; Date.now() < end; await new Promise((r) => setTimeout(r, 10))) {
      running = await db.agentTask.findMany({ where: { projectId: P, status: "running" }, include: { agent: true } });
      if (running.length >= 2) break;
    }
    expect(new Set(running.map((t) => t.agent.key))).toEqual(new Set(["reviewer", "builder"]));
    expect(await db.artifactVersion.count({ where: { projectId: P } })).toBe(1);
  });

  it("6-9. mid-flight requirement change ripples and quarantines the outdated build", async () => {
    const audience = await db.requirement.findFirstOrThrow({ where: { projectId: P, category: "audience" } });
    const { impactId, conflict } = await wf.proposeChange(P, daniel, {
      key: audience.key,
      title: "Elderly patients on mobile phones",
      description: "Elderly patients (65+) using phones: mobile-first, large text, high contrast",
      baseVersion: audience.version,
      reason: "Our pilot clinic serves mostly seniors",
    });
    expect(conflict).toBe(false);
    const ia = await db.impactAnalysis.findUniqueOrThrow({ where: { id: impactId } });
    const result = JSON.parse(ia.result);
    expect(result.staleTasks.length).toBeGreaterThan(0);
    expect(result.categories.backend).toEqual([]);

    const ar = await pending("change");
    await wf.vote(P, { ...aisha, role: "founder" }, ar.id, "approve");
    await wf.vote(P, { ...daniel, role: "designer" }, ar.id, "approve");
    await settle();
    process.env.BC_AGENT_STEP_MS = "0";

    const build = await db.agentTask.findFirstOrThrow({ where: { projectId: P, type: "build" }, orderBy: { createdAt: "asc" } });
    expect(build.status).toBe("quarantined");
    expect(build.staleReason).toMatch(/outdated requirements/);
    expect(await db.artifactVersion.count({ where: { projectId: P } })).toBe(1); // never silently committed
    expect(await db.notification.count({ where: { projectId: P, category: "conflict" } })).toBeGreaterThan(0);
    await pending("rebuild"); // Reviewer prepared an updated task
  });

  it("detects conflicting change proposals on an old version", async () => {
    const audience = await db.requirement.findFirstOrThrow({ where: { projectId: P, category: "audience" } });
    const r = await wf.proposeChange(P, aisha, { key: audience.key, title: "x", description: "y", baseVersion: audience.version - 1, reason: "late edit" });
    expect(r.conflict).toBe(true);
    await wf.discardChange(P, aisha, r.impactId);
  });

  it("10. restarted Builder recovers context from persistent state", async () => {
    const before = await db.agent.findUniqueOrThrow({ where: { projectId_key: { projectId: P, key: "builder" } } });
    const report = await restartAgent(P, aisha, "builder");
    const after = await db.agent.findUniqueOrThrow({ where: { projectId_key: { projectId: P, key: "builder" } } });
    const project = await db.project.findUniqueOrThrow({ where: { id: P } });
    expect(after.epoch).toBe(before.epoch + 1);
    expect(report.contextVersion).toBe(project.contextVersion);
    expect(report.quarantined).toBe(1);
    expect(report.requirements.some((r) => r.includes("Elderly"))).toBe(true);
  });

  it("11-14. approved rebuild → validation → human approval → new version", async () => {
    await wf.vote(P, { ...aisha, role: "founder" }, (await pending("rebuild")).id, "approve");
    await settle();
    const out = await pending("build_output");
    const rec = JSON.parse(out.recommendation!);
    expect(rec.verdict).toBe("approve");
    await wf.vote(P, { ...daniel, role: "designer" }, out.id, "approve");
    const versions = await db.artifactVersion.findMany({ where: { projectId: P }, orderBy: { number: "asc" } });
    expect(versions).toHaveLength(2);
    const spec = JSON.parse(versions[1].spec);
    expect(spec.theme.fontScale).toBe(1.5);
    expect(spec.theme.layout).toBe("mobile-first");
    expect(JSON.parse(versions[1].changedComponents).length).toBeGreaterThan(0);
  });

  it("15. compares old and new versions", async () => {
    const [v1, v2] = await db.artifactVersion.findMany({ where: { projectId: P }, orderBy: { number: "asc" } });
    const d = await wf.compareVersions(P, v1.id, v2.id);
    expect(d.spec.some((x) => x.detail.includes("Text size"))).toBe(true);
    expect(d.requirements.some((x) => x.kind === "modified")).toBe(true);
    expect(d.decisions.length).toBeGreaterThan(0);
  });

  it("16. safe restore creates a new version and keeps history", async () => {
    const cp = await db.checkpoint.findFirstOrThrow({ where: { projectId: P, milestone: "preview_approved" } });
    const before = await db.requirement.findFirstOrThrow({ where: { projectId: P, category: "audience" } });
    const preview = await wf.restorePreview(P, { checkpointId: cp.id });
    expect(preview.requirements.length).toBeGreaterThan(0);
    const r = await wf.restore(P, aisha, { checkpointId: cp.id, reason: "Compare with original direction" });
    expect(r.artifactVersion).toBe(3);
    const versions = await db.artifactVersion.findMany({ where: { projectId: P } });
    expect(versions).toHaveLength(3);
    const audience = await db.requirement.findFirstOrThrow({ where: { projectId: P, category: "audience" } });
    expect(audience.title).not.toMatch(/Elderly/);
    expect(audience.version).toBe(before.version + 1); // restore is a new revision, not a rewind
    expect(await db.decision.count({ where: { projectId: P, kind: "restore" } })).toBe(1);
  });

  it("agent controls: pause at a safe boundary, resume, stop discards output", async () => {
    process.env.BC_AGENT_STEP_MS = "60";
    const t = await db.$transaction((tx) => createTask(tx, P, "builder", "build_plan", "Plan", {}, aisha.id));
    startTask(t.id);
    await new Promise((r) => setTimeout(r, 20));
    await controlTask(P, aisha, t.id, "pause");
    await new Promise((r) => setTimeout(r, 200));
    expect((await db.agentTask.findUniqueOrThrow({ where: { id: t.id } })).status).toBe("paused");
    await controlTask(P, aisha, t.id, "resume");
    await settle();
    expect((await db.agentTask.findUniqueOrThrow({ where: { id: t.id } })).status).toBe("completed");

    const s = await db.$transaction((tx) => createTask(tx, P, "reviewer", "acceptance", "Accept", {}, aisha.id));
    startTask(s.id);
    await new Promise((r) => setTimeout(r, 20));
    await controlTask(P, aisha, s.id, "stop");
    await settle();
    expect((await db.agentTask.findUniqueOrThrow({ where: { id: s.id } })).status).toBe("cancelled");
    process.env.BC_AGENT_STEP_MS = "0";
  });

  it("observers cannot mutate; state snapshot is complete", async () => {
    await expect(dispatch(P, { id: "u_guest", name: "Sam", color: "#000" }, "observer", { type: "request_preview" })).rejects.toThrow(/Observers/);
    const s = await getState(P);
    expect(s.versions).toHaveLength(3);
    expect(s.decisions.length).toBeGreaterThan(4);
    expect(s.checkpoints.map((c) => c.milestone)).toEqual(expect.arrayContaining(["requirements_approved", "preview_generated", "preview_approved", "build_started", "build_completed", "validation_completed"]));
    // Both in-flight contributions (Builder build + Reviewer acceptance plan) were on stale context.
    expect(s.metrics.quarantined).toBe(2);
  });
});

describe("preview feedback changes the theme end to end", () => {
  beforeAll(async () => {
    await resetDemo();
  });

  it("regenerating with 'dark to light' gives a light preview, build and passing validation", async () => {
    await wf.submitRequest(P, aisha, "Build a healthcare appointment booking app with a dark theme, desktop-first.");
    await settle();
    const keys = (await db.requirement.findMany({ where: { projectId: P, status: "proposed" } })).map((r) => r.key);
    await wf.decideProposed(P, daniel, keys, "approve");
    await wf.requestPreview(P, aisha);
    await settle();
    const first = await db.preview.findFirstOrThrow({ where: { projectId: P }, orderBy: { number: "desc" } });
    expect(JSON.parse(first.spec).theme.mode).toBe("dark");

    await wf.requestPreview(P, aisha, "change theme from dark to light");
    await settle();
    const second = await db.preview.findFirstOrThrow({ where: { projectId: P }, orderBy: { number: "desc" } });
    expect(second.number).toBe(first.number + 1);
    expect(JSON.parse(second.spec).theme.mode).toBe("light");
    expect(JSON.parse(second.feedback)).toEqual(["change theme from dark to light"]);

    const ar = await db.approvalRequest.findFirstOrThrow({ where: { projectId: P, kind: "preview", status: "pending", payload: { contains: second.id } } });
    await wf.vote(P, { ...aisha, role: "founder" }, ar.id, "approve");
    await wf.vote(P, { ...daniel, role: "designer" }, ar.id, "approve");
    await settle();
    const build = await db.agentTask.findFirstOrThrow({ where: { projectId: P, type: "build" }, orderBy: { createdAt: "desc" } });
    expect(JSON.parse(build.output!).result.spec.theme.mode).toBe("light");
    const validate = await db.agentTask.findFirstOrThrow({ where: { projectId: P, type: "validate" }, orderBy: { createdAt: "desc" } });
    expect(JSON.parse(validate.output!).result.passed).toBe(true);
  });
});
