# Questions log — constitution

## Round 1 — 2026-11-17

### Q-principles-01 — Which principles and quality bar should every change in this repository inherit?
- **Blocking:** yes · **Material:** no
- **Why it matters:** Principles decide trade-offs in every later phase; the quality bar sets review rules and required test levels.
- **Options:**
  1. Pragmatic set (Recommended) — Five principles (simplicity first, reversible decisions, test what you specify, explicit over implicit, small increments), with peer review of every spec and unit + acceptance tests for every requirement.
  2. Strict set — The pragmatic set plus mandatory integration tests, a second reviewer and an ADR for every dependency; stronger guarantees but slower for a small project.
  3. Minimal set — Three principles (simplicity, testability, reversibility) and automated tests only; lightest process but leaves review rules open.
- **Sources:** /architect:init step 4 (principles and quality bar)
- **Answer:** Pragmatic set (Recommended)
- **Extracted instructions:** none

### Q-nfr-01 — Which NFR defaults and forbidden technologies should changes inherit unless their spec overrides them?
- **Blocking:** yes · **Material:** yes · **Candidates considered:** 4 (inline analysis by the conductor, stated before the round)
- **Why it matters:** Defaults are inherited by every change's NFRs and limit which dependencies may be introduced.
- **Options:**
  1. Baseline defaults (Recommended) — No secrets in the repository, dependencies with no known high or critical CVEs, OSI-approved permissive licences only (copyleft such as GPL/AGPL forbidden), errors logged with context; performance thresholds are set per change.
  2. Security-only defaults — Only the secrets and CVE rules; licences and logging are decided per change, which is more flexible but less consistent.
- **Rejected:** Strict numeric defaults (p95 latency, WCAG AA, coverage %) — no product exists yet to size them against; No defaults — specs would leave NFRs unstated.
- **Sources:** /architect:init step 4 (NFR defaults and forbidden technologies)
- **Answer:** Baseline defaults (Recommended)
- **Extracted instructions:** none

### Q-vcs-01 — Should the conductor commit .sdd/ automatically at each gate approval (this is a git repository)?
- **Blocking:** yes · **Material:** no
- **Why it matters:** Sets the Version control setting; yes makes the conductor approve with `--commit`.
- **Options:**
  1. Yes, commit at gates (Recommended) — Each approval commits only the change folder, SDD.md and registry.json, giving an audit trail of who approved what.
  2. No, I commit myself — You keep full control over commits but the gate history depends on your discipline.
- **Sources:** /architect:init step 4 (version control)
- **Answer:** Yes, commit at gates (Recommended)
- **Extracted instructions:** none

### Q-language-01 — In which language should specs be written, and with which conventions?
- **Blocking:** yes · **Material:** no
- **Why it matters:** Sets the spec language, naming conventions and glossary location for every artifact.
- **Options:**
  1. English, defaults (Recommended) — Specs in English, kebab-case file names, glossary in .sdd/_living/glossary.md, code style set by each language's standard formatter.
  2. French, defaults — Specs in French with the same file and glossary conventions; IDs and code identifiers stay in English.
- **Sources:** /architect:init step 4 (language and conventions)
- **Answer:** English, defaults (Recommended)
- **Extracted instructions:** none

## Round 2 — 2026-11-17

### Q-dod-01 — Which global definition-of-done items should every change meet?
- **Blocking:** yes · **Material:** no
- **Why it matters:** Every feature DoD references these global items.
- **Options:**
  1. Standard five (Recommended) — DOD-G-01 all automated tests pass, DOD-G-02 every requirement traced to a passing acceptance scenario, DOD-G-03 code reviewed, DOD-G-04 no lint/format errors, DOD-G-05 living specs and docs updated.
  2. Core three — Only tests pass, traceability to acceptance scenarios, and code review; lighter but documentation can drift.
- **Sources:** /architect:init step 4 (global DoD items)
- **Answer:** Standard five (Recommended)
- **Extracted instructions:** none

### Q-profile-01 — Which thresholds should decide whether a change is proposed as lite rather than full?
- **Blocking:** yes · **Material:** no
- **Why it matters:** Decides which changes get the single-file lite artifacts instead of the full folder structure.
- **Options:**
  1. Template defaults (Recommended) — Lite when ≤ 3 user stories, ≤ 10 requirements and ≤ 2 touched modules; a sensible split for a new project.
  2. Wider lite — Lite when ≤ 5 stories, ≤ 15 requirements and ≤ 3 modules; less ceremony but larger changes get lighter specs.
- **Sources:** /architect:init step 4 (profile thresholds)
- **Answer:** Wider lite
- **Extracted instructions:** none
