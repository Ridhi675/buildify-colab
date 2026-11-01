// Compiles an AppSpec into a runnable project: a dependency-free Node.js
// backend (REST API + JSON file storage + static hosting), the frontend from
// site.ts wired to that API, and a README with run instructions.

import type { AppSpec, ReqLite } from "../types";
import { API_RUNTIME, siteParts, slug } from "./site";

export interface ProjectFile {
  path: string;
  content: string;
}

/** Plain text for Markdown: strip characters that would start markup. */
const md = (s: string) => s.replace(/[\r\n]+/g, " ").replace(/([\\`*_[\]<>|#])/g, "\\$1").trim();

const SERVER = `// Backend for this app: serves the frontend in ./public and a small REST API.
// No dependencies: needs only Node.js 18 or newer. Data is kept in ./data/db.json.
"use strict";
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const APP_NAME = __APP_NAME__;
const PORT = Number(process.env.PORT) || 8080;
const PUBLIC = path.join(__dirname, "public");
const DB_FILE = process.env.DB_FILE || path.join(__dirname, "data", "db.json");
const MAX_BODY = 100 * 1024;

// ---------- storage ----------
function readDb() {
  try {
    const db = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
    return { entries: db.entries || {}, bookings: db.bookings || [] };
  } catch {
    return { entries: {}, bookings: [] };
  }
}
function writeDb(db) {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  const tmp = DB_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE); // atomic replace, so a crash never leaves half a file
}

// ---------- helpers ----------
function send(res, status, data) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(data));
}
function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error("Request body too large"), { status: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
      } catch {
        reject(Object.assign(new Error("Body must be JSON"), { status: 400 }));
      }
    });
    req.on("error", reject);
  });
}
/** Keep only short string fields: { "Full name": "Ada", ... }. */
function cleanFields(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw Object.assign(new Error("Expected an object of fields"), { status: 400 });
  const out = {};
  for (const [k, v] of Object.entries(input).slice(0, 50)) {
    if (typeof v !== "string") continue;
    out[String(k).slice(0, 100)] = v.slice(0, 2000);
  }
  return out;
}
const validKey = (k) => /^[a-z0-9-]{1,80}$/.test(k);

// ---------- API ----------
async function api(req, res, parts) {
  const [resource, key, id] = parts;
  const db = readDb();

  if (resource === "health" && req.method === "GET") return send(res, 200, { ok: true });

  // /api/entries/:form and /api/entries/:form/:id — records saved by each form
  if (resource === "entries") {
    if (!key) return req.method === "GET" ? send(res, 200, db.entries) : send(res, 405, { error: "Method not allowed" });
    if (!validKey(key)) return send(res, 400, { error: "Unknown form" });
    const list = db.entries[key] || [];
    if (!id && req.method === "GET") return send(res, 200, list);
    if (!id && req.method === "POST") {
      const body = await readJson(req);
      const fields = cleanFields(body.fields);
      if (!Object.values(fields).some((v) => v.trim())) return send(res, 400, { error: "Fill in at least one field" });
      const entry = { id: crypto.randomUUID(), fields, at: Date.now() };
      db.entries[key] = [...list, entry];
      writeDb(db);
      return send(res, 201, entry);
    }
    if (id && req.method === "DELETE") {
      if (!list.some((e) => e.id === id)) return send(res, 404, { error: "Not found" });
      db.entries[key] = list.filter((e) => e.id !== id);
      writeDb(db);
      return send(res, 200, { ok: true });
    }
  }

  // /api/bookings and /api/bookings/:id
  if (resource === "bookings") {
    if (!key && req.method === "GET") return send(res, 200, db.bookings);
    if (!key && req.method === "POST") {
      const body = await readJson(req);
      const details = cleanFields(body.details);
      if (!Object.keys(details).length) return send(res, 400, { error: "Booking details are missing" });
      const booking = { id: crypto.randomUUID(), details, at: Date.now() };
      db.bookings.push(booking);
      writeDb(db);
      return send(res, 201, booking);
    }
    if (key && req.method === "GET") {
      const b = db.bookings.find((x) => x.id === key);
      return b ? send(res, 200, b) : send(res, 404, { error: "Not found" });
    }
  }
  return send(res, 404, { error: "Unknown API route" });
}

// ---------- static files ----------
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };
function serveStatic(req, res, pathname) {
  const rel = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\\/+/, "");
  const file = path.resolve(PUBLIC, rel);
  if (!file.startsWith(PUBLIC + path.sep)) return send(res, 403, { error: "Forbidden" });
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, { error: "Not found" });
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, "http://localhost");
  try {
    if (pathname.startsWith("/api/")) return await api(req, res, pathname.slice(5).split("/").filter(Boolean));
    if (req.method !== "GET") return send(res, 405, { error: "Method not allowed" });
    serveStatic(req, res, pathname);
  } catch (e) {
    send(res, e.status || 500, { error: e.status ? e.message : "Server error" });
    if (!e.status) console.error(e);
  }
});

