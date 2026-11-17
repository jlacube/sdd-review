---
id: CONSTITUTION
artifact: constitution
status: approved
version: 1
updated: "2026-11-17"
---
# Constitution

<!-- Guidance: drafted by /architect:init in at most two interview rounds; approved at gate G0
(`/architect:gate constitution`). Every change inherits these rules. -->

Decisions behind this document: `.sdd/_constitution/questions-log.md` (rounds 1–2).
Toolchain: `.sdd/_constitution/toolchain.md`. The repository is greenfield (no code at init).

## Principles

1. **Simplicity first** — choose the simplest design that meets the stated requirements; add
   complexity only when a requirement or NFR demands it.
2. **Prefer reversible decisions** — when two options score close, pick the one that is cheaper
   to undo; irreversible choices need an ADR.
3. **Test what you specify** — every requirement has at least one acceptance scenario, and every
   scenario is automated.
4. **Explicit over implicit** — assumptions, limits and error behaviour are written down, not
   left to the implementer.
5. **Small increments** — deliver in changes and tasks small enough to review and roll back
   independently.

## Quality bar

- **Specs:** every spec, plan and ideation passes `sdd lint` and `sdd trace` with no errors and is
  reviewed by the critic before its gate; P-01 approves every gate.
- **Code:** every code change is peer-reviewed before merge.
- **Test levels required:** unit tests for the logic behind each requirement, and automated
  acceptance tests for every acceptance scenario. Integration tests are required when a change's
  spec or plan calls for them.

## NFR defaults

A change inherits these unless its spec sets another value with a reason.

| ID | Category (ISO/IEC 25010) | Default | Metric | Method |
|---|---|---|---|---|
| NFR-D-01 | Security — confidentiality | No secrets (keys, tokens, passwords) in the repository | Count of secrets detected | Secret scan of the repository; threshold = 0 |
| NFR-D-02 | Security — integrity | No dependency with a known high or critical vulnerability | Count of high/critical CVEs | Dependency audit of the language's package manager; threshold = 0 |
| NFR-D-03 | Maintainability — compliance | Dependencies use OSI-approved permissive licences | Count of non-permissive licences | Licence check of the dependency tree; threshold = 0 |
| NFR-D-04 | Maintainability — analysability | Errors are logged with context (operation, inputs identifying the case, cause) | Share of error paths with a contextual log entry | Code review against the error catalogue; threshold = 100 % |
| NFR-D-05 | Performance efficiency | No project-wide default; each change sets its own thresholds | — | Set in the change's NFRs |

## Global DoD

| ID | Statement | Evidence type |
|---|---|---|
| DOD-G-01 | All automated tests pass in CI (or the local test run when no CI exists) | test-report |
| DOD-G-02 | Every requirement is traced to at least one passing acceptance scenario | trace-report |
| DOD-G-03 | Every code change has been peer-reviewed and approved | review-record |
| DOD-G-04 | Linters and formatters of the touched languages report no errors | tool-output |
| DOD-G-05 | Living specs (`.sdd/_living/`) and user-facing docs are updated for the change | diff |

## Forbidden technologies

| Technology / licence / service | Reason |
|---|---|
| Copyleft-licensed dependencies (GPL, AGPL, LGPL, SSPL and similar) | Only OSI-approved permissive licences are allowed (NFR-D-03) |
| Dependencies with known high or critical vulnerabilities | Violates NFR-D-02 |
| Secrets committed to the repository (in code, config or `.sdd/`) | Violates NFR-D-01; use environment variables or a secret store |

## Profile thresholds

A change is proposed as **lite** when all of these hold; otherwise **full**:

| Measure | Lite when |
|---|---|
| Expected user stories | ≤ 5 |
| Expected requirements | ≤ 15 |
| Touched modules | ≤ 3 |

## Version control

| Setting | Value |
|---|---|
| Commit `.sdd/` at each gate approval | yes |

<!-- yes: the conductor approves with `sdd gate approve … --commit`, which commits only the change folder,
`.sdd/SDD.md` and `.sdd/registry.json` (message "CHG-<NNN>: <gate> approved by <approver>"); refused when
other changes are staged. no: you commit yourself. -->

## Language & conventions

- **Spec language:** English. IDs and code identifiers are in English.
- **File names:** kebab-case.
- **Glossary:** `.sdd/_living/glossary.md`; each change adds terms through its glossary delta.
- **Code style:** the standard formatter and linter of each language used (chosen when the
  language is introduced, recorded in the change's plan).

## Approval

| Gate | Date | Approver | Decision (verbatim) |
|---|---|---|---|
| G0 | 2026-11-17 | P-01 | Approve |
