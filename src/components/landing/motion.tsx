"use client";

import { LazyMotion, m, MotionConfig } from "motion/react";
import { useEffect, type ReactNode } from "react";

/** Lenis smooth scrolling for the page it is mounted on. Off for reduced motion. */
export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let lenis: { destroy: () => void } | null = null;
    let cancelled = false;
    // Loaded after first paint so it never competes with the hero.
    void import("lenis").then(({ default: Lenis }) => {
      if (!cancelled) lenis = new Lenis({ autoRaf: true, anchors: { offset: -96 }, lerp: 0.12 });
    });
    return () => {
      cancelled = true;
      lenis?.destroy();
    };
  }, []);
  return null;
}

const loadFeatures = () => import("./motion-features").then((mod) => mod.default);

/** Loads only the DOM animation features (keeps the bundle small) and honours reduced motion. */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}

/** Fades content up the first time it scrolls into view. */
export function Reveal({ children, delay = 0, className, as = "div" }: { children: ReactNode; delay?: number; className?: string; as?: "div" | "li" }) {
  const C = as === "li" ? m.li : m.div;
  return (
    <C
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -60px 0px" }}
      transition={{ duration: 0.6, delay, ease: [0.2, 0.7, 0.2, 1] }}
    >
      {children}
    </C>
  );
}
