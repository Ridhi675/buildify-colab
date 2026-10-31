// Deterministic "rules engine" that turns approved requirements into an AppSpec.
// It is used (a) as the offline generator when no LLM key is configured,
// (b) to simulate a requirement change for deterministic impact analysis, and
// (c) to keep unaffected components byte-identical during impact-aware rebuilds.

import type { AppSpec, ReqLite, SpecComponent, SpecPage, TextualSpec, Theme } from "../types";

const text = (reqs: ReqLite[]) =>
  reqs
    .filter((r) => r.status === "approved")
    .map((r) => `${r.title} ${r.description}`.toLowerCase())
    .join(" \n ");

const has = (t: string, ...words: string[]) => words.some((w) => t.includes(w));

export function deriveTheme(reqs: ReqLite[]): Theme {
  const t = text(reqs);
  const elderly = has(t, "elderly", "senior", "older adult", "aged");
  const accessible = elderly || has(t, "accessib", "wcag", "high contrast", "low vision");
  const mobile = has(t, "mobile-first", "mobile first", "phone", "mobile");
  const desktopFirst = has(t, "desktop-first", "desktop first");
  // Explicit "light" wins over "dark": the later decision usually names the new state.
  const dark = has(t, "dark theme", "dark mode", "dark visual") && !has(t, "light theme", "light mode", "light visual");
  return {
    mode: dark && !elderly ? "dark" : "light",
    primary: elderly ? "#0b5cad" : has(t, "health", "care", "clinic") ? "#0f766e" : "#4f46e5",
    fontScale: elderly ? 1.5 : accessible ? 1.25 : 1,
    contrast: accessible ? "high" : "standard",
    layout: mobile && !(desktopFirst && !elderly) ? "mobile-first" : "desktop-first",
    motion: elderly || has(t, "lightweight", "reduced motion", "minimal animation") ? "reduced" : "full",
    density: elderly ? "spacious" : accessible ? "comfortable" : "compact",
  };
}

function reqsFor(reqs: ReqLite[], componentKey: string) {
  return reqs.filter((r) => r.status === "approved" && r.components.includes(componentKey)).map((r) => r.key);
}

function comp(reqs: ReqLite[], key: string, type: SpecComponent["type"], title: string, body: string, items: string[] = []): SpecComponent {
  return { key, type, title, body, items, requirementKeys: reqsFor(reqs, key) };
}

export function isHealthcare(reqs: ReqLite[], name = "") {
  return has(text(reqs) + name.toLowerCase(), "health", "appointment", "doctor", "clinic", "patient");
}

/** Build the full spec for the current requirements. */
export function deriveSpec(reqs: ReqLite[], appName: string): AppSpec {
  const t = text(reqs);
  const theme = deriveTheme(reqs);
  const elderly = theme.fontScale >= 1.5;
  const simple = elderly || has(t, "simple navigation", "easy to navigate", "simplified");
  const navStyle: AppSpec["navigation"]["style"] =
    theme.layout === "mobile-first" ? "bottom-tabs" : simple ? "top" : "sidebar";

  let pages: SpecPage[];
  if (isHealthcare(reqs, appName)) {
    const btn = elderly ? "Large, labelled buttons (min 56px)" : "Standard buttons";
    pages = [
      {
        key: "home",
        name: "Home",
        purpose: "Orient the patient and start a booking",
        components: [
          comp(reqs, "home-hero", "hero", elderly ? "Book a doctor in 3 easy steps" : "Find care and book appointments",
            elderly ? "Clear steps, large text and a single main action." : "Search specialists, compare availability and book online.",
            [elderly ? "Call support: 1-800-555-0100" : "Search by specialty or name"]),
          comp(reqs, "doctor-list", "doctor-list", "Available doctors", "Pick a doctor to see open times.",
            ["Dr. Priya Nair — General Practice", "Dr. Samuel Osei — Cardiology", "Dr. Lena Fischer — Dermatology"]),
        ],
      },
      {
        key: "book",
        name: "Book",
        purpose: "Choose a time and confirm details",
        components: [
          comp(reqs, "slot-picker", "slot-picker", "Choose a time", elderly ? "Showing one day at a time." : "Next 7 days of availability.",
            elderly ? ["Mon 9:00 AM", "Mon 11:30 AM", "Mon 2:00 PM"] : ["Mon 9:00", "Mon 9:30", "Tue 10:00", "Tue 14:30", "Wed 8:30", "Thu 16:00"]),
          comp(reqs, "booking-form", "booking-form", "Your details", btn,
            elderly ? ["Full name", "Phone number"] : ["Full name", "Email", "Phone", "Reason for visit", "Insurance ID"]),
        ],
      },
      {
        key: "confirm",
        name: "Confirmation",
        purpose: "Reassure the patient and set reminders",
        components: [
          comp(reqs, "confirmation", "confirmation", "You're booked", "We sent the details to your phone."),
          ...(has(t, "reminder", "notif")
            ? [comp(reqs, "reminders", "reminders", "Reminders", "We'll remind you before your visit.",
                elderly ? ["Phone call 1 day before", "SMS 2 hours before"] : ["Email 1 day before", "Push 1 hour before"])]
            : []),
        ],
      },
    ];
    if (elderly || has(t, "help", "support")) {
      pages.push({
        key: "help",
        name: "Help",
        purpose: "Get assistance by phone or with a family member",
        components: [comp(reqs, "help", "help", "Need help?", "Call us or ask a family member to book for you.", ["Call 1-800-555-0100", "Text size settings"])],
      });
    }
  } else {
    const features = reqs.filter((r) => r.status === "approved" && r.category === "feature");
    pages = [
      {
        key: "home",
        name: "Home",
        purpose: "Explain the product and lead to the main action",
        components: [
          comp(reqs, "home-hero", "hero", appName, reqs.find((r) => r.category === "audience")?.description ?? "A product built collaboratively."),
          comp(reqs, "feature-list", "feature-list", "What you can do", "Key capabilities", features.map((f) => f.title)),
          comp(reqs, "cta", "cta", "Get started", "Primary call to action"),
        ],
      },
      ...features.slice(0, 3).map((f, i) => ({
        key: `feature-${i + 1}`,
        name: f.title.split(" ").slice(0, 3).join(" "),
        purpose: f.description,
        components: [comp(reqs, `feature-${i + 1}-form`, "form" as const, f.title, f.description, f.acceptanceCriteria.slice(0, 4))],
      })),
    ];
  }

  return {
    appName,
    tagline: elderly ? "Simple, readable care booking" : "Book care online",
    theme,
    navigation: { style: navStyle, items: pages.map((p) => p.name) },
    pages,
  };
}