if (require.main === module) {
  server.listen(PORT, () => console.log(\`\${APP_NAME} is running at http://localhost:\${PORT}\`));
}
module.exports = server;
`;

function readme(spec: AppSpec, reqs: ReqLite[], label: string) {
  const name = md(spec.appName);
  const approved = reqs.filter((r) => r.status === "approved");
  const forms = spec.pages.flatMap((p) => p.components.filter((c) => c.type === "form").map((c) => ({ page: p.name, c })));
  const booking = spec.pages.some((p) => p.components.some((c) => c.type === "booking-form"));
  return `# ${name}

${md(spec.tagline)}

Generated by ReBrix from ${md(label)}. It is a complete, runnable web app: a Node.js backend with a REST API and file storage, and a frontend that talks to it.

## Run it locally

You need [Node.js](https://nodejs.org) 18 or newer. Nothing else to install: the backend has no dependencies.

1. Unzip this folder and open a terminal in it.
2. Start the app:

   \`\`\`bash
   npm start
   \`\`\`

3. Open http://localhost:8080 in your browser.

To use another port:

\`\`\`bash
PORT=5000 npm start
\`\`\`

On Windows PowerShell:

\`\`\`powershell
$env:PORT=5000; npm start
\`\`\`

Stop the server with Ctrl+C. Everything you save is kept in \`data/db.json\`; delete that file to start fresh.

## What's inside

\`\`\`
${slug(spec.appName)}/
├── server.js          backend: REST API, JSON storage, serves the frontend
├── package.json       npm start → node server.js
├── public/
│   ├── index.html     pages and navigation
│   ├── styles.css     theme: ${spec.theme.mode}, ${spec.theme.layout}, text ${Math.round(spec.theme.fontScale * 100)}%
│   └── app.js         routing, forms and calls to the API
├── data/              created on first save (db.json)
├── spec.json          the ReBrix spec this app was generated from
└── README.md
\`\`\`

## Pages

${spec.pages.map((p) => `- **${md(p.name)}** — ${md(p.purpose)}`).join("\n")}

## Requirements this build covers

${approved.length ? approved.map((r) => `- **${md(r.key)} · ${md(r.title)}** — ${md(r.description)}`).join("\n") : "- (none recorded)"}

## API

| Method | Path | What it does |
|---|---|---|
| GET | /api/health | Health check |
| GET | /api/entries | All saved entries, grouped by form |
| GET | /api/entries/:form | Entries saved by one form |
| POST | /api/entries/:form | Save an entry: \`{ "fields": { "Title": "…" } }\` |
| DELETE | /api/entries/:form/:id | Delete an entry |
${booking ? "| GET | /api/bookings | All bookings |\n| POST | /api/bookings | Create a booking: `{ \"details\": { \"Full name\": \"…\" } }` |\n| GET | /api/bookings/:id | One booking |\n" : ""}${forms.length ? `\nForms in this app: ${forms.map(({ page, c }) => `\`${c.key}\` (${md(c.title)}, on ${md(page)})`).join(", ")}.\n` : ""}
Try it from a terminal while the app is running:

\`\`\`bash
curl http://localhost:8080/api/health
\`\`\`

## Deploy

Any host that runs Node.js works (Render, Railway, Fly.io, a VPS). Use \`npm start\` as the start command; the app reads the \`PORT\` environment variable. Set \`DB_FILE\` to a path on a persistent disk so data survives restarts.

## Limits

- No sign-in: anyone who can open the app can read and change its data.
- Storage is a single JSON file, fine for a prototype or a small team, not for heavy traffic.
- Layouts come from ReBrix templates; edit \`public/\` freely to change the design.
`;
}

/** All files of the runnable project, paths relative to the project folder. */
export function projectFiles(spec: AppSpec, reqs: ReqLite[], label: string): ProjectFile[] {
  const p = siteParts(spec, "Built with ReBrix");
  const name = slug(spec.appName);
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="ReBrix">
<meta name="description" content="${p.description}">
<title>${p.title}</title>
<link rel="stylesheet" href="/styles.css">
</head>
<body>
${p.body}
<script src="/app.js"></script>
</body>
</html>
`;
  const pkg = {
    name,
    version: "1.0.0",
    private: true,
    description: spec.tagline,
    main: "server.js",
    scripts: { start: "node server.js" },
    engines: { node: ">=18" },
  };
  return [
    { path: "README.md", content: readme(spec, reqs, label) },
    { path: "package.json", content: JSON.stringify(pkg, null, 2) + "\n" },
    { path: "server.js", content: SERVER.replace("__APP_NAME__", () => JSON.stringify(spec.appName)) },
    { path: "public/index.html", content: html },
    { path: "public/styles.css", content: p.css.trim() + "\n" },
    { path: "public/app.js", content: API_RUNTIME },
    { path: "spec.json", content: JSON.stringify(spec, null, 2) + "\n" },
    { path: ".gitignore", content: "node_modules/\ndata/\n" },
  ];
}
