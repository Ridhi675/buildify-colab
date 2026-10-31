import { z } from "zod";

// ---------- App specification (the shared product artifact) ----------
// Previews and built artifacts are structured JSON rendered by a safe React
// renderer. No generated code is ever executed.

export const COMPONENT_TYPES = [
  "nav",
  "hero",
  "doctor-list",
  "slot-picker",
  "booking-form",
  "confirmation",
  "reminders",
  "help",
  "feature-list",
  "form",
  "list",
  "stats",
  "text",
  "cta",
] as const;

export const ThemeSchema = z.object({
  mode: z.enum(["light", "dark"]),
  primary: z.string(),
  fontScale: z.number(),
  contrast: z.enum(["standard", "high"]),
  layout: z.enum(["desktop-first", "mobile-first"]),
  motion: z.enum(["full", "reduced"]),
  density: z.enum(["compact", "comfortable", "spacious"]),
});

export const SpecComponentSchema = z.object({
  key: z.string(),
  type: z.enum(COMPONENT_TYPES),
  title: z.string(),
  body: z.string(),
  items: z.array(z.string()),
  requirementKeys: z.array(z.string()),
});

export const SpecPageSchema = z.object({
  key: z.string(),
  name: z.string(),
  purpose: z.string(),
  components: z.array(SpecComponentSchema),
});

export const AppSpecSchema = z.object({
  appName: z.string(),
  tagline: z.string(),
  theme: ThemeSchema,
  navigation: z.object({ style: z.enum(["top", "sidebar", "bottom-tabs"]), items: z.array(z.string()) }),
  pages: z.array(SpecPageSchema),
});

export type Theme = z.infer<typeof ThemeSchema>;
export type SpecComponent = z.infer<typeof SpecComponentSchema>;
export type SpecPage = z.infer<typeof SpecPageSchema>;
export type AppSpec = z.infer<typeof AppSpecSchema>;

export const TextualSpecSchema = z.object({
  summary: z.string(),
  audience: z.string(),
  features: z.array(z.string()),
  functionalRequirements: z.array(z.string()),
  pages: z.array(z.object({ name: z.string(), description: z.string() })),
  assumptions: z.array(z.string()),
  journey: z.array(z.string()),
});
export type TextualSpec = z.infer<typeof TextualSpecSchema>;

// ---------- Requirements ----------

export const CATEGORIES = ["audience", "layout", "theme", "accessibility", "feature", "performance", "data"] as const;
export const PRIORITIES = ["must", "high", "medium", "low"] as const;

export const ProposedRequirementSchema = z.object({
  title: z.string(),
  description: z.string(),
  category: z.enum(CATEGORIES),
  priority: z.enum(PRIORITIES),
  acceptanceCriteria: z.array(z.string()),
  components: z.array(z.string()),
});
export type ProposedRequirement = z.infer<typeof ProposedRequirementSchema>;

export const SimplifyResultSchema = z.object({
  productName: z.string(),
  ambiguities: z.array(z.string()),
  requirements: z.array(ProposedRequirementSchema),
});
export type SimplifyResult = z.infer<typeof SimplifyResultSchema>;

/** Minimal requirement shape the pure engine works with. */
export interface ReqLite {
  key: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  version: number;
  components: string[];
  acceptanceCriteria: string[];
}

export interface CompLite {
  key: string;
  name: string;
  category: string;
}

export interface EdgeLite {
  fromKey: string;
  toKey: string;
  inferred?: boolean;
}

export interface TaskLite {
  id: string;
  title: string;
  status: string;
  agentKey: string;
  requirementKeys: string[];
}

export type ImpactCategory = "frontend" | "backend" | "design" | "testing";

export interface ImpactResult {
  changedKey: string;
  affectedRequirements: { key: string; title: string; via: string }[];
  affectedComponents: { key: string; name: string; category: string; reason: string; inferred: boolean }[];
  unaffectedComponents: { key: string; name: string; category: string }[];
  categories: Record<ImpactCategory, string[]>;
  staleTasks: { id: string; title: string; agentKey: string; status: string }[];
  agents: { key: string; effect: string }[];
  effortHours: number;
  severity: "low" | "medium" | "high";
  confidence: "high" | "medium" | "low";
  steps: string[];
  inferred: { area: string; note: string }[];
  specDiff: string[];
}
