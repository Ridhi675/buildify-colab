# Demo video script (≈4½ minutes)

Setup: two browser windows side by side — left **Aisha (Founder)**, right **Daniel (Designer)** — both on CareConnect. Reset the demo first. The demo guide (bottom-left) shows progress; official hackathon steps are tagged *req 1–7*.

| Time | Screen | Say / do |
|---|---|---|
| 0:00 | Dashboard → workspace, both windows | "Buildify CoLab: two humans, two AI agents, one product. Aisha is our founder, Daniel our designer — each in their own browser. Green dots are live presence; you can even see each other's cursor." **(req 1: shared task + identities)** |
| 0:20 | Left: Workspace | Aisha clicks *Use demo request* → *Simplify with Reviewer AI*. "Aisha just types what she wants." |
| 0:35 | Right: requirements appear | "Daniel sees it instantly. The Reviewer turned one sentence into structured requirements — each with an ID, priority, acceptance criteria and version — shown next to the original words so intent is preserved." Daniel edits one, then *Approve all*. |
| 0:55 | Preview Studio | Generate preview. "Before spending on a full build, we get a cheap visual and textual preview. The Builder is blocked until two humans approve." Daniel approves (1/2), Aisha approves (2/2). |
| 1:20 | Agent Control Centre | "Now both agents work in parallel: the Reviewer writes acceptance tests while the Builder builds." **(req 2)** |
| 1:35 | Right: Workspace → REQ-001 → Propose change | Daniel: "Our pilot clinic serves seniors on phones." *Fill demo change* → *Analyze impact*. **(req 3)** |
| 1:50 | Ripple Effect | "Before anything changes, the Ripple Effect shows the consequences: typography, navigation, contrast and tests are affected; the appointments API and patient database are not. It flags the Builder's in-flight build as about to become stale. Items the AI only guessed are labelled 'inferred'." Both approve. |
| 2:20 | Agent Control Centre | Builder finishes → red **Quarantined**: "Output is based on outdated requirements: REQ-001 changed v1 → v2." "It never touched the product." **(req 4)** |
| 2:40 | Builder → Restart agent | "Let's crash the Builder." Confirm. Point at the recovery report: "It rebuilt its context purely from the project store — context v2, approved requirements, the latest decision, the quarantined output, pending approvals." **(req 5)** |
| 3:00 | Approvals drawer | "The Reviewer prepared an updated task — but only a human can start it." Approve rebuild. Reviewer validation appears: "All checks passed — recommendation only." Aisha accepts. **(req 6)** |
| 3:25 | Workspace canvas | v2: large text, high contrast, mobile-first, bottom tabs, help page. "Only the affected components were rebuilt — highlighted in amber." **(req 7)** |
| 3:45 | Time Machine → Compare v1 vs v2 | "Anyone — even a non-technical stakeholder — can see what changed, who approved it and why." |
| 4:05 | Checkpoints → *Preview #1 approved* → Restore | Show the impact preview, type a reason, confirm. "Restore creates v3 from the old snapshot. v1 and v2 stay — history is never erased." |
| 4:25 | Workspace | "One shared artifact, two humans, two agents, and every decision understood." |

Fallback lines: if no API key is configured, outputs carry a **Rules engine** badge — say "the agents run on a deterministic engine here; with a key the same pipeline calls Claude." Agent restart is labelled **SIMULATED** in the activity log.
