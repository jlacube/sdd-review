---
id: "C001-OA-002"
artifact: ideation/option-analysis
change: "CHG-001"
phase: 00-ideation
status: draft
---
# OA-002 — Form factor and integration surface

## Problem

Decide where the review assistant lives and how the developer reaches it: a headless analysis
module, a standalone local UI, an IDE extension, a Claude Code plugin or a PR-platform app. It
must be decided now because it sets the architecture boundary (analysis core versus surface),
the first increment and the platforms the research must cover. Binding inputs from round 1
(`00-ideation/questions-log.md`): the primary reviewer is the developer accepting agent output
locally, before commit or PR (Q-reviewer-01); specs are used when present, with intent fallback
(Q-spec-anchor-01), so the tool must work on ordinary agent sessions; P-01 wants a new workflow
and UI, not only a helper on today's diff view (Q-restatement-01). The review paradigm
(C001-OA-001) recommends an intent map with collapsed, evidence-backed hunks, which needs a
custom interactive view. Constitution principles 1, 2 and 5 apply, and every dependency must
use a permissive licence (constitution, Forbidden technologies). Out of scope: the UI
technology stack and the packaging details (plan phase), and the analysis technology.

This analysis was scored before the step-3 research notes existed. It was re-checked against
C001-R-001 and C001-R-002 on 2026-11-17 (section "Re-check against research"): no score
changes, the totals and the recommendation stand, and no near tie applies.

## Criteria

| Criterion | Weight (%) |
|---|---|
| Freedom to build a new review UI | 25 |
| Fit with local acceptance of agent output | 25 |
| Reach across agents and editors | 15 |
| Simple, reversible first increment | 20 |
| Reusable, testable analysis core | 15 |

- **Freedom to build a new review UI** — room for a custom, interactive view (intent map,
  collapsible evidence) rather than comments on an existing diff; P-01's UI instruction.
- **Fit with local acceptance of agent output** — runs on the working tree or local branch at
  the moment the developer accepts the agent's work (Q-reviewer-01).
- **Reach across agents and editors** — usable whatever agent produced the change and whatever
  editor the developer uses (Q-spec-anchor-01: ordinary agent sessions included).
- **Simple, reversible first increment** — low build and maintenance cost, easy to replace
  (constitution principles 1, 2, 5).
- **Reusable, testable analysis core** — the analysis is separable from the surface, unit
  testable (constitution principle 3) and callable by later surfaces.

## Candidates

- **1 — Analysis module only** — a library and CLI that writes a review report (Markdown or
  JSON); no interactive UI. The "do less" option.
- **2 — Analysis core with a standalone local UI** — the same library and CLI, plus a local UI
  the CLI opens (web app on the loopback interface, or a desktop wrapper chosen in the plan).
  Other surfaces (a Claude Code hook, an IDE command) can later launch it through the CLI.
- **3 — VS Code extension** — the review runs inside VS Code with webview panels and native
  diff and comment views.
- **4 — Claude Code plugin** — skills, agents and hooks (for example on the agent's stop event)
  that run the review inside the Claude Code session, in the terminal.
- **5 — PR-platform app** — a GitHub or GitLab app that analyses pull requests and posts the
  review as checks and comments.

## Scores

| Candidate | Freedom to build a new review UI | Fit with local acceptance of agent output | Reach across agents and editors | Simple, reversible first increment | Reusable, testable analysis core | Weighted |
|---|---|---|---|---|---|---|
| Weights | 25 | 25 | 15 | 20 | 15 | 100 |
| 1 — Analysis module only | 1 | 3 | 5 | 5 | 5 | 3.50 |
| 2 — Analysis core with a standalone local UI | 5 | 4 | 5 | 3 | 5 | 4.35 |
| 3 — VS Code extension | 3 | 5 | 2 | 2 | 3 | 3.15 |
| 4 — Claude Code plugin | 1 | 5 | 1 | 4 | 2 | 2.75 |
| 5 — PR-platform app | 3 | 1 | 3 | 2 | 3 | 2.30 |

Justifications (sources opened when the analysis was scored: Claude Code plugin manifest
reference <https://code.claude.com/docs/en/plugins-reference> (accessed 2026-11-17); VS Code
Webview API guide <https://code.visualstudio.com/api/extension-guides/webview> (accessed
2026-11-17)). Research-note citations for each score: section "Re-check against research".

