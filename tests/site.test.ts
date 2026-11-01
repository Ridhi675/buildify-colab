import { describe, expect, it } from "vitest";
import { applyDesignFeedback, deriveSpec, deriveTheme } from "@/lib/engine/spec";
import { renderSite, siteFileName } from "@/lib/engine/site";
import { validateSpec } from "@/lib/ai/agents";
import type { ReqLite } from "@/lib/types";

const reqs: ReqLite[] = [
  { key: "REQ-001", title: "General adult patients", description: "Adults booking appointments", category: "audience", priority: "high", status: "approved", version: 1, components: ["home-hero"], acceptanceCriteria: [] },
  { key: "REQ-002", title: "Appointment scheduling", description: "Pick a doctor and slot", category: "feature", priority: "must", status: "approved", version: 1, components: ["doctor-list", "slot-picker", "booking-form"], acceptanceCriteria: [] },
  { key: "REQ-003", title: "Dark visual theme", description: "Dark color scheme", category: "theme", priority: "medium", status: "approved", version: 1, components: ["color-theme"], acceptanceCriteria: [] },
];

describe("preview feedback → theme", () => {
  it("switches dark to light from plain language", () => {
    const base = deriveTheme(reqs);
    expect(base.mode).toBe("dark");
    const r = applyDesignFeedback(base, ["change theme from dark to light"]);
    expect(r.theme.mode).toBe("light");
    expect(r.applied).toContain("mode");
  });

  it("applies the newest note last and treats 'light blue' as a colour, not a mode", () => {
    const r = applyDesignFeedback(deriveTheme(reqs), ["make it light", "use light blue buttons and bigger text"]);
    expect(r.theme.mode).toBe("light");
    expect(r.theme.primary).toBe("#2563eb");
    expect(r.theme.fontScale).toBe(1.25);
    expect(applyDesignFeedback(r.theme, ["actually go back to dark mode"]).theme.mode).toBe("dark");
  });

  it("leaves the theme alone for unrelated feedback", () => {
    const base = deriveTheme(reqs);
    expect(applyDesignFeedback(base, ["rename the hero heading"])).toEqual({ theme: base, applied: [] });
  });

  it("validation accepts a mode that humans changed through feedback", () => {
    const spec = deriveSpec(reqs, "CareConnect");
    spec.theme = applyDesignFeedback(spec.theme, ["switch to light theme"]).theme;
    expect(validateSpec(spec, reqs).checks.find((c) => c.label === "Dark theme applied")?.ok).toBe(false);
    const v = validateSpec(spec, reqs, ["mode"]);
    expect(v.checks.some((c) => c.label.startsWith("Light theme applied"))).toBe(true);
    expect(v.checks.find((c) => c.label === "Dark theme applied")).toBeUndefined();
  });
});

describe("standalone website export", () => {
  it("renders every page, the theme and a working runtime into one HTML file", () => {
    const spec = deriveSpec(reqs, "CareConnect");
    const html = renderSite(spec);
    expect(html.startsWith("<!doctype html>")).toBe(true);
    for (const p of spec.pages) expect(html).toContain(`data-page="${p.key}"`);
    expect(html).toContain("--bg:#0b1220"); // dark theme
    expect(html).toContain("data-booking");
    expect(html).toContain('addEventListener("submit"');
    expect(siteFileName(spec)).toBe("careconnect.html");
  });

  it("escapes spec text so LLM output can never inject markup or script", () => {
    const spec = deriveSpec(reqs, `Evil <script>alert(1)</script> "app"`);
    spec.pages[0].components[0].title = `<img src=x onerror=alert(1)>`;
    const html = renderSite(spec);
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<script>alert(1)");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html.match(/<script>/g)).toHaveLength(1); // only the fixed runtime
  });

  it("turns generic feature pages into forms that save entries", () => {
    const generic: ReqLite[] = [
      { key: "REQ-001", title: "Post retro notes", description: "Team members post went-well and to-improve notes", category: "feature", priority: "must", status: "approved", version: 1, components: [], acceptanceCriteria: ["User can post a note to a column", "Notes show the author"] },
    ];
    const html = renderSite(deriveSpec(generic, "Retro Board"));
    expect(html).toContain('data-entries="feature-1-form"');
    expect(html).toContain('name="Title"');
    expect(html).toContain("User can post a note to a column");
  });
});
