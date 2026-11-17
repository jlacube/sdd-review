# Questions log — CHG-001 · 00-ideation

## Change creation (/architect:new, before the phase started) — 2026-11-17

Recorded here because `/architect:new` keeps no log of its own (critic finding CR-9).

### Q-profile-01 — Which profile should the new change (an SDD review module and/or UI for large AI-generated codebase changes) use?
- **Blocking:** yes · **Material:** no
- **Why it matters:** The profile sets which files 10-spec and 20-plan produce.
- **Options:**
  1. Full (Recommended) — Estimate is about 6–10 stories, 20–35 requirements and 3–5 modules, above the lite limits (≤ 5 stories, ≤ 15 requirements, ≤ 3 modules); full keeps capabilities, architecture and plan in separate files.
  2. Lite — Single-file spec and plan; lighter, but likely too small for a module plus a UI and wide brainstorming, and can be upgraded to full later.
- **Sources:** /architect:new step 3; constitution Profile thresholds
- **Answer:** Full (Recommended)
- **Extracted instructions:** none

### Q-title-01 — Which title should the change carry (your full text stays as the idea statement for ideation)?
- **Blocking:** yes · **Material:** no
- **Why it matters:** Sets the change title and folder name.
- **Options:**
  1. SDD review assistant (Recommended) — Short title "SDD review assistant for large AI-generated changes"; your full text goes into the ideation as the idea to restate.
  2. Keep my full text — Use your whole sentence as the title; nothing is lost, but folder names and listings get long.
