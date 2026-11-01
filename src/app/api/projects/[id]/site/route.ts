// The built product, from ?version=<artifactVersionId> or ?preview=<previewId>
// (default: the current artifact version, else the latest preview).
// - no format: a standalone website to open in the browser (?download=1 saves the HTML file)
// - ?format=project: a .zip of the runnable project (Node backend + frontend + README)
import { requireMember } from "@/lib/server/auth";
import { db, j } from "@/lib/db";
import { projectFiles } from "@/lib/engine/project";
import { renderSite, siteFileName, slug } from "@/lib/engine/site";
import { loadReqs } from "@/lib/server/core";
import { json } from "@/lib/server/http";
import { zip } from "@/lib/server/zip";
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

  let source: { spec: string; label: string } | null = null;
  const latestPreview = async () => {
    const p = previewId
      ? await db.preview.findFirst({ where: { id: previewId, projectId: id } })
      : await db.preview.findFirst({ where: { projectId: id }, orderBy: { number: "desc" } });
    return p ? { spec: p.spec, label: `preview #${p.number} of “${project.name}”` } : null;
  };
  if (previewId) source = await latestPreview();
  else {
    const vid = versionId ?? project.currentArtifactVerId;
    const v = vid ? await db.artifactVersion.findFirst({ where: { id: vid, projectId: id } }) : null;
    source = v ? { spec: v.spec, label: `version ${v.number} of “${project.name}” (${v.label})` } : await latestPreview();
  }
  const spec = source ? j.parse<AppSpec | null>(source.spec, null) : null;
  if (!source || !spec?.pages?.length) return json({ error: "Nothing built yet — generate a preview first" }, 404);

  if (url.searchParams.get("format") === "project") {
    const folder = slug(spec.appName);
    const files = projectFiles(spec, await loadReqs(db, id), source.label).map((f) => ({ path: `${folder}/${f.path}`, content: f.content }));
    return new Response(new Uint8Array(zip(files)), {
      headers: { "content-type": "application/zip", "content-disposition": `attachment; filename="${folder}.zip"`, "cache-control": "no-store" },
    });
  }

  const headers: Record<string, string> = {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    // Served from this origin, so run it in an opaque sandbox: it cannot read the workspace's session.
    "content-security-policy": "sandbox allow-scripts allow-forms; default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:",
  };
  if (url.searchParams.get("download")) headers["content-disposition"] = `attachment; filename="${siteFileName(spec)}"`;
  return new Response(renderSite(spec), { headers });
}
