// Users, the resettable CareConnect demo project, and new-project creation.

import { db, type Tx } from "../db";
import { templateCatalogue, type TemplateKey } from "../engine/templates";

export const USERS = [
  { id: "u_aisha", name: "Aisha Rao", title: "Founder / Product Manager", color: "#e11d48", role: "founder" },
  { id: "u_daniel", name: "Daniel Okafor", title: "Product Designer", color: "#2563eb", role: "designer" },
  { id: "u_guest", name: "Sam Lee", title: "Stakeholder (observer)", color: "#64748b", role: "observer" },
];

export const DEMO_ID = "careconnect";

const COMPONENTS: [string, string, string, string][] = [
  ["nav", "Navigation bar", "frontend", "Top-level navigation between screens"],
  ["home-hero", "Home hero", "frontend", "Welcome message and primary action"],
  ["doctor-list", "Doctor list", "frontend", "Browse available doctors"],
  ["slot-picker", "Time-slot picker", "frontend", "Choose an available appointment time"],
  ["booking-form", "Booking form", "frontend", "Patient details and confirmation button"],
  ["confirmation", "Confirmation screen", "frontend", "Booking summary"],
  ["reminders", "Reminder settings", "frontend", "How and when reminders are sent"],
  ["help", "Help & support", "frontend", "Phone support and text-size settings"],
  ["typography", "Typography scale", "design", "Font sizes and line heights"],
  ["color-theme", "Color theme & contrast", "design", "Color tokens and contrast"],
  ["layout-grid", "Layout grid", "design", "Breakpoints and page structure"],
  ["appointments-api", "Appointments API", "backend", "Create and list appointments"],
  ["patient-db", "Patient records", "backend", "Patient profile storage"],
  ["notification-service", "Notification service", "backend", "Email / SMS / call reminders"],
  ["a11y-tests", "Accessibility tests", "testing", "Contrast, focus and text-size checks"],
  ["viewport-tests", "Viewport tests", "testing", "Mobile and desktop layout checks"],
  ["booking-e2e", "Booking end-to-end test", "testing", "Full booking journey"],
];

const COMPONENT_DEPS: [string, string][] = [
  ["booking-form", "slot-picker"],
  ["slot-picker", "doctor-list"],
  ["doctor-list", "appointments-api"],
  ["appointments-api", "patient-db"],
  ["reminders", "notification-service"],
  ["nav", "typography"],
  ["nav", "layout-grid"],
  ["home-hero", "typography"],
  ["booking-form", "typography"],
  ["help", "typography"],
  ["a11y-tests", "typography"],
  ["a11y-tests", "color-theme"],
  ["viewport-tests", "layout-grid"],
  ["booking-e2e", "booking-form"],
];

export async function ensureUsers() {
  for (const u of USERS)
    await db.user.upsert({ where: { id: u.id }, create: { id: u.id, name: u.name, title: u.title, color: u.color }, update: { name: u.name, title: u.title, color: u.color } });
}

async function scaffold(tx: Tx, projectId: string, withComponents: boolean, members: { id: string; role: string }[] = USERS) {
  for (const u of members) await tx.projectMember.create({ data: { projectId, userId: u.id, role: u.role } });
  await tx.agent.create({ data: { projectId, key: "reviewer", name: "Bunty", role: "AI Strategist" } });
  await tx.agent.create({ data: { projectId, key: "builder", name: "Babli", role: "AI Builder" } });
  if (withComponents) {
    await tx.component.createMany({ data: COMPONENTS.map(([key, name, category, description]) => ({ projectId, key, name, category, description })) });
    await tx.componentDependency.createMany({ data: COMPONENT_DEPS.map(([fromKey, toKey]) => ({ projectId, fromKey, toKey })) });
  }
  await tx.contextVersion.create({ data: { projectId, number: 0, snapshot: JSON.stringify({ requirements: [] }), reason: "Project created", authorId: "system" } });
}

