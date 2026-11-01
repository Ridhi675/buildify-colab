"use client";

import { Eye, RefreshCw, RotateCcw, Sparkles, ThumbsDown, ThumbsUp } from "lucide-react";
import { useState } from "react";
import type { AppSpec } from "@/lib/types";
import { AppRenderer } from "../../AppRenderer";
import { cn } from "../../client";
import { Avatar, Button, Card, CardHeader, Empty, inputCls, StatusBadge } from "../../ui";
import { canVote, DraftStatus, SiteButtons, useLiveDraft, useNames, useWs } from "../shared";

/**
 * The bottom of the Workspace: the latest preview (or the latest build, once one
 * is newer) drawn as the product, with Approve / Decline / Propose change.
 */
export function PreviewSection() {
  const { state, run } = useWs();
  const name = useNames();
  const [proposing, setProposing] = useState(false);
  const { text: change, setText: setChange, typing, lastEditor } = useLiveDraft("preview-feedback");

  const preview = state.previews[state.previews.length - 1];
  const build = state.versions.find((v) => v.id === state.project.currentArtifactVerId);
  const showBuild = !!build && (!preview || build.createdAt > preview.createdAt);
  const running = state.tasks.find((t) => t.type === "preview" && ["queued", "running"].includes(t.status));
  const approval = preview && state.approvals.find((a) => a.kind === "preview" && (a.payload as { previewId?: string }).previewId === preview.id);
  const approvedReqs = state.requirements.filter((r) => r.status === "approved").length;
  const voter = canVote(state);
  const mine = approval?.votes.find((v) => v.userId === state.me.id);
  const yes = approval?.votes.filter((v) => v.vote === "approve").length ?? 0;

  const proposeChange = async () => {
    const note = change.trim();
    if (!note || !approval) return;
    // The note travels with the regenerate request (once), so "bigger text" isn't applied twice.
    await run({ type: "vote", requestId: approval.id, vote: "revise" });
    await run({ type: "request_preview", feedback: note }, "Bunty is redrawing the preview");
    setProposing(false);
  };

  return (
    <Card>
      <CardHeader
        icon={<Eye size={16} />}
        title={showBuild ? `Product · v${build!.number}` : preview ? `Preview #${preview.number}` : "Preview"}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {(preview || build) && <SiteButtons query={showBuild ? `version=${build!.id}` : `preview=${preview!.id}`} />}
            {voter && (
              <Button variant={preview ? "secondary" : "primary"} size="sm" disabled={!approvedReqs || !!running} onClick={() => run({ type: "request_preview" }, "Bunty is drawing a preview")}>
                {preview ? <RefreshCw size={13} /> : <Sparkles size={13} />} {preview ? "Regenerate" : "Generate preview"}
              </Button>
            )}
          </div>
        }
      />

      {running && <div className="border-b border-border px-4 py-2 text-xs text-muted-foreground"><span className="animate-pulse-soft">●</span> {running.phaseLabel}…</div>}

      {!preview && !build ? (
        <div className="p-5">
          <Empty icon={<Eye size={28} />} title="No preview yet">{approvedReqs ? "Generate a preview to see the product before anything is built." : "Approve at least one requirement, then generate a preview."}</Empty>
        </div>
      ) : (
        <>
          <div className="bg-muted/40 p-4">
            <AppRenderer spec={(showBuild ? build!.spec : preview!.spec) as AppSpec} />
          </div>

          {!showBuild && preview && (
            <div className="space-y-3 border-t border-border p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <StatusBadge status={preview.status} />
                {approval && <span>{yes}/{approval.requiredApprovals} approvals</span>}
                <span className="flex -space-x-1">
                  {approval?.votes.map((v) => (
                    <span key={v.id} title={`${name(v.userId).name}: ${v.vote}`}><Avatar name={name(v.userId).name} color={name(v.userId).color} size={18} ring /></span>
                  ))}
                </span>
                {preview.feedback.length > 0 && <span className="truncate">· changes asked: {preview.feedback.map((f) => `“${f}”`).join(", ")}</span>}
              </div>

              {approval?.status === "pending" && voter && (
                <>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="success" onClick={() => run({ type: "vote", requestId: approval.id, vote: "approve" }, "Approval recorded")}>
                      <ThumbsUp size={13} /> {mine?.vote === "approve" ? "Approved" : "Approve"}
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => run({ type: "vote", requestId: approval.id, vote: "reject" }, "Declined")}>
                      <ThumbsDown size={13} /> Decline
                    </Button>
                    <Button size="sm" onClick={() => setProposing((p) => !p)} aria-expanded={proposing}>
                      <RotateCcw size={13} /> Propose change
                    </Button>
                    {mine?.vote === "approve" && <span className="self-center text-xs text-muted-foreground">Waiting for the other person.</span>}
                  </div>
                  {(proposing || typing || lastEditor) && (
                    <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => (e.preventDefault(), void proposeChange())}>
                      <input
                        autoFocus={proposing}
                        className={cn(inputCls, "min-w-0 flex-1 py-1.5 text-sm")}
                        style={typing ? { boxShadow: `0 0 0 2px ${typing.color}` } : undefined}
                        placeholder="e.g. switch to a light theme, green buttons, bigger text"
                        value={change}
                        onChange={(e) => setChange(e.target.value)}
                      />
                      <Button size="sm" variant="primary" type="submit" disabled={!change.trim()}>Send to Bunty</Button>
                      <DraftStatus typing={typing} lastEditor={lastEditor} className="w-full" />
                    </form>
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
