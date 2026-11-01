import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { validateSpec } from "@/lib/ai/agents";
import { analyzeImpact } from "@/lib/engine/impact";
import { projectFiles } from "@/lib/engine/project";
import { renderSite } from "@/lib/engine/site";
import { allComponents, deriveSpec } from "@/lib/engine/spec";
import { TEMPLATE_KEYS, TEMPLATES } from "@/lib/engine/templates";
import { product, quote } from "@/lib/engine/items";
import { dispatch } from "@/lib/server/actions";
import { createProject } from "@/lib/server/seed";
import { AppSpecSchema, type ReqLite } from "@/lib/types";

const reqs: ReqLite[] = [
  { key: "REQ-001", title: "Students and staff", description: "People on campus who want quick answers", category: "audience", priority: "high", status: "approved", version: 1, components: [], acceptanceCriteria: [] },
  { key: "REQ-002", title: "Online ordering", description: "Order and pay ahead", category: "feature", priority: "must", status: "approved", version: 1, components: [], acceptanceCriteria: ["Order completes in 3 steps"] },
  { key: "REQ-003", title: "Light visual theme", description: "Bright, light theme", category: "theme", priority: "medium", status: "approved", version: 1, components: [], acceptanceCriteria: [] },
];

describe("website templates", () => {
  for (const key of TEMPLATE_KEYS) {
    it(`${key}: valid spec, passing validation, safe single-script site`, () => {
      const spec = deriveSpec(reqs, "Campus Café", key);
      expect(() => AppSpecSchema.parse(spec)).not.toThrow();
      expect(spec.pages.length).toBeGreaterThanOrEqual(2);
      // Section templates carry unlinked features on their main section; auto/booking rely on the
      // requirement → component links Bunty writes during simplification, which this data skips.
      if (key !== "auto" && key !== "booking") expect(validateSpec(spec, reqs).checks.filter((c) => !c.ok)).toEqual([]);
      const html = renderSite(spec);
      expect(html.match(/<script>/g)).toHaveLength(1);
      for (const p of spec.pages) expect(html).toContain(`data-page="${p.key}"`);
    });
  }

  it("each template has its own layout and accent", () => {
    const store = deriveSpec([], "Shop", "store");
    expect(allComponents(store).map((c) => c.type)).toEqual(expect.arrayContaining(["product-grid", "cart", "checkout", "confirmation"]));
    expect(store.theme.primary).toBe(TEMPLATES.store.accent);
    expect(allComponents(deriveSpec([], "Café", "restaurant")).map((c) => c.type)).toEqual(expect.arrayContaining(["menu", "contact", "hours"]));
    expect(allComponents(deriveSpec([], "Fest", "event")).map((c) => c.type)).toEqual(expect.arrayContaining(["schedule", "team", "contact"]));
    expect(allComponents(deriveSpec([], "Me", "portfolio")).map((c) => c.type)).toEqual(expect.arrayContaining(["gallery", "contact"]));
    expect(allComponents(deriveSpec([], "Launch", "landing")).map((c) => c.type)).toEqual(expect.arrayContaining(["testimonials", "pricing", "contact"]));
  });

  it("store site has a working cart and checkout wired to the backend", () => {
    const spec = deriveSpec(reqs, "Thread & Co.", "store");
    const html = renderSite(spec);
    expect(html).toContain('data-add="Denim Jacket"');
    expect(html).toContain('data-price="64"'); // sale price is what you pay
    expect(html).toContain('data-checkout="checkout"');
    const app = projectFiles(spec, reqs, "test").find((f) => f.path === "public/app.js")!.content;
    expect(app).toContain("data-checkout");
    expect(projectFiles(spec, reqs, "test").map((f) => f.path)).toContain("THIRD_PARTY_NOTICES.md");
  });

  it("reads item formats back out", () => {
    expect(product("Denim Jacket — $80 — $64")).toMatchObject({ name: "Denim Jacket", price: "$80", sale: "$64" });
    expect(product("Masala Dosa — ₹120 — Crispy rice crepe")).toMatchObject({ name: "Masala Dosa", price: "₹120", note: "Crispy rice crepe" });
    expect(quote("“Setup took five minutes.” — Fred S.")).toEqual({ text: "Setup took five minutes.", who: "Fred S." });
  });

  it("Ripple simulates the change on the project's template", () => {
    const comps = deriveSpec(reqs, "Shop", "store").pages.flatMap((p) => p.components).map((c) => ({ key: c.key, name: c.title, category: "frontend" }));
    const r = analyzeImpact({ appName: "Shop", template: "store", changedKey: "REQ-003", newTitle: "Dark visual theme", newDescription: "Dark theme", requirements: reqs, reqDeps: [], components: comps, compDeps: [], tasks: [] });
    expect(r).toBeTruthy();
  });

  it("creates a project on a template and switches it later", async () => {
    const owner = await db.user.upsert({ where: { id: "u_tpl" }, update: {}, create: { id: "u_tpl", name: "Tia Owner", title: "Owner", color: "#000" } });
    const p = await createProject(owner.id, "Campus Café", "", false, "restaurant");
    expect((await db.project.findUniqueOrThrow({ where: { id: p.id } })).template).toBe("restaurant");
    const keys = (await db.component.findMany({ where: { projectId: p.id } })).map((c) => c.key);
    expect(keys).toEqual(expect.arrayContaining(["menu", "reservation", "hours", "nav", "api"]));

    await dispatch(p.id, { id: owner.id, name: owner.name, color: owner.color }, "founder", { type: "set_template", template: "store" });
    expect((await db.project.findUniqueOrThrow({ where: { id: p.id } })).template).toBe("store");
    expect((await db.component.findMany({ where: { projectId: p.id } })).map((c) => c.key)).toEqual(expect.arrayContaining(["product-grid", "cart", "checkout"]));
    await expect(dispatch(p.id, { id: "u_guest", name: "Sam", color: "#000" }, "observer", { type: "set_template", template: "event" })).rejects.toThrow(/Observers/);
  });
});
