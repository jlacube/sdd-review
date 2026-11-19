---
id: "CHG-001"
title: "SDD review assistant for large AI-generated changes"
kind: "greenfield"
profile: "full"
status: active
phase: 10-spec
phases:
  00-ideation: { status: approved, approved_hash: "sha256:d0721f9810516e7b8ff4c5a5b0bc74b641accb23b24caff8deb7f1fd1655577d", approved_at: 2026-11-17, approved_by: "Jerome LACUBE" }
  10-spec: { status: approved, approved_hash: "sha256:150bd914bf4dd4b7e53e4d8b24a9901f2c648437357b3924d39d6a5cbd9ea0d0", approved_at: 2026-11-19, approved_by: "Jerome LACUBE" }
  20-plan: { status: draft, approved_hash: null, approved_at: null, approved_by: null }
implementation: { status: not-started }
stopped: null
owners: []
defects:
  - { id: D-001, ref: C001-IF-012, summary: "No error code or behaviour when git is missing, older than 2.34, or refuses the repository (C001-ADR-004)", reporter: sdd-architect, date: 2026-11-18, status: open, resolution: null, closed_at: null }
  - { id: D-002, ref: C001-CON-18, summary: "Node.js 22+ and git 2.34+ are not stated as prerequisites (C001-ADR-001, C001-ADR-004)", reporter: sdd-architect, date: 2026-11-18, status: open, resolution: null, closed_at: null }
  - { id: D-003, ref: C001-CON-17, summary: "Parser grammar versions are not named as a fixed-per-release input (C001-ADR-003)", reporter: sdd-architect, date: 2026-11-18, status: open, resolution: null, closed_at: null }
  - { id: D-004, ref: C001-IF-013, summary: "Evidence commands inherit the environment unchanged, so GIT_DIR and GIT_INDEX_FILE from a git-hook launch can point evidence runs at the developer's repository (C001-ADR-006)", reporter: sdd-architect, date: 2026-11-18, status: open, resolution: null, closed_at: null }
  - { id: D-005, ref: C001-IF-004, summary: "Credential-store service names in the review configuration are not limited to the sdd-review namespace (C001-ADR-008)", reporter: sdd-architect, date: 2026-11-18, status: open, resolution: null, closed_at: null }
  - { id: D-006, ref: C001-IF-013, summary: "No error code or behaviour when a submodule commit recorded by the snapshot is missing locally (C001-ADR-006)", reporter: sdd-architect, date: 2026-11-18, status: open, resolution: null, closed_at: null }
  - { id: D-007, ref: C001-IF-012, summary: "Clean filters are forbidden (IF-012 §2 item 2), so files under a clean filter such as Git LFS always show as changed; behaviour and notice unspecified (C001-ADR-004)", reporter: sdd-architect, date: 2026-11-18, status: open, resolution: null, closed_at: null }
waivers:
  - { item: TR-06, gate: 10-spec, date: 2026-11-19, note: "Approve, waive plan checks (Recommended)" }
  - { item: TR-08, gate: 10-spec, date: 2026-11-19, note: "Approve, waive plan checks (Recommended)" }
  - { item: LINT-OBS-001, gate: 10-spec, date: 2026-11-19, note: "Approve, waive plan checks (Recommended)" }
---
# CHG-001 — SDD review assistant for large AI-generated changes

## Index
- `00-ideation/` — ideation (gate G1)
- `10-spec/` — specification (gate G2)
- `20-plan/` — plan (gate G3; implementers start at `20-plan/handoff.md`)

## Gate log
| Date | Gate | Decision | Words of approver | Waivers | Usage |
|---|---|---|---|---|---|
| 2026-11-17 | G1 (ideation) | **Approved** | "Approve" | none | unavailable |
| 2026-11-17 | G1 (ideation) | **Approved** | "Approve" | none | unavailable |
| 2026-11-18 | G2 (spec) | **Approved** | "Approve" | none | unavailable |
| 2026-11-18 | G2 (spec) | **Revise** | "Fix defects D-001 to D-007 found by the plan-phase ADRs: git missing/too old error, Node 22+/git 2.34+ prerequisites, fixed grammar versions, GIT_DIR/GIT_INDEX_FILE leaking into evidence commands, credential namespace, missing-submodule error, clean-filter files" | none | unavailable |
| 2026-11-19 | G2 (spec) | **Approved with waivers** | "Approve, waive plan checks (Recommended)" | TR-06, TR-08, LINT-OBS-001 | unavailable |