- **Sources:** /architect:new step 3
- **Answer:** SDD review assistant (Recommended)
- **Extracted instructions:** none
- **Idea statement given by P-01 (verbatim, from the command arguments; the opening quotation mark is P-01's own and the text has no closing one):** "Let's build a Spec Driven Development review module / UI or both, to facilitate / assist into reviewing massive codebase changes, like what is done by AI Assisted Coding agents. let's brainstorm a lot, assess existing solutions etc

## Round 1 — 2026-11-17

### Q-restatement-01 — Does this restatement match your idea: an assistant that splits a massive AI-generated change into reviewable units, links each to spec items, highlights risky or unspecified parts and records the verdict?
- **Blocking:** yes · **Material:** yes
- **Why it matters:** The restatement becomes the problem statement and frames every research topic.
- **Options:**
  1. Yes, as stated (Recommended) — The restatement becomes the problem statement of the ideation; correct it in free text if a part is off.
  2. Broader than that — Choose this if you also want the tool to fix, re-prompt or steer the agent, not only assist the human reviewer; say how in free text.
- **Sources:** phase-ideation step 2
- **Answer:** Broader than that, in term of workflow and UI. I'm looking to create a disruptive way to review AI changes, as volumes of changes and change's sizes are increasing exponentially
- **Extracted instructions:**
  - "in term of workflow and UI" → the scope covers the whole review workflow and a new UI, not only an analysis helper on top of today's diff view.
  - "a disruptive way to review AI changes" → research and options must include review paradigms that depart from line-by-line diff review, not only incremental improvements.
  - "volumes of changes and change's sizes are increasing exponentially" → the problem statement and goals must address scale (number and size of changes) as the driving constraint.

### Q-reviewer-01 — Who is the primary reviewer the assistant serves first?
- **Blocking:** yes · **Material:** yes
- **Why it matters:** Decides the integration point and the workflow the research focuses on.
- **Options:**
  1. Dev reviewing agent output (Recommended) — The developer who ran the agent and must accept its changes locally before commit or PR; the most frequent and most painful review today.
  2. PR reviewer / tech lead — A teammate reviewing someone else's agent-made pull request; pulls the design toward GitHub/GitLab integration and team workflows.
  3. Spec owner — A non-coding owner checking that the change matches the approved spec; pulls the design toward traceability views over code views.
- **Sources:** phase-ideation step 2
- **Answer:** Dev reviewing agent output (Recommended)
- **Extracted instructions:** none

### Q-spec-anchor-01 — How tightly should the review be anchored to specifications?
- **Blocking:** yes · **Material:** yes
- **Why it matters:** Decides whether the tool depends on an SDD workspace and which inputs research must cover.
- **Options:**
  1. Specs when present (Recommended) — Uses SDD artifacts (requirements, tasks, acceptance scenarios, e.g. this repo's .sdd/ format) when they exist, and falls back to intent from commits, PR text or agent transcripts otherwise; widest reach.
  2. SDD specs required — Works only on changes backed by a spec workspace; sharpest spec-to-code checks but unusable on ordinary agent sessions.
  3. Spec-agnostic — Reviews any large diff on its own merits; simplest, but drops the spec-driven angle you named.
- **Sources:** phase-ideation step 2
- **Answer:** Specs when present (Recommended)
- **Extracted instructions:** none

### Q-research-scope-01 — How wide should the assessment of existing solutions be?
- **Blocking:** yes · **Material:** no
- **Why it matters:** Sets the breadth of the research note.
- **Options:**
  1. Wide survey (Recommended) — AI PR reviewers (e.g. CodeRabbit, Copilot review, Graphite), SDD tools (e.g. Spec Kit, Kiro, Tessl), diff and stacked-review tools, and research on reviewing large changes; matches your 'brainstorm a lot'.
  2. Open-source only — Only tools you could reuse or extend; faster and directly actionable, but misses commercial patterns worth copying.
- **Sources:** phase-ideation step 2
- **Answer:** Wide survey (Recommended)
- **Extracted instructions:** none

## Round 2 — 2026-11-17

### Q-paradigm-01 — Which review paradigm should the assistant be built around (analysis C001-OA-001, 5 candidates)?
- **Blocking:** yes · **Material:** yes · **Candidates considered:** 5 (C001-OA-001)
- **Why it matters:** Sets the review unit, what the tool may accept on its own and what the developer still reads; it shapes every capability and the UI.
- **Options:**
  1. Intent map + risk triage (Recommended) — Score 4.30: you review by spec item or intent; inside each, low-risk hunks are cleared with visible evidence and you sign per intent; scales best but needs two engines (mapping and triage).
  2. Intent/spec-first review — Score 3.75: simpler, and missing or unrequested code becomes visible, but you still read every mapped hunk, so effort grows with change size.
  3. Evidence-based acceptance — Score 3.50: most radical, judging tests, traces and invariants instead of code, but agent-written tests can be weak and design defects go unseen.
- **Rejected:** Augmented guided diff — keeps line-by-line reading, effort linear in diff size (2.55); Risk-triaged review by exception alone — part of the recommended hybrid; without intent, unrequested low-risk code passes unseen (3.50).
- **Sources:** C001-OA-001, Q-restatement-01, Q-reviewer-01, Q-spec-anchor-01
- **Answer:** 1 + architecture / design assistance-insight-integration
- **Extracted instructions:**
  - "architecture / design assistance-insight-integration" → add an architecture and design dimension on top of option 1; its exact meaning is ambiguous and is asked in round 3 (Q-arch-insight-01).

### Q-formfactor-01 — Which form factor should the review assistant take first (analysis C001-OA-002, 5 candidates)?
- **Blocking:** yes · **Material:** yes · **Candidates considered:** 5 (C001-OA-002)
- **Why it matters:** Sets the architecture boundary between analysis core and surface, the first increment and the platforms in scope.
- **Options:**
  1. Core + local UI (Recommended) — Score 4.35: an analysis core with CLI plus a standalone local UI; full freedom for the new review UI, works with any agent and editor, core reusable; costs a second component and a local server to secure.
  2. VS Code extension — Score 3.15: sits in the editor you already use, but webviews constrain the UI and other editors are excluded.
- **Rejected:** Analysis module only — no interactive UI, contradicts Q-restatement-01 (3.50; kept as first internal increment); Claude Code plugin — no graphical view, limited to Claude Code sessions (2.75; possible later launcher); PR-platform app — runs after push, wrong moment for the local reviewer, adds hosting and secrets (2.30).
- **Sources:** C001-OA-002, C001-OA-001, Q-restatement-01, Q-reviewer-01
- **Answer:** Core + local UI (Recommended)
- **Extracted instructions:** none

## Round 3 — 2026-11-17

### Q-arch-insight-01 — What should the "architecture / design assistance-insight-integration" you added to the intent map + risk triage paradigm cover?
- **Blocking:** yes · **Material:** yes · **Candidates considered:** 3 (inline, conductor)
- **Why it matters:** Clarifies the extracted instruction of Q-paradigm-01; changes the scope of the analysis core and of the UI.
- **Options:**
  1. Impact + design critique (Recommended) — Show which components, layers and dependencies the change touches, flag drift from documented architecture (ADRs, constraints, architecture docs) and new couplings, and critique design quality (duplication, abstractions, patterns) as review findings.
  2. Architecture impact only — Only the map of touched components and dependencies plus drift from documented architecture; narrower and more objective, but no opinion on design quality.
  3. Design co-pilot — Impact and critique plus proposing alternative designs and feeding them back to the agent as follow-up tasks; the most ambitious, it extends the tool beyond review into steering.
- **Sources:** Q-paradigm-01 (extracted instruction)
- **Answer:** 1 but really in the sens of "how to simply and robustify how we conduct reviews". don't be shy to be disruptive
- **Extracted instructions:**
  - "really in the sens of 'how to simply and robustify how we conduct reviews'" → the architecture/design dimension (impact map, drift, design critique) is a lens that makes the review itself simpler and more reliable — e.g. the developer reviews top-down from the architecture delta to intents to hunks — rather than a separate design-consulting feature. Applied in the Design direction and Goals of ideation.md.
  - "don't be shy to be disruptive" → the design direction favours bold departures from today's diff-centric review over incremental features; applied in Design direction and as a goal.

### Q-autonomy-01 — How far may the tool clear low-risk code without you reading it?
- **Blocking:** yes · **Material:** yes · **Candidates considered:** 4 (inline, conductor)
- **Why it matters:** Sets what the triage engine may do on its own and where human accountability sits.
- **Options:**
  1. Collapse with evidence (Recommended) — Low-risk hunks are folded but visible with the evidence that cleared them (tests, type checks, pure renames); you still sign each intent, so nothing is accepted without your signature.
  2. Rank only, never clear — The tool orders and highlights but every hunk stays open; safest, but review effort still grows with change size.
  3. Auto-accept with audit — Hunks meeting a policy are accepted automatically and logged; fastest, but defects in cleared code reach the commit unseen.
- **Rejected:** Human approval of every hunk — the line-by-line review the change aims to replace.
- **Sources:** C001-OA-001
- **Answer:** Collapse with evidence (Recommended)
- **Extracted instructions:** none

### Q-llm-01 — Which language-model setup should the analysis use, given that code may leave your machine?
- **Blocking:** yes · **Material:** yes · **Candidates considered:** 4 (inline, conductor)
- **Why it matters:** Sets a dependency, the privacy posture and offline capability.
- **Options:**
  1. Pluggable, local allowed (Recommended) — A provider interface supporting a local model or a cloud API chosen per repository, with deterministic analysis (git, AST, tests) working without any model; most flexible and privacy-safe.
  2. Claude API only — One provider, simplest to build and best quality per effort, but code is sent to a cloud API and offline use is impossible.
  3. Reuse agent session — Run the analysis through the coding agent already in use (e.g. Claude Code headless); no extra key, but ties the tool to that agent's availability and cost.
- **Rejected:** Cloud model with code sent by default — conflicts with a local-first tool.
- **Sources:** C001-OA-002
- **Answer:** Pluggable, local allowed (Recommended)
- **Extracted instructions:** none

### Q-scale-01 — What size of change should the first version be designed to handle comfortably?
- **Blocking:** yes · **Material:** yes · **Candidates considered:** 2 (inline, conductor)
- **Why it matters:** Sets the performance NFRs and the analysis and UI budgets.
- **Options:**
  1. Up to ~10k lines (Recommended) — About 10,000 changed lines over ~300 files per review; covers most large agent sessions today and sets the performance NFRs.
  2. Up to ~50k lines — About 50,000 lines over ~1,500 files; anticipates the growth you described, but raises analysis time, cost and UI performance demands from day one.
- **Sources:** Q-restatement-01 (scale instruction)
- **Answer:** Up to ~10k lines (Recommended)
- **Extracted instructions:** none
