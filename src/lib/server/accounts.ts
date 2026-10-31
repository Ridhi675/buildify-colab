// Real accounts (email + password) and project invite links, so people on
// different computers each sign in as themselves. The seeded demo people stay
// available for the CareConnect demo only.

import crypto from "node:crypto";
import { promisify } from "node:util";
import { db } from "../db";
import { HttpError } from "./auth";
import { activity, mutate, type Actor } from "./core";
import { DEMO_ID, USERS } from "./seed";

const scrypt = promisify(crypto.scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export const ROLES = ["founder", "designer", "observer"] as const;
export type Role = (typeof ROLES)[number];

const DEMO_IDS = new Set(USERS.map((u) => u.id));
export const isDemoUser = (id: string) => DEMO_IDS.has(id);

const COLORS = ["#e11d48", "#2563eb", "#059669", "#d97706", "#7c3aed", "#0891b2", "#db2777", "#4f46e5"];

export async function hashPassword(password: string) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined) {
  const [scheme, salt, hash] = (stored ?? "").split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const actual = await scrypt(password, Buffer.from(salt, "base64url"), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

/** Fields that are safe to send to the browser. */
export function publicUser(u: { id: string; name: string; title: string; color: string; email?: string | null }) {
  return { id: u.id, name: u.name, title: u.title, color: u.color, email: u.email ?? null, demo: isDemoUser(u.id) };
}

// Small in-memory brake on password guessing (single-instance deployment).
const failures = new Map<string, { count: number; until: number }>();
const MAX_FAILURES = 8;
const LOCK_MS = 10 * 60_000;

export async function signUp(input: { name: string; email: string; password: string; title?: string }) {
  const email = input.email.trim().toLowerCase();
  if (await db.user.findUnique({ where: { email } })) throw new HttpError(409, "An account with this email already exists — sign in instead");
  const id = `u_${crypto.randomBytes(9).toString("base64url")}`;
  const color = COLORS[crypto.createHash("sha256").update(email).digest()[0] % COLORS.length];
  return db.user.create({
    data: { id, name: input.name.trim(), title: input.title?.trim() || "Collaborator", email, color, passwordHash: await hashPassword(input.password) },
  });
}

export async function signIn(input: { email: string; password: string }) {
  const email = input.email.trim().toLowerCase();
  const f = failures.get(email);
  if (f && f.count >= MAX_FAILURES && f.until > Date.now()) throw new HttpError(429, "Too many attempts — try again in a few minutes");
  const user = await db.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
    const next = f && f.until > Date.now() ? f.count + 1 : 1;
    failures.set(email, { count: next, until: Date.now() + LOCK_MS });
    throw new HttpError(401, "Email or password is incorrect");
  }
  failures.delete(email);
  return user;
}

export async function createInvite(projectId: string, actor: Actor, role: Role) {
  if (projectId === DEMO_ID) throw new HttpError(400, "The demo uses demo people. Create your own project to invite teammates.");
  const token = crypto.randomBytes(18).toString("base64url");
  return mutate(projectId, "invite created", async (tx) => {
    const invite = await tx.projectInvite.create({ data: { projectId, token, role, createdById: actor.id } });
    await activity(tx, projectId, actor, "Created an invite link", { target: `${role} role` });
    return { token: invite.token, role: invite.role };
  });
}

export async function revokeInvite(projectId: string, actor: Actor, inviteId: string) {
  return mutate(projectId, "invite revoked", async (tx) => {
    const r = await tx.projectInvite.updateMany({ where: { id: inviteId, projectId, revokedAt: null }, data: { revokedAt: new Date() } });
    if (!r.count) throw new HttpError(404, "Invite not found or already revoked");
    await activity(tx, projectId, actor, "Revoked an invite link", { target: inviteId });
    return { ok: true };
  });
}

async function liveInvite(token: string) {
  const invite = await db.projectInvite.findUnique({ where: { token }, include: { project: { select: { id: true, name: true, description: true } } } });
  if (!invite || invite.revokedAt) throw new HttpError(404, "This invite link is invalid or has been revoked");
  return invite;
}

/** What the invite page shows before someone joins. */
export async function describeInvite(token: string) {
  const invite = await liveInvite(token);
  const by = await db.user.findUnique({ where: { id: invite.createdById }, select: { name: true } });
  return { project: invite.project, role: invite.role, invitedBy: by?.name ?? "A teammate" };
}

/** Adds the signed-in user to the project. Existing members keep their role. */
export async function acceptInvite(token: string, user: { id: string; name: string }) {
  // Demo identities are shared by everyone who opens the demo, so they cannot join real projects.
  if (isDemoUser(user.id)) throw new HttpError(403, "Sign in with your own account to join this project");
  const invite = await liveInvite(token);
  const projectId = invite.projectId;
  const existing = await db.projectMember.findUnique({ where: { projectId_userId: { projectId, userId: user.id } } });
  if (existing) return { projectId, joined: false };
  await mutate(projectId, "member joined", async (tx) => {
    await tx.projectMember.create({ data: { projectId, userId: user.id, role: invite.role } });
    await tx.projectInvite.update({ where: { id: invite.id }, data: { uses: { increment: 1 } } });
    await activity(tx, projectId, { id: user.id, name: user.name, kind: "human" }, "Joined the project", { target: `${invite.role} role` });
  });
  return { projectId, joined: true };
}
