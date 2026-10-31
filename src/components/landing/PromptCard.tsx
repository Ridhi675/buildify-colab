"use client";

import { ArrowUp, Plus } from "lucide-react";
import { cn } from "../client";
import { onGlowMove } from "../effects";

/** Large prompt input: textarea, + button, one toggle chip and a round send button. */
export function PromptCard({
  value,
  onChange,
  onSubmit,
  onPlus,
  toggle,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onPlus: () => void;
  toggle: { label: string; on: boolean; onChange: (on: boolean) => void; title?: string };
  placeholder: string;
}) {
  const can = value.trim().length > 0;
  return (
    <form
      className="glow-card w-full rounded-3xl border border-border bg-surface text-left shadow-md"
      onPointerMove={onGlowMove}
      onSubmit={(e) => {
        e.preventDefault();
        if (can) onSubmit();
      }}
    >
      <label htmlFor="prompt" className="sr-only">Describe your product</label>
      <textarea
        id="prompt"
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && can) {
            e.preventDefault();
            onSubmit();
          }
        }}
        placeholder={placeholder}
        className="block w-full resize-none rounded-t-3xl bg-transparent px-5 pt-5 text-[15px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/70 sm:px-6 sm:pt-6"
      />
      <div className="flex items-center gap-2 px-3 pb-3 pt-4 sm:px-4 sm:pb-4">
        <button type="button" onClick={onPlus} aria-label="Open the new project form" title="New project" className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
          <Plus size={18} />
        </button>
        <button
          type="button"
          role="switch"
          aria-checked={toggle.on}
          title={toggle.title}
          onClick={() => toggle.onChange(!toggle.on)}
          className={cn(
            "inline-flex h-8 items-center gap-2 rounded-full border px-3 text-xs font-medium transition focus-visible:outline-2 focus-visible:outline-ring",
            toggle.on ? "border-accent/30 bg-accent-soft text-accent" : "border-border bg-surface text-muted-foreground hover:text-foreground",
          )}
        >
          {toggle.label}
          <span className={cn("relative h-3.5 w-6 rounded-full transition-colors", toggle.on ? "bg-accent" : "bg-border-strong")}>
            <span className={cn("absolute top-0.5 h-2.5 w-2.5 rounded-full bg-surface shadow-xs transition-transform", toggle.on ? "translate-x-3" : "translate-x-0.5")} />
          </span>
        </button>
        <button
          type="submit"
          disabled={!can}
          aria-label="Continue"
          className="glow-btn ml-auto inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <ArrowUp size={17} />
        </button>
      </div>
    </form>
  );
}

/** Rounded suggestion chips under the prompt card. */
export function SuggestionChips({ items, onPick }: { items: string[]; onPick: (s: string) => void }) {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {items.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onPick(s)}
          className="rounded-full border border-border bg-surface/70 px-4 py-2 text-[13px] font-medium text-foreground/80 shadow-xs backdrop-blur transition hover:-translate-y-0.5 hover:border-border-strong hover:text-foreground hover:shadow-sm focus-visible:outline-2 focus-visible:outline-ring"
        >
          {s}
        </button>
      ))}
    </div>
  );
}
