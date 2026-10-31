// Reviewer AI and Builder AI capabilities. Each function tries the configured LLM
// first and falls back to the deterministic rules engine. The returned `source`
// tells the UI which one produced the result — never presented as something else.

import { z } from "zod";
import { structured, type LlmResult } from "./llm";
import { deriveSpec, deriveTextual, allComponents } from "../engine/spec";
import {
  CATEGORIES,
  PRIORITIES,
  SimplifyResultSchema,
  TextualSpecSchema,
  type AppSpec,
  type ImpactResult,
  type ProposedRequirement,
  type ReqLite,
  type SimplifyResult,
  type TextualSpec,
} from "../types";

export interface AiOutput<T> {
  data: T;
  source: "llm" | "rules";
  model?: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  note?: string;
}

async function withFallback<T>(llm: () => Promise<LlmResult<T> | null>, rules: () => T): Promise<AiOutput<T>> {
  try {
    const r = await llm();
    if (r) return { data: r.data, source: "llm", model: r.model, tokensIn: r.tokensIn, tokensOut: r.tokensOut, costUsd: r.costUsd };
  } catch (e) {
    return { data: rules(), source: "rules", tokensIn: 0, tokensOut: 0, costUsd: 0, note: `LLM unavailable (${(e as Error).message}); used rules engine` };
  }
  return { data: rules(), source: "rules", tokensIn: 0, tokensOut: 0, costUsd: 0 };
}

const REVIEWER_SYSTEM =
  "You are the Reviewer AI in Buildify CoLab, a product-building workspace shared by two humans and a Builder AI. " +
  "You turn human requests into precise, testable product requirements, explain things in plain language for non-technical readers, " +
  "and never claim a human approved something. Preserve the human's original intent; flag ambiguity instead of guessing.";

// ---------------- Query simplification ----------------

export function simplifyRules(request: string): SimplifyResult {
  const t = request.toLowerCase();
  const reqs: ProposedRequirement[] = [];
  const add = (r: ProposedRequirement) => reqs.push(r);
  const health = /health|appointment|doctor|clinic|patient|booking/.test(t);
  const elderly = /elderly|senior|older|aged|grand/.test(t);
  if (elderly)
    add({ title: "Designed for elderly patients", description: "Primary users are elderly patients (65+), many with reduced vision or dexterity.", category: "audience", priority: "must",
      acceptanceCriteria: ["Body text renders at ≥ 150% of default size", "Every action is reachable in ≤ 3 taps"], components: ["home-hero", "typography", "nav", "a11y-tests"] });
  else if (health)
    add({ title: "General adult patients", description: "Adults booking appointments for themselves.", category: "audience", priority: "high",
      acceptanceCriteria: ["Copy is written at a grade 8 reading level"], components: ["home-hero", "typography", "nav", "a11y-tests"] });
  if (elderly || /accessib|readable|contrast|easy to (use|navigate)/.test(t))
    add({ title: "Large readable typography and high contrast", description: "Large text, WCAG AA contrast (4.5:1+), accessible buttons ≥ 56px.", category: "accessibility", priority: "must",
      acceptanceCriteria: ["Contrast ratio ≥ 4.5:1 for all text", "Touch targets ≥ 56px"], components: ["typography", "color-theme", "booking-form", "a11y-tests"] });
  if (/easy to navigate|simple|navigation/.test(t) || elderly)
    add({ title: "Simple navigation", description: "At most 4 top-level destinations with text labels, no hidden menus.", category: "layout", priority: "high",
      acceptanceCriteria: ["≤ 4 navigation items", "No hamburger menu on primary flows"], components: ["nav", "layout-grid"] });
  if (health)
    add({ title: "Appointment scheduling", description: "Patients pick a doctor and an available time slot, then confirm.", category: "feature", priority: "must",
      acceptanceCriteria: ["Booking completes in ≤ 3 steps", "Unavailable slots cannot be selected"], components: ["doctor-list", "slot-picker", "booking-form", "appointments-api", "booking-e2e"] });
  if (/remind|notif|confirm/.test(t) || health)
    add({ title: "Confirmation and reminders", description: "Show a clear confirmation and send reminders before the visit.", category: "feature", priority: "high",
      acceptanceCriteria: ["Confirmation shows date, time and doctor", "Reminder sent 24h before"], components: ["confirmation", "reminders", "notification-service"] });
  if (/mobile|phone|responsive/.test(t))
    add({ title: "Mobile responsiveness", description: "Mobile-first layout that scales up to desktop.", category: "layout", priority: "high",
      acceptanceCriteria: ["Usable at 360px width without horizontal scroll"], components: ["layout-grid", "nav", "viewport-tests"] });
  else if (/desktop/.test(t))
    add({ title: "Desktop-first web layout", description: "Desktop-first responsive web layout with a sidebar for power users.", category: "layout", priority: "medium",
      acceptanceCriteria: ["Optimised for ≥ 1280px screens", "Still usable at tablet width"], components: ["layout-grid", "nav", "viewport-tests"] });
  if (/lightweight|fast|light weight|performance/.test(t))
    add({ title: "Lightweight frontend", description: "Small bundle and minimal unnecessary animations.", category: "performance", priority: "medium",
      acceptanceCriteria: ["Initial JS ≤ 150KB gzipped", "Respects prefers-reduced-motion"], components: ["layout-grid"] });
  if (/dark/.test(t))
    add({ title: "Dark visual theme", description: "Dark color scheme across all screens.", category: "theme", priority: "medium",
      acceptanceCriteria: ["All screens use dark surfaces"], components: ["color-theme"] });
  if (!reqs.length) {
    for (const part of request.split(/[.;\n]+/).map((s) => s.trim()).filter((s) => s.length > 8).slice(0, 5))
      add({ title: part.slice(0, 60), description: part, category: "feature", priority: "medium", acceptanceCriteria: [`A user can: ${part}`], components: [] });
  }
  const ambiguities: string[] = [];
  if (!/mobile|desktop|web|app|phone/.test(t)) ambiguities.push("Which platform comes first: mobile, desktop web, or both?");
  if (health && !/insurance|pay/.test(t)) ambiguities.push("Do patients need to enter insurance or payment details?");
  if (!elderly && !/user|patient|customer|audience/.test(t)) ambiguities.push("Who is the primary user?");
  return { productName: health ? "CareConnect" : "New product", ambiguities, requirements: reqs };
}

