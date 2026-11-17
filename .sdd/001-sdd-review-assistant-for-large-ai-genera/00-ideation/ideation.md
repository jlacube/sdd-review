---
id: "CHG-001"
artifact: ideation
change: "CHG-001"
phase: 00-ideation
status: draft
version: 0.3.0
created: "2026-11-17"
---
# SDD review assistant for large AI-generated changes — ideation

## 1. Document control
| Version | Date | Author | Change |
|---|---|---|---|
| 0.1.0 | 2026-11-17 | Conductor (with sdd-researcher, sdd-options-analyst) | First draft |
| 0.2.0 | 2026-11-17 | Conductor | Fixes for critic findings CR-1 to CR-9 (`critic-report.md`) |
| 0.3.0 | 2026-11-17 | Conductor | After G1: research note C001-R-003 added to §6 and §12 (no decision changed); CR-13, CR-16 fixed |

- **Change:** CHG-001 · profile full · kind greenfield
- **Status:** draft · **Approver:** P-01 (gate G1)

## 2. Problem statement
AI coding agents now produce changes faster and larger than a human can review line by line:
vendor telemetry reports that teams with high AI adoption merge more pull requests that are much
larger and take far longer to review (C001-R-002 §B, Faros finding; correlational, medium
confidence), while studies of human-written changes find review effectiveness falling as changes
grow beyond a few hundred lines (C001-R-002 §B, Cisco/SmartBear and Baum findings; extending them
to agent-scale changes is an inference). The developer who ran the agent
and must accept its output locally (Q-reviewer-01) ends up skimming or rubber-stamping thousands
of lines, reverse-engineering intent from a diff, with no way to tell whether the change does what
was specified — no more and no less — or what the change does to the architecture. Among the tools
surveyed, most skip or split large changes, grouping exists only in hosted pull-request services,
and none found maps changes to specification items (C001-R-001 Gaps; an inference from absence,
medium to low confidence). P-01 frames the need as a disruptive new review
workflow and UI, because the volume and size of changes keep growing exponentially
(Q-restatement-01).

## 3. Q&A decision record
Full options, rationales and verbatim answers: `questions-log.md`.

### Change creation (before the phase)
| ID | Question | Answer (verbatim) |
|---|---|---|
| Q-profile-01 | Profile of the change? | Full (Recommended) |
| Q-title-01 | Title of the change? | SDD review assistant (Recommended) |

### Round 1
| ID | Question | Answer (verbatim) |
|---|---|---|
| Q-restatement-01 | Does the restatement match the idea? | Broader than that, in term of workflow and UI. I'm looking to create a disruptive way to review AI changes, as volumes of changes and change's sizes are increasing exponentially |
| Q-reviewer-01 | Primary reviewer served first? | Dev reviewing agent output (Recommended) |
| Q-spec-anchor-01 | How tightly anchored to specifications? | Specs when present (Recommended) |
| Q-research-scope-01 | Width of the assessment of existing solutions? | Wide survey (Recommended) |

### Round 2
| ID | Question | Answer (verbatim) |
|---|---|---|
| Q-paradigm-01 | Review paradigm (C001-OA-001)? | 1 + architecture / design assistance-insight-integration |
| Q-formfactor-01 | Form factor (C001-OA-002)? | Core + local UI (Recommended) |

### Round 3
| ID | Question | Answer (verbatim) |
|---|---|---|
| Q-arch-insight-01 | Meaning of the architecture/design addition? | 1 but really in the sens of "how to simply and robustify how we conduct reviews". don't be shy to be disruptive |
| Q-autonomy-01 | How far may the tool clear low-risk code? | Collapse with evidence (Recommended) |
| Q-llm-01 | Language-model setup? | Pluggable, local allowed (Recommended) |
| Q-scale-01 | Change size the first version handles comfortably? | Up to ~10k lines (Recommended) |

## 4. Goals and non-goals
### 4.1 Goals
Targets marked `[ASSUMPTION]` are proposals; P-01 sets the final thresholds in 10-spec NFRs.

1. **G-1 Scale:** a developer can review a single agent change of up to about 10,000 changed lines
   over about 300 files in one local session (C001-DEC-007); performance thresholds are set in
   10-spec NFRs.
2. **G-2 Review effort independent of raw size:** the developer reviews intents and flagged hunks,
   not every line. Target: on a 10,000-line change, the hunks left open for human reading cover
   at most 30 % of changed lines, and the UI shows the read, cleared and open shares
   [ASSUMPTION: G-2 target of 30 %, to confirm in 10-spec] (C001-DEC-001, C001-DEC-003).
3. **G-3 Spec conformance visible:** every intent shows the code and evidence behind it; code that
   traces to no intent and intents with no code are flagged (C001-DEC-001, C001-DEC-006;
   C001-R-001 Gap 2).