export function allComponents(spec: AppSpec): SpecComponent[] {
  return spec.pages.flatMap((p) => p.components);
}

/**
 * Impact-aware rebuild: regenerate only `affected` component keys and keep every
 * other component exactly as it was in `prev`. Returns the merged spec and the
 * list of component keys whose content actually changed.
 */
export function rebuildSpec(prev: AppSpec, next: AppSpec, affected: Set<string>): { spec: AppSpec; changed: string[] } {
  const prevComps = new Map(allComponents(prev).map((c) => [c.key, c]));
  const changed: string[] = [];
  const pages = next.pages.map((p) => ({
    ...p,
    components: p.components.map((c) => {
      const old = prevComps.get(c.key);
      if (old && !affected.has(c.key)) return old;
      if (!old || JSON.stringify(old) !== JSON.stringify(c)) changed.push(c.key);
      return c;
    }),
  }));
  const themeChanged = JSON.stringify(prev.theme) !== JSON.stringify(next.theme);
  if (themeChanged) changed.push("theme");
  if (JSON.stringify(prev.navigation) !== JSON.stringify(next.navigation)) changed.push("navigation");
  for (const k of prevComps.keys()) if (!allComponents({ ...next, pages }).some((c) => c.key === k)) changed.push(`${k} (removed)`);
  return { spec: { ...next, pages }, changed };
}

/** Human-readable differences between two specs. */
export function diffSpecs(a: AppSpec, b: AppSpec) {
  const out: { kind: "added" | "removed" | "modified"; area: string; detail: string }[] = [];
  const ta = a.theme as Record<string, unknown>;
  const tb = b.theme as Record<string, unknown>;
  const labels: Record<string, string> = {
    mode: "Color mode", primary: "Brand color", fontScale: "Text size", contrast: "Contrast",
    layout: "Layout strategy", motion: "Animations", density: "Spacing",
  };
  for (const k of Object.keys(labels)) {
    if (ta[k] !== tb[k]) out.push({ kind: "modified", area: "Design", detail: `${labels[k]}: ${fmt(k, ta[k])} → ${fmt(k, tb[k])}` });
  }
  if (a.navigation.style !== b.navigation.style)
    out.push({ kind: "modified", area: "Navigation", detail: `Navigation style: ${a.navigation.style} → ${b.navigation.style}` });
  const ca = new Map(allComponents(a).map((c) => [c.key, c]));
  const cb = new Map(allComponents(b).map((c) => [c.key, c]));
  for (const [k, c] of cb) {
    const old = ca.get(k);
    if (!old) out.push({ kind: "added", area: "Component", detail: `${c.title} (${k})` });
    else if (JSON.stringify(old) !== JSON.stringify(c)) {
      const bits: string[] = [];
      if (old.title !== c.title) bits.push(`title “${old.title}” → “${c.title}”`);
      if (old.body !== c.body) bits.push("description updated");
      if (JSON.stringify(old.items) !== JSON.stringify(c.items)) bits.push(old.items.length === c.items.length ? "options reworded" : `${old.items.length} → ${c.items.length} options`);
      if (JSON.stringify(old.requirementKeys) !== JSON.stringify(c.requirementKeys)) bits.push("requirement links changed");
      out.push({ kind: "modified", area: "Component", detail: `${c.title} (${k}): ${bits.join(", ")}` });
    }
  }
  for (const [k, c] of ca) if (!cb.has(k)) out.push({ kind: "removed", area: "Component", detail: `${c.title} (${k})` });
  return out;
}

function fmt(k: string, v: unknown) {
  if (k === "fontScale") return `${Math.round(Number(v) * 100)}%`;
  return String(v);
}

export function deriveTextual(reqs: ReqLite[], spec: AppSpec): TextualSpec {
  const approved = reqs.filter((r) => r.status === "approved");
  const audience = approved.find((r) => r.category === "audience");
  return {
    summary: `${spec.appName}: ${spec.tagline}. ${spec.pages.length} screens, ${spec.theme.layout}, ${spec.theme.mode} theme.`,
    audience: audience ? audience.description : "Not specified yet",
    features: approved.filter((r) => r.category === "feature").map((r) => r.title),
    functionalRequirements: approved.map((r) => `${r.key}: ${r.title}`),
    pages: spec.pages.map((p) => ({ name: p.name, description: `${p.purpose} — ${p.components.map((c) => c.title).join(", ")}` })),
    assumptions: [
      "Preview is rendered from structured JSON; no generated code is executed.",
      `Text size ${Math.round(spec.theme.fontScale * 100)}%, ${spec.theme.contrast} contrast, ${spec.theme.motion} motion.`,
      "Backend endpoints are described, not deployed, in this MVP.",
    ],
    journey: spec.pages.map((p, i) => `${i + 1}. ${p.name}: ${p.purpose}`),
  };
}
