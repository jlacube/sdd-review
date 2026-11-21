---
id: C001-T-018
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Working-tree observer — macOS and Windows implementations
milestone: C001-M-01
status: done
depends_on: [C001-T-017]
implements: [C001-REQ-523, C001-REQ-524, C001-NFR-016]
satisfies_ac: [C001-AC-523.1, C001-AC-524.1]
verified_by: [C001-TS-570, C001-TS-571, C001-TS-577, C001-TS-578, C001-TC-552]
components: [C001-COMP-011]
risk_refs: []
estimate: L
report: { commit: "94e1018", completed_at: 2026-11-21, notes: "Windows (ReadDirectoryChangesW) and macOS (FSEvents) observers + platform switch; macOS fixed with marker-barrier drains and moved-dir detection (debug/t018-macos); all observer suites green on 4 CI runners at 1723d6b; gap: ancestor of an external git dir renamed and back within a run; workspace watcher macOS fallback still to move to native observer; PR at M-01 merge" }
---
# C001-T-018 — Working-tree observer: macOS and Windows implementations

## Intent
Implement the observer model of C001-T-017 with FSEvents on macOS and `ReadDirectoryChangesW` on
Windows, with the drain at run end and the causes of the C001-ADR-006 §9 table for each OS.

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `src/core/evidence/observer/macos.ts › FSEvents observer` | stream per root with file-level events, `FSEventStreamFlushSync` and event-ID window, `MustScanSubDirs`, `UserDropped`, `KernelDropped`, `RootChanged`, network volume types |
| add | `src/core/evidence/observer/windows.ts › ReadDirectoryChangesW observer` | subtree handle on the working-tree root and on git directories outside it, 64 KiB buffer, zero-byte completion and `ERROR_NOTIFY_ENUM_DIR`, handle errors after a root moves, `\\wsl$` shares |
| add | `test/unit/evidence/observer/macos-flags.test.ts`, `windows-status.test.ts` | mapping of recorded FSEvents flags and `ReadDirectoryChangesW` completions (zero bytes, `ERROR_NOTIFY_ENUM_DIR`, handle errors) to causes; no real notification |
| add | `test/integration/evidence/observer/macos.test.ts`, `windows.test.ts` | C001-TC-552, real FSEvents and `ReadDirectoryChangesW` on the macOS and Windows runner kinds: each cause raised on its OS; a change in the working tree during a run reported |

## Preconditions
- C001-T-017 done; native binding licences confirmed by C001-T-002.

## Step outline
1. Implement the macOS observer and its drain; map the flags to causes, with the named subtree as
   the top-most path where FSEvents gives one.
2. Implement the Windows observer and its repeated non-blocking drain.
3. Run the integration cause tests on the macOS x86-64, macOS arm64 and Windows CI runners.

## Verification
- `npm test -- test/unit/evidence/observer`
- `npm test -- test/integration/evidence/observer` (on the macOS x86-64, macOS arm64 and Windows runners)
- `npm run acceptance -- --scenario C001-TS-570 --scenario C001-TS-571 --scenario C001-TS-577 --scenario C001-TS-578` (on macOS and Windows, with C001-T-069)

## Done when
- [ ] Each macOS and Windows cause of the C001-ADR-006 §9 table is raised in a test on its OS.
- [ ] A change made in the working tree during a run is reported on every CI operating system.