4. **G-4 Architecture lens:** the review opens on the architecture delta (touched components,
   layers, dependencies, drift from documented architecture), and every intent and every open
   hunk is reachable from the component it touches in that view (C001-DEC-001).
5. **G-5 Accountable verdict:** nothing is accepted without the developer's signature on an
   intent; every cleared hunk carries its evidence; verdicts are recorded (C001-DEC-003).
6. **G-6 Works with or without specs:** uses an SDD workspace when present and an intent fallback
   otherwise (C001-DEC-006).
7. **G-7 Local and private by default:** runs on the developer's machine; no code leaves it unless
   the repository is configured for a cloud model (C001-DEC-002, C001-DEC-004).
8. **G-8 Disruptive workflow:** the review flow departs from file-by-file diff reading. Target: in
   a comparison on seeded-defect agent changes of 2,000–10,000 lines, review time is at least
   50 % lower than with a standard diff review, and the share of seeded defects found is not lower
   [ASSUMPTION: G-8 targets, to confirm in 10-spec].

### 4.2 Non-goals
1. Generating or fixing code, or steering the agent, in this change (the "design co-pilot" option
   was not chosen, Q-arch-insight-01).
2. Replacing team pull-request review on hosting platforms in this change (PR-platform app
   rejected for the first version, C001-OA-002, C001-DEC-005).
3. Automatic acceptance or commit of any code by the tool (C001-DEC-003).
4. Formal verification of code against specs.
5. Changes above about 10,000 lines in the first version (Q-scale-01).

## 5. Scope boundary
- **In scope:** analysis core with CLI; standalone local review UI; intake of a change as working
  tree versus a base commit (C001-R-001 Implications); intent mapping from an SDD workspace or
  intent fallback; risk triage with evidence and collapse; architecture impact and drift lens with
  design-quality findings; per-intent verdicts and their record; pluggable model provider with a
  model-free deterministic mode.
- **Out of scope:** the non-goals of §4.2; hosting, multi-user collaboration and accounts.
- **Later (separate future changes, not this one):** IDE extension, Claude Code launcher and a
  PR-platform surface on top of the core (C001-DEC-002); structured feedback sent back to the
  agent (C001-R-001 Gap 7; would lift non-goal 1); incremental re-review after agent revisions
  (C001-R-002 paradigm 20); changes beyond 10,000 lines (C001-DEC-007).
- **Hand-over:** 10-spec turns this direction into capabilities, requirements, NFRs and the
  architecture; nothing is implemented before gate G3.

## 6. Research index
| Note | Question | Confidence |
|---|---|---|
| C001-R-001 (`research/R-001-ai-review-tools-landscape.md`) | Which existing tools help review large AI-generated changes, and what gaps remain? Conclusion: grouped review exists only as hosted PR services; local review has no grouping, ranking or spec links (8 gaps listed). | medium |
| C001-R-002 (`research/R-002-sdd-and-review-paradigms.md`) | How do SDD tools verify code against specs, and what evidence and paradigms exist for reviewing large changes? Conclusion: partitioning, ordering and evidence-based acceptance are research-backed levers; 20 candidate paradigms. | medium (low for 2026 AI-review claims) |
| C001-R-003 (`research/R-003-cline-aider-windsurf-review.md`) | How do Cline, Aider and Windsurf present agent changes for review and acceptance? Conclusion: inside the agent surface, review is per edit or per turn, with checkpoints or commits for undo; none groups hunks by intent or maps them to requirements, and none documents handling for large changes (grouping exists only in Devin Review, for pull requests; added after G1). | medium |

## 7. Options and decisions index
| OA / DEC | Decision | Outcome |
|---|---|---|
| C001-OA-001 → C001-DEC-001 | Review paradigm | Intent map with risk triage, plus an architecture/design lens that simplifies and hardens review |
| C001-OA-002 → C001-DEC-002 | Form factor | Analysis core with CLI plus standalone local UI |
| Q-autonomy-01 → C001-DEC-003 | Clearing autonomy | Collapse low-risk hunks with evidence; developer signs each intent |
| Q-llm-01 → C001-DEC-004 | Language model | Pluggable provider, local allowed; deterministic mode without a model |
| Q-reviewer-01 → C001-DEC-005 | Primary reviewer | Developer accepting agent output locally |
| Q-spec-anchor-01 → C001-DEC-006 | Spec anchoring | Specs when present, intent fallback otherwise |
| Q-scale-01 → C001-DEC-007 | Scale target | About 10,000 changed lines over about 300 files |

## 8. Design direction
The review is turned upside down: instead of reading a diff file by file, the developer reviews a
**map of the change** from the top.

1. **Intake.** The core snapshots the change (working tree versus base commit, including edits
   invisible to agent checkpoints) and gathers available context: SDD workspace, commit and PR
   text, agent plan or transcript when present.
2. **Architecture delta first.** The core derives which components, layers and dependencies the
   change touches and flags drift from documented architecture and new couplings. The UI opens on
   this view; it frames where to look and how big each area of change is.