export function simplifyRequest(request: string, componentKeys: string[]) {
  return withFallback(
    () =>
      structured({
        system: REVIEWER_SYSTEM,
        schema: SimplifyResultSchema,
        prompt:
          `Convert this human request into 3-8 structured requirements.\n` +
          `Categories: ${CATEGORIES.join(", ")}. Priorities: ${PRIORITIES.join(", ")}.\n` +
          `Link each requirement to affected component keys chosen ONLY from: ${componentKeys.join(", ") || "(none yet; use [])"}.\n` +
          `Write 1-3 measurable acceptance criteria each. List genuine ambiguities as questions.\n\nRequest:\n"""${request}"""`,
      }),
    () => simplifyRules(request),
  );
}

// ---------------- Acceptance test plan (Reviewer, parallel with Builder) ----------------

const AcceptancePlanSchema = z.object({
  items: z.array(z.object({ requirementKey: z.string(), checks: z.array(z.string()) })),
  risks: z.array(z.string()),
});
export type AcceptancePlan = z.infer<typeof AcceptancePlanSchema>;

export function acceptancePlan(reqs: ReqLite[]) {
  const approved = reqs.filter((r) => r.status === "approved");
  return withFallback(
    () =>
      structured({
        system: REVIEWER_SYSTEM,
        schema: AcceptancePlanSchema,
        prompt: `Write a concise acceptance test plan (2-4 checks per requirement) and top risks for:\n${JSON.stringify(approved.map(({ key, title, description, acceptanceCriteria }) => ({ key, title, description, acceptanceCriteria })), null, 1)}`,
      }),
    () => ({
      items: approved.map((r) => ({
        requirementKey: r.key,
        checks: [...r.acceptanceCriteria, `Reviewer verifies “${r.title}” on mobile and desktop`],
      })),
      risks: approved.some((r) => r.category === "audience")
        ? ["Audience changes ripple into typography, navigation and tests"]
        : ["No target audience defined yet"],
    }),
  );
}

// ---------------- Builder: implementation plan ----------------

const BuildPlanSchema = z.object({
  steps: z.array(z.object({ component: z.string(), work: z.string(), estimateHours: z.number() })),
  notes: z.array(z.string()),
});
export type BuildPlan = z.infer<typeof BuildPlanSchema>;

export function buildPlan(reqs: ReqLite[], components: { key: string; name: string; category: string }[]) {
  const approved = reqs.filter((r) => r.status === "approved");
  return withFallback(
    () =>
      structured({
        system: "You are the Builder AI. You only implement approved specifications and report structured, honest progress.",
        schema: BuildPlanSchema,
        prompt: `Write a technical implementation plan (one step per component that needs work) for these approved requirements:\n${JSON.stringify(approved.map(({ key, title, components }) => ({ key, title, components })))}\nComponents:\n${JSON.stringify(components)}`,
      }),
    () => ({
      steps: components
        .filter((c) => approved.some((r) => r.components.includes(c.key)))
        .map((c) => ({ component: c.key, work: `Implement ${c.name} for ${approved.filter((r) => r.components.includes(c.key)).map((r) => r.key).join(", ")}`, estimateHours: c.category === "backend" ? 3 : c.category === "testing" ? 1 : 2 })),
      notes: ["Generated by rules engine from requirement→component links"],
    }),
  );
}

