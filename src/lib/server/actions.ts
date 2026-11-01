// Single validated entry point for every project mutation (zod-checked).

import { z } from "zod";
import { CATEGORIES, PRIORITIES } from "../types";
import { TEMPLATE_KEYS } from "../engine/templates";
import type { Actor } from "./core";
import { acquireLock, clearDraft, DRAFT_FIELDS, publish, releaseLock, setDraft, touchPresence } from "./realtime";
import { controlTask, delegateTask, redirectTask, restartAgent } from "./tasks";
import * as wf from "./workflow";
import { resetDemo, DEMO_ID } from "./seed";
import { HttpError } from "./auth";
import { db } from "../db";
import { createInvite, revokeInvite, ROLES } from "./accounts";
import { addReference, ReferenceInput, removeReference } from "./references";

const id = z.string().min(1).max(64);
const text = (max = 2000) => z.string().trim().min(1).max(max);

export const ActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("submit_request"), request: text(4000) }),
  z.object({ type: z.literal("decide_requirements"), keys: z.array(id).min(1), decision: z.enum(["approve", "reject"]) }),
  z.object({ type: z.literal("edit_proposed"), key: id, expectedVersion: z.number().int(), title: text(160), description: text(), priority: z.enum(PRIORITIES) }),
  z.object({ type: z.literal("add_requirement"), title: text(160), description: text(), category: z.enum(CATEGORIES), priority: z.enum(PRIORITIES) }),
  z.object({ type: z.literal("propose_change"), key: id, title: text(160), description: text(), baseVersion: z.number().int().optional(), reason: text(500), replaces: id.optional() }),
  z.object({ type: z.literal("rebase_change"), impactId: id }),
  z.object({ type: z.literal("discard_change"), impactId: id }),
  z.object({ type: z.literal("request_preview"), feedback: z.string().max(1000).optional() }),
  z.object({ type: z.literal("vote"), requestId: id, vote: z.enum(["approve", "reject", "revise"]), comment: z.string().max(1000).optional() }),
  z.object({ type: z.literal("task_control"), taskId: id, op: z.enum(["pause", "resume", "stop", "retry"]) }),
  z.object({ type: z.literal("task_redirect"), taskId: id, instructions: text(1000) }),
  z.object({ type: z.literal("task_delegate"), taskId: id }),
  z.object({ type: z.literal("agent_restart"), agent: z.enum(["reviewer", "builder"]) }),
  z.object({ type: z.literal("checkpoint"), label: text(120) }),
  z.object({ type: z.literal("restore_preview"), artifactVersionId: id.optional(), checkpointId: id.optional() }),
  z.object({ type: z.literal("restore"), artifactVersionId: id.optional(), checkpointId: id.optional(), reason: text(500) }),
  z.object({ type: z.literal("compare"), a: id, b: id }),
  z.object({ type: z.literal("request_release") }),
  z.object({ type: z.literal("comment"), targetType: z.enum(["component", "requirement", "preview", "approval", "general", "version"]), targetId: id, body: text() }),
  z.object({ type: z.literal("chat"), message: text(2000) }),
  z.object({ type: z.literal("presence"), view: z.string().max(40), focus: z.string().max(80).nullable().optional() }),
  z.object({ type: z.literal("cursor"), x: z.number(), y: z.number(), view: z.string().max(40) }),
  z.object({ type: z.literal("lock"), target: id, release: z.boolean().optional() }),
  z.object({ type: z.literal("draft"), field: z.enum(DRAFT_FIELDS), text: z.string().max(4000), clientId: z.string().max(40) }),
  z.object({ type: z.literal("set_template"), template: z.enum(TEMPLATE_KEYS) }),
  z.object({ type: z.literal("set_policy"), major: z.number().int().min(1).max(2), minor: z.number().int().min(1).max(2), release: z.number().int().min(1).max(2) }),
  z.object({ type: z.literal("mark_read") }),
  z.object({ type: z.literal("reset_demo") }),
  z.object({ type: z.literal("create_invite"), role: z.enum(ROLES) }),
  z.object({ type: z.literal("add_reference"), reference: ReferenceInput }),
  z.object({ type: z.literal("remove_reference"), id }),
  z.object({ type: z.literal("revoke_invite"), inviteId: id }),
]);
export type Action = z.infer<typeof ActionSchema>;

