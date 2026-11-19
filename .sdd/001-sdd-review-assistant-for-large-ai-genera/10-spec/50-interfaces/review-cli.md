---
id: "C001-IF-001"
artifact: spec/interface
change: "CHG-001"
phase: 10-spec
status: draft
kind: CLI
---
# C001-IF-001 — Review assistant CLI contract

Provider: C001-COMP-001. The executable is `sdd-review` (`README.md` §2, Q-naming-01). Every command calls the core API (C001-IF-003); none needs the local review
UI except `review` and `open` (C001-REQ-913, C001-CON-09).

## Synopsis
```text
sdd-review review  [<intake options>] [--port <n>] [--no-browser]
sdd-review open    [<snapshot-id>] [--port <n>] [--no-browser]
sdd-review analyse --headless --out <directory> [<intake options>]
sdd-review reviews
sdd-review status  [--snapshot <snapshot-id>]
sdd-review intents [--snapshot <snapshot-id>]
sdd-review sign    <intent> [--snapshot <snapshot-id>] [--confirm-open-hunks <n>]
sdd-review reject  <intent> --reason <text> [--snapshot <snapshot-id>]
sdd-review defer   <intent> --note <text> [--snapshot <snapshot-id>]
sdd-review config validate [--file <path>]

<intake options> = [--base <commit>] [--sdd-change <id>] [--pr-text <file>]
                   [--plan <file>]... [--transcript <file>]... [--test-command <command>]
global options   = [--repo <directory>] [--format text|json] [--help] [--version]
```

- `--repo` defaults to the current directory. `--format json` prints the JSON documents of
  C001-IF-008 and C001-IF-009 instead of text.
- `<intent>` is an intent ID (`i-…`), a unique prefix of one of at least 6 characters, or the spec
  item ID of an intent taken from an SDD change. Exactly one intent per command (C001-REQ-702).
- Without `--snapshot`, review commands act on the review most recently opened in the repository
  by `review`, `open` or `analyse`.
- `--plan` and `--transcript` may be repeated; `--pr-text` is given at most once.
- Every value is passed to the core as data; a value that starts with `-` is never taken as a
  commit name (ERR-INTAKE-003).

## Commands
| Command | Arguments / options | Effect | Requirements |
|---|---|---|---|
| `review` | intake options; `--port <n>` (default: a free port chosen by the operating system); `--no-browser` | Takes in the change, prints the intake summary, the size warning and the intake notices (ERR-SDD-004, ERR-SDD-005), runs the static analysis, starts the UI server on 127.0.0.1, opens the review in the default browser (or prints its address), then runs evidence and model jobs in the background until interrupted. If a review of the same snapshot is already served, opens that one instead. | C001-REQ-101 to C001-REQ-114, C001-REQ-119, C001-REQ-121, C001-REQ-123, C001-REQ-124, C001-REQ-201, C001-REQ-223, C001-REQ-302, C001-REQ-326, C001-REQ-505, C001-REQ-808, C001-REQ-901, C001-REQ-902 |
| `open` | `<snapshot-id>` (default: the most recent review); `--port`; `--no-browser` | Reopens an existing review without intake, restores its state and serves it; shows the moved-on notice when the working tree differs. | C001-REQ-117, C001-REQ-918, C001-REQ-919 |
| `analyse --headless` | `--out <directory>` (required, created when missing); intake options | Runs intake and the whole analysis without the UI, waits until the test run, mutation testing and model tasks are complete or unavailable, then writes the files listed under Output. | C001-REQ-912, C001-REQ-913, C001-REQ-914 |
| `reviews` | — | Lists the reviews of the repository: snapshot ID, base and HEAD commits, creation time, decision status, and the path of the review record file (C001-IF-009), which the developer can give to others. | C001-REQ-118, C001-REQ-714 |
| `status` | `--snapshot` | Prints the decision status, the read, cleared and open shares of the change, the coverage statement and the moved-on notice when it applies. | C001-REQ-117, C001-REQ-602, C001-REQ-613, C001-REQ-711 |
| `intents` | `--snapshot` | Prints each intent with its ID, title, current verdict or stale status with causes, and its read, cleared and open shares; orphan code and unmet intents first. | C001-REQ-916, C001-REQ-718 |
| `sign` | `<intent>`; `--confirm-open-hunks <n>` | Records a sign verdict. With open hunks: on a terminal, prompts with the number of open hunks and their changed lines and records only on "y"; without a terminal, records only when `<n>` equals the current number of open hunks. | C001-REQ-701 to C001-REQ-703, C001-REQ-712, C001-REQ-721, C001-REQ-915 |
| `reject` | `<intent>`; `--reason <text>` (required) | Records a reject verdict with the reason. | C001-REQ-704, C001-REQ-706, C001-REQ-712, C001-REQ-721, C001-REQ-915 |
| `defer` | `<intent>`; `--note <text>` (required) | Records a defer verdict with the note. | C001-REQ-705, C001-REQ-706, C001-REQ-712, C001-REQ-721, C001-REQ-915 |
| `config validate` | `--file <path>` (default: `.sdd-review/config.json` of the working tree) | Validates a review configuration against C001-IF-004 and lists ignored settings; changes nothing. | C001-REQ-425, C001-REQ-427 |