// ---------------- Preview / artifact generation ----------------

const CopySchema = z.object({
  tagline: z.string(),
  components: z.array(z.object({ key: z.string(), title: z.string(), body: z.string(), items: z.array(z.string()) })),
});

/**
 * Structure and theme always come from the deterministic engine (so impact analysis
 * and partial rebuilds stay reliable); the LLM, when available, writes the copy.
 */
export async function generateSpec(reqs: ReqLite[], appName: string, onlyKeys?: Set<string>): Promise<AiOutput<AppSpec>> {
  const skeleton = deriveSpec(reqs, appName);
  const targets = allComponents(skeleton).filter((c) => !onlyKeys || onlyKeys.has(c.key));
  const out = await withFallback(
    () =>
      structured({
        system: "You are the Builder AI. Write concise, realistic UI copy for each component. Keep the same keys. Honor every approved requirement.",
        schema: CopySchema,
        prompt:
          `Approved requirements:\n${JSON.stringify(reqs.filter((r) => r.status === "approved").map(({ key, title, description }) => ({ key, title, description })))}\n` +
          `Theme: ${JSON.stringify(skeleton.theme)}\nComponents to write (keep keys, ≤6 items each):\n${JSON.stringify(targets.map(({ key, type, title, body, items }) => ({ key, type, title, body, items })))}`,
      }),
    () => ({ tagline: skeleton.tagline, components: targets.map(({ key, title, body, items }) => ({ key, title, body, items })) }),
  );
  const copy = new Map(out.data.components.map((c) => [c.key, c]));
  const spec: AppSpec = {
    ...skeleton,
    tagline: out.data.tagline || skeleton.tagline,
    pages: skeleton.pages.map((p) => ({
      ...p,
      components: p.components.map((c) => {
        const k = copy.get(c.key);
        return k && (!onlyKeys || onlyKeys.has(c.key)) ? { ...c, title: k.title, body: k.body, items: k.items.slice(0, 6) } : c;
      }),
    })),
  };
  return { ...out, data: spec };
}

export async function generateTextual(reqs: ReqLite[], spec: AppSpec): Promise<AiOutput<TextualSpec>> {
  return withFallback(
    () =>
      structured({
        system: REVIEWER_SYSTEM,
        schema: TextualSpecSchema,
        prompt: `Write the textual preview (plain language) for this product.\nRequirements: ${JSON.stringify(reqs.filter((r) => r.status === "approved").map(({ key, title, description }) => ({ key, title, description })))}\nScreens: ${JSON.stringify(spec.pages.map((p) => ({ name: p.name, purpose: p.purpose, components: p.components.map((c) => c.title) })))}`,
      }),
    () => deriveTextual(reqs, spec),
  );
}

// ---------------- Validation (Reviewer checks Builder output) ----------------

export interface Validation {
  passed: boolean;
  checks: { label: string; ok: boolean; requirementKey?: string }[];
  summary: string;
}

export function validateSpec(spec: AppSpec, reqs: ReqLite[]): Validation {
  const approved = reqs.filter((r) => r.status === "approved");
  const t = approved.map((r) => `${r.title} ${r.description}`.toLowerCase()).join(" ");
  const checks: Validation["checks"] = [];
  const req = (re: RegExp) => approved.find((r) => re.test(`${r.title} ${r.description}`.toLowerCase()))?.key;
  if (/elderly|senior/.test(t)) {
    checks.push({ label: "Text size ≥ 150% for elderly users", ok: spec.theme.fontScale >= 1.5, requirementKey: req(/elderly|senior/) });
    checks.push({ label: "High contrast enabled", ok: spec.theme.contrast === "high", requirementKey: req(/elderly|senior/) });
    checks.push({ label: "Reduced motion", ok: spec.theme.motion === "reduced", requirementKey: req(/elderly|senior/) });
  }
  if (/mobile-first|mobile first|mobile/.test(t)) checks.push({ label: "Mobile-first layout", ok: spec.theme.layout === "mobile-first", requirementKey: req(/mobile/) });
  if (/dark theme|dark visual/.test(t) && !/elderly/.test(t)) checks.push({ label: "Dark theme applied", ok: spec.theme.mode === "dark", requirementKey: req(/dark/) });
  if (/light theme|light visual/.test(t)) checks.push({ label: "Light theme applied", ok: spec.theme.mode === "light", requirementKey: req(/light/) });
  if (spec.navigation.items.length > 0) checks.push({ label: `Navigation has ≤ 5 destinations (${spec.navigation.items.length})`, ok: spec.navigation.items.length <= 5 });
  const comps = allComponents(spec);
  for (const r of approved.filter((r) => r.category === "feature")) {
    checks.push({ label: `“${r.title}” is implemented by at least one component`, ok: comps.some((c) => c.requirementKeys.includes(r.key)), requirementKey: r.key });
  }
  const failed = checks.filter((c) => !c.ok);
  return {
    passed: failed.length === 0,
    checks,
    summary: failed.length
      ? `${failed.length} of ${checks.length} checks failed: ${failed.map((f) => f.label).join("; ")}.`
      : `All ${checks.length} acceptance checks passed against the current requirements.`,
  };
}

