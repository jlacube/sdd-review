---
id: C001-T-110
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Comparison study — change pool A to D and the practice change
milestone: C001-M-07
status: todo
depends_on: [C001-T-013, C001-T-106, C001-T-109]
implements: []
satisfies_ac: [C001-AC-610.1, C001-AC-301.1]
verified_by: [C001-TC-007]
components: [C001-COMP-019, C001-COMP-001]
risk_refs: [C001-RISK-015]
estimate: L
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-110 — Comparison study: change pool A to D and the practice change

## Intent
The moderator takes the four agent changes of `60-test-plan.md` §6 item 2 (A 2,000–3,000,
B 3,001–5,000, C 5,001–8,000, D 8,001–10,000 changed lines; each deep ecosystem at least once; at
least one with an SDD workspace and one without) and one practice change outside the pool, each
produced by a coding agent from a written task description, and freezes them as commits before
seeding. The pool shares nothing with the benchmark set or the calibration corpus. `satisfies_ac`
names the criteria whose value the study measures (`10-strategy.md` §2).

## Targets
| Kind | Target | Change |
|---|---|---|
| add | private study repositories (one per change), readable by the moderator and the study seeder only | the agent's commits of each change, frozen; their HEAD hashes recorded |
| add | `scripts/study/ › g8-validate-pool` | checks size bands, ecosystem coverage and SDD-workspace coverage of `study/g8/pool.json` |
| add | `study/g8/pool.json` | per change: label, ecosystem, repository, base and frozen HEAD hashes, changed-line count, SDD workspace yes or no, task description hash; the practice change marked as such |

## Preconditions
- C001-T-013 and C001-T-106 done (benchmark set and calibration corpus fixed, so overlaps can be
  excluded); C001-T-109 done (record layout).

## Step outline
1. Write five task descriptions (A to D and the practice change) that differ from every benchmark
   and corpus task; run the coding agent; keep runs inside the size bands.
2. Check the coverage rules (ecosystems, SDD workspace) over A to D.
3. Freeze each change as commits in its private repository and record `study/g8/pool.json`.
4. Run the overlap check of C001-T-106 with the pool record present.

## Verification
- `npm run bench -- calibration --check-overlap` (now also checks `study/g8/pool.json`)
- `npm run study -- g8-validate-pool` (size bands, ecosystem and SDD-workspace coverage)

## Done when
- [ ] Four pool changes and one practice change are frozen, each within its size band, with the
      coverage rules of `60-test-plan.md` §6 item 2 met.
- [ ] No pool change overlaps the benchmark set or the calibration corpus.
