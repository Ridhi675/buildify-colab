// Ripple Effect: deterministic impact analysis.
//
// Three deterministic signals, combined:
//  1. Requirement dependency graph (reverse traversal from the changed requirement).
//  2. Requirement -> component links, then component dependency graph (reverse traversal).
//  3. Spec simulation: derive the AppSpec before and after the change with the rules
//     engine and diff it; components whose rendered content changes are affected.
// AI-suggested items are appended separately and always labelled `inferred`.

import type { CompLite, EdgeLite, ImpactCategory, ImpactResult, ReqLite, TaskLite } from "../types";
import { allComponents, deriveSpec, diffSpecs } from "./spec";
import type { TemplateKey } from "./templates";

const EFFORT_HOURS: Record<string, number> = { frontend: 2, design: 1.5, testing: 1, backend: 3 };

/** Everything that (transitively) depends on `start`, following edges from -> to in reverse. */
export function dependents(start: string[], edges: EdgeLite[]): Map<string, string> {
  const via = new Map<string, string>(start.map((s) => [s, "changed"]));
  const queue = [...start];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const e of edges) {
      if (e.toKey === cur && !via.has(e.fromKey)) {
        via.set(e.fromKey, `depends on ${cur}`);
        queue.push(e.fromKey);
      }
    }
  }
  return via;
}

export interface ImpactInput {
  appName: string;
  template?: TemplateKey;
  changedKey: string;
  newTitle: string;
  newDescription: string;
  requirements: ReqLite[];
  reqDeps: EdgeLite[];
  components: CompLite[];
  compDeps: EdgeLite[];
  tasks: TaskLite[];
}

export function analyzeImpact(input: ImpactInput): ImpactResult {
  const { requirements, components, changedKey } = input;
  const changed = requirements.find((r) => r.key === changedKey);
  if (!changed) throw new Error(`Unknown requirement ${changedKey}`);

  // 1. requirement graph
  const reqVia = dependents([changedKey], input.reqDeps);
  const affectedRequirements = [...reqVia.entries()].map(([key, via]) => ({
    key,
    title: requirements.find((r) => r.key === key)?.title ?? key,
    via,
  }));

  // 2. component graph seeded by requirement links
  const reason = new Map<string, string>();
  for (const { key } of affectedRequirements) {
    const r = requirements.find((x) => x.key === key);
    for (const c of r?.components ?? []) if (!reason.has(c)) reason.set(c, `linked to ${key}`);
  }

  // 3. spec simulation
  const proposed = requirements.map((r) =>
    r.key === changedKey ? { ...r, title: input.newTitle, description: input.newDescription, version: r.version + 1 } : r,
  );
  const before = deriveSpec(requirements, input.appName, input.template);
  const after = deriveSpec(proposed, input.appName, input.template);
  const specDiff = diffSpecs(before, after);
  const beforeComps = new Map(allComponents(before).map((c) => [c.key, c]));
  for (const c of allComponents(after)) {
    const o = beforeComps.get(c.key);
    if ((!o || JSON.stringify(o.items) !== JSON.stringify(c.items) || o.title !== c.title || o.body !== c.body) && !reason.has(c.key))
      reason.set(c.key, "content changes in simulated rebuild");
  }
  if (JSON.stringify(before.theme) !== JSON.stringify(after.theme)) {
    for (const k of ["typography", "color-theme", "layout-grid"]) {
      const themeKey = k === "typography" ? "fontScale" : k === "color-theme" ? "contrast" : "layout";
      if ((before.theme as Record<string, unknown>)[themeKey] !== (after.theme as Record<string, unknown>)[themeKey] && !reason.has(k))
        reason.set(k, "design tokens change in simulated rebuild");
    }
  }

  const compVia = dependents([...reason.keys()], input.compDeps);
  for (const [k, via] of compVia) if (!reason.has(k)) reason.set(k, via);

  const known = new Map(components.map((c) => [c.key, c]));
  const affectedComponents = [...reason.entries()]
    .filter(([k]) => known.has(k))
    .map(([key, why]) => ({ key, name: known.get(key)!.name, category: known.get(key)!.category, reason: why, inferred: false }));
  const affectedSet = new Set(affectedComponents.map((c) => c.key));
  const unaffectedComponents = components.filter((c) => !affectedSet.has(c.key)).map(({ key, name, category }) => ({ key, name, category }));

  const categories: Record<ImpactCategory, string[]> = { frontend: [], backend: [], design: [], testing: [] };
  for (const c of affectedComponents) (categories[c.category as ImpactCategory] ?? categories.frontend).push(c.name);

  const affectedReqKeys = new Set(affectedRequirements.map((r) => r.key));
  const staleTasks = input.tasks
    .filter((t) => ["queued", "running", "paused"].includes(t.status) && t.requirementKeys.some((k) => affectedReqKeys.has(k)))
    .map(({ id, title, agentKey, status }) => ({ id, title, agentKey, status }));

  const agents = [
    { key: "reviewer", effect: `Re-validate acceptance criteria for ${affectedRequirements.map((r) => r.key).join(", ")}` },
    {
      key: "builder",
      effect: affectedComponents.some((c) => c.category !== "testing")
        ? `Rebuild ${affectedComponents.filter((c) => c.category !== "testing").length} component(s); keep ${unaffectedComponents.length} unchanged`
        : "No rebuild needed",
    },
  ];

  const effortHours = affectedComponents.reduce((s, c) => s + (EFFORT_HOURS[c.category] ?? 1), 0);
  const ratio = affectedComponents.length / Math.max(1, components.length);
  const severity: ImpactResult["severity"] =
    ratio > 0.45 || changed.priority === "must" ? "high" : ratio > 0.2 ? "medium" : "low";
  const unexplained = affectedComponents.filter((c) => c.reason.startsWith("content changes")).length;
  // Components found only by spec simulation (no explicit dependency path) lower confidence.
  const confidence: ImpactResult["confidence"] = unexplained === 0 ? "high" : unexplained <= 4 ? "medium" : "low";

  const steps = [
    `Record ${changedKey} v${changed.version + 1} and create a new context version`,
    ...(staleTasks.length ? [`Mark ${staleTasks.length} in-flight task(s) as stale; their output will be quarantined`] : []),
    `Reviewer updates acceptance criteria for ${affectedRequirements.length} requirement(s)`,
    `Builder rebuilds only ${affectedComponents.filter((c) => c.category !== "testing").length} affected component(s)`,
    ...(categories.testing.length ? [`Re-run: ${categories.testing.join(", ")}`] : []),
    "Humans review the updated artifact before it becomes the current version",
  ];
  if (confidence === "low") steps.push("Low dependency confidence: conservative fallback — review the full artifact, not just the diff");

  return {
    changedKey,
    affectedRequirements,
    affectedComponents,
    unaffectedComponents,
    categories,
    staleTasks,
    agents,
    effortHours,
    severity,
    confidence,
    steps,
    inferred: [],
    specDiff: specDiff.map((d) => `${d.kind === "added" ? "+" : d.kind === "removed" ? "−" : "~"} ${d.detail}`),
  };
}
