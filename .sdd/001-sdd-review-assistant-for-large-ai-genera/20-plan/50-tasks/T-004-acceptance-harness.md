---
id: C001-T-004
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Acceptance harness, fixture repository builder and stub provider
milestone: C001-M-01
status: done
depends_on: [C001-T-001, C001-T-003]
implements: []
satisfies_ac: [C001-AC-101.1]
verified_by: [C001-TS-101, C001-TS-926]
components: [C001-COMP-001, C001-COMP-002]
risk_refs: []
estimate: L
report: { commit: 8a10893, completed_at: 2026-11-20, notes: "Harness, fixture builder (labels, --repo base option), stub-llm, headless reader, Playwright driver; 20 unit tests + browser CI job green on 4 runners; TS-101/TS-926 automated and fail until T-008/T-010; PR at M-01 merge" }
---
# C001-T-004 — Acceptance harness, fixture repository builder and stub provider

## Intent
Every acceptance scenario of `10-spec/20-capabilities/*/acceptance.md` runs as an automated test
selected by its scenario ID (C001-DOD-001 to C001-DOD-009). This task builds the runner, the
fixture repository builder with labelled commits, readers of the headless output, the `stub-llm`
local provider and the browser driver, following the fixture conventions stated at the top of each
acceptance file. The harness implements no requirement (C001-REQ-101 is implemented by C001-T-006
and C001-T-008, C001-REQ-912 by C001-T-010); `satisfies_ac` names the first criterion it runs
(`10-strategy.md` §2).

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `test/acceptance/runner/` | Cucumber.js runner; `npm run acceptance -- --scenario <TS-ID>` and `npm run acceptance:browser` |
| add | `test/fixtures/builder/ › fixture repository builder` | builds git repositories from declarative fixtures, records hash and subject per label, sets git version on `PATH` per scenario; base option: by default a fixture starts from an empty repository, and with `npm run acceptance -- --repo <ecosystem>` (repeatable; `typescript`, `python`, `csharp`) the builder starts from the reference repository of that ecosystem at the commit recorded in `bench/set/benchmark-set.json` (C001-T-013) and writes the scenario's declared files on top (C001-TC-008) |
| add | `test/fixtures/repos/` | `fx-intake`, `fx-local`, `fx-default`, `fx-lfs`, `fx-crypt` and the other named fixtures, added as their scenarios are automated |
| add | `test/acceptance/support/headless-output.ts` | reads the files written by the headless analysis (C001-IF-008, C001-IF-009) |
| add | `test/acceptance/support/stub-llm/` | loopback provider with scripted answers that records every request; model name `stub-model-1` |
| add | `test/acceptance/support/browser.ts` | Playwright driver for Chrome, Edge and Firefox |

## Preconditions
- C001-T-001 and C001-T-003 done; C001-T-002 (through C001-T-003) confirmed the licences of
  Cucumber.js and Playwright.

## Step outline
1. Add the runner and bind step definitions by scenario ID; an unbound step fails the scenario.
2. Implement the fixture builder (labels, commits, working-tree edits, ignore rules, attributes,
   filters, remotes and upstream branches) on the developer's git, outside the system under test.
   Add the base option `--repo <ecosystem>`: the builder clones the base repository at a recorded
   commit into the fixture directory, then applies the declared files and commits; it reads the
   repository and commit per ecosystem from `bench/set/benchmark-set.json`, and fails with a clear
   message while that file does not exist (C001-T-013 writes it; until then the option is tested
   with a small local base repository).
3. Implement the headless-output reader and the `stub-llm` provider (OpenAI-compatible and
   Anthropic Messages shapes of C001-IF-010 §4 and §5).
4. Add the browser driver and the per-browser CI job.
5. Automate C001-TS-101 as the first scenario; it fails until C001-T-008 exists.

## Verification
- `npm test -- test/fixtures`
- `npm run acceptance -- --scenario C001-TS-101`

## Done when
- [ ] Scenarios are selectable by ID and report pass, fail or undefined per scenario.
- [ ] The fixture builder records label hashes that steps can assert on.
- [ ] With `--repo <ecosystem>` a fixture is built on the given base repository at its recorded
      commit, with the declared files on top; without it, on an empty repository.
- [ ] `stub-llm` records every request it receives.
