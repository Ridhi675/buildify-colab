import { describe, expect, it } from "vitest";
import { dispatch } from "@/lib/server/actions";
import { clearDraft, draftList, subscribe, type BusEvent } from "@/lib/server/realtime";

const P = "live-drafts-test";
const aisha = { id: "u_aisha", name: "Aisha Rao", color: "#e11d48" };

describe("live prompting (shared drafts)", () => {
  it("broadcasts each draft to the project and keeps the latest per field", async () => {
    const seen: BusEvent[] = [];
    const off = subscribe(P, (e) => seen.push(e));
    await dispatch(P, aisha, "founder", { type: "draft", field: "request", text: "Build a retro", clientId: "tab-a" });
    await dispatch(P, aisha, "founder", { type: "draft", field: "request", text: "Build a retro board", clientId: "tab-a" });
    off();
    expect(seen.filter((e) => e.type === "draft")).toHaveLength(2);
    const d = draftList(P).find((x) => x.field === "request")!;
    expect(d).toMatchObject({ text: "Build a retro board", userId: "u_aisha", name: "Aisha Rao", clientId: "tab-a" });
  });

  it("clears the box for everyone when the prompt is submitted", () => {
    clearDraft(P, "request", { userId: aisha.id, name: aisha.name, color: aisha.color });
    expect(draftList(P).find((x) => x.field === "request")?.text).toBe("");
  });

  it("observers may draft chat messages only", async () => {
    const sam = { id: "u_guest", name: "Sam Lee", color: "#000" };
    await expect(dispatch(P, sam, "observer", { type: "draft", field: "request", text: "x", clientId: "t" })).rejects.toThrow(/chat/);
    await dispatch(P, sam, "observer", { type: "draft", field: "chat", text: "what changed?", clientId: "t" });
    expect(draftList(P).find((x) => x.field === "chat")?.text).toBe("what changed?");
  });
});
