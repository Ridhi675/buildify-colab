// Real accounts and invite links: people on different computers each sign in
// as themselves and join a project through a link.

import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { acceptInvite, createInvite, hashPassword, publicUser, revokeInvite, signIn, signUp, verifyPassword } from "@/lib/server/accounts";
import { dispatch } from "@/lib/server/actions";
import { signToken, verifyToken } from "@/lib/server/auth";
import { createProject, DEMO_ID, resetDemo } from "@/lib/server/seed";

const run = Date.now().toString(36);
const email = (who: string) => `${who}.${run}@example.test`;

describe("accounts and invites", () => {
  it("hashes passwords and rejects wrong ones", async () => {
    const h = await hashPassword("correct horse");
    expect(h).not.toContain("correct horse");
    expect(await verifyPassword("correct horse", h)).toBe(true);
    expect(await verifyPassword("wrong horse", h)).toBe(false);
    expect(await verifyPassword("anything", null)).toBe(false);
  });

  it("signs up, signs in, and never exposes the password hash", async () => {
    const u = await signUp({ name: "Priya Shah", email: email("Priya"), password: "s3cret-pass" });
    expect(u.email).toBe(email("priya"));
    const back = await signIn({ email: email("PRIYA"), password: "s3cret-pass" });
    expect(back.id).toBe(u.id);
    expect(verifyToken(signToken(u.id))).toBe(u.id);
    expect(publicUser(back)).not.toHaveProperty("passwordHash");
    await expect(signIn({ email: email("priya"), password: "nope-nope" })).rejects.toThrow(/incorrect/);
    await expect(signUp({ name: "Dup", email: email("priya"), password: "another-pass" })).rejects.toThrow(/already exists/);
  });

  it("a real account starts its project alone, invites a teammate by link, and can revoke it", async () => {
    const owner = await signUp({ name: "Owner One", email: email("owner"), password: "owner-pass" });
    const mate = await signUp({ name: "Mate Two", email: email("mate"), password: "mate-pass1" });
    const p = await createProject(owner.id, "Tool Library", "Lend and borrow tools", false);

    const members = await db.projectMember.findMany({ where: { projectId: p.id } });
    expect(members.map((m) => [m.userId, m.role])).toEqual([[owner.id, "founder"]]);

    const actor = { id: owner.id, name: owner.name, kind: "human" as const };
    const { token } = await createInvite(p.id, actor, "designer");
    expect(await acceptInvite(token, mate)).toEqual({ projectId: p.id, joined: true });
    expect(await acceptInvite(token, mate)).toEqual({ projectId: p.id, joined: false });
    const joined = await db.projectMember.findUniqueOrThrow({ where: { projectId_userId: { projectId: p.id, userId: mate.id } } });
    expect(joined.role).toBe("designer");

    // Demo people are shared by everyone, so they cannot join real projects.
    await expect(acceptInvite(token, { id: "u_daniel", name: "Daniel Okafor" })).rejects.toThrow(/own account/);

    const invite = await db.projectInvite.findUniqueOrThrow({ where: { token } });
    await revokeInvite(p.id, actor, invite.id);
    const late = await signUp({ name: "Late Three", email: email("late"), password: "late-pass1" });
    await expect(acceptInvite(token, late)).rejects.toThrow(/revoked/);
  });

  it("observers cannot invite, and the demo cannot be shared", async () => {
    const owner = await signUp({ name: "Owner Obs", email: email("owner-obs"), password: "owner-pass" });
    const watcher = await signUp({ name: "Watcher", email: email("watcher"), password: "watch-pass" });
    const p = await createProject(owner.id, "Observed", "", false);
    const { token } = await createInvite(p.id, { id: owner.id, name: owner.name, kind: "human" }, "observer");
    await acceptInvite(token, watcher);
    await expect(dispatch(p.id, watcher, "observer", { type: "create_invite", role: "founder" })).rejects.toThrow(/Observers/);

    await resetDemo();
    await expect(dispatch(DEMO_ID, { id: "u_aisha", name: "Aisha Rao", color: "#e11d48" }, "founder", { type: "create_invite", role: "designer" })).rejects.toThrow(/demo/);
  });
});