- **1 — Module only.** UI 1: a static report, no interactive review. Fit 3: runs locally on the
  working tree, but the developer reads a file. Reach 5: any agent, any editor. Simple 5: one
  component. Core 5: the core is the product.
- **2 — Core + local UI.** UI 5: full control of layout and interaction. Fit 4: local and on the
  working tree, but in a separate window from the agent and the editor. Reach 5: browser or
  desktop window, independent of agent and editor. Simple 3: two parts (core and UI) and a local
  server to secure (loopback binding, session token). Core 5: the CLI boundary keeps the core
  separate and lets later surfaces reuse it.
- **3 — VS Code extension.** UI 3: webviews allow custom HTML, but the guide advises using them
  sparingly, isolates them behind message passing and recreates them when hidden unless state
  is saved. Fit 5: the developer is already in the editor. Reach 2: VS Code and its forks only.
  Simple 2: extension API, webview state and message passing. Core 3: separable, but extension
  code tends to absorb logic.
- **4 — Claude Code plugin.** UI 1: the manifest reference lists skills, commands, agents, hooks,
  MCP and LSP servers, output styles, themes and monitors; none is a graphical view, so review
  stays in the terminal. Fit 5: hooks fire at the exact moment the agent finishes. Reach 1:
  Claude Code sessions only. Simple 4: Markdown skills and scripts. Core 2: logic tends to live
  in prompts, which is harder to unit test.
- **5 — PR-platform app.** UI 3: limited to checks and comments on the PR page unless an external
  site is added. Fit 1: runs after push, while P-01 chose the local developer (Q-reviewer-01).
  Reach 3: agent-neutral but bound to one platform. Simple 2: hosting, webhooks, app
  authentication and secrets. Core 3.

## Sensitivity

- **Top two by score: 2 (4.35) and 1 (3.50), gap 0.85.** 2 − 1 = 4·w(UI) + w(fit) −
  2·w(simple). Candidate 1 wins only when 2·w(simple) exceeds 4·w(UI) + w(fit), for example
  UI 10 %, fit 20 %, reach 15 %, simple 45 %, core 10 % (1 at 4.20, 2 at 3.90). That would drop
  the UI that P-01 asked for (Q-restatement-01); not plausible. (Corrected on 2026-11-17: the
  earlier example changed three weights only and summed to 105 %.)
- **Recommended versus the strongest presented alternative, 3 (3.15), gap 1.20.** 2 − 3 =
  2·w(UI) − w(fit) + 3·w(reach) + w(simple) + 2·w(core). Even if P-01 confirms that every
  target developer uses VS Code (reach for 3 rises to 4), 3 reaches 3.45 and stays second.
  Candidate 3 leads only if fit dominates and reach counts for nothing, which conflicts with
  Q-spec-anchor-01.
- **Dependency on C001-OA-001.** If P-01 chooses B or D there instead of E, the UI need is
  smaller but still present; with fit and simple unchanged, candidate 2 stays ahead of
  candidate 1 while w(UI) stays above about 4 %.
- **Re-check (2026-11-17).** The research notes change no score here. The near tie that the
  re-check of C001-OA-001 finds in its pessimistic case (E 3.70 against B 3.75) reaches this
  analysis only through the dependency bullet above, and that bullet keeps candidate 2 first.
- The proposed weights do not flip the recommendation under plausible changes; P-01's
  confirmation of the weights is not required.

## Presented

1. **2 — Analysis core with a standalone local UI** (4.35) — recommended.
2. **3 — VS Code extension** (3.15) — the in-editor alternative.

Only two candidates are presented: candidate 1 scores second but contradicts P-01's UI scope
instruction (see Rejected).

## Recommendation

