"use client";

import { ArrowRight, LogOut, Menu, X } from "lucide-react";
import { BrandIcon, BrandName } from "../brand";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "../client";
import { ThemeToggle } from "../theme";

export interface NavLink {
  href: string;
  label: string;
}

/** Floating glass pill navbar. Active section (scroll-spy) shows in the accent colour. */
export function Navbar({ links, cta, account, onSignOut }: { links: NavLink[]; cta: ReactNode; account?: ReactNode; onSignOut?: () => void }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<string>(links[0]?.href ?? "");

  useEffect(() => {
    const ids = links.map((l) => l.href).filter((h) => h.startsWith("#"));
    const els = ids.map((id) => document.querySelector(id)).filter(Boolean) as Element[];
    if (!els.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (hit) setActive(`#${hit.target.id}`);
      },
      { rootMargin: "-40% 0px -50% 0px", threshold: [0, 0.25, 0.5] },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [links]);

  const linkCls = (href: string) =>
    cn(
      "rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
      active === href ? "text-accent" : "text-muted-foreground hover:text-foreground",
    );

  return (
    <header className="fixed inset-x-0 top-3 z-40 px-3 sm:top-4 sm:px-6">
      <nav aria-label="Main" className={cn("mx-auto max-w-6xl border border-border/70 bg-surface-glass shadow-sm backdrop-blur-xl transition-[border-radius]", open ? "rounded-3xl" : "rounded-full")}>
        <div className="flex h-14 items-center gap-2 pl-3 pr-2 sm:pl-4">
          <Link href="/" aria-label="ReBrix home" className="flex shrink-0 items-center gap-2 rounded-full font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            <span className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface text-accent"><BrandIcon size={16} /></span>
            <BrandName className="hidden text-base sm:inline" />
          </Link>

          <div className="hidden min-w-0 flex-1 items-center justify-center gap-1 md:flex">
            {links.map((l) => (
              <a key={l.href} href={l.href} className={linkCls(l.href)} aria-current={active === l.href ? "true" : undefined}>{l.label}</a>
            ))}
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-1 md:ml-0">
            <ThemeToggle />
            {account && <div className="hidden items-center sm:flex">{account}</div>}
            {onSignOut && (
              <button onClick={onSignOut} title="Sign out" className="hidden h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring sm:inline-flex">
                <LogOut size={14} /> Sign out
              </button>
            )}
            <div className="hidden sm:block">{cta}</div>
            <button
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring md:hidden"
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              onClick={() => setOpen((o) => !o)}
            >
              {open ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>

        {open && (
          <div className="animate-in border-t border-border/70 px-3 pb-3 pt-2 md:hidden">
            {links.map((l) => (
              <a key={l.href} href={l.href} onClick={() => setOpen(false)} className={cn("block", linkCls(l.href), "px-3 py-2.5 text-sm")}>{l.label}</a>
            ))}
            <div className="mt-2 flex items-center gap-2 px-1" onClick={() => setOpen(false)}>
              {cta}
              {onSignOut && (
                <button onClick={onSignOut} className="inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-muted-foreground hover:bg-muted">
                  <LogOut size={14} /> Sign out
                </button>
              )}
            </div>
          </div>
        )}
      </nav>
    </header>
  );
}

/** White pill call-to-action used in the navbar. */
export function PillCta({ children, onClick, href }: { children: ReactNode; onClick?: () => void; href?: string }) {
  const cls =
    "glow-btn group inline-flex h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-accent px-5 text-[13px] font-semibold text-accent-foreground shadow-sm transition hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
  const inner = (
    <>
      {children}
      <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
    </>
  );
  return href ? <a href={href} className={cls}>{inner}</a> : <button type="button" onClick={onClick} className={cls}>{inner}</button>;
}
