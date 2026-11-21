---
sdd_version: 1
workspace: .sdd
generator: architect-plugin@0.1.0
id_scheme: "C{NNN}-{TYPE}-{seq}"
---
# Spec-Driven Development workspace

This folder holds the specifications for this repository. **Agents: read this file first.**

## How to orient yourself (agents)
1. Read `registry.json` → find changes whose status is not `archived`.
2. For the change you work on, read `NNN-slug/change.md` (phase, gate state, open defects).
3. Respect phase order: `00-ideation` → `10-spec` → `20-plan`. Never consume an artifact whose
   `status` is not `approved` (or whose approval hash no longer matches its content).
4. Current system truth lives in `_living/`; per-change deltas live in change folders.
5. Project rules: `_constitution/constitution.md`.

## If you are implementing a change
Read `NNN-slug/20-plan/handoff.md` and report progress with
`node <plugin-root>/scripts/sdd.mjs task set <task-id> --status <status>` as described there.

## Conventions
- IDs: `C<NNN>-<TYPE>-<seq>` (e.g. `C004-REQ-012`); short forms (`REQ-012`) inside a change folder.
- Status: not-started → draft → in-review → approved → (stale | in-revision) → archived.
- Markers: `[NEEDS CLARIFICATION: …]`, `[ASSUMPTION: …]`, `[WAIVED: <gate> <reason>]`.
- Only the sdd CLI writes `registry.json`, `ids.json`, `approvals.json` and the status block below.

<!-- sdd:status:begin -->
| Change | Title | Phase | Status | Tasks done | Open defects | Updated |
|---|---|---|---|---|---|---|
| 001 | SDD review assistant for large AI-generated changes | 20-plan | approved | 14/116 | 15 | 2026-11-21 |
<!-- sdd:status:end -->
