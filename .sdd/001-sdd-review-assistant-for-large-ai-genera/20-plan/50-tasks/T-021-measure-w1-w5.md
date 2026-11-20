---
id: C001-T-021
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Workspace measurements W1 to W6
milestone: C001-M-01
status: todo
depends_on: [C001-T-020, C001-T-018]
implements: [C001-NFR-018]
satisfies_ac: [C001-AC-505.1, C001-AC-514.1, C001-AC-512.1]
verified_by: [C001-TS-512, C001-TS-539, C001-TS-532]
components: [C001-COMP-011]
risk_refs: [C001-RISK-001, C001-RISK-012, C001-RISK-016]
estimate: L
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-021 — Workspace measurements W1 to W6

## Intent
Take the measurements W1 to W5 of C001-ADR-006 §11 and W6 of its Amendment 1 (A1.6) on every
benchmark change in its environment, thresholds on the reference machine and reports from every
operating system of C001-CON-15, and record each result in `bench/results/workspace-<date>.md`
(C001-ADR-006 §11 points to that file; the approved ADR is not edited, `10-strategy.md` §2). They
decide whether
C001-NFR-018 (a) ≤ 3.0, (b) ≤ 60 min and (c) ≤ 1 s hold together and whether C001-AS-08 needs its
mitigations. W6 has no pass condition; it reports the cost of copying and hashing files under a
clean filter at reset and is an input to W2 and W4.

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `bench/workspace/ › W1 to W6 suites` | the protocol of each label, using the harness of C001-T-020 |
| add | `bench/results/workspace-<date>.md` | raw results per run, per OS, per benchmark change, and a summary with one result line per label and its pass or miss, as C001-ADR-006 §11 requires (W6 reported with its share of (a) and (c)) |

## Preconditions
- C001-T-020 and C001-T-018 done; benchmark set frozen (C001-T-013).

## Step outline
1. W5 first: full and touched-path check on a 500,000-line tree, observer set-up on a working tree
   with installed dependencies, per-run observation cost.
2. W1: preparation time and first-results ratio (C001-AS-08), per benchmark change.
3. W2: (a) with reset, checks and observation in the measured run, 3 runs.
4. W3: (b) with the copy, root rewrite, self-containment check and 7 workers; report copy time,
   mutant count and mean time per mutant.
5. W4: (c) with 10 fixed-text commands, at least one run during and one after mutation testing,
   split into reset, checks, observation, shell start and save.
6. W6: on the W6 fixture of C001-T-020, measure fill and reset time once with every covered file
   holding its working-tree copy and once with every covered file holding its stored form; report
   the share of (a) and (c) that these resets take (C001-ADR-006 A1.5, A1.6). The production code
   for covered files comes later (C001-T-028, C001-T-067), so W6 uses the covered-file spike of
   C001-T-020; C001-T-093 measures again on the production code.
7. Record the results in `bench/results/workspace-<date>.md`; state per label pass or miss for
   C001-T-024 (W6: reported, with its share of (a) and (c)). A result that would change the
   decision of C001-ADR-006 goes to C001-T-024, never into the ADR.

## Verification
- `npm run bench -- workspace-w5`
- `npm run bench -- workspace-w1`
- `npm run bench -- workspace-w2`
- `npm run bench -- workspace-w3`
- `npm run bench -- workspace-w4`
- `npm run bench -- workspace-w6`

## Done when
- [ ] W1 to W5 have results for every benchmark change on the reference machine and reports from each OS.
- [ ] W6 has results on its fixture for both fill states, on the reference machine and each OS.
- [ ] The summary of `bench/results/workspace-<date>.md` holds one result line per label with pass
      or miss (W6 reported), and no file under `.sdd/` is changed.