A verdict command prints the moved-on notice before recording when the working tree no longer
matches the snapshot (C001-REQ-117) and leaves the repository unchanged (C001-REQ-707). `sign`,
`reject` and `defer` are the only CLI commands that write review record entries. When
`user.name` or `user.email` of the repository's git configuration is not set, they record nothing
and exit 6 with ERR-ACT-006, after the checks of the intent and the reason or note and before any
open-hunk prompt (C001-IF-003 §4); the command never sets the git configuration itself
(C001-REQ-721, C001-REQ-120). Read-only commands (`review`, `open`, `analyse`, `reviews`,
`status`, `intents`, `config validate`) work without a git identity.

## Exit codes
| Code | Meaning |
|---|---|
| 0 | The command completed and wrote all its results (notices may have been printed) |
| 1 | Internal error (ERR-CLI-003) |
| 2 | Usage error (ERR-CLI-001) |
| 3 | Intake refused: ERR-INTAKE-001 to ERR-INTAKE-004, ERR-CTX-001 to ERR-CTX-003, ERR-SDD-001 to ERR-SDD-003; git unusable: ERR-INTAKE-008, for every command that reads git data (C001-IF-012 §6) |
| 4 | Empty change (ERR-INTAKE-005) |
| 5 | Unknown review, intent or hunk (ERR-STORE-004, ERR-ACT-004) |
| 6 | Review action refused: ERR-ACT-001 to ERR-ACT-003, ERR-ACT-006 (the actions of the local review UI return the other refusals of `errors.md` as HTTP problems only) |
| 7 | Results not written (ERR-CLI-002) |
| 8 | Review state store error: ERR-STORE-001 to ERR-STORE-003 |
| 9 | UI server cannot listen (ERR-UI-004) |
| 10 | Invalid configuration file (ERR-CFG-003, `config validate` only) |

`review` and `open` exit 0 when the developer stops them (interrupt signal) after the last
confirmed action has been saved (C001-REQ-914, C001-REQ-920).

## Output
- **Standard output:** results — the intake summary, the review address (with the token fragment
  of C001-IF-002), lists and statuses; with `--format json`, one JSON document.
- **Standard error:** progress, notices and errors as `<code>: <message>` from `errors.md`.
- **Cloud provider announcement:** before the first request to a cloud provider, on standard
  error: `Repository content is sent to model provider "<name>" at <host>.` (C001-REQ-808).
- **Intake summary (text):** base commit hash and subject line; how it was chosen, one of the cases
  of C001-IF-012 §4: `named <value>`, `merge base with upstream <ref>`,
  `merge base with default branch <ref>` (the default branch of the remote, local `main` or local
  `master`), or `HEAD (no upstream branch, no default branch of the remote, no local main or
  master with a merge base)`; whenever the base commit is HEAD itself, whichever of these cases
  chose it (for example `named HEAD`, or a merge base on which HEAD sits), the warning
  `only uncommitted edits are reviewed, name another base with --base` on the line after it
  (C001-REQ-114); changed files and changed lines; intent context found (SDD change and spec-item count, commits,
  named files by role, documented architecture or none); the test command that will run on the
  snapshot and where it comes from (`--test-command` or the configuration of the base commit), or
  `none`, since its own network use is outside the review assistant's control (C001-REQ-505,
  C001-REQ-803); the size warning ERR-INTAKE-006 when it applies (C001-REQ-104, C001-REQ-114,
  C001-REQ-121).
- **Headless output directory** (`analyse --headless`), each file valid against its schema:

| File | Schema |
|---|---|
| `intake.json` | C001-IF-008 `#/$defs/IntakeDocument` |
| `architecture-delta.json` | C001-IF-008 `#/$defs/ArchitectureDeltaDocument` |
| `intent-map.json` | C001-IF-008 `#/$defs/IntentMapDocument` |
| `triage.json` | C001-IF-008 `#/$defs/TriageDocument` |
| `evidence.json` | C001-IF-008 `#/$defs/EvidenceDocument` |
| `review-record.jsonl` | C001-IF-009, one line per entry |

  Existing files of these names are replaced; other files in the directory are left alone. A
  command that cannot write every file exits 7 and removes the files it wrote in this run.
