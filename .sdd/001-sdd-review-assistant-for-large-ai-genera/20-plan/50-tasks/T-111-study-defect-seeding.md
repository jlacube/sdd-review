---
id: C001-T-111
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Comparison study — defect seeding and sealed lists
milestone: C001-M-07
status: todo
depends_on: [C001-T-110]
implements: []
satisfies_ac: [C001-AC-610.1, C001-AC-301.1]
verified_by: [C001-TC-007]
components: [C001-COMP-019, C001-COMP-001]
risk_refs: [C001-RISK-015]
estimate: L
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-111 — Comparison study: defect seeding and sealed lists

## Intent
The study seeder (appointed by P-01; neither moderator nor rater nor participant) seeds at least 8
defects into each of the changes A to D, at least one of each of the six kinds of `30-nfr/nfr.md`
§3 item 3, and writes the sealed list into an encrypted file whose key only the seeder holds until
the last session has ended (`60-test-plan.md` §6 item 3). At about 20 minutes per defect, 32
defects or more plus the sealed lists take about 2 days. `satisfies_ac` names the criteria whose
value the study measures (`10-strategy.md` §2).

## Targets
| Kind | Target | Change |
|---|---|---|
| modify | private study repositories of A to D | each defect folded into the agent commit that last touched its file, so the commit list stays the agent's and no commit names the seeding; the seeded HEAD hashes replace the frozen ones for the sessions |
| add | `study/g8/sealed/` | one encrypted sealed list per change (file, lines, kind, description per defect) and the seeded HEAD hash in clear |

## Preconditions
- C001-T-110 done; the study seeder is appointed and is neither the moderator nor a rater.

## Step outline
1. Per change, choose spots for at least 8 defects, at least one of each of the six kinds, and seed
   them as small, plausible edits folded into the agent's commits.
2. Write each change's sealed list and encrypt it; keep the key outside the repository.
3. Record the seeded HEAD hashes in clear next to the sealed lists, so the moderator opens exactly
   the seeded changes.

## Verification
- `npm run study -- g8-validate-pool --seeded` (every seeded HEAD exists in its private repository and has the frozen base)

## Done when
- [ ] Changes A to D each hold at least 8 seeded defects, at least one of each of the six kinds.
- [ ] Each sealed list is encrypted, and only the seeder holds its key.
