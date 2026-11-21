---
id: C001-T-086
artifact: plan/task
change: "CHG-001"
phase: 20-plan
title: Provider keys — environment variables and per-OS credential-store readers
milestone: C001-M-06
status: in-progress
depends_on: [C001-T-085]
implements: [C001-REQ-809, C001-REQ-820]
satisfies_ac: [C001-AC-809.1, C001-AC-820.1]
verified_by: [C001-TS-825, C001-TS-826, C001-TS-827, C001-TS-858, C001-TS-861, C001-TS-862, C001-TC-851]
components: [C001-COMP-015, C001-COMP-006]
risk_refs: [C001-RISK-018, C001-RISK-002]
estimate: L
report: { commit: null, completed_at: null, notes: null }
---
# C001-T-086 — Provider keys: environment variables and per-OS credential-store readers

## Intent
Read a provider key at each request preparation from the environment variable or the credential-store
entry that the configuration names, never from the repository and never stored or logged
(C001-CON-21, C001-IF-010 §7), with the per-OS readers of C001-ADR-008 §1 to §3; only services
`sdd-review` or `sdd-review/…` are accepted (C001-REQ-820; the spec wins where C001-ADR-008 still
calls this a later option).

## Targets
| Kind | Target | Change |
|---|---|---|
| add | `src/core/model/keys/key-source.ts › key lookup` | environment, credential store, default entry; normalisation; no cache |
| add | `src/core/model/keys/macos.ts › security reader` | `/usr/bin/security` without shell, 30 s timeout |
| add | `src/core/model/keys/windows.ts › CredReadW reader` | FFI or native addon chosen here; UTF-16LE or UTF-8 decoding |
| add | `src/core/model/keys/linux.ts › Secret Service reader` | permissive D-Bus client; no unlock prompt; 5 s timeout |
| add | `test/unit/model/keys/` | logic without a credential store: lookup order, service-name check, normalisation, UTF-16LE and UTF-8 decoding of recorded secrets, not-found and cannot-open classes from recorded reader results; log scan for the test key |
| add | `test/integration/model/keys/credential-store.test.ts` | C001-TC-851, the real store of each CI runner: a test key stored under service `sdd-review` in macOS Keychain, Windows Credential Manager and Linux Secret Service (gnome-keyring in a D-Bus session) is read; on a Linux runner with no Secret Service the reader ends within its 5 s timeout and the environment variable is used (C001-RISK-018) |

## Preconditions
- C001-T-085 done; the FFI library and the D-Bus client licences confirmed by C001-T-002.

## Step outline
1. Implement the lookup order and the service-name check.
2. Implement the three readers with their not-found and cannot-open classes.
3. Log failed lookups with provider, entry and cause class only.
4. Run the per-OS CI set-up of C001-ADR-008 §4 for the integration test.

## Verification
- `npm test -- test/unit/model/keys`
- `npm test -- test/integration/model/keys` (on each CI runner kind)
- `npm run acceptance -- --scenario C001-TS-825 --scenario C001-TS-826 --scenario C001-TS-827 --scenario C001-TS-858 --scenario C001-TS-861 --scenario C001-TS-862`
- `npm run secret-scan`

## Done when
- [ ] The listed scenarios pass on each CI operating system.
- [ ] The log scan finds no test key in any log, result, record or view.
