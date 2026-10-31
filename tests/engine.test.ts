import { describe, expect, it } from "vitest";
import { checkStale, diffRequirements, fingerprint } from "@/lib/engine/context";
import { analyzeImpact, dependents } from "@/lib/engine/impact";
import { allComponents, deriveSpec, diffSpecs, rebuildSpec } from "@/lib/engine/spec";
import { simplifyRules } from "@/lib/ai/agents";
import type { ReqLite } from "@/lib/types";

const base: ReqLite[] = [
  { key: "REQ-001", title: "General adult patients", description: "Adults booking appointments", category: "audience", priority: "high", status: "approved", version: 1, components: ["home-hero", "typography", "nav", "a11y-tests"], acceptanceCriteria: [] },
  { key: "REQ-002", title: "Appointment scheduling", description: "Pick a doctor and slot", category: "feature", priority: "must", status: "approved", version: 1, components: ["doctor-list", "slot-picker", "booking-form", "appointments-api"], acceptanceCriteria: [] },
  { key: "REQ-003", title: "Dark visual theme", description: "Dark color scheme", category: "theme", priority: "medium", status: "approved", version: 1, components: ["color-theme"], acceptanceCriteria: [] },
  { key: "REQ-004", title: "Desktop-first web layout", description: "Desktop-first layout", category: "layout", priority: "medium", status: "approved", version: 1, components: ["layout-grid", "nav"], acceptanceCriteria: [] },
];
const comps = [
  ["nav", "frontend"], ["home-hero", "frontend"], ["doctor-list", "frontend"], ["slot-picker", "frontend"], ["booking-form", "frontend"],
  ["confirmation", "frontend"], ["typography", "design"], ["color-theme", "design"], ["layout-grid", "design"],
  ["appointments-api", "backend"], ["patient-db", "backend"], ["notification-service", "backend"], ["a11y-tests", "testing"], ["viewport-tests", "testing"],
].map(([key, category]) => ({ key, name: key, category }));
const compDeps = [
  { fromKey: "nav", toKey: "typography" }, { fromKey: "booking-form", toKey: "typography" }, { fromKey: "viewport-tests", toKey: "layout-grid" },
  { fromKey: "doctor-list", toKey: "appointments-api" }, { fromKey: "appointments-api", toKey: "patient-db" },
];
const reqDeps = [{ fromKey: "REQ-003", toKey: "REQ-001" }, { fromKey: "REQ-004", toKey: "REQ-001" }];

describe("query simplification (rules engine)", () => {
  it("turns a vague elderly healthcare request into structured requirements", () => {
    const r = simplifyRules("Build a healthcare app for elderly users. Make it easy to navigate and lightweight.");
    const titles = r.requirements.map((q) => q.title.toLowerCase()).join(" | ");
    expect(titles).toContain("elderly");
    expect(titles).toContain("typography");
    expect(titles).toContain("simple navigation");
    expect(titles).toContain("appointment scheduling");
    expect(titles).toContain("lightweight");
    for (const q of r.requirements) expect(q.acceptanceCriteria.length).toBeGreaterThan(0);
  });
});

describe("fingerprints and stale detection", () => {
  it("detects a changed dependency version", () => {
    const fp = fingerprint(base, ["REQ-001", "REQ-002"]);
    expect(checkStale(fp, base).stale).toBe(false);
    const changed = base.map((r) => (r.key === "REQ-001" ? { ...r, version: 2, title: "Elderly patients" } : r));
    const check = checkStale(fp, changed);
    expect(check.stale).toBe(true);
    expect(check.changed[0]).toMatchObject({ key: "REQ-001", from: 1, to: 2 });
    expect(check.reason).toContain("outdated requirements");
  });

  it("ignores changes to requirements the task does not depend on", () => {
    const fp = fingerprint(base, ["REQ-002"]);
    const changed = base.map((r) => (r.key === "REQ-001" ? { ...r, version: 2 } : r));
    expect(checkStale(fp, changed).stale).toBe(false);
  });

  it("diffs requirement snapshots", () => {
    const d = diffRequirements(base, [...base.slice(1), { ...base[0], key: "REQ-009", title: "New" }]);
    expect(d.map((x) => x.kind).sort()).toEqual(["added", "removed"]);
  });
});

describe("ripple effect impact analysis", () => {
  const result = analyzeImpact({
    appName: "CareConnect",
    changedKey: "REQ-001",
    newTitle: "Elderly patients on mobile",
    newDescription: "Elderly patients (65+) using phones; mobile-first and accessible",
    requirements: base,
    reqDeps,
    components: comps,
    compDeps,
    tasks: [{ id: "t1", title: "Build", status: "running", agentKey: "builder", requirementKeys: ["REQ-001", "REQ-002"] }],
  });

  it("traverses requirement dependencies", () => {
    expect(result.affectedRequirements.map((r) => r.key).sort()).toEqual(["REQ-001", "REQ-003", "REQ-004"]);
  });

  it("affects design/frontend/testing but not backend data logic", () => {
    const keys = result.affectedComponents.map((c) => c.key);
    expect(keys).toEqual(expect.arrayContaining(["typography", "nav", "a11y-tests", "layout-grid", "viewport-tests"]));
    expect(result.categories.backend).toEqual([]);
    expect(result.unaffectedComponents.map((c) => c.key)).toEqual(expect.arrayContaining(["patient-db", "appointments-api"]));
  });

  it("flags in-flight tasks as stale and summarises the spec diff", () => {
    expect(result.staleTasks.map((t) => t.id)).toEqual(["t1"]);
    expect(result.specDiff.join(" ")).toMatch(/Text size: 100% → 150%/);
    expect(result.specDiff.join(" ")).toMatch(/Color mode: dark → light/);
    expect(["medium", "high"]).toContain(result.severity);
  });

  it("dependents() walks reverse edges transitively", () => {
    expect([...dependents(["patient-db"], compDeps).keys()].sort()).toEqual(["appointments-api", "doctor-list", "patient-db"]);
  });
});

describe("impact-aware rebuild", () => {
  it("keeps unaffected components identical and reports what changed", () => {
    const before = deriveSpec(base, "CareConnect");
    const changedReqs = base.map((r) => (r.key === "REQ-001" ? { ...r, title: "Elderly patients", description: "elderly patients, mobile-first", version: 2 } : r));
    const after = deriveSpec(changedReqs, "CareConnect");
    const { spec, changed } = rebuildSpec(before, after, new Set(["home-hero", "booking-form"]));
    const old = new Map(allComponents(before).map((c) => [c.key, c]));
    const confirmation = allComponents(spec).find((c) => c.key === "confirmation")!;
    expect(confirmation).toBe(old.get("confirmation")); // untouched object
    expect(changed).toContain("theme");
    expect(spec.theme.fontScale).toBe(1.5);
    expect(diffSpecs(before, spec).some((d) => d.detail.includes("Text size"))).toBe(true);
  });
});