**2 — Analysis core with a standalone local UI**: it is the only surface that gives full
freedom for the new review UI while running locally for any agent and editor, and its CLI
boundary keeps the analysis core testable and reusable. No near tie applies (lead 1.20 over
candidate 3), and the re-check against the research notes (2026-11-17) leaves it unchanged. The
first increment can be the core and CLI alone (candidate 1 as an internal milestone), and an IDE
command or a Claude Code hook can later open the same UI, which keeps the choice reversible
(constitution principles 2 and 5).

## Rejected

- **1 — Analysis module only** (3.50) — has no interactive UI, which contradicts P-01's scope
  instruction that the change covers the workflow and a new UI (Q-restatement-01); kept as the
  first internal increment of candidate 2.
- **4 — Claude Code plugin** (2.75) — no graphical view and limited to Claude Code sessions;
  worth adding later as a thin launcher that calls the CLI.
- **5 — PR-platform app** (2.30) — runs after push, at the wrong moment for the developer who
  accepts agent output locally (Q-reviewer-01), and adds hosting and secret management.

## Re-check against research (2026-11-17)

Trigger: critic finding CR-1 (`00-ideation/critic-report.md`). Inputs: C001-R-001 and
C001-R-002. Weights unchanged. No web source was opened for the re-check; every citation below
is to a research note.

### Score changes

None. Every score is either backed by the notes or not addressed by them.

### Scores confirmed

- **2 — Core + local UI.** UI 5 and reach 5: Plannotator serves a browser review UI from a local
  server for local diffs, and it works with Claude Code, Codex, Gemini CLI and OpenCode
  (C001-R-001 §B). A local, agent-neutral review UI is therefore feasible, and its licence is
  permissive (C001-R-001 Implications). Fit 4: grouped, explained review exists only as
  PR-hosted services, and local review is limited to commands that list findings (C001-R-001 §D,
  Gap 1). The separate window from the agent and the editor remains, so 4, not 5. Simple 3: the
  local server still has to be secured; a precedent does not remove that cost. Core 5: unchanged.
- **1 — Module only.** UI 1: local review commands that produce findings lists are the pattern
  C001-R-001 Gap 1 names as insufficient. In the field study of C001-R-002 §B, developers wanted
  up-front summaries and on-demand explanations, which a static report serves only in part.
- **3 — VS Code extension.** Fit 5: Copilot agent mode already offers a working set of pending
  edits, a multi-diff editor and Keep or Undo per change or file (C001-R-001 §C), so native
  review controls exist. They work per change or per file, not per intent, and the webview limits
  stand, so UI stays 3. Reach 2: unchanged.
- **4 — Claude Code plugin.** UI 1: the desktop app's diff view (C001-R-001 §C) is not a plugin
  surface. Checkpoints miss Bash and subagent edits (C001-R-001 §D). This favours intake from git
  state, which any candidate can use, so it separates no scores.
- **5 — PR-platform app.** UI 3: rich grouped UIs (CodeRabbit Change Stack, Devin Review, cubic)
  run as PR-hosted sites (C001-R-001 §D), which the "external site" caveat already prices in.
  Fit 1: Bugbot's pre-push review, which skips a later PR review (C001-R-001 §A), shows vendors
  moving review before the push. This supports the weight on local fit (Q-reviewer-01).

### Totals and sensitivity

- Totals unchanged: 2 at 4.35, 1 at 3.50, 3 at 3.15, 4 at 2.75, 5 at 2.30.
- Near tie: none. Candidate 2 leads the presented alternative 3 by 1.20 and candidate 1 by 0.85.
- The CR-1 sensitivity case (C001-OA-001: E 3.70 against B 3.75 when evidence is weak) does not
  change this ranking. Under B the UI need shrinks but remains: an intent list with linked
  hunks. Candidate 2 stays ahead of 1 while w(UI) exceeds about 4 %, and its lead over 3 does
  not depend on the paradigm.
- Arithmetic correction only: the Sensitivity example for candidate 1 now uses weights that sum
  to 100 %. The conclusion is unchanged.

### Outcome

Recommendation unchanged: candidate 2 (4.35). Presented set and order unchanged.