/** Wipe and recreate the CareConnect demo at its starting point (step 1). */
export async function resetDemo() {
  await ensureUsers();
  await db.requirementDependency.deleteMany({ where: { projectId: DEMO_ID } });
  await db.componentDependency.deleteMany({ where: { projectId: DEMO_ID } });
  await db.project.deleteMany({ where: { id: DEMO_ID } });
  await db.$transaction(async (tx) => {
    await tx.project.create({
      data: { id: DEMO_ID, name: "CareConnect", description: "Accessible healthcare appointment booking", ownerId: "u_aisha", isDemo: true },
    });
    await scaffold(tx, DEMO_ID, true);
    await tx.activityEvent.create({
      data: { projectId: DEMO_ID, actorId: "system", actorName: "System", actorKind: "system", action: "Demo project reset", outcome: "Two humans and two agents ready", contextVersion: 0 },
    });
  });
  return DEMO_ID;
}

/** Add a template's components and dependencies that the project doesn't have yet (Ripple uses them). */
export async function addCatalogue(tx: Tx, projectId: string, template: TemplateKey) {
  if (template === "auto" || template === "booking") return;
  const { components, deps } = templateCatalogue(template);
  const have = new Set((await tx.component.findMany({ where: { projectId }, select: { key: true } })).map((c) => c.key));
  const fresh = components.filter(([key]) => !have.has(key));
  if (fresh.length) await tx.component.createMany({ data: fresh.map(([key, name, category]) => ({ projectId, key, name, category })) });
  const haveDeps = new Set((await tx.componentDependency.findMany({ where: { projectId } })).map((d) => `${d.fromKey}>${d.toKey}`));
  const newDeps = deps.filter(([a, b]) => !haveDeps.has(`${a}>${b}`));
  if (newDeps.length) await tx.componentDependency.createMany({ data: newDeps.map(([fromKey, toKey]) => ({ projectId, fromKey, toKey })) });
}

export async function createProject(ownerId: string, name: string, description: string, healthcare: boolean, template: TemplateKey = "auto") {
  await ensureUsers();
  const healthcareComponents = healthcare || template === "booking";
  return db.$transaction(async (tx) => {
    const p = await tx.project.create({ data: { name, description, ownerId, template } });
    // Demo people share their projects with each other; a real account starts
    // alone as founder and invites teammates with a link.
    const members = USERS.some((u) => u.id === ownerId) ? USERS : [{ id: ownerId, role: "founder" }];
    await scaffold(tx, p.id, healthcareComponents, members);
    if (template !== "auto" && template !== "booking") await addCatalogue(tx, p.id, template);
    else if (!healthcareComponents) {
      // Generic component catalogue for non-healthcare products.
      const generic: [string, string, string][] = [
        ["nav", "Navigation", "frontend"], ["home-hero", "Home hero", "frontend"], ["feature-list", "Feature list", "frontend"], ["cta", "Call to action", "frontend"],
        ["feature-1-form", "Feature 1 screen", "frontend"], ["feature-2-form", "Feature 2 screen", "frontend"], ["feature-3-form", "Feature 3 screen", "frontend"],
        ["typography", "Typography scale", "design"], ["color-theme", "Color theme", "design"], ["layout-grid", "Layout grid", "design"],
        ["api", "Application API", "backend"], ["a11y-tests", "Accessibility tests", "testing"], ["viewport-tests", "Viewport tests", "testing"],
      ];
      await tx.component.createMany({ data: generic.map(([key, n, category]) => ({ projectId: p.id, key, name: n, category })) });
      await tx.componentDependency.createMany({
        data: [["nav", "typography"], ["home-hero", "typography"], ["nav", "layout-grid"], ["a11y-tests", "typography"], ["viewport-tests", "layout-grid"], ["feature-1-form", "api"], ["feature-2-form", "api"], ["feature-3-form", "api"]].map(([fromKey, toKey]) => ({ projectId: p.id, fromKey, toKey })),
      });
    }
    await tx.activityEvent.create({ data: { projectId: p.id, actorId: ownerId, actorName: "Owner", actorKind: "human", action: "Created project", target: name, contextVersion: 0 } });
    return p;
  });
}
