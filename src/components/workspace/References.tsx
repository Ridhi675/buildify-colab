"use client";

import { FileCode2, ImagePlus, X } from "lucide-react";
import { useRef } from "react";
import { Button } from "../ui";
import { ACCEPT, analyzeReference } from "./referenceFiles";
import { useWs } from "./shared";

/** Optional "Upload reference" button: a screenshot or HTML/CSS template the preview should take after. */
export function UploadReferenceButton() {
  const { state, run, toast } = useWs();
  const input = useRef<HTMLInputElement>(null);
  if (state.me.role === "observer") return null;

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const reference = await analyzeReference(file);
      await run({ type: "add_reference", reference }, "Reference added — the next preview will follow it");
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      if (input.current) input.current.value = "";
    }
  };

  return (
    <>
      <input ref={input} type="file" accept={ACCEPT} className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
      <Button
        variant="secondary"
        title="Optional: a screenshot or HTML/CSS template of a website you like"
        onClick={() => input.current?.click()}
      >
        <ImagePlus size={15} /> Upload reference <span className="font-normal text-muted-foreground">(optional)</span>
      </Button>
    </>
  );
}

/** The uploaded references with what ReBrix took from each, plus remove buttons. */
export function ReferenceChips() {
  const { state, run } = useWs();
  const refs = state.references;
  if (!refs.length) return null;
  const canEdit = state.me.role !== "observer";

  return (
    <div className="mt-4 w-full text-left">
      <div className="mb-2 text-xs text-muted-foreground">
        Design references — previews take their colours, light/dark style and layout from these. They aren’t copied pixel for pixel.
      </div>
      <ul className="flex flex-wrap gap-2">
        {refs.map((r) => {
          const took = [r.mode && `${r.mode} theme`, r.accent && "brand colour", r.layout?.replace("-", " ")].filter(Boolean).join(" · ");
          return (
            <li key={r.id} className="flex max-w-full items-center gap-2.5 rounded-2xl border border-border bg-surface py-1.5 pl-1.5 pr-2 shadow-xs">
              {r.thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.thumb} alt="" className="h-10 w-14 shrink-0 rounded-lg border border-border object-cover" />
              ) : (
                <span className="flex h-10 w-14 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-muted text-muted-foreground"><FileCode2 size={18} /></span>
              )}
              <div className="min-w-0">
                <div className="max-w-[180px] truncate text-xs font-medium text-foreground" title={r.name}>{r.name}</div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <span className="flex -space-x-1">
                    {r.palette.slice(0, 5).map((c) => (
                      <span key={c} className="h-3.5 w-3.5 rounded-full ring-2 ring-surface" style={{ background: c }} title={c} />
                    ))}
                  </span>
                  <span className="truncate text-[11px] text-muted-foreground">{took || "colours only"}</span>
                </div>
              </div>
              {canEdit && (
                <button
                  onClick={() => run({ type: "remove_reference", id: r.id }, "Reference removed")}
                  aria-label={`Remove ${r.name}`}
                  className="ml-1 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <X size={13} />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
