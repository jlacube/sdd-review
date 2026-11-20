---
id: "C001-ADR-008"
artifact: plan/adr
change: "CHG-001"
phase: 20-plan
status: accepted
date: 2026-11-18
deciders: ["P-01"]
amended: 2026-11-19
---
# C001-ADR-008 — Credential-store access per operating system

> **Amended on 2026-11-19** (Amendment 1 at the end of this file): aligned with the specification
> re-approved at G2 on 2026-11-19. The decision is unchanged.

## Context and problem

The model gateway (C001-COMP-015) reads a provider key when it prepares a request: first the
environment variable `keyEnv`, else the credential-store entry `keyCredential` (by default service
`sdd-review`, account = provider name), else no key; a store that cannot be opened counts as
holding no key (C001-IF-010 §7, `50-interfaces/README.md` §2, C001-REQ-809, C001-TS-826). Keys never
appear in the repository, logs, results, the record or the UI (C001-CON-21). C001-IF-010 §7 leaves
the access per operating system to this ADR; C001-CON-15 requires an implementation on Windows 11,
macOS 14+ and Ubuntu 22.04+, C001-CON-07 permissive licences without copyleft linking, and
C001-CON-11 no connection off the machine. Without the decision the entry layout per OS, the
behaviour of a locked store and the headless behaviour would be left to the implementer, and the
developer would not know which command stores a key where the tool finds it.

Native calls follow the implementation language of C001-ADR-001 (TypeScript on Node.js); see §3.

## Considered options

Options analysis: `OA-010-credential-store-access.md` (C001-OA-010).

- **Per-OS native readers** (4.70) — `security` program on macOS, `CredReadW` on Windows, Secret
  Service over D-Bus on Linux.
- **Own bindings to every OS API** (4.20) — Security framework on macOS instead of `security`.
- **Cross-platform keyring library** (4.00).

Rejected there: OS command-line tools only (3.10) and environment variables only (3.35, violates
C001-IF-010 §7).

## Decision outcome

**Accepted by P-01 on 2026-11-18.** Question Q-credentials-01 (`20-plan/questions-log.md`,
round 2), answer: "Per-OS native readers (Recommended)".

Chosen: **per-OS native readers**. Each reads exactly the entry that the OS's own tool writes,
raises no keychain dialog for entries created as documented, fails at once and without a dialog in
headless sessions, and links no copyleft library. The review assistant never writes to a
credential store.

## Design

### 1. Entry layout and reader per operating system

| OS | Entry | Reader | Not found | Cannot be opened (also "no key") | Developer stores the key with |
|---|---|---|---|---|---|
| macOS 14+ | generic password item; service = `<service>`, account = `<account>`; any keychain in the user's search list | `/usr/bin/security find-generic-password -s <service> -a <account> -w`, started without a shell, arguments as separate values; the secret is read from standard output | exit status 44 | any other non-zero exit, including a locked keychain in an SSH session; no answer within 30 s (a dialog for an item that does not trust `security`), after which the process is ended | `security add-generic-password -s sdd-review -a <provider> -w` (with `-w` last, `security` prompts for the key, so it stays out of the shell history) |
| Windows 11 | generic credential (`CRED_TYPE_GENERIC`); target name = `<service>/<account>`; user name = `<account>` | `CredReadW(<target>, CRED_TYPE_GENERIC)` in process; the blob is decoded as UTF-16LE when every second byte is zero, else as UTF-8 | `ERROR_NOT_FOUND` | any other error | `cmdkey /generic:sdd-review/<provider> /user:<provider> /pass` (prompts for the key), or Credential Manager › Windows Credentials › Add a generic credential |
| Ubuntu 22.04+ and other Linux | Secret Service item with attributes `service` = `<service>` and `account` = `<account>`, in any collection | Secret Service API on the session bus: `OpenSession` with the "plain" algorithm, `SearchItems`, `GetSecrets`; among unlocked matches, the default collection first, then the most recently modified item | no matching item | no session bus or no `org.freedesktop.secrets` service; only locked matches (the reader never starts an unlock prompt); no answer within 5 s | `secret-tool store --label="sdd-review <provider>" service sdd-review account <provider>` (package `libsecret-tools`), or Seahorse, KeePassXC or KWallet with Secret Service enabled |

- **Values:** `service` and `account` come from `keyCredential` or the defaults; they are passed as
  data (separate process arguments, API strings, D-Bus attribute values), never through a shell.
- **Normalisation:** trailing spaces, tabs, carriage returns and line feeds are removed (the
  `security` program ends its output with a line feed); an empty result means no key.
- **When:** at each request preparation, as C001-IF-010 §7 states; nothing is cached across
  requests, so a rotated key takes effect at the next request.

### 2. Hygiene

- The key is held only in the memory of the request being prepared and is not copied into
  results, notices, the record or the UI (C001-CON-21).
- Log entries of a failed lookup (NFR-D-04) name the provider, the entry (`service/account`) and the
  cause class (not found, locked, store unavailable, timed out, access denied), never the secret or
  the raw output of the store.
- The standard error of the `security` program, which holds only its error text, may be logged;
  its standard output is never logged.
- The Secret Service "plain" algorithm sends the secret over the per-user session bus socket,
  which only the same user can open; an encrypted session algorithm is used where the D-Bus client
  offers one.

### 3. Native calls and dependencies

- `CredReadW` is called through a permissive Node.js FFI library such as koffi (MIT) or a small
  native addon (C001-ADR-001); the implementing task chooses between them.
