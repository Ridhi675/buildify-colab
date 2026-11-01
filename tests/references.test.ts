// Optional design references: hints extracted in the browser steer the preview.

import { describe, expect, it } from "vitest";
import { db, j } from "@/lib/db";
import { ActionSchema, dispatch } from "@/lib/server/actions";
import { hintsFrom } from "@/lib/server/references";
import { createProject } from "@/lib/server/seed";
import * as wf from "@/lib/server/workflow";
import { applyDesignFeedback, deriveTheme } from "@/lib/engine/spec";
import type { AppSpec } from "@/lib/types";

const aisha = { id: "u_aisha", name: "Aisha Rao", color: "#e11d48" };
const template = { name: "dark-mode-red.html", kind: "template" as const, mime: "text/html", data: "<style>body{background:#ffffff}</style>", palette: ["#2f6f4f"], accent: "#2f6f4f", mode: "light" as const, layout: "mobile-first" as const };

async function settle(projectId: string, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (!(await db.agentTask.count({ where: { projectId, status: { in: ["queued", "running"] } } }))) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("tasks did not settle");
}

describe("design references", () => {
  it("turns references into design notes, ignoring the file name", () => {
    const hints = hintsFrom([{ accent: "#2f6f4f", mode: "light", layout: "mobile-first", note: "" }, { accent: null, mode: null, layout: null, note: "" }]);
    expect(hints).toEqual(["Design reference: light theme, brand colour #2f6f4f, mobile-first layout"]);
    const { theme, applied } = applyDesignFeedback({ ...deriveTheme([]), mode: "dark" }, hints);
    expect(theme).toMatchObject({ mode: "light", primary: "#2f6f4f", layout: "mobile-first" });
    expect(applied).toEqual(expect.arrayContaining(["mode", "primary", "layout"]));
  });

  it("validates uploads and keeps observers out", async () => {
    expect(() => ActionSchema.parse({ type: "add_reference", reference: { ...template, kind: "image", data: "not-an-image" } })).toThrow();
    expect(() => ActionSchema.parse({ type: "add_reference", reference: { ...template, accent: "red" } })).toThrow();
    const p = await createProject(aisha.id, "Ref checks", "", false);
    await expect(dispatch(p.id, { id: "u_guest", name: "Sam Lee", color: "#64748b" }, "observer", { type: "add_reference", reference: template })).rejects.toThrow(/Observers/);
    for (let i = 0; i < 6; i++) await dispatch(p.id, aisha, "founder", { type: "add_reference", reference: { ...template, name: `ref-${i}.html` } });
    await expect(dispatch(p.id, aisha, "founder", { type: "add_reference", reference: template })).rejects.toThrow(/Up to 6/);
  });

  it("a generated preview follows the reference's colour and light/dark style", async () => {
    const p = await createProject(aisha.id, "Shoe store", "Sell shoes online", false);
    const actor = { id: aisha.id, name: aisha.name, kind: "human" as const };
    const { key } = await wf.addRequirement(p.id, actor, { title: "Dark storefront", description: "A dark visual theme for the shop", category: "theme", priority: "must" });
    await wf.decideProposed(p.id, actor, [key], "approve");

    // Feedback given before the upload ("make it red") is older, so the reference overrides it.
    await wf.requestPreview(p.id, actor, "make it red");
    await settle(p.id);
    await dispatch(p.id, aisha, "founder", { type: "add_reference", reference: template });
    await wf.requestPreview(p.id, actor);
    await settle(p.id);

    const preview = await db.preview.findFirstOrThrow({ where: { projectId: p.id }, orderBy: { number: "desc" } });
    const spec = j.parse<AppSpec>(preview.spec, {} as AppSpec);
    // The requirement asked for dark; the uploaded reference (light, green) wins over the requirement text.
    expect(spec.theme).toMatchObject({ mode: "light", primary: "#2f6f4f", layout: "mobile-first" });

    const { id } = (await db.projectReference.findFirstOrThrow({ where: { projectId: p.id } }));
    await dispatch(p.id, aisha, "founder", { type: "remove_reference", id });
    expect(await db.projectReference.count({ where: { projectId: p.id } })).toBe(0);
  });
});
