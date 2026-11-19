---
id: "C001-OA-010"
artifact: plan/option-analysis
change: "CHG-001"
phase: 20-plan
status: draft
---
# OA-010 — Credential-store access per operating system

## Problem

The model gateway (C001-COMP-015) reads a provider key, when a request is prepared, from the
environment variable `keyEnv` and else from the credential-store entry `keyCredential`, by default
service `sdd-review` and account = provider name (C001-IF-010 §7, `50-interfaces/README.md` §2,
C001-REQ-809, scenario C001-TS-826). A store that cannot be opened counts as holding no key; keys
never appear in the repository, logs, results, the record or the UI (C001-CON-21). The review
assistant only reads the store; the developer stores the key. The access must exist on Windows 11,
macOS 14+ and Ubuntu 22.04+ (C001-CON-15), carry permissive licences only and link no copyleft
library (C001-CON-07; libsecret is LGPL-2.1), and open no network connection (C001-CON-11). The
decision depends on the implementation language (architect A) only for how native calls are made;
the candidates are stated without it. Out of scope: storing keys from the CLI (no such command in
C001-IF-001) and the key lookup order (fixed by C001-IF-010 §7).

## Criteria

| Criterion | Weight (%) |
|---|---|
| Conformance and secret hygiene | 30 |
| Works on every supported OS, desktop and headless | 20 |
| Permissive licences, no copyleft linking | 20 |
| Low build and maintenance effort | 15 |
| Developer setup with the OS's own tools | 15 |

- **Conformance and secret hygiene** — read only, at request time, the entry named by `service`
  and `account`; no caching beyond the request; no secret in arguments, logs or errors; a store
  that cannot be opened gives "no key" (C001-IF-010 §7, C001-CON-21).
- **Every OS, desktop and headless** — works in a desktop session and fails cleanly (no hang, no
  dialog that blocks a headless run) over SSH or in CI.
- **Licences** — C001-CON-07, NFR-D-03, transitive dependencies included.
- **Effort** — code and native packaging per OS and architecture (constitution principle 1).
- **Developer setup** — the entry can be written with the tool the OS already provides
  (Keychain, Credential Manager, Secret Service), and the documentation names one command per OS.

## Candidates

- **1 — Per-OS native readers** — macOS: the system program `/usr/bin/security`
  (`find-generic-password -s <service> -a <account> -w`); Windows: the Credential Manager API
  `CredReadW` for a generic credential; Linux: the freedesktop Secret Service API spoken over D-Bus
  with a permissive D-Bus client (no libsecret).
- **2 — Own bindings to every OS API** — as 1, but macOS through the Security framework
  (`SecItemCopyMatching`) instead of the `security` program.
- **3 — Cross-platform keyring library of the implementation language** — for example Python
  `keyring`, the Rust `keyring` crate, Go `go-keyring` or Node `@napi-rs/keyring`, pinned to the
  OS backends.
- **4 — OS command-line tools only** — macOS `security`, Windows PowerShell with a credential
  script, Linux `secret-tool`.
- **5 — Environment variables only** — no credential store in this release.

## Scores

| Candidate | Conformance and secret hygiene | Works on every supported OS, desktop and headless | Permissive licences, no copyleft linking | Low build and maintenance effort | Developer setup with the OS's own tools | Weighted |
|---|---|---|---|---|---|---|
| Weights | 30 | 20 | 20 | 15 | 15 | 100 |
| 1 — Per-OS native readers | 5 | 5 | 5 | 3 | 5 | 4.70 |
| 2 — Own bindings to every OS API | 5 | 4 | 5 | 2 | 4 | 4.20 |
| 3 — Cross-platform keyring library | 4 | 4 | 4 | 5 | 3 | 4.00 |
| 4 — OS command-line tools only | 3 | 2 | 3 | 4 | 4 | 3.10 |
| 5 — Environment variables only | 1 | 5 | 5 | 5 | 2 | 3.35 |

Justifications (sources: section Sources; none opened in this session):

