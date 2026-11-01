// Section items are plain strings so the LLM can rewrite them; these helpers read
// the conventional formats back out: "Name — $80 — $64", "“Quote” — Name", "09:00 — Talk".

const PRICE = /[$€£₹]\s?\d[\d,]*(?:\.\d{1,2})?/g;

export const parts = (s: string) => s.split(/\s+[—–-]\s+/).map((x) => x.trim()).filter(Boolean);

export const prices = (s: string) => s.match(PRICE) ?? [];

export const priceValue = (p: string) => Number(p.replace(/[^\d.]/g, "")) || 0;

/** "Denim Jacket — $80 — $64" → name, list price, sale price; "Dosa — ₹120 — Crispy crepe" → note. */
export function product(s: string) {
  const ps = parts(s);
  const pr = prices(s);
  const name = ps[0] ?? s;
  const note = ps.slice(1).find((p) => !prices(p).length);
  return { name, price: pr[0], sale: pr[1], note };
}

/** "Starter — $0 — 1 project, community support" */
export function plan(s: string) {
  const ps = parts(s);
  const price = prices(s)[0];
  const features = (ps.slice(1).find((p) => !prices(p).length) ?? "").split(/,\s*/).filter(Boolean);
  return { name: ps[0] ?? s, price, features };
}

/** "“It saved us hours.” — Margaret E." */
export function quote(s: string) {
  const m = s.match(/^\s*[“"](.+?)[”"]\s*[—–-]\s*(.+)$/);
  return m ? { text: m[1], who: m[2] } : { text: s.replace(/^[“"]|[”"]$/g, ""), who: "" };
}

/** "Ananya Gupta — Product lead" → name + detail (also used for gallery, schedule and hours rows). */
export function pair(s: string, sep: RegExp = /\s+[—–-]\s+|\s+·\s+/) {
  const i = s.search(sep);
  if (i < 0) return { a: s, b: "" };
  const m = s.slice(i).match(sep)!;
  return { a: s.slice(0, i).trim(), b: s.slice(i + m[0].length).trim() };
}

export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
