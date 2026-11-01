// Website templates: which pages a product has and which sections are on them.
// Bunty (or the rules engine) then writes the copy from the requirements, and the
// theme still comes from requirements + preview feedback.
//
// Layouts are adapted from Start Bootstrap's free templates (MIT licence,
// Copyright 2013-2023 Start Bootstrap LLC, https://startbootstrap.com):
// Landing Page, Shop Homepage, Business Casual, Agency and Freelancer.

import type { ReqLite, SpecComponent, SpecPage } from "../types";

export const TEMPLATE_KEYS = ["auto", "booking", "landing", "store", "restaurant", "event", "portfolio"] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

export interface TemplateInfo {
  key: TemplateKey;
  name: string;
  description: string;
  /** Start Bootstrap template the layout is adapted from. */
  basedOn?: string;
  /** Accent used when the requirements don't ask for a colour. */
  accent?: string;
  tagline: string;
  /** Name used for the picker's thumbnail. */
  sampleName: string;
}

export const TEMPLATES: Record<TemplateKey, TemplateInfo> = {
  auto: { key: "auto", name: "Let Bunty decide", description: "Pick a layout from the requirements (booking flow or home + feature pages).", tagline: "Built with ReBrix", sampleName: "Your product" },
  booking: { key: "booking", name: "Appointment booking", description: "Pick a provider and a time, enter details, get a confirmation.", tagline: "Book online in three steps", sampleName: "CareConnect", accent: "#0f766e" },
  landing: { key: "landing", name: "Landing page", description: "Hero, features, testimonials, pricing and a contact form.", basedOn: "Landing Page", tagline: "Everything you need, nothing you don't", sampleName: "Launchpad", accent: "#4f46e5" },
  store: { key: "store", name: "Online store", description: "Product grid with sale prices, a cart and checkout.", basedOn: "Shop Homepage", tagline: "Shop in style", sampleName: "Thread & Co.", accent: "#111827" },
  restaurant: { key: "restaurant", name: "Restaurant / café", description: "Menu with prices, opening hours and table reservations.", basedOn: "Business Casual", tagline: "Fresh food, good company", sampleName: "The Corner Café", accent: "#b45309" },
  event: { key: "event", name: "Event", description: "Schedule, speakers and a registration form.", basedOn: "Agency", tagline: "Two days of talks and workshops", sampleName: "DevFest 2026", accent: "#7c3aed" },
  portfolio: { key: "portfolio", name: "Portfolio", description: "About, a project gallery and a contact form.", basedOn: "Freelancer", tagline: "Designer and developer", sampleName: "Riya Sharma", accent: "#0891b2" },
};

export const isTemplate = (k: string): k is TemplateKey => (TEMPLATE_KEYS as readonly string[]).includes(k);

type Comp = (key: string, type: SpecComponent["type"], title: string, body: string, items?: string[]) => SpecComponent;

interface Ctx {
  appName: string;
  audience?: string;
  features: ReqLite[];
  comp: Comp;
}