/** Observers (non-technical stakeholders) may read, comment and ask the Reviewer — nothing else. */
const OBSERVER_OK = new Set(["comment", "chat", "draft", "presence", "cursor", "mark_read", "compare", "restore_preview"]);

export async function dispatch(projectId: string, user: { id: string; name: string; color: string }, role: string, a: Action) {
  const actor: Actor = { id: user.id, name: user.name, kind: "human" };
  if (role === "observer" && !OBSERVER_OK.has(a.type)) throw new HttpError(403, "Observers can view, comment and chat, but not change the project");

  const by = { userId: user.id, name: user.name, color: user.color };

  switch (a.type) {
    case "submit_request": {
      const r = await wf.submitRequest(projectId, actor, a.request);
      clearDraft(projectId, "request", by);
      return r;
    }
    case "decide_requirements": return wf.decideProposed(projectId, actor, a.keys, a.decision);
    case "edit_proposed": return wf.editProposed(projectId, actor, a.key, a.expectedVersion, { title: a.title, description: a.description, priority: a.priority });
    case "add_requirement": return wf.addRequirement(projectId, actor, { title: a.title, description: a.description, category: a.category, priority: a.priority });
    case "propose_change": return wf.proposeChange(projectId, actor, a);
    case "rebase_change": return wf.rebaseChange(projectId, actor, a.impactId);
    case "discard_change": return wf.discardChange(projectId, actor, a.impactId);
    case "request_preview": {
      const r = await wf.requestPreview(projectId, actor, a.feedback);
      clearDraft(projectId, "preview-feedback", by);
      return r;
    }
    case "vote": return wf.vote(projectId, { ...actor, role }, a.requestId, a.vote, a.comment);
    case "task_control": return controlTask(projectId, actor, a.taskId, a.op);
    case "task_redirect": return redirectTask(projectId, actor, a.taskId, a.instructions);
    case "task_delegate": return delegateTask(projectId, actor, a.taskId);
    case "agent_restart": return restartAgent(projectId, actor, a.agent);
    case "checkpoint": return wf.manualCheckpoint(projectId, actor, a.label);
    case "restore_preview": return wf.restorePreview(projectId, a);
    case "restore": return wf.restore(projectId, actor, a);
    case "compare": return wf.compareVersions(projectId, a.a, a.b);
    case "request_release": return wf.requestRelease(projectId, actor);
    case "comment": return wf.addComment(projectId, actor, a.targetType, a.targetId, a.body);
    case "chat":
      clearDraft(projectId, "chat", by); // the reply can take a while; the message is already posted
      return wf.chat(projectId, actor, a.message);
    case "draft":
      if (role === "observer" && a.field !== "chat") throw new HttpError(403, "Observers can only draft chat messages");
      setDraft(projectId, { field: a.field, text: a.text, clientId: a.clientId, ...by });
      return { ok: true };
    case "presence":
      touchPresence(projectId, { userId: user.id, name: user.name, color: user.color, view: a.view, focus: a.focus ?? null });
      return { ok: true };
    case "cursor":
      publish(projectId, { type: "cursor", userId: user.id, name: user.name, color: user.color, x: a.x, y: a.y, view: a.view });
      return { ok: true };
    case "lock":
      if (a.release) {
        releaseLock(projectId, a.target, user.id);
        return { ok: true };
      }
      return acquireLock(projectId, a.target, user.id, user.name);
    case "set_template": return wf.setTemplate(projectId, actor, a.template);
    case "set_policy": return wf.setPolicy(projectId, actor, a);
    case "mark_read":
      await wf.markRead(projectId, user.id);
      return { ok: true };
    case "create_invite": return createInvite(projectId, actor, a.role);
    case "add_reference": return addReference(projectId, actor, a.reference);
    case "remove_reference": return removeReference(projectId, actor, a.id);
    case "revoke_invite": return revokeInvite(projectId, actor, a.inviteId);
    case "reset_demo": {
      if (projectId !== DEMO_ID) throw new HttpError(400, "Only the demo project can be reset");
      // Bump epochs so in-flight runners cannot commit into the fresh project.
      await db.agent.updateMany({ where: { projectId }, data: { epoch: { increment: 1000 } } });
      await resetDemo();
      publish(projectId, { type: "changed", reason: "demo reset" });
      return { ok: true };
    }
  }
}
