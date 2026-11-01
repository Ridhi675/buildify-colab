// Compiles an AppSpec into a website. Two outputs share the same markup and CSS:
// - renderSite: one self-contained HTML file (data saved in the visitor's browser)
// - siteParts + API_RUNTIME: the frontend of the downloadable project, whose
//   data goes to the generated Node backend (see project.ts)
// Spec text is always HTML-escaped; the only scripts are the fixed runtimes
// below, so content from an LLM can never execute.

import type { AppSpec, SpecComponent, SpecPage, Theme } from "../types";
import { initials, pair, plan, priceValue, product, quote } from "./items";

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "app";

/** File name for the downloaded single-file site, e.g. "careconnect.html". */
export const siteFileName = (spec: AppSpec) => `${slug(spec.appName)}.html`;

function palette(t: Theme) {
  const dark = t.mode === "dark";
  const hc = t.contrast === "high";
  return {
    bg: dark ? "#0b1220" : "#ffffff",
    surface: dark ? "#111a2e" : hc ? "#ffffff" : "#f8fafc",
    text: dark ? "#e5e7eb" : hc ? "#000000" : "#0f172a",
    muted: dark ? "#94a3b8" : hc ? "#1f2937" : "#64748b",
    border: dark ? "#1e293b" : hc ? "#111827" : "#e2e8f0",
    primary: /^#[0-9a-fA-F]{3,8}$/.test(t.primary) ? t.primary : "#4f46e5",
  };
}

/** Key of the first page that has a section of this type. */
const pageWith = (pages: SpecPage[], type: SpecComponent["type"]) => pages.find((p) => p.components.some((c) => c.type === type))?.key;

/** A form's items are field labels when they are short; otherwise they describe what the feature does. */
const looksLikeFields = (items: string[]) => items.length > 0 && items.every((i) => i.split(/\s+/).length <= 4);

function inputFor(label: string, name: string) {
  const l = label.toLowerCase();
  const type = /e-?mail/.test(l) ? "email" : /phone|mobile|tel/.test(l) ? "tel" : /date/.test(l) ? "date" : /time/.test(l) ? "time" : /number|age|qty|quantity|amount/.test(l) ? "number" : "text";
  const long = /reason|note|details|description|message|comment/.test(l);
  const field = long ? `<textarea name="${esc(name)}" rows="3"></textarea>` : `<input type="${type}" name="${esc(name)}" ${/insurance|optional/.test(l) ? "" : "required"}>`;
  return `<label class="field"><span>${esc(label)}</span>${field}</label>`;
}

