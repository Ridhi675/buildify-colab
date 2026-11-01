"use client";

import { Bot, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../client";
import { agentColor } from "../effects";
import { ChatPanel, useWs } from "./shared";

const MIN = 300;
const KEY = "bc_chat";

function load(): { open: boolean; width: number } {
  try {
    return { open: false, width: 380, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return { open: false, width: 380 };
  }
}

/**
 * Bunty lives in a small button at the bottom right. Opened, it docks to the
 * right edge; drag its left edge to resize (like Colab's side panel), × closes it.
 */
export function ChatDock() {
  const { state } = useWs();
  const [{ open, width }, setUi] = useState({ open: false, width: 380 });
  const [seen, setSeen] = useState(state.chat.length);
  const dragging = useRef(false);

  useEffect(() => setUi(load()), []);
  const save = (next: { open: boolean; width: number }) => {
    setUi(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* storage blocked */
    }
  };
  useEffect(() => {
    if (open) setSeen(state.chat.length);
  }, [open, state.chat.length]);

  const startDrag = (e: React.PointerEvent) => {
    e.preventDefault();
    dragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onDrag = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const max = Math.max(MIN, window.innerWidth * 0.7);
    setUi((u) => ({ ...u, width: Math.round(Math.min(max, Math.max(MIN, window.innerWidth - e.clientX))) }));
  };
  const endDrag = () => {
    if (!dragging.current) return;
    dragging.current = false;
    save({ open, width });
  };

  const unread = Math.max(0, state.chat.length - seen);

  if (!open)
    return (
      <button
        onClick={() => save({ open: true, width })}
        className="fixed bottom-5 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full text-white shadow-lg transition hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        style={{ background: agentColor("reviewer") }}
        title="Ask Bunty"
        aria-label="Open Bunty chat"
      >
        <Bot size={22} />
        {unread > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold">{unread}</span>}
      </button>
    );

  return (
    <aside
      className="fixed inset-y-0 right-0 z-40 flex max-w-full flex-col border-l border-border bg-surface shadow-lg lg:relative lg:inset-auto lg:z-10 lg:shadow-none"
      style={{ width }}
      aria-label="Bunty chat"
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize chat"
        title="Drag to resize"
        onPointerDown={startDrag}
        onPointerMove={onDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className={cn("absolute inset-y-0 -left-1 z-10 hidden w-2 cursor-col-resize lg:block", "after:absolute after:inset-y-0 after:left-[3px] after:w-0.5 after:bg-transparent hover:after:bg-accent")}
      />
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <span className="flex h-6 w-6 items-center justify-center rounded-full text-white" style={{ background: agentColor("reviewer") }}><Bot size={13} /></span>
        <span className="text-sm font-semibold">Bunty</span>
        <button onClick={() => save({ open: false, width })} className="ml-auto rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Close Bunty chat" title="Close">
          <X size={16} />
        </button>
      </div>
      <ChatPanel />
    </aside>
  );
}
