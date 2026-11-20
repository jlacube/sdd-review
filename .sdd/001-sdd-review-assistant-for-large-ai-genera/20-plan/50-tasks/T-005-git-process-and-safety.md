---
id: C001-T-005
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Git access adapter — program check and hardened read-only execution
milestone: C001-M-01
status: done
depends_on: [C001-T-001, C001-T-002, C001-T-003]
implements: [C001-REQ-125, C001-REQ-120]
satisfies_ac: [C001-AC-125.1, C001-AC-120.1]
verified_by: [C001-TS-165, C001-TS-166, C001-TS-144, C001-TS-145, C001-TS-146, C001-TC-024, C001-TC-025]
components: [C001-COMP-003]
risk_refs: [C001-RISK-005, C001-RISK-002, C001-RISK-014]
estimate: L
report: { commit: c8db8b0, completed_at: 2026-11-20, notes: "Adapter runner/env/program-check/port; 86 unit+integration tests green on 4 runners; hostile-repo and hook-env verified on git 2.34.0, 2.45.1, 2.56.1 locally on Windows only (CI runs PATH git only: SDD_GIT_234/SDD_GIT_LATEST not yet set in CI); TS-165 pending (needs root), TS-144/145/146/166 await intake T-008; D-014 raised; untrackedCache part of G-17 unproven; PR at M-01 merge" }
---
# C001-T-005 — Git access adapter: program check and hardened read-only execution

## Intent
Run the installed git program as a separate process under the safety rules of C001-IF-012 §2 and
the hardening profile of C001-ADR-004 with its Amendment 1: no write, no repository-configured
program, no network. Every git process starts with the git repository-locating variables cleared,
so that a review started from a git hook reads the repository it names and not a hook's temporary
index (P-01's answer to Q-hookenv-01, C001-RISK-005). Before the first git read of each command,
check the program and the repository and stop with ERR-INTAKE-008 and its cause (C001-IF-012 §6).

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `src/core/git/process.ts › git process runner` | spawns git with the hardening profile (including `core.untrackedCache=false`, C001-ADR-004 A1.3) and the cleaned environment, a persistent `cat-file --batch` process, bounded output, cancellation |
| add | `src/core/git/environment.ts › git read environment` | the developer's environment with every variable of the "Removed" list of C001-IF-013 §1 item 7 removed (case-insensitive names on Windows); one shared list constant, also used by C001-T-019 |
| add | `src/core/git/program-check.ts › program check` | the five causes of C001-IF-012 §6 (not found, cannot start, no readable version, older than 2.34, repository refused) |
| add | `src/core/git/port.ts › GitAccessPort` | the port of C001-IF-012 §3 as an interface; operations filled by C001-T-006 |
| add | `test/unit/git/environment.test.ts`, `test/unit/git/program-check.test.ts` | removal list applied case-insensitively on Windows; each cause of the program check mapped to its text (no git process started) |
| add | `test/integration/git/hostile-repository.test.ts` | C001-TC-024: fixture `fx-hostile` (hooks, fsmonitor, filters, textconv, pagers, credential helpers, promisor remote) runs no program, opens no connection and writes nothing, on git 2.34.0 and the latest git release |
| add | `test/integration/git/hook-environment.test.ts` | C001-TC-025: each removed variable set to a decoy repository, index or object store; reads return the target repository's data and never touch the decoy |

## Preconditions
- C001-T-003 done (ERR-INTAKE-008 in the catalogue).
- C001-T-002 done (git option facts confirmed from their sources; report row to complete).
- Where C001-ADR-004 and C001-IF-012 disagree, C001-IF-012 applies (`10-strategy.md` §2).

## Step outline
1. Implement the runner with the environment and `-c` overrides of the hardening profile of
   C001-ADR-004 and its Amendment 1 (A1.3 adds `core.untrackedCache=false`); reject any operation
   outside the read-only allowlist.
2. Build the git read environment: start from the developer's environment and remove every
   variable on the "Removed" list of C001-IF-013 §1 item 7 (`GIT_DIR`, `GIT_INDEX_FILE`,
   `GIT_WORK_TREE` and the others of that list) before every git process, the program check and
   the persistent batch process included. The repository is always named explicitly to git, never
   found through these variables. The "Replaced" and "Kept" rules of that item govern evidence
   commands (C001-T-019) and are not applied here. Plan decision under Q-hookenv-01; no
   requirement of the specification changes.
3. Implement the program check, run once per command before the first read.
4. Build the hostile-repository integration test that C001-ADR-004 names as follow-up (A1.8),
   comparing the repository (working tree, index, refs, config) before and after, on git 2.34 and
   on the latest git release.
5. Build the hook-environment test: a fixture repository plus a decoy repository and a decoy index
   file; run the adapter with each removed variable set to the decoy, and once from a real
   `pre-commit` hook, installed by the test, that calls the adapter during a `git commit` of
   chosen paths (git then sets a temporary `GIT_INDEX_FILE`); assert the result equals a run from a plain
   shell and the decoy files are never opened.
6. Record the confirmed effect of the profile options, `core.untrackedCache=false` included, in the
   report of C001-T-002 (C001-RISK-002).
7. Prove C001-REQ-120 for the operations available so far; C001-T-006 extends the proof.

## Verification
- `npm test -- test/unit/git`
- `npm test -- test/integration/git`
- `npm run acceptance -- --scenario C001-TS-165 --scenario C001-TS-166`
- `npm run acceptance -- --scenario C001-TS-144 --scenario C001-TS-145 --scenario C001-TS-146`

## Done when
- [ ] Each cause of C001-IF-012 §6 stops the command with ERR-INTAKE-008 and its cause text.
- [ ] The hostile-repository test shows no program started and no byte changed in the repository.
- [ ] No git child process is left after cancellation.
- [ ] No git process of the adapter has a variable of the "Removed" list of C001-IF-013 §1 item 7
      in its environment; the hook-environment test passes on the three CI operating systems.