function block(c: SpecComponent, pages: SpecPage[], pageIndex: number, booking: boolean) {
  const next = pages[Math.min(pageIndex + 1, pages.length - 1)].key;
  const body = c.body ? `<p class="muted">${esc(c.body)}</p>` : "";
  const h = (tag: string) => `<${tag}>${esc(c.title)}</${tag}>`;
  let inner: string;
  switch (c.type) {
    case "hero":
    case "cta": {
      const extra = c.items[0]
        ? /^call\b/i.test(c.items[0]) && /[\d-]{7,}/.test(c.items[0])
          ? `<a class="hint" href="tel:${esc(c.items[0].replace(/[^\d+]/g, ""))}">${esc(c.items[0])}</a>`
          : `<span class="hint">${esc(c.items[0])}</span>`
        : "";
      inner = `${h(c.type === "hero" ? "h1" : "h2")}${body}<div class="row"><a class="btn" href="#/${esc(next)}">${booking ? "Book appointment" : "Get started"}</a>${extra}</div>`;
      break;
    }
    case "doctor-list":
    case "list":
    case "feature-list": {
      const items = c.items.map((it) => {
        const target = c.type === "feature-list" ? pages.find((p) => it.toLowerCase().startsWith(p.name.toLowerCase())) : undefined;
        return target
          ? `<a class="item" href="#/${esc(target.key)}">${esc(it)}<span aria-hidden="true">›</span></a>`
          : `<button type="button" class="item" data-pick="${esc(c.key)}" data-value="${esc(it)}">${esc(it)}<span aria-hidden="true">›</span></button>`;
      });
      const cont = c.type === "doctor-list" ? `<a class="btn" href="#/${esc(next)}" data-needs="${esc(c.key)}">Continue</a>` : "";
      inner = `${h("h3")}${body}<div class="stack">${items.join("")}</div>${cont}`;
      break;
    }
    case "slot-picker":
      inner = `${h("h3")}${body}<div class="slots">${c.items.map((s) => `<button type="button" class="slot" data-pick="${esc(c.key)}" data-value="${esc(s)}">${esc(s)}</button>`).join("")}</div>`;
      break;
    case "booking-form":
      inner = `${h("h3")}${body}<form data-booking data-next="${esc(next)}">${c.items.map((f) => inputFor(f, f)).join("")}<p class="error" hidden></p><button class="btn" type="submit">Confirm booking</button></form>`;
      break;
    case "form": {
      const fields = looksLikeFields(c.items) ? c.items : ["Title", "Details"];
      const what = looksLikeFields(c.items) ? "" : `<ul class="checks">${c.items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
      inner = `${h("h3")}${body}${what}<form data-entries="${esc(c.key)}">${fields.map((f) => inputFor(f, f)).join("")}<p class="error" hidden></p><button class="btn" type="submit">Save</button></form><div class="entries" data-list="${esc(c.key)}"></div>`;
      break;
    }
    case "confirmation":
      inner = `<div class="center"><div class="tick" aria-hidden="true">✓</div>${h("h2")}${body}<div data-summary></div><a class="btn ghost" href="#/${esc(pages[0].key)}">Back to home</a></div>`;
      break;
    case "reminders":
      inner = `${h("h3")}${c.items.map((r) => `<label class="check"><input type="checkbox" data-toggle="${esc(c.key)}:${esc(r)}" checked> ${esc(r)}</label>`).join("")}`;
      break;
    case "help":
      inner = `${h("h3")}${body}<div class="stack">${c.items
        .map((x) => (/[\d-]{7,}/.test(x) ? `<a class="item" href="tel:${esc(x.replace(/[^\d+]/g, ""))}">${esc(x)}</a>` : `<div class="item">${esc(x)}</div>`))
        .join("")}</div>`;
      break;
    case "stats":
      inner = `${h("h3")}${body}<div class="stats">${c.items.map((x) => `<div class="stat">${esc(x)}</div>`).join("")}</div>`;
      break;
    // ---- template sections (layouts adapted from Start Bootstrap, MIT) ----
    case "product-grid": {
      const cartPage = pageWith(pages, "cart");
      const cards = c.items.map((it) => {
        const p = product(it);
        const pay = p.sale ?? p.price ?? "";
        return `<div class="product">${p.sale ? `<span class="badge">Sale</span>` : ""}<div class="thumb" aria-hidden="true">${esc(initials(p.name))}</div><div class="pname">${esc(p.name)}</div><div class="price">${p.sale ? `<s>${esc(p.price)}</s> ` : ""}${esc(pay)}</div><button type="button" class="btn ghost" data-add="${esc(p.name)}" data-price="${priceValue(pay)}" data-label="${esc(pay)}">Add to cart</button></div>`;
      });
      inner = `${h("h3")}${body}<div class="products">${cards.join("")}</div>${cartPage ? `<a class="btn" href="#/${esc(cartPage)}" data-cart-count>View cart</a>` : ""}`;
      break;
    }
    case "cart":
      inner = `${h("h3")}${body}<div data-cart></div><a class="btn" href="#/${esc(next)}" data-needs-cart>Checkout</a>`;
      break;
    case "checkout":
      inner = `${h("h3")}${body}<div data-cart-summary></div><form data-checkout="${esc(c.key)}" data-next="${esc(next)}">${c.items.map((f) => inputFor(f, f)).join("")}<p class="error" hidden></p><button class="btn" type="submit">Place order</button></form>`;
      break;
    case "menu":
      inner = `${h("h3")}${body}<div class="rows">${c.items
        .map((it) => {
          const p = product(it);
          return `<div class="mrow"><div><b>${esc(p.name)}</b>${p.note ? `<div class="muted small">${esc(p.note)}</div>` : ""}</div><span class="price">${esc(p.price ?? "")}</span></div>`;
        })
        .join("")}</div>`;
      break;
    case "hours":
    case "schedule":
      inner = `${h("h3")}${body}<div class="rows">${c.items
        .map((it) => {
          const { a, b } = c.type === "hours" ? pair(it, /\s+·\s+/) : pair(it);
          return c.type === "schedule" ? `<div class="srow"><span class="when">${esc(a)}</span><span>${esc(b)}</span></div>` : `<div class="mrow"><span>${esc(a)}</span><b>${esc(b)}</b></div>`;
        })
        .join("")}</div>`;
      break;
    case "team":
      inner = `${h("h3")}${body}<div class="people">${c.items
        .map((it) => {
          const { a, b } = pair(it);
          return `<div class="person"><div class="avatar" aria-hidden="true">${esc(initials(a))}</div><b>${esc(a)}</b><div class="muted small">${esc(b)}</div></div>`;
        })
        .join("")}</div>`;
      break;
    case "gallery":
      inner = `${h("h3")}${body}<div class="tiles">${c.items
        .map((it, i) => {
          const { a, b } = pair(it);
          return `<figure class="tile"><div class="art art${i % 4}" aria-hidden="true"></div><figcaption><b>${esc(a)}</b><span class="muted small">${esc(b)}</span></figcaption></figure>`;
        })
        .join("")}</div>`;
      break;
    case "pricing": {
      const target = pageWith(pages, "contact") ?? next;
      inner = `${h("h3")}${body}<div class="plans">${c.items
        .map((it, i) => {
          const p = plan(it);
          return `<div class="plan${i === 1 ? " featured" : ""}"><b>${esc(p.name)}</b><div class="amount">${esc(p.price ?? "")}<span class="muted small"> / month</span></div><ul class="checks">${p.features.map((f) => `<li>${esc(f)}</li>`).join("")}</ul><a class="btn${i === 1 ? "" : " ghost"}" href="#/${esc(target)}">Choose ${esc(p.name)}</a></div>`;
        })
        .join("")}</div>`;
      break;
    }
    case "testimonials":
      inner = `${h("h3")}${body}<div class="quotes">${c.items
        .map((it) => {
          const q = quote(it);
          return `<blockquote><div class="avatar" aria-hidden="true">${esc(initials(q.who || "?"))}</div><p>“${esc(q.text)}”</p>${q.who ? `<cite>${esc(q.who)}</cite>` : ""}</blockquote>`;
        })
        .join("")}</div>`;
      break;
    case "contact":
      inner = `${h("h3")}${body}<form data-entries="${esc(c.key)}">${c.items.map((f) => inputFor(f, f)).join("")}<p class="error" hidden></p><p class="thanks" hidden>Thanks, we got it. We'll be in touch soon.</p><button class="btn" type="submit">Send</button></form>`;
      break;
    default:
      inner = `${h("h3")}${body}${c.items.length ? `<ul>${c.items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}`;
  }
  return `<section class="card" data-component="${esc(c.key)}">${inner}</section>`;
}

/** The shared pieces of both outputs: page title, CSS and the <body> markup (without scripts). */
export function siteParts(spec: AppSpec, footer: string) {
  const t = spec.theme;
  const c = palette(t);
  const fs = t.fontScale || 1;
  const pad = t.density === "spacious" ? 24 : t.density === "comfortable" ? 18 : 14;
  const nav = spec.navigation.style;
  const mobile = t.layout === "mobile-first";
  const booking = spec.pages.some((p) => p.components.some((x) => x.type === "booking-form"));

  const links = spec.pages.map((p) => `<a href="#/${esc(p.key)}" data-link="${esc(p.key)}">${esc(p.name)}</a>`).join("");
  const pages = spec.pages
    .map(
      (p, i) =>
        `<div class="page" data-page="${esc(p.key)}"${i ? " hidden" : ""}><p class="purpose">${esc(p.purpose)}</p><div class="grid${p.components.length > 1 ? " two" : ""}">${p.components.map((x) => block(x, spec.pages, i, booking)).join("")}</div></div>`,
    )
    .join("");

  const css = `
:root{--bg:${c.bg};--surface:${c.surface};--text:${c.text};--muted:${c.muted};--border:${c.border};--primary:${c.primary};--fs:${fs};--pad:${pad}px;color-scheme:${t.mode}}
*{box-sizing:border-box}html,body{margin:0}
body{background:var(--bg);color:var(--text);font:calc(16px*var(--fs))/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:var(--primary)}
header.top{background:var(--primary);color:#fff;padding:12px var(--pad);display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
header.top strong{font-size:1.1em}header.top span{opacity:.9;font-size:.85em}
nav{display:flex;gap:4px;padding:8px;border-bottom:1px solid var(--border);background:var(--bg);overflow-x:auto}
nav a{padding:8px 14px;border-radius:10px;text-decoration:none;color:var(--muted);font-weight:600;white-space:nowrap}
nav a.active{color:var(--primary);background:color-mix(in srgb,var(--primary) 12%,transparent)}
.shell{max-width:${mobile ? "520px" : "1100px"};margin:0 auto}
.layout{display:block}
main{padding:var(--pad);min-height:60vh}
.purpose{color:var(--muted);font-size:.85em;margin:0 0 12px}
.grid{display:grid;gap:14px}
@media(min-width:760px){.grid.two{grid-template-columns:${mobile ? "1fr" : "1fr 1fr"}}${nav === "sidebar" && !mobile ? ".layout{display:flex}.layout nav{flex-direction:column;border-bottom:0;border-right:1px solid var(--border);min-width:200px;padding:12px}.layout main{flex:1}" : ""}}
.card{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:var(--pad)}
.card h1{font-size:1.6em;line-height:1.2;margin:0 0 8px}.card h2{font-size:1.3em;margin:0 0 8px}.card h3{font-size:1.1em;margin:0 0 6px}
.muted{color:var(--muted);margin:0 0 10px}
.row{display:flex;flex-wrap:wrap;gap:10px;align-items:center}.hint{color:var(--muted);font-size:.85em}
.btn{display:inline-flex;align-items:center;justify-content:center;min-height:calc(42px*var(--fs));padding:0 18px;border-radius:10px;border:2px solid var(--primary);background:var(--primary);color:#fff;font:inherit;font-weight:700;text-decoration:none;cursor:pointer;margin-top:8px}
.btn.ghost{background:transparent;color:var(--primary)}
.btn[aria-disabled=true]{opacity:.45;pointer-events:none}
.stack{display:grid;gap:8px;margin-bottom:6px}
.item{display:flex;justify-content:space-between;align-items:center;width:100%;text-align:left;padding:10px 12px;border:2px solid var(--border);border-radius:10px;background:var(--bg);color:var(--text);font:inherit;text-decoration:none;cursor:pointer}
.slots{display:grid;gap:8px;grid-template-columns:repeat(${fs >= 1.5 ? 1 : 3},minmax(0,1fr))}
.slot{min-height:calc(40px*var(--fs));border:2px solid var(--border);border-radius:10px;background:var(--bg);color:var(--text);font:inherit;font-weight:600;cursor:pointer}
.item.on,.slot.on{border-color:var(--primary)}.slot.on{background:var(--primary);color:#fff}
form{display:grid;gap:10px}
.field{display:grid;gap:4px;font-size:.85em;color:var(--muted)}
.field input,.field textarea{font:inherit;font-size:calc(1em/.85);color:var(--text);background:var(--bg);border:2px solid var(--border);border-radius:10px;padding:10px}
.field input:focus,.field textarea:focus,.btn:focus-visible,.item:focus-visible,.slot:focus-visible,nav a:focus-visible{outline:3px solid var(--primary);outline-offset:2px}
.error{color:#dc2626;margin:0}
.checks{margin:0 0 10px;padding-left:20px;color:var(--muted)}
.check{display:flex;gap:8px;align-items:center;margin:6px 0}.check input{width:calc(18px*var(--fs));height:calc(18px*var(--fs));accent-color:var(--primary)}
.entries{display:grid;gap:8px;margin-top:12px}
.entry{border:1px solid var(--border);border-radius:10px;padding:10px;background:var(--bg)}
.entry b{display:block}.entry small{color:var(--muted)}
.entry button{float:right;border:0;background:none;color:var(--muted);cursor:pointer;font:inherit}
.center{text-align:center}.tick{width:56px;height:56px;margin:0 auto 8px;border-radius:50%;background:#16a34a;color:#fff;display:grid;place-items:center;font-size:30px}
.summary{text-align:left;display:inline-block;margin:6px 0 4px}
.stats{display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(140px,1fr))}.stat{padding:12px;border-radius:10px;background:var(--bg);border:1px solid var(--border);font-weight:700}
.small{font-size:.8em}.thanks{color:#16a34a;margin:0;font-weight:600}
.products{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(${mobile ? 140 : 180}px,1fr));margin-bottom:6px}
.product{position:relative;border:1px solid var(--border);border-radius:12px;padding:10px;background:var(--bg);display:grid;gap:4px;text-align:center}
.product .btn{margin-top:4px;min-height:calc(36px*var(--fs))}
.thumb{aspect-ratio:4/3;border-radius:8px;display:grid;place-items:center;font-weight:800;font-size:1.6em;color:var(--primary);background:color-mix(in srgb,var(--primary) 12%,var(--surface))}
.badge{position:absolute;top:16px;right:16px;background:var(--text);color:var(--bg);font-size:.7em;font-weight:700;padding:2px 8px;border-radius:999px}
.pname{font-weight:700}.price{font-weight:700}.price s{color:var(--muted);font-weight:400}
.rows{display:grid}.mrow,.srow{display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px dashed var(--border)}.mrow:last-child,.srow:last-child{border-bottom:0}
.srow{justify-content:flex-start}.when{min-width:70px;font-weight:700;color:var(--primary)}
.people,.quotes{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));text-align:center}
.avatar{width:56px;height:56px;margin:0 auto 8px;border-radius:50%;display:grid;place-items:center;font-weight:800;color:#fff;background:var(--primary)}
blockquote{margin:0;padding:12px;border:1px solid var(--border);border-radius:12px;background:var(--bg)}blockquote p{margin:0 0 6px}cite{color:var(--muted);font-style:normal;font-size:.85em}
.tiles{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(${mobile ? 140 : 200}px,1fr))}
.tile{margin:0;border:1px solid var(--border);border-radius:12px;overflow:hidden;background:var(--bg)}.tile figcaption{display:grid;padding:8px 10px}
.art{aspect-ratio:4/3}.art0{background:linear-gradient(135deg,var(--primary),color-mix(in srgb,var(--primary) 40%,#fff))}.art1{background:linear-gradient(135deg,color-mix(in srgb,var(--primary) 60%,#000),var(--primary))}.art2{background:linear-gradient(45deg,color-mix(in srgb,var(--primary) 25%,#fff),var(--primary))}.art3{background:linear-gradient(160deg,var(--primary),color-mix(in srgb,var(--primary) 50%,#f59e0b))}
.plans{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(190px,1fr))}
.plan{border:1px solid var(--border);border-radius:12px;padding:14px;background:var(--bg);display:flex;flex-direction:column;gap:6px}.plan.featured{border:2px solid var(--primary)}.plan .btn{margin-top:auto}
.amount{font-size:1.6em;font-weight:800}
.cart-row{display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border)}.cart-row span{flex:1}
.cart-row button{border:1px solid var(--border);background:var(--bg);color:var(--text);border-radius:8px;min-width:32px;min-height:32px;font:inherit;cursor:pointer}
.total{display:flex;justify-content:space-between;font-weight:800;padding:10px 0}
footer{color:var(--muted);font-size:.75em;text-align:center;padding:16px}
${nav === "bottom-tabs" ? "body{padding-bottom:72px}nav.tabs{position:fixed;bottom:0;left:0;right:0;justify-content:space-around;border-top:1px solid var(--border);border-bottom:0}" : ""}
${t.motion === "reduced" ? "*{transition:none!important;animation:none!important;scroll-behavior:auto!important}" : ".btn,.item,.slot{transition:transform .12s}.btn:active,.item:active,.slot:active{transform:scale(.98)}"}
`;

  const navHtml = `<nav class="${nav === "bottom-tabs" ? "tabs" : ""}" aria-label="Main">${links}</nav>`;
  const body = `<div class="shell">
<header class="top"><strong>${esc(spec.appName)}</strong><span>${esc(spec.tagline)}</span></header>
${nav === "bottom-tabs" || nav === "sidebar" ? "" : navHtml}
<div class="layout">${nav === "sidebar" ? navHtml : ""}<main>${pages}</main></div>
${nav === "bottom-tabs" ? navHtml : ""}
<footer>${esc(footer)}</footer>
</div>`;
  return { title: esc(spec.appName), description: esc(spec.tagline), css, body };
}

// Shared by both runtimes: hash routing and the selection/toggle UI state.
const ROUTER = `
function $(q,r){return Array.prototype.slice.call((r||document).querySelectorAll(q))}
function text(tag,cls,t){var e=document.createElement(tag);if(cls)e.className=cls;if(t!=null)e.textContent=t;return e}
function fields(form){var o={};$("input,textarea",form).forEach(function(i){o[i.name]=i.value.trim()});return o}
function route(){
  var key=(location.hash.match(/^#\\/(.+)$/)||[])[1];var pages=$("[data-page]");
  var hit=pages.some(function(p){return p.getAttribute("data-page")===key});if(!hit)key=pages[0].getAttribute("data-page");
  pages.forEach(function(p){p.hidden=p.getAttribute("data-page")!==key});
  $("[data-link]").forEach(function(a){var on=a.getAttribute("data-link")===key;a.classList.toggle("active",on);if(on)a.setAttribute("aria-current","page");else a.removeAttribute("aria-current")});
  window.scrollTo(0,0);paint();
}
function paintPicks(){
  $("[data-pick]").forEach(function(b){b.classList.toggle("on",S.picks[b.getAttribute("data-pick")]===b.getAttribute("data-value"));b.setAttribute("aria-pressed",b.classList.contains("on"))});
  $("[data-needs]").forEach(function(a){a.setAttribute("aria-disabled",S.picks[a.getAttribute("data-needs")]?"false":"true")});
  $("[data-toggle]").forEach(function(i){var k=i.getAttribute("data-toggle");if(k in S.toggles)i.checked=S.toggles[k]});
  paintCart();
}
function money(n){var sym=(S.cart[0]&&S.cart[0].label.match(/^[^\\d\\s]+/)||["$"])[0];return sym+(Math.round(n*100)%100?n.toFixed(2):String(Math.round(n)))}
function cartCount(){return S.cart.reduce(function(n,i){return n+i.qty},0)}
function cartTotal(){return S.cart.reduce(function(n,i){return n+i.qty*i.price},0)}
function cartText(){return S.cart.map(function(i){return i.qty+"× "+i.name}).join(", ")}
function paintCart(){
  $("[data-cart-count]").forEach(function(a){a.textContent="View cart ("+cartCount()+")"});
  $("[data-needs-cart]").forEach(function(a){a.setAttribute("aria-disabled",S.cart.length?"false":"true")});
  $("[data-cart],[data-cart-summary]").forEach(function(box){
    var edit=box.hasAttribute("data-cart");box.innerHTML="";
    if(!S.cart.length){box.appendChild(text("p","muted","Your cart is empty."));return}
    S.cart.forEach(function(item,i){
      var row=text("div","cart-row");row.appendChild(text("span",null,item.name+" · "+item.label));
      if(edit){
        var dec=text("button",null,"−"),inc=text("button",null,"+");dec.type=inc.type="button";
        dec.setAttribute("aria-label","One less "+item.name);inc.setAttribute("aria-label","One more "+item.name);
        dec.onclick=function(){item.qty--;if(item.qty<1)S.cart.splice(i,1);saveUi();paintCart()};
        inc.onclick=function(){item.qty++;saveUi();paintCart()};
        row.appendChild(dec);row.appendChild(text("b",null,String(item.qty)));row.appendChild(inc);
      }else row.appendChild(text("b",null,"× "+item.qty));
      box.appendChild(row);
    });
    var t=text("div","total");t.appendChild(text("span",null,"Total"));t.appendChild(text("span",null,money(cartTotal())));box.appendChild(t);
  });
}
function orderDetails(f){var d=fields(f);d.Items=cartText();d.Total=money(cartTotal());return d}
function entryCard(e,onDelete){
  var d=text("div","entry"),del=text("button",null,"Delete");del.type="button";del.onclick=onDelete;d.appendChild(del);
  var keys=Object.keys(e.fields);d.appendChild(text("b",null,e.fields[keys[0]]||"(untitled)"));
  keys.slice(1).forEach(function(f){if(e.fields[f])d.appendChild(text("div",null,f+": "+e.fields[f]))});
  d.appendChild(text("small",null,new Date(e.at).toLocaleString()));return d;
}
function summaryList(b){var ul=text("ul","summary");Object.keys(b).forEach(function(k){if(b[k])ul.appendChild(text("li",null,k+": "+b[k]))});return ul}
function selections(){var b={};Object.keys(S.picks).forEach(function(k){var el=document.querySelector('[data-component="'+k+'"] h3');b[el?el.textContent:k]=S.picks[k]});return b}
function missingSlot(){var slots=$(".slot[data-pick]").map(function(x){return x.getAttribute("data-pick")});return slots.length&&!slots.some(function(k){return S.picks[k]})}
document.addEventListener("click",function(e){
  var add=e.target.closest&&e.target.closest("[data-add]");
  if(add){
    var name=add.getAttribute("data-add"),hit=S.cart.filter(function(i){return i.name===name})[0];
    if(hit)hit.qty++;else S.cart.push({name:name,price:Number(add.getAttribute("data-price"))||0,label:add.getAttribute("data-label")||"",qty:1});
    saveUi();paintCart();add.textContent="Added ✓";setTimeout(function(){add.textContent="Add to cart"},900);return;
  }
  var b=e.target.closest&&e.target.closest("[data-pick]");if(!b)return;
  S.picks[b.getAttribute("data-pick")]=b.getAttribute("data-value");saveUi();paintPicks();
});
document.addEventListener("change",function(e){
  var k=e.target.getAttribute&&e.target.getAttribute("data-toggle");if(!k)return;S.toggles[k]=e.target.checked;saveUi();
});
window.addEventListener("hashchange",route);
`;

/** Single-file site: everything saved in this browser's localStorage. */
function localRuntime(storeKey: string) {
  return `
(function(){
var KEY=${JSON.stringify(storeKey)},mem={};
function load(){try{return JSON.parse(localStorage.getItem(KEY)||"{}")}catch(e){return mem}}
function save(s){mem=s;try{localStorage.setItem(KEY,JSON.stringify(s))}catch(e){}}
function saveUi(){save(S)}
var S=load();S.picks=S.picks||{};S.entries=S.entries||{};S.toggles=S.toggles||{};S.cart=S.cart||[];
${ROUTER}
function paint(){
  paintPicks();
  $("[data-list]").forEach(function(box){
    var k=box.getAttribute("data-list"),list=S.entries[k]||[];box.innerHTML="";
    if(list.length)box.appendChild(text("small","muted",list.length+" saved"));
    list.slice().reverse().forEach(function(e,ri){var i=list.length-1-ri;box.appendChild(entryCard(e,function(){list.splice(i,1);S.entries[k]=list;save(S);paint()}))});
  });
  $("[data-summary]").forEach(function(box){box.innerHTML="";if(S.booking)box.appendChild(summaryList(S.booking))});
}
document.addEventListener("submit",function(e){
  var f=e.target;e.preventDefault();var err=f.querySelector(".error");
  if(f.hasAttribute("data-booking")){
    if(missingSlot()){err.textContent="Please choose a time first.";err.hidden=false;return}
    err.hidden=true;var b=selections(),v=fields(f);Object.keys(v).forEach(function(k){b[k]=v[k]});
    S.booking=b;save(S);f.reset();location.hash="#/"+f.getAttribute("data-next");return;
  }
  var order=f.getAttribute("data-checkout");
  if(order){
    if(!S.cart.length){err.textContent="Your cart is empty.";err.hidden=false;return}
    err.hidden=true;var d=orderDetails(f);(S.entries[order]=S.entries[order]||[]).push({fields:d,at:Date.now()});
    S.booking=d;S.cart=[];save(S);f.reset();location.hash="#/"+f.getAttribute("data-next");return;
  }
  var k=f.getAttribute("data-entries");if(!k)return;
  (S.entries[k]=S.entries[k]||[]).push({fields:fields(f),at:Date.now()});save(S);f.reset();
  var th=f.querySelector(".thanks");if(th)th.hidden=false;paint();
});
route();
})();`;
}

/** Frontend of the downloadable project: data goes to the generated backend's REST API. */
export const API_RUNTIME = `// Frontend runtime: hash routing, selections, and calls to the backend API (server.js).
(function(){
var UI="ui:"+location.host;
function loadUi(){try{return JSON.parse(localStorage.getItem(UI)||"{}")}catch(e){return {}}}
function saveUi(){try{localStorage.setItem(UI,JSON.stringify({picks:S.picks,toggles:S.toggles,cart:S.cart}))}catch(e){}}
var S=loadUi();S.picks=S.picks||{};S.toggles=S.toggles||{};S.cart=S.cart||[];
// The last booking or order, shown on the confirmation page.
function summary(){try{return JSON.parse(sessionStorage.getItem("summary")||"null")}catch(e){return null}}
function setSummary(d){try{sessionStorage.setItem("summary",JSON.stringify(d))}catch(e){}}
function api(path,opts){
  opts=opts||{};if(opts.body){opts.body=JSON.stringify(opts.body);opts.headers={"content-type":"application/json"}}
  return fetch("/api"+path,opts).then(function(r){return r.json().then(function(d){if(!r.ok)throw new Error(d.error||("Request failed ("+r.status+")"));return d})});
}
${ROUTER}
function paint(){
  paintPicks();
  $("[data-list]").forEach(function(box){
    var k=box.getAttribute("data-list");
    api("/entries/"+encodeURIComponent(k)).then(function(list){
      box.innerHTML="";if(list.length)box.appendChild(text("small","muted",list.length+" saved"));
      list.slice().reverse().forEach(function(e){box.appendChild(entryCard(e,function(){api("/entries/"+encodeURIComponent(k)+"/"+e.id,{method:"DELETE"}).then(paint)}))});
    }).catch(function(err){box.textContent="Could not load entries: "+err.message});
  });
  var last=summary();
  $("[data-summary]").forEach(function(box){box.innerHTML="";if(last)box.appendChild(summaryList(last))});
}
document.addEventListener("submit",function(e){
  var f=e.target;e.preventDefault();var err=f.querySelector(".error");
  function fail(x){if(err){err.textContent=x.message;err.hidden=false}}
  if(err)err.hidden=true;
  if(f.hasAttribute("data-booking")){
    if(missingSlot())return fail(new Error("Please choose a time first."));
    var b=selections(),v=fields(f);Object.keys(v).forEach(function(k){b[k]=v[k]});
    api("/bookings",{method:"POST",body:{details:b}}).then(function(r){setSummary(r.details);f.reset();location.hash="#/"+f.getAttribute("data-next")}).catch(fail);return;
  }
  var order=f.getAttribute("data-checkout");
  if(order){
    if(!S.cart.length)return fail(new Error("Your cart is empty."));
    api("/entries/"+encodeURIComponent(order),{method:"POST",body:{fields:orderDetails(f)}}).then(function(r){setSummary(r.fields);S.cart=[];saveUi();f.reset();location.hash="#/"+f.getAttribute("data-next")}).catch(fail);return;
  }
  var k=f.getAttribute("data-entries");if(!k)return;
  api("/entries/"+encodeURIComponent(k),{method:"POST",body:{fields:fields(f)}}).then(function(){f.reset();var th=f.querySelector(".thanks");if(th)th.hidden=false;paint()}).catch(fail);
});
route();
})();
`;

export function renderSite(spec: AppSpec): string {
  const p = siteParts(spec, "Built with ReBrix · data you enter is saved in this browser only");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="ReBrix">
<meta name="description" content="${p.description}">
<title>${p.title}</title>
<style>${p.css}</style>
</head>
<body>
${p.body}
<script>${localRuntime(`rebrix-site:${slug(spec.appName)}`)}</script>
</body>
</html>`;
}
