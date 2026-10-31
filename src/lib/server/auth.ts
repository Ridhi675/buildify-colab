// Session tokens (userId.hmac) for real accounts and the seeded demo people.
// Tokens live in the browser, so each computer (or tab) holds its own identity.

import crypto from "node:crypto";
import { db } from "../db";

const secret = () => {
  const s = process.env.AUTH_SECRET;
  if (s) return s;
  // Anyone who knows the fallback could forge a session, so production must set its own.
  if (process.env.NODE_ENV === "production") throw new HttpError(500, "AUTH_SECRET is not set on the server");
  return "dev-only-secret-change-me";
};

export function signToken(userId: string) {
  const mac = crypto.createHmac("sha256", secret()).update(userId).digest("base64url").slice(0, 32);
  return `${userId}.${mac}`;
}

export function verifyToken(token: string | null | undefined): string | null {
  if (!token) return null;
  const i = token.lastIndexOf(".");
  if (i <= 0) return null;
  const userId = token.slice(0, i);
  const expected = signToken(userId);
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? userId : null;
}

export class HttpError extends Error {
  constructor(public status: number, message: string, public data?: unknown) {
    super(message);
  }
}

export function tokenFrom(req: Request) {
  const url = new URL(req.url);
  return req.headers.get("x-bc-token") ?? url.searchParams.get("t");
}

export async function requireUser(req: Request) {
  const id = verifyToken(tokenFrom(req));
  if (!id) throw new HttpError(401, "Sign in to continue");
  const user = await db.user.findUnique({ where: { id } });
  if (!user) throw new HttpError(401, "Unknown user");
  return user;
}

/** Project-level authorization: the user must be a member. */
export async function requireMember(req: Request, projectId: string) {
  const user = await requireUser(req);
  const member = await db.projectMember.findUnique({ where: { projectId_userId: { projectId, userId: user.id } } });
  if (!member) throw new HttpError(403, "You are not a member of this project");
  return { user, member };
}
