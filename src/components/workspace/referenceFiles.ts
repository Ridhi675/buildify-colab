// Reads an uploaded design reference in the browser and pulls out the hints
// ReBrix uses: main colours, the accent, light or dark, and layout. Images are
// also shrunk so the upload stays small. Nothing here leaves the browser except
// the result sent to the server.

export interface AnalyzedReference {
  name: string;
  kind: "image" | "template";
  mime: string;
  data: string;
  thumb?: string;
  palette: string[];
  accent?: string;
  mode?: "light" | "dark";
  layout?: "mobile-first" | "desktop-first";
}

export const ACCEPT = "image/png,image/jpeg,image/webp,.html,.htm,.css";
const MAX_FILE = 8 * 1024 * 1024;
const MAX_TEXT = 300_000;

const toHex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
const fromHex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
const luminance = ([r, g, b]: number[]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
function satLight([r, g, b]: number[]) {
  const max = Math.max(r, g, b) / 255, min = Math.min(r, g, b) / 255;
  const l = (max + min) / 2;
  const s = max === min ? 0 : l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
  return { s, l };
}
const distance = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Most-used distinct colours, then the first one colourful enough to be the brand colour. */
function summarize(counts: Map<string, number>) {
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([h]) => h);
  const palette: string[] = [];
  for (const h of sorted) {
    if (palette.every((p) => distance(fromHex(p), fromHex(h)) > 48)) palette.push(h);
    if (palette.length === 6) break;
  }
  const accent = palette.find((h) => {
    const { s, l } = satLight(fromHex(h));
    return s > 0.3 && l > 0.2 && l < 0.75;
  });
  return { palette, accent };
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => (URL.revokeObjectURL(url), resolve(img));
    img.onerror = () => (URL.revokeObjectURL(url), reject(new Error("That image couldn’t be read")));
    img.src = url;
  });
}

function draw(img: HTMLImageElement, maxSide: number) {
  const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(img.naturalWidth * k));
  c.height = Math.max(1, Math.round(img.naturalHeight * k));
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return { c, ctx };
}

async function analyzeImage(file: File): Promise<AnalyzedReference> {
  const img = await loadImage(file);
  const { c: small, ctx } = draw(img, 72);
  const px = ctx.getImageData(0, 0, small.width, small.height).data;
  const counts = new Map<string, number>();
  let lum = 0;
  for (let i = 0; i < px.length; i += 4) {
    // 16 levels per channel groups near-identical shades together.
    const q = [px[i], px[i + 1], px[i + 2]].map((v) => Math.min(255, Math.round(v / 16) * 16 + 8));
    const h = toHex(q[0], q[1], q[2]);
    counts.set(h, (counts.get(h) ?? 0) + 1);
    lum += luminance([px[i], px[i + 1], px[i + 2]]);
  }
  const { palette, accent } = summarize(counts);
  return {
    name: file.name,
    kind: "image",
    mime: "image/jpeg",
    data: draw(img, 1280).c.toDataURL("image/jpeg", 0.8),
    thumb: draw(img, 240).c.toDataURL("image/jpeg", 0.7),
    palette,
    accent,
    mode: lum / (px.length / 4) < 0.42 ? "dark" : "light",
  };
}

async function analyzeTemplate(file: File): Promise<AnalyzedReference> {
  const text = (await file.text()).slice(0, MAX_TEXT);
  const counts = new Map<string, number>();
  for (const m of text.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)) {
    const raw = m[1].toLowerCase();
    const h = `#${raw.length === 3 ? raw.split("").map((ch) => ch + ch).join("") : raw}`;
    counts.set(h, (counts.get(h) ?? 0) + 1);
  }
  const { palette, accent } = summarize(counts);
  // Page background decides light or dark, when the template sets one.
  const bg = text.match(/(?:body|html|:root)[^{]*\{[^}]*background(?:-color)?\s*:\s*#([0-9a-f]{6}|[0-9a-f]{3})\b/i)?.[1];
  const bgHex = bg ? `#${bg.length === 3 ? bg.split("").map((ch) => ch + ch).join("") : bg}` : undefined;
  const lower = text.toLowerCase();
  const layout = /bottom-?(nav|tab|bar)/.test(lower) || lower.includes("mobile-first") ? "mobile-first" : /sidebar|side-nav|sidenav/.test(lower) ? "desktop-first" : undefined;
  return {
    name: file.name,
    kind: "template",
    mime: file.type || (file.name.endsWith(".css") ? "text/css" : "text/html"),
    data: text,
    palette,
    accent,
    mode: bgHex ? (luminance(fromHex(bgHex)) < 0.42 ? "dark" : "light") : undefined,
    layout,
  };
}

export async function analyzeReference(file: File): Promise<AnalyzedReference> {
  if (file.size > MAX_FILE) throw new Error("That file is over 8 MB — try a smaller screenshot");
  if (/^image\/(png|jpeg|webp)$/.test(file.type)) return analyzeImage(file);
  if (/\.(html?|css)$/i.test(file.name) || /^text\/(html|css)$/.test(file.type)) return analyzeTemplate(file);
  throw new Error("Upload a PNG, JPG or WebP screenshot, or an HTML/CSS template");
}