// ---------------- Impact supplement (inferred, labelled) ----------------

const InferredSchema = z.object({ notes: z.array(z.object({ area: z.string(), note: z.string() })) });

export function impactSupplement(result: ImpactResult, oldText: string, newText: string) {
  return withFallback(
    () =>
      structured({
        system: REVIEWER_SYSTEM,
        schema: InferredSchema,
        prompt:
          `A requirement changed from "${oldText}" to "${newText}". The deterministic dependency engine found:\n` +
          `${JSON.stringify({ affected: result.affectedComponents.map((c) => c.key), unaffected: result.unaffectedComponents.map((c) => c.key) })}\n` +
          `List up to 4 additional, plausible consequences it may have missed (area + one sentence). These will be labelled as inferred.`,
      }),
    () => ({
      notes: [
        ...(/elderly|senior/.test(newText.toLowerCase())
          ? [{ area: "Backend", note: "Reminders may need a phone-call channel for elderly patients; check whether the notification service supports voice." }]
          : []),
        ...(result.categories.backend.length === 0 ? [{ area: "Backend", note: "No API or data-model change detected; backend work can stay as-is." }] : []),
      ],
    }),
  );
}

// ---------------- Reviewer chat ----------------

const ChatSchema = z.object({
  reply: z.string(),
  intent: z.enum(["answer", "new_request", "change_requirement"]),
  requirementKey: z.string(),
  newTitle: z.string(),
  newDescription: z.string(),
});
export type ChatIntent = z.infer<typeof ChatSchema>;

export function reviewerChat(message: string, reqs: ReqLite[], recent: string[]) {
  const approved = reqs.filter((r) => r.status === "approved");
  return withFallback(
    () =>
      structured({
        system: REVIEWER_SYSTEM + " Answer in 1-3 short sentences. You cannot approve anything yourself.",
        schema: ChatSchema,
        prompt:
          `Requirements: ${JSON.stringify(approved.map(({ key, title, description }) => ({ key, title, description })))}\n` +
          `Recent activity: ${recent.slice(0, 8).join(" | ")}\n` +
          `Human message: "${message}"\n` +
          `If they ask to change an existing requirement, set intent=change_requirement with requirementKey/newTitle/newDescription. ` +
          `If they describe new product needs, intent=new_request. Otherwise intent=answer and empty strings for the other fields.`,
      }),
    () => chatRules(message, approved, recent),
  );
}

function chatRules(message: string, approved: ReqLite[], recent: string[]): ChatIntent {
  const m = message.toLowerCase();
  const none = { requirementKey: "", newTitle: "", newDescription: "" };
  const change = m.match(/(?:change|make|switch|update)\s+(?:the\s+)?(audience|theme|layout|target audience)?.*?\bto\b\s+(.+)/);
  if (change) {
    const target = approved.find((r) => (change[1] ? r.category === (change[1].includes("audience") ? "audience" : change[1]) : false)) ?? approved.find((r) => r.category === "audience");
    if (target)
      return { reply: `I'll prepare an impact analysis for changing ${target.key} (“${target.title}”). Nothing changes until humans approve it.`, intent: "change_requirement", requirementKey: target.key, newTitle: capital(change[2]).slice(0, 80), newDescription: capital(change[2]) };
  }
  if (/what (changed|happened)|status|summary|why/.test(m))
    return { reply: recent.length ? `Latest: ${recent.slice(0, 3).join(" • ")}` : "Nothing has happened yet.", intent: "answer", ...none };
  if (/build|app|want|need|should|add/.test(m))
    return { reply: "I'll turn that into structured requirements for you to review.", intent: "new_request", ...none };
  return { reply: `There are ${approved.length} approved requirements. Ask me what changed, or describe what you want to build.`, intent: "answer", ...none };
}

const capital = (s: string) => s.trim().replace(/[.!?]+$/, "").replace(/^./, (c) => c.toUpperCase());