- The Secret Service is spoken with a Node.js D-Bus client that is permissively licensed and links
  neither libdbus nor libsecret (LGPL-2.1), for example dbus-next (MIT; maintenance to verify); the
  implementing task chooses it (C001-ADR-001).
- `/usr/bin/security` is part of macOS and is run as a separate program; nothing is shipped or
  linked.

### 4. Tests

Scenario C001-TS-826 and the failure scenarios of C001-REQ-816 run on each OS in CI: on macOS with a
temporary keychain added to the search list and the item created by `security`; on Windows with
`cmdkey`; on Linux with `gnome-keyring-daemon` started unlocked inside `dbus-run-session`. Further
cases: locked store, no store (headless Linux without a session bus), entry absent, UTF-8 and
UTF-16LE blobs on Windows, and a log scan for the test key (C001-DOD-029 style).

## Consequences

- **Good:** works with each OS's standard tools; no dialog for documented entries; clean headless
  fallback to "no key" and ERR-MODEL-006; no copyleft link; no new network path.
- **Bad:** three code paths to test; on Linux the D-Bus client becomes a dependency of the review
  assistant; on macOS an entry created by another application than `security` raises a keychain
  dialog or, headless, counts as "no key"; developers on Ubuntu without a desktop keyring must use
  `keyEnv`.
- **Residual risk:** the review configuration, read from the base commit, chooses both the entry
  and the provider endpoint, so a hostile base commit could name another application's entry and
  send it, with the cloud opt-in, to an endpoint of its choice. The same base commit can already run
  any code through `tests.command` (C001-REQ-505), so the trust boundary does not move. A hardening
  option for a later revision of C001-IF-004 is to accept only services named `sdd-review` or
  starting with `sdd-review/`; recorded as defect D-005 in `change.md` (Q-specfix-01).
- **Constraints:** realises the credential-store part of C001-CON-18 within C001-CON-07,
  C001-CON-11, C001-CON-15 and C001-CON-21; no new constraint.
- **Components:** C001-COMP-015 (key lookup at request preparation), C001-COMP-006 (passes
  `keyCredential`), C001-COMP-016 and C001-COMP-017 (receive the key for the request header only).
- **Follow-up:** user documentation with the three store commands; a research note confirming the
  `security` exit status for "not found", the cmdkey blob encoding and the Node.js D-Bus client.
- **Not verified online in this session:** the behaviour of `security`, `CredReadW`, `cmdkey` and
  the Secret Service API stated in §1, and the licences and maintenance state of koffi, dbus-next
  and libsecret, come from the architect's knowledge as of 2026-06 (C001-OA-010, Sources). The
  research note above confirms the behaviour; the licence check of C001-CON-07 (NFR-D-03) must
  confirm the licence of the FFI library and the D-Bus client before either is added.

## Amendment 1 — 2026-11-19: alignment with the revised specification

**Why.** This ADR raised defect D-005 (Q-specfix-01). The specification revision that closed it was
re-approved at G2 on 2026-11-19. It added C001-REQ-820, notice ERR-CFG-004, the pattern
`^sdd-review(/.*)?$` for `keyCredential.service` in the schema of C001-IF-004, and the matching
row in `50-interfaces/README.md` §2. C001-IF-010 §7 now states the trust boundary of the key
settings.

**What stays.** The decision is unchanged: per-OS native readers. P-01's acceptance of 2026-11-18
(Q-credentials-01) is unchanged, and so is C001-OA-010. The text above stays as it was accepted.
Where it differs from this amendment, this amendment applies.

| Passage above | Now |
|---|---|
| Consequences: "Residual risk: the review configuration … A hardening option for a later revision of C001-IF-004 …" | A1.1 (closed) |
| Design §1, "Values" | A1.2 |
| Design §4, Tests | A1.3 |

**A1.1 — Service names and trust boundary (C001-REQ-820, ERR-CFG-004, C001-IF-010 §7; D-005
closed).** The hardening option is now part of the specification. A review configuration whose
`keyCredential` names a service other than `sdd-review`, or a name beginning with `sdd-review/`,
is treated as a configuration that cannot be read (C001-REQ-427, C001-REQ-819). The review then
runs in model-free mode, clears no hunk and reports ERR-CFG-004 in place of ERR-CFG-001;
`config validate` reports ERR-CFG-003. The model gateway therefore never asks a reader for another
application's entry. The trust boundary stays where the Consequences put it, and C001-IF-010 §7 now
states it:
- the base commit's configuration is trusted as the project's own code;
- `keyEnv` may name any environment variable, by design;
- the service limit is defence in depth against a mistaken configuration, not the trust boundary.

**A1.2 — Values passed to the readers (Design §1).** The service name is checked when the
configuration is loaded (C001-COMP-006, against the schema of C001-IF-004), not in the readers. The
readers still pass `service` and `account` as data.
- A reader receives only `sdd-review` or a service beginning with `sdd-review/`. `account` is not
  limited.
- On Windows, a service `sdd-review/<name>` gives the target name `sdd-review/<name>/<account>`.
- The store commands in the table of §1 use the default service. For a configured
  `sdd-review/<name>`, the developer gives that service instead.

**A1.3 — Tests (Design §4).** Added: the scenarios of C001-REQ-820 (C001-TS-858 to C001-TS-862)
run on each operating system with an entry of a foreign service present in the store. They assert
that no reader is called for that entry, and that neither its key nor its content appears in a
log, a result or the record.
