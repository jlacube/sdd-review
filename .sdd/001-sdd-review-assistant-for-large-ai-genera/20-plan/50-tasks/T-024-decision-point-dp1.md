---
id: C001-T-024
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Decision point DP-1 — evaluate the milestone 1 measurements
milestone: C001-M-01
status: todo
depends_on: [C001-T-014, C001-T-021, C001-T-022, C001-T-023]
implements: []
satisfies_ac: [C001-AC-514.1, C001-AC-512.1]
verified_by: [C001-TS-539, C001-TS-532]
components: [C001-COMP-011, C001-COMP-007, C001-COMP-019]
risk_refs: [C001-RISK-001, C001-RISK-009, C001-RISK-010, C001-RISK-012, C001-RISK-013, C001-RISK-016]
estimate: S
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-024 — Decision point DP-1: evaluate the milestone 1 measurements

## Intent
Read the results of the parse spike, W1 to W6 (W6 reported, as input to W2 and W4), K1 to K6 and
the UI prototype and take the outcome that `10-strategy.md` §3 assigns to each finding. In
particular, if C001-NFR-018 (b) ≤ 60 min and (c) ≤ 1 s cannot both hold, the conflict goes back to
P-01 and no task relaxes either threshold (C001-ADR-006 §10, C001-CON-22). The decision point
implements no requirement; `satisfies_ac` names the criteria whose implementation it gates
(`10-strategy.md` §2). It edits no approved artifact: a finding that needs a decision or plan change
goes to P-01 through a defect, and a plan change through `/architect:revise plan`.

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `bench/results/dp-1.md` | each finding with its measured values and source file (`spikes/parse/RESULTS.md`, `spikes/ui/RESULTS.md`, `bench/results/workspace-<date>.md`, `bench/results/kill-tests-<date>.md`), its outcome per `10-strategy.md` §3, the follow-up tasks or defects |
| modify | `.sdd/001-sdd-review-assistant-for-large-ai-genera/change.md › defects` | through `sdd defect add` only, for each finding that goes back to P-01 |

## Preconditions
- C001-T-014, C001-T-021, C001-T-022, C001-T-023 done with results recorded in their result files.

## Step outline
1. Tabulate every result against its threshold or pass condition (C001-T-014: ≤ 60 s and ≤ 1 GiB).
2. Apply `10-strategy.md` §3 per finding.
3. For a finding that goes back to P-01, run `sdd defect add --ref <ID> --summary "…"` with the
   measured values, and set the dependent tasks of C001-M-03 or C001-M-04 to `blocked` with
   `sdd task set <T-ID> --status blocked --reason "DP-1: <finding>"`.
4. For an outcome that adds or changes tasks (the mitigations of C001-ADR-006 §11 after W1 above
   3.0, the narrowed instrumentation after W2 above 3.0, the native parser module after a parse
   miss), report the change to the conductor, who runs `/architect:revise plan`; no task file or
   ADR is edited by this task.
5. Hand the outcome to the conductor.

## Verification
- `sdd lint 001`
- `sdd trace 001`

## Done when
- [ ] Every M-01 measurement has an outcome in `bench/results/dp-1.md`.
- [ ] Every finding that needs P-01 is recorded as a defect and its dependent tasks are blocked.
- [ ] The conductor has acknowledged the outcome before C001-T-036 and C001-T-060 start.
