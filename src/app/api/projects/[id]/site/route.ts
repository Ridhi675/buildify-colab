// The built product as a standalone website: ?version=<artifactVersionId> or
// ?preview=<previewId> (default: the current artifact version, else the latest
// preview). ?download=1 returns it as a file to host anywhere.
import { requireMember } from "@/lib/server/auth";
import { db, j } from "@/lib/db";
import { renderSite, siteFileName } from "@/lib/engine/site";
import { json } from "@/lib/server/http";
import type { AppSpec } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await requireMember(req, id);
  } catch {
    return json({ error: "Sign in and open the project first" }, 401);
  }
  const url = new URL(req.url);
  const versionId = url.searchParams.get("version");
  const previewId = url.searchParams.get("preview");
  const project = await db.project.findUnique({ where: { id } });
  if (!project) return json({ error: "Not found" }, 404);

  let raw: string | undefined;
  if (previewId) raw = (await db.preview.findFirst({ where: { id: previewId, projectId: id } }))?.spec;
  else {
    const vid = versionId ?? project.currentArtifactVerId;
    raw = vid ? (await db.artifactVersion.findFirst({ where: { id: vid, projectId: id } }))?.spec : undefined;
    raw ??= (await db.preview.findFirst({ where: { projectId: id }, orderBy: { number: "desc" } }))?.spec;
  }
  const spec = raw ? j.parse<AppSpec | null>(raw, null) : null;
  if (!spec?.pages?.length) return json({ error: "Nothing built yet — generate a preview first" }, 404);

  const headers: Record<string, string> = {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    // Served from this origin, so run it in an opaque sandbox: it cannot read the workspace's session.
    "content-security-policy": "sandbox allow-scripts allow-forms; default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:",
  };
  if (url.searchParams.get("download")) headers["content-disposition"] = `attachment; filename="${siteFileName(spec)}"`;
  return new Response(renderSite(spec), { headers });
}
