import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { inflateRawSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deriveSpec } from "@/lib/engine/spec";
import { projectFiles } from "@/lib/engine/project";
import { zip } from "@/lib/server/zip";
import type { ReqLite } from "@/lib/types";

const reqs: ReqLite[] = [
  { key: "REQ-001", title: "Appointment scheduling", description: "Pick a doctor and slot", category: "feature", priority: "must", status: "approved", version: 1, components: ["doctor-list", "slot-picker", "booking-form"], acceptanceCriteria: [] },
  { key: "REQ-002", title: "Post retro notes", description: "Team posts notes", category: "feature", priority: "high", status: "approved", version: 1, components: [], acceptanceCriteria: ["User can post a note to a column"] },
];

/** Read every file back out of a zip (local headers + inflate). */
function unzip(buf: Buffer) {
  const out: Record<string, string> = {};
  let o = 0;
  while (buf.readUInt32LE(o) === 0x04034b50) {
    const size = buf.readUInt32LE(o + 18);
    const nameLen = buf.readUInt16LE(o + 26);
    const name = buf.subarray(o + 30, o + 30 + nameLen).toString("utf8");
    const start = o + 30 + nameLen + buf.readUInt16LE(o + 28);
    out[name] = inflateRawSync(buf.subarray(start, start + size)).toString("utf8");
    o = start + size;
  }
  expect(buf.readUInt32LE(buf.length - 22)).toBe(0x06054b50);
  return out;
}

describe("downloadable project", () => {
  const files = projectFiles(deriveSpec(reqs, "CareConnect"), reqs, "preview #1 of “CareConnect”");

  it("contains backend, frontend, README and spec, and round-trips through the zip", () => {
    const paths = files.map((f) => f.path);
    expect(paths).toEqual(expect.arrayContaining(["README.md", "package.json", "server.js", "public/index.html", "public/styles.css", "public/app.js", "spec.json"]));
    const back = unzip(zip(files.map((f) => ({ path: `careconnect/${f.path}`, content: f.content }))));
    for (const f of files) expect(back[`careconnect/${f.path}`]).toBe(f.content);
    const readme = files.find((f) => f.path === "README.md")!.content;
    expect(readme).toContain("npm start");
    expect(readme).toContain("REQ-001 · Appointment scheduling");
    expect(JSON.parse(files.find((f) => f.path === "package.json")!.content).scripts.start).toBe("node server.js");
  });

  describe("generated server", () => {
    let dir = "";
    let proc: ChildProcess;
    const port = 41000 + Math.floor(Math.random() * 2000);
    const base = `http://127.0.0.1:${port}`;
    const call = (path: string, init?: RequestInit) => fetch(base + path, init).then(async (r) => ({ status: r.status, type: r.headers.get("content-type"), body: await r.text() }));

    beforeAll(async () => {
      dir = mkdtempSync(join(tmpdir(), "rebrix-project-"));
      for (const f of files) {
        mkdirSync(dirname(join(dir, f.path)), { recursive: true });
        writeFileSync(join(dir, f.path), f.content);
      }
      proc = spawn(process.execPath, ["server.js"], { cwd: dir, env: { ...process.env, PORT: String(port) } });
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("server did not start")), 10_000);
        proc.stdout!.on("data", (d) => String(d).includes("running") && (clearTimeout(t), resolve()));
        proc.on("exit", (code) => reject(new Error(`server exited (${code})`)));
      });
    });
    afterAll(async () => {
      if (proc && proc.exitCode === null) await new Promise((r) => (proc.once("exit", r), proc.kill()));
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); // Windows releases the folder a moment after exit
    });

    it("serves the frontend", async () => {
      const home = await call("/");
      expect(home.status).toBe(200);
      expect(home.body).toContain('data-page="home"');
      expect(home.body).toContain('<script src="/app.js">');
      expect((await call("/app.js")).type).toContain("javascript");
      expect((await call("/styles.css")).status).toBe(200);
      expect((await call("/%2e%2e/server.js")).status).not.toBe(200); // no escaping ./public
    });

    it("saves, lists and deletes entries through the API", async () => {
      const post = await call("/api/entries/feature-2-form", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fields: { Title: "Went well", Details: "Demo" } }) });
      expect(post.status).toBe(201);
      const entry = JSON.parse(post.body);
      const list = JSON.parse((await call("/api/entries/feature-2-form")).body);
      expect(list).toEqual([expect.objectContaining({ id: entry.id, fields: { Title: "Went well", Details: "Demo" } })]);
      expect((await call(`/api/entries/feature-2-form/${entry.id}`, { method: "DELETE" })).status).toBe(200);
      expect(JSON.parse((await call("/api/entries/feature-2-form")).body)).toEqual([]);
      expect((await call("/api/entries/feature-2-form", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fields: { Title: " " } }) })).status).toBe(400);
    });

    it("stores bookings", async () => {
      const post = await call("/api/bookings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ details: { "Full name": "Ada", "Choose a time": "Mon 9:00" } }) });
      expect(post.status).toBe(201);
      const { id } = JSON.parse(post.body);
      expect(JSON.parse((await call(`/api/bookings/${id}`)).body).details["Full name"]).toBe("Ada");
    });
  });
});
