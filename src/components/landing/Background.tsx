"use client";

import { useEffect, useRef } from "react";

/**
 * Full-page backdrop that follows the cursor: a dim light square under the
 * pointer, a faint grid, and colour blobs with a little parallax.
 * The cursor position eases toward the pointer in a rAF loop that only runs
 * while it is catching up, and only CSS variables change (no React renders).
 */
export function CursorBackground() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let tx = window.innerWidth / 2;
    let ty = window.innerHeight * 0.35;
    let x = tx;
    let y = ty;
    let raf = 0;

    const apply = () => {
      el.style.setProperty("--mx", `${x}px`);
      el.style.setProperty("--my", `${y}px`);
      el.style.setProperty("--px", (x / window.innerWidth - 0.5).toFixed(4));
      el.style.setProperty("--py", (y / window.innerHeight - 0.5).toFixed(4));
    };
    const tick = () => {
      x += (tx - x) * 0.14;
      y += (ty - y) * 0.14;
      apply();
      raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.4 ? requestAnimationFrame(tick) : 0;
    };
    const move = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      tx = e.clientX;
      ty = e.clientY;
      el.dataset.active = "";
      if (reduce) {
        x = tx;
        y = ty;
        apply();
      } else if (!raf) raf = requestAnimationFrame(tick);
    };

    apply();
    window.addEventListener("pointermove", move, { passive: true });
    return () => {
      window.removeEventListener("pointermove", move);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={ref} aria-hidden className="cursor-bg pointer-events-none fixed inset-0 z-0 overflow-hidden bg-page">
      <div className="cursor-parallax absolute inset-0" style={{ ["--depth" as string]: "-36px" }}>
        <div className="aurora aurora-1 left-[-12%] top-[-18%] h-[620px] w-[620px]" />
        <div className="aurora aurora-3 right-[-10%] top-[30%] h-[520px] w-[620px] opacity-60" />
      </div>
      <div className="cursor-parallax absolute inset-0" style={{ ["--depth" as string]: "22px" }}>
        <div className="aurora aurora-2 left-[35%] top-[55%] h-[420px] w-[520px] opacity-50" />
      </div>
      <div className="absolute inset-0 overflow-hidden">
        <div className="bg-grid bg-grid-drift" />
      </div>
      <div className="cursor-square" />
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-background to-transparent" />
    </div>
  );
}