- **1.** Conformance 5: each reader asks for exactly one entry, the secret travels through a pipe or
  memory and never through arguments, nothing is cached. OS 5: an item that the developer creates
  with `security add-generic-password` lists `security` as a trusted application, so later reads
  through it raise no dialog; over SSH a locked keychain fails at once ("user interaction is not
  allowed"), as does a missing or locked Secret Service, both read as "no key". Licences 5: OS
  programs and APIs, plus a permissive D-Bus client. Effort 3: one process call, one small API
  binding, one D-Bus client. Setup 5: `security`, `cmdkey` and `secret-tool` or Seahorse write the
  entry that the reader expects.
- **2.** OS 4: an item created by `security` or Keychain Access trusts only those programs, so a
  read through the Security framework from the review assistant's executable raises a keychain
  dialog, which blocks headless runs until it times out and asks again after each update of the
  runtime. Effort 2: Core Foundation bindings on top of 1. Setup 4.
- **3.** Conformance 4: backend selection logic (for example Python `keyring` honours
  `PYTHON_KEYRING_BACKEND` and may pick a plaintext backend if one is installed; the Rust crate can
  use the kernel keyutils store instead of Secret Service), and entry layouts differ between
  libraries. OS 4: macOS reads through the Security framework, with the dialog of 2. Licences 4:
  transitive native dependencies to check (for example libdbus, AFL-2.1 or GPL-2.0). Effort 5.
  Setup 3: the layout on Windows and Linux follows the library, not the OS tools' defaults.
- **4.** OS 2: Ubuntu does not install `secret-tool` (package `libsecret-tools`) by default; Windows
  has no built-in program that prints a generic credential's secret, so a PowerShell script would
  compile a native call on each read and fails under Constrained Language Mode. Licences 3:
  `secret-tool` is an LGPL program run separately, which needs the separate-program argument of
  C001-CON-14. Conformance 3, effort 4, setup 4.
- **5.** Conformance 1: C001-IF-010 §7 and scenario C001-TS-826 require the credential-store lookup.
  Setup 2: keys end up in shell profiles in plain text.

## Sensitivity

- **1 against 2 (gap 0.50).** 1 scores at least as high as 2 on every criterion, so no weight
  change makes 2 lead.
- **1 against 3 (gap 0.70).** 1 − 3 = w(conformance) + w(OS) + w(licences) − 2·w(effort) +
  2·w(setup). 3 leads only when effort dominates, for example 20, 10, 10, 50, 10 (3 at 4.40, 1 at
  4.00); giving build effort half the weight in a decision about secret handling is not plausible.
- **Score risk.** If the D-Bus client of the chosen language proves unmaintained, the effort score
  of 1 drops to 2 (total 4.55); it still leads.

## Presented

1. **1 — Per-OS native readers** (4.70) — recommended.
2. **2 — Own bindings to every OS API** (4.20) — uniform native code, keychain dialogs on macOS.
3. **3 — Cross-platform keyring library** (4.00) — least code, less control over behaviour.

## Recommendation

**1 — Per-OS native readers**: it reads exactly the entry that each OS's own tool writes, raises no
keychain dialog for entries created as documented, fails cleanly when headless, and links no
copyleft library. No near tie applies (lead 0.50 over 2).

## Rejected

- **4 — OS command-line tools only** (3.10) — no built-in Windows reader, `secret-tool` missing by
  default on Ubuntu and LGPL-licensed.
- **5 — Environment variables only** (3.35) — violates C001-IF-010 §7 and scenario C001-TS-826.

## Sources

Not opened in this session (2026-11-18); facts from the architect's knowledge, to be confirmed by a
research note before the plan gate:

- macOS `security(1)` man page (`find-generic-password`, `add-generic-password`, `-w`, `-T`).
- Microsoft Learn, `CredReadW` and `CREDENTIALW`; `cmdkey` command reference.
- freedesktop.org Secret Service API specification (`OpenSession`, `SearchItems`, `GetSecrets`,
  `Unlock`, "plain" algorithm).
- libsecret (LGPL-2.1-or-later) and `secret-tool(1)`; Ubuntu package `libsecret-tools`.
- Python `keyring` documentation (backend selection, `PYTHON_KEYRING_BACKEND`); Rust `keyring`
  crate features (keyutils, Secret Service); `go-keyring` (macOS backend calls `security`).
