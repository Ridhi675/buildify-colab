// Optional design references (a website screenshot or an HTML/CSS template).
// The browser extracts colours, light/dark and layout from the file; here those
// hints are stored and turned into design notes that preview generation follows.

import { z } from "zod";
import { db, j } from "../db";
import { HttpError } from "./auth";
import { activity, mutate, type Actor } from "./core";

export const MAX_REFERENCES = 6;

const hex = z.string().regex(/^#[0-9a-f]{6}$/i);
const imageUrl = (max: number) => z.string().max(max).regex(/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/, "Expected an image");

export const ReferenceInput = z
  .object({
    name: z.string().trim().min(1).max(160),
    kind: z.enum(["image", "template"]),
    mime: z.string().max(100),
    data: z.string().min(1).max(900_000),
    thumb: imageUrl(150_000).optional(),
    palette: z.array(hex).max(8).default([]),
    accent: hex.optional(),
    mode: z.enum(["light", "dark"]).optional(),
    layout: z.enum(["mobile-first", "desktop-first"]).optional(),
    note: z.string().trim().max(500).optional(),
  })
  .refine((r) => r.kind !== "image" || imageUrl(900_000).safeParse(r.data).success, { message: "Expected an image", path: ["data"] });
export type ReferenceInput = z.infer<typeof ReferenceInput>;

export async function addReference(projectId: string, actor: Actor, input: ReferenceInput) {
  return mutate(projectId, "reference added", async (tx) => {
    const count = await tx.projectReference.count({ where: { projectId } });
    if (count >= MAX_REFERENCES) throw new HttpError(400, `Up to ${MAX_REFERENCES} references per project — remove one first`);
    const ref = await tx.projectReference.create({
      data: {
        projectId,
        name: input.name,
        kind: input.kind,
        mime: input.mime,
        data: input.data,
        thumb: input.thumb ?? "",
        palette: j.str(input.palette),
        accent: input.accent?.toLowerCase(),
        mode: input.mode,
        layout: input.layout,
        note: input.note ?? "",
        createdById: actor.id,
      },
    });
    await activity(tx, projectId, actor, "Added a design reference", { target: input.name });
    return { id: ref.id };
  });
}

export async function removeReference(projectId: string, actor: Actor, id: string) {
  return mutate(projectId, "reference removed", async (tx) => {
    const ref = await tx.projectReference.findFirst({ where: { id, projectId } });
    if (!ref) throw new HttpError(404, "Reference not found");
    await tx.projectReference.delete({ where: { id } });
    await activity(tx, projectId, actor, "Removed a design reference", { target: ref.name });
    return { ok: true };
  });
}

/**
 * Design notes from the references, oldest first, in the same plain-language
 * form as preview feedback ("light theme, brand colour #3b6ea5"). The file name
 * is left out so words in it ("dark-mode.png") can't be read as instructions.
 */
export function hintsFrom(refs: { accent: string | null; mode: string | null; layout: string | null; note: string }[]) {
  return refs
    .map((r) => {
      const parts = [r.mode && `${r.mode} theme`, r.accent && `brand colour ${r.accent}`, r.layout && `${r.layout} layout`].filter(Boolean);
      const note = r.note.trim();
      if (!parts.length && !note) return "";
      return `Design reference: ${parts.join(", ")}${parts.length && note ? ". " : ""}${note}`.trim();
    })
    .filter(Boolean);
}

/** Each reference's design note with its upload time, so it can be ordered against preview feedback. */
export async function referenceNotes(projectId: string) {
  const refs = await db.projectReference.findMany({ where: { projectId }, orderBy: { createdAt: "asc" }, select: { accent: true, mode: true, layout: true, note: true, createdAt: true } });
  return refs.flatMap((r) => hintsFrom([r]).map((text) => ({ at: r.createdAt, text })));
}