/** Pages for the section-based templates (booking and auto live in spec.ts). */
export function templatePages(key: Exclude<TemplateKey, "auto" | "booking">, ctx: Ctx): SpecPage[] {
  const { appName, comp } = ctx;
  const featureTitles = ctx.features.map((f) => f.title).slice(0, 6);
  switch (key) {
    case "landing":
      return [
        {
          key: "home",
          name: "Home",
          purpose: "Explain the product and lead to sign-up",
          components: [
            comp("home-hero", "hero", appName, ctx.audience ?? "A simple way to get more done, built with the people who use it.", ["Free to start"]),
            comp("features", "feature-list", "Why people choose us", "Everything important, in one place.", featureTitles.length ? featureTitles : ["Fully responsive", "Fast to set up", "Easy to use"]),
            comp("testimonials", "testimonials", "What people are saying", "", ["“It saved our team hours every week.” — Margaret E.", "“Setup took five minutes.” — Fred S.", "“The best tool we adopted this year.” — Sarah W."]),
          ],
        },
        {
          key: "pricing",
          name: "Pricing",
          purpose: "Compare plans and choose one",
          components: [comp("pricing", "pricing", "Simple pricing", "Start free, upgrade when you grow.", ["Starter — $0 — 1 project, community support", "Team — $12 — Unlimited projects, priority support", "Business — $39 — SSO, audit log, dedicated help"])],
        },
        {
          key: "contact",
          name: "Contact",
          purpose: "Get in touch with the team",
          components: [comp("contact", "contact", "Get in touch", "We usually reply within a day.", ["Name", "Email", "Message"])],
        },
      ];
    case "store":
      return [
        {
          key: "shop",
          name: "Shop",
          purpose: "Browse products and add them to the cart",
          components: [
            comp("home-hero", "hero", appName, ctx.audience ?? "Quality pieces, fair prices, delivered to your door.", ["Free delivery over $50"]),
            comp("product-grid", "product-grid", "Products", "New arrivals and best sellers.", ["Classic Tee — $25", "Denim Jacket — $80 — $64", "Canvas Tote — $18", "Linen Shirt — $45", "Wool Beanie — $20 — $15", "Leather Belt — $35"]),
          ],
        },
        {
          key: "cart",
          name: "Cart",
          purpose: "Review the cart and continue to checkout",
          components: [comp("cart", "cart", "Your cart", "Change quantities or remove items.")],
        },
        {
          key: "checkout",
          name: "Checkout",
          purpose: "Enter delivery details and place the order",
          components: [comp("checkout", "checkout", "Checkout", "We'll email your receipt.", ["Full name", "Email", "Delivery address", "Phone"])],
        },
        {
          key: "confirm",
          name: "Order placed",
          purpose: "Confirm the order",
          components: [comp("confirmation", "confirmation", "Thank you for your order", "We've received it and will ship it soon.")],
        },
      ];
    case "restaurant":
      return [
        {
          key: "home",
          name: "Menu",
          purpose: "See what's cooking today",
          components: [
            comp("home-hero", "hero", appName, ctx.audience ?? "Seasonal food and great coffee, made fresh every day.", ["Open today until 10pm"]),
            comp("menu", "menu", "Menu", "Prices include taxes.", ["Masala Dosa — ₹120 — Crispy rice crepe with spiced potato", "Paneer Tikka — ₹220 — Charred cottage cheese, mint chutney", "Veg Biryani — ₹180 — Fragrant rice, raita", "Filter Coffee — ₹60 — South Indian style", "Gulab Jamun — ₹90 — Two pieces, warm"]),
          ],
        },
        {
          key: "reserve",
          name: "Reserve",
          purpose: "Book a table",
          components: [comp("reservation", "contact", "Reserve a table", "We'll confirm by phone.", ["Name", "Phone", "Date", "Time", "Guests"])],
        },
        {
          key: "visit",
          name: "Find us",
          purpose: "Opening hours and address",
          components: [
            comp("hours", "hours", "Opening hours", "", ["Mon–Fri · 8:00–22:00", "Saturday · 9:00–23:00", "Sunday · 9:00–21:00"]),
            comp("address", "text", "Find us", "12 Mall Road, Patiala · Call 98765 43210", []),
          ],
        },
      ];
    case "event":
      return [
        {
          key: "home",
          name: "Event",
          purpose: "What, when and where",
          components: [
            comp("home-hero", "hero", appName, ctx.audience ?? "Talks, workshops and good conversations. 14–15 March · Main Auditorium.", ["Limited seats"]),
            comp("schedule", "schedule", "Schedule", "Day 1", ["09:00 — Registration and breakfast", "10:00 — Opening keynote", "11:30 — Workshops", "13:00 — Lunch", "14:00 — Lightning talks", "17:00 — Closing and networking"]),
          ],
        },
        {
          key: "speakers",
          name: "Speakers",
          purpose: "Meet the speakers",
          components: [comp("speakers", "team", "Speakers", "Practitioners sharing what works.", ["Ananya Gupta — Product lead", "Karan Mehta — Engineer", "Sara Khan — Designer"])],
        },
        {
          key: "register",
          name: "Register",
          purpose: "Save a seat",
          components: [comp("registration", "contact", "Register", "Entry is free; seats are limited.", ["Full name", "Email", "College / company", "Track"])],
        },
      ];
    case "portfolio":
      return [
        {
          key: "home",
          name: "About",
          purpose: "Who I am and what I do",
          components: [
            comp("home-hero", "hero", appName, ctx.audience ?? "I design and build clear, friendly digital products.", ["Available for freelance work"]),
            comp("about", "text", "About", "Five years of shipping web and mobile products for startups and nonprofits.", featureTitles.length ? featureTitles : ["UI and UX design", "Front-end development", "Design systems"]),
          ],
        },
        {
          key: "work",
          name: "Projects",
          purpose: "Selected work",
          components: [comp("gallery", "gallery", "Projects", "A few things I'm proud of.", ["Cabin booking app — Mobile", "Fintech dashboard — Web", "Café brand — Identity", "Clinic website — Web", "Habit tracker — Mobile", "Charity campaign — Design"])],
        },
        {
          key: "contact",
          name: "Contact",
          purpose: "Start a project together",
          components: [comp("contact", "contact", "Contact me", "Tell me about your project.", ["Name", "Email", "Phone", "Message"])],
        },
      ];
  }
}

/** The section that carries any approved feature not tied to a specific section (keeps validation honest). */
export const PRIMARY_SECTION: Record<Exclude<TemplateKey, "auto" | "booking">, string> = {
  landing: "features",
  store: "product-grid",
  restaurant: "menu",
  event: "schedule",
  portfolio: "gallery",
};

/** Component catalogue for a new project on this template (used by Ripple's dependency graph). */
export function templateCatalogue(key: Exclude<TemplateKey, "auto" | "booking">): { components: [string, string, string][]; deps: [string, string][] } {
  const sections = templatePages(key, { appName: "", features: [], comp: (k, type, title) => ({ key: k, type, title, body: "", items: [], requirementKeys: [] }) }).flatMap((p) => p.components);
  const components: [string, string, string][] = [
    ["nav", "Navigation", "frontend"],
    ...sections.map((c): [string, string, string] => [c.key, c.title || c.key, "frontend"]),
    ["typography", "Typography scale", "design"], ["color-theme", "Color theme", "design"], ["layout-grid", "Layout grid", "design"],
    ["api", "Application API", "backend"], ["a11y-tests", "Accessibility tests", "testing"], ["viewport-tests", "Viewport tests", "testing"],
  ];
  const forms = sections.filter((c) => ["contact", "checkout", "cart", "form"].includes(c.type)).map((c) => c.key);
  const deps: [string, string][] = [["nav", "typography"], ["home-hero", "typography"], ["nav", "layout-grid"], ["a11y-tests", "typography"], ["viewport-tests", "layout-grid"], ...forms.map((k): [string, string] => [k, "api"])];
  return { components, deps };
}