3. **Intent map.** Hunks are grouped under intents — spec items when a workspace exists, extracted
   intents otherwise — in one neutral intermediate form. Orphan code (no intent) and unmet intents
   (no code) are surfaced first.
4. **Risk triage with evidence.** Inside each intent, hunks are scored; low-risk hunks collapse
   with the evidence that cleared them, high-risk hunks and design findings stay open. The UI shows
   how much of the change has been read versus cleared.
5. **Verdict.** The developer signs, rejects or defers each intent; the verdict and its evidence
   are recorded against the change snapshot.

The core is model-optional: deterministic analysis runs everywhere, and a pluggable provider adds
intent extraction, grouping and design critique.

**Candidate paradigms (C001-R-002 list).** The core flow above already embodies paradigms 1–4, 11
and 17, and paradigm 5 without its auto-acceptance tier (excluded by non-goal 3 and
C001-DEC-003). Paradigm 18 (formal contracts) is excluded by non-goal 4; paradigms 14 (review during
generation) and 20 (incremental re-review) are Later (§5). 10-spec may add **only** from
paradigms 6, 7, 8, 9, 10, 12, 13, 15, 16 and 19, and only as features of the in-scope components
of §5; anything else needs a revision of this ideation. This keeps "don't be shy to be
disruptive" inside a bounded scope.

## 9. Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Wrong intent mapping or grouping hides a defect in the wrong place | medium | high | Show mapping confidence; orphan and unmet lists; developer can open any collapsed hunk |
| Evidence that clears hunks is weak (agent-written tests) | high | high | Rank evidence strength; never clear security-sensitive areas on test evidence alone (to define in 10-spec) |
| LLM explanations narrow attention without finding more serious defects (C001-R-002 §B) | medium | medium | Show uncertainty; let the developer sample underlying code; deterministic signals first |
| Non-deterministic AI grouping changes between runs (C001-R-001 Implications) | medium | medium | Anchor review state to a snapshot; flag stale verdicts |
| Developer stops learning the code when reading less (C001-R-002 Implications) | medium | medium | Architecture delta and intent narrative as comprehension aids; measure in evaluation |
| Analysis too slow or costly at 10,000 lines | medium | medium | Performance NFRs in 10-spec; deterministic pre-pass; local model option |
| Local server exposed beyond the machine | low | high | Bind to localhost; constitution NFR-D-01 for secrets |

## 10. Assumptions
| Assumption | If wrong |
|---|---|
| [ASSUMPTION: Q-scale-01] Agent changes reviewed today rarely exceed ~10,000 lines | Scale target and NFRs must be raised |
| [ASSUMPTION: G-2 target of 30 %] At most 30 % of changed lines left open is achievable and useful | Target revised in 10-spec NFRs |
| [ASSUMPTION: G-8 targets] A 50 % review-time reduction with no loss of seeded-defect detection is achievable and measurable | Targets or protocol revised in 10-spec |
| [ASSUMPTION: the developer can run the project's tests locally to produce evidence] | Evidence falls back to static signals; less can be cleared |
| [ASSUMPTION: a git repository is the unit of review] | Intake must support other version-control systems |
| [ASSUMPTION: Q-spec-anchor-01] Intent can be extracted well enough from commits, PR text or transcripts when no spec exists | The no-spec mode offers less mapping and more open hunks |

## 11. Open questions
| Question | Owner | Needed by |
|---|---|---|
| What is the neutral intermediate form for intents, hunks and evidence? | sdd-architect with sdd-spec-writer | 10-spec |
| Which evidence types may clear a hunk, and which areas are never cleared automatically? | P-01 (on spec-writer proposal) | 10-spec |
| Which of the allowed candidate paradigms (6, 7, 8, 9, 10, 12, 13, 15, 16, 19 of C001-R-002; §8) go into the first version? | P-01 | 10-spec |
| Final thresholds for G-2 and G-8 and the comparison protocol for G-8 | P-01 with sdd-test-designer | 10-spec |
| Where are verdicts stored (in the repository or local state)? | sdd-architect | 10-spec |
| Implementation language and UI stack | sdd-architect (ADR) | 20-plan |

## 12. Sources
This document cites external sources through the research notes and analyses, which list every
source with its retrieval date. The findings referred to by name in §2 rest on these sources, as
listed in C001-R-002 §B:
- Cisco/SmartBear — https://smartbear.com/learn/code-review/best-practices-for-peer-code-review/ (retrieved 2026-11-17)
- Baum et al. — https://www.zora.uzh.ch/entities/publication/245eb643-3ebd-476c-a613-8097ff6d9582 (retrieved 2026-11-17)
- Faros — https://www.faros.ai/blog/ai-productivity-paradox-report-2025 (retrieved 2026-11-17)

All other sources: C001-R-001 §Findings, C001-R-002 §Findings, C001-R-003 §Findings, and the
source lists of C001-OA-001 and C001-OA-002.
