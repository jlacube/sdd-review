# Questions log — CHG-001 · 20-plan

## Round 1 — 2026-11-18

### Q-language-01 — Which language and runtime should the CLI, the analysis core and the local UI server be written in (C001-OA-003)?
- **Blocking:** yes · **Material:** yes · **Candidates considered:** 5 (C001-OA-003)
- **Why it matters:** Every implementation task, the UI server, the parser choice and the git adapter build on it; decides whether developers need Node.js and the headroom under NFR-001 and NFR-004.
- **Options:**
  1. TypeScript/Node.js (Recommended) — Scores 4.15: one language from core to web client, lowest build effort; developers need Node.js 22+, and an early spike must confirm speed and memory headroom (a 5-point weight shift makes it a tie with Rust).
  2. Rust — Scores 3.95: most speed and memory headroom and one executable per platform with no prerequisite, at the cost of a second language (for the web client) and slower delivery.
- **Rejected:** Go (3.55) — tree-sitter only through cgo; C# on .NET (3.35) — exact for C# only, large distribution; Python (2.85) — least headroom, ast tied to interpreter version.
- **Sources:** C001-OA-003, C001-ADR-001, C001-CON-18, NFR-001, NFR-004, NFR-016 (sdd-architect)
- **Answer:** TypeScript/Node.js (Recommended)
- **Extracted instructions:** none

### Q-uistack-01 — Which stack should the local review UI use, web client framework and UI server (C001-OA-004)?
- **Blocking:** yes · **Material:** yes · **Candidates considered:** 5 (C001-OA-004)
- **Why it matters:** Sets web client and UI server dependencies, the margin under NFR-003, and how CON-10/CON-20 are enforced.
- **Options:**
  1. React + Node HTTP (Recommended) — Scores 4.45: React 19 page built with Vite on Node's built-in HTTP server; text rendering by default, no CSP exception, most familiar tooling; lists virtualised from the start.
  2. SolidJS + Hono — Scores 4.30: fine-grained updates give the most response-time margin, but a smaller ecosystem and fewer implementers know it.
  3. Svelte + Node HTTP — Scores 4.25: compiled components with a small runtime, but its transition helpers break the CSP and its newest syntax is less familiar.
- **Rejected:** Lit web components (3.75) — routing, state and data loading by hand; htmx server-rendered HTML (2.75) — replaces the JSON contract, injection points.
- **Sources:** C001-OA-004, C001-ADR-002, NFR-003, CON-10, CON-20, IF-002 (sdd-architect)
- **Answer:** React + Node HTTP (Recommended)
- **Extracted instructions:** none

### Q-parsers-01 — Which syntax parsers should the analysis core use for TypeScript/JavaScript, Python and C# (plus smol-toml BSD-3 and fast-xml-parser MIT for manifests) (C001-OA-005)?
- **Blocking:** yes · **Material:** yes · **Candidates considered:** 5 (C001-OA-005)
- **Why it matters:** Adds the parsing dependencies and decides how public API, formatting-only changes, moves and renames are recognised (IF-005 §7, REQ-406…408, NFR-008).
- **Options:**
  1. tree-sitter for all (Recommended) — Scores 4.30: one MIT tree model, WebAssembly grammars on every platform; name resolution built in house (unresolved names keep hunks open) and grammars can lag new syntax.
  2. TS compiler API + tree-sitter — Scores 4.10: exact TypeScript trees and name resolution, but two tree models and a compiler API changing with TypeScript's native port.
  3. oxc + tree-sitter — Scores 4.10: fastest TypeScript parser, but a native module per platform, a pre-1.0 API and two tree models.
- **Rejected:** Each ecosystem's compiler front end in helper processes (3.35) — against CON-18, needs Python and .NET everywhere; No syntax parser (2.95) — against NFR-008 (a).
- **Sources:** C001-OA-005, C001-ADR-003, CON-18, NFR-008, IF-005 (sdd-architect)
- **Answer:** tree-sitter for all (Recommended)
- **Extracted instructions:** none

### Q-gitaccess-01 — Does running the git program you installed, as a separate program the tool neither links nor ships, count as a forbidden copyleft dependency under your constitution, and which git access should the tool use (C001-OA-006)?
- **Blocking:** yes · **Material:** yes · **Candidates considered:** 5 (C001-OA-006)
- **Why it matters:** C001-CON-14 requires the ADR to reject the git program if it is a copyleft dependency; decides between git's own semantics and a permissive library with gaps or a native module.
- **Options:**
  1. Installed git, read-only (Recommended) — Not a copyleft dependency (separate program, not linked or shipped); git 2.34+ read-only commands under fixed safety settings, hunks computed in process; git's own semantics for every repository format. Scores 4.50 with this reading.
  2. gitoxide native module — Treat the git program as forbidden; permissive Rust library with broad coverage, but a native module to build per platform and no reftable support (3.80).
  3. isomorphic-git + own code — Treat the git program as forbidden; permissive pure JavaScript, but rename detection, blame, global config and SHA-256 repositories must be built or go missing (3.65).
- **Rejected:** libgit2 through nodegit (3.05) — GPL-2.0 with linking exception, shipped in the package; In-house git reader (3.50) — highest effort.
- **Sources:** C001-OA-006, C001-ADR-004, CON-14, CON-13, IF-012, NFR-D-03 (sdd-architect)
- **Answer:** Installed git, read-only (Recommended)
- **Extracted instructions:** none

## Round 2 — 2026-11-18

### Q-workspace-02 — How should evidence workspaces get the project's installed dependencies (node_modules, restored packages) so tests run outside your working tree (C001-OA-008)?
- **Blocking:** yes · **Material:** yes · **Candidates considered:** 5 (C001-OA-008)
- **Why it matters:** Decides C001-ADR-006: what is copied into each workspace, disk and time cost (AS-08, NFR-018 (b)), and whether a dependency cache is built now.
- **Options:**
  1. Copy-on-write copy-in (Recommended) — Scores 4.10: dependency folders cloned or copied from the working tree with links retargeted, working tree untouchable; costs minutes and gigabytes per workspace on NTFS and ext4.
  2. Lock-file-keyed cache — Scores 3.80: fastest sessions through a persistent cache and kept workspaces, but adds cache keys, eviction and locking, and a stale entry can outlive one session.
  3. Snapshot files only — Scores 3.60: simplest and safest, but TypeScript test commands fail unless they install dependencies themselves, which needs the network every session.
- **Rejected:** Offline install per workspace (2.50) — runs lifecycle scripts, can reach the network (CON-11); Links into the working tree (3.40) — violates CON-22.
- **Sources:** C001-OA-008, C001-ADR-006, CON-22, AS-08, NFR-018 (sdd-architect)
- **Answer:** Copy-on-write copy-in (Recommended)
- **Extracted instructions:** none

### Q-mutation-01 — Which mutation tools should the first version use for TypeScript/JavaScript, Python and C#/.NET (C001-OA-009)?
- **Blocking:** yes · **Material:** yes · **Candidates considered:** 5 (C001-OA-009)
- **Why it matters:** Sets mutation-tool and adapter dependencies (CON-18, REQ-514); decides Python mutation evidence on Windows 11 (CON-15) and the margin under NFR-018 (b).
- **Options:**
  1. Stryker + own Python engine (Recommended) — Scores 3.75: StrykerJS and Stryker.NET plus a Python mutation engine built on the import hook; works on all three OSes with permissive licences, at the cost of building and maintaining the Python engine.
  2. Stryker + mutmut 3 — Scores 3.55: fastest mature Python tool, but reportedly no native Windows support (unverified); would score 4.45 if it does run on Windows.
  3. Verify mutmut first — Have the researcher check mutmut 3's Windows support and the tool licences now; the architect then updates C001-ADR-007 and the question is asked again with verified facts.
- **Rejected:** Mutation tools as the per-test coverage source (3.40) — against REQ-505/506; Own mutation engines in all three ecosystems (3.30) — highest effort.
- **Sources:** C001-OA-009, C001-ADR-007, CON-18, CON-07, CON-15, NFR-018 (sdd-architect; option 3 added by the conductor)
- **Answer:** Stryker + own Python engine (Recommended)
- **Extracted instructions:** none

### Q-credentials-01 — How should the review assistant read model-provider keys from each operating system's credential store (C001-OA-010)?
- **Blocking:** yes · **Material:** yes · **Candidates considered:** 5 (C001-OA-010)
- **Why it matters:** Sets the key-handling posture and the native dependency (D-Bus client on Linux) of C001-ADR-008 (IF-010 §7, CON-21).
- **Options:**
  1. Per-OS native readers (Recommended) — Scores 4.70: macOS security program, Windows CredReadW, Linux Secret Service over a permissive D-Bus client; reads exactly what OS tools write, no keychain dialog, clean headless fallback; three small code paths; read-only.
  2. Own bindings to every OS API — Scores 4.20: uniform native code, but reading through the macOS Security framework raises keychain dialogs for entries created with the security program.
  3. Keyring library — Scores 4.00: least code, but backend selection and entry layout follow the library rather than the OS tools, and macOS reads raise dialogs.
- **Rejected:** OS command-line tools only (3.10) — no built-in Windows reader, secret-tool LGPL and absent by default; Environment variables only (3.35) — violates IF-010 §7 and TS-826.
- **Sources:** C001-OA-010, C001-ADR-008, IF-010, CON-21, CON-15 (sdd-architect)
- **Answer:** Per-OS native readers (Recommended)
- **Extracted instructions:** none

## Round 3 — 2026-11-18

### Q-specfix-01 — How should the seven spec corrections found by the architects be handled (git missing/too old error, Node 22+/git 2.34+ prerequisites, fixed grammar versions, GIT_DIR/GIT_INDEX_FILE leaking into evidence commands, credential namespace, missing-submodule error, Git LFS/clean-filter files always changed)?
- **Blocking:** yes · **Material:** yes
- **Why it matters:** The spec is frozen at G2; the plan must not contradict it.
- **Options:**
  1. Small spec revision now (Recommended) — I record each as a spec defect; you run /architect:revise spec 001; architect and spec-writer fix only these seven, critic checks them, you re-approve G2; the planner then works on a correct spec. One short detour, nothing in the plan is redone.
  2. Defects now, revise before G3 — I record the defects and the planner starts at once, planning around them; the spec revision happens before G3, and the plan is checked again against it.
  3. Plan only, no spec change — Handle them as plan tasks and risks; fastest, but the frozen spec stays wrong on the GIT_DIR safety point and the plan would contradict it.
- **Sources:** C001-ADR-001, ADR-003, ADR-004, ADR-006, ADR-008 (sdd-architect A and B; conductor)
- **Answer:** Small spec revision now (Recommended)
- **Extracted instructions:** none — defects D-001 … D-007 recorded with `sdd defect add`.

## Round 4 — 2026-11-19

### Q-ci-01 — Which CI service runs the acceptance, browser and benchmark-verification jobs on Windows 11 x86-64, macOS x86-64 and arm64, and Ubuntu x86-64?
- **Blocking:** yes · **Material:** no
- **Why it matters:** C001-NFR-016, C001-NFR-017 and C001-DOD-027/028 need CI runners on all four platform kinds plus an offline job; T-001, T-097 and T-100 assume GitHub Actions.
- **Options:**
  1. GitHub Actions (Recommended) — Hosted Windows, macOS x86-64 + arm64 and Ubuntu runners; the plan's workflow paths already assume it; needs the repository on GitHub.
  2. Another hosted CI — Fits an existing organisation setup; T-001, T-097, T-100 change pipeline targets; macOS arm64 runners must exist.
  3. Self-hosted runners — No hosted-service dependency; someone maintains four platform kinds.
- **Sources:** C001-NFR-016, C001-NFR-017, C001-DOD-027, C001-DOD-028, C001-T-001 (sdd-planner)
- **Answer:** GitHub Actions (Recommended)
- **Extracted instructions:** none

### Q-hookenv-01 — When a review is started from a git hook, git sets GIT_DIR / GIT_INDEX_FILE; the spec strips them from evidence commands (C001-REQ-525) but not from the tool's own git reads. How should this be handled?
- **Blocking:** no · **Material:** yes
- **Why it matters:** A pre-commit hook can point GIT_INDEX_FILE at a temporary index, so the git adapter could read the wrong index.
- **Options:**
  1. Plan task + risk (Recommended) — The git-adapter task starts every git read with those variables cleared, with a test and a risk entry; consistent with the spec.
  2. Spec revision — Add a requirement to C001-IF-012 via `/architect:revise spec 001`; another G2 re-approval.
- **Sources:** C001-REQ-525, C001-IF-012, C001-ADR-004 Amendment 1 (sdd-architect; options by the conductor)
- **Answer:** Plan task + risk (Recommended)
- **Extracted instructions:** none

## Round 5 — 2026-11-19

### Q-ci-02 — GitHub-hosted runners offer no Windows 11 x86-64 image (windows-2025 is Windows Server). How should the Windows 11 evidence of C001-NFR-016 and C001-DOD-027 be produced?
- **Blocking:** yes · **Material:** no
- **Why it matters:** C001-NFR-016 sets 100 % of the acceptance scenarios on Windows 11 x86-64 in CI; hosted runners alone give no Windows 11 run.
- **Options:**
  1. Win 11 runner, release (Recommended) — Hosted windows-2025 on every push, plus one Windows 11 x86-64 machine as a self-hosted runner for nightly and closing-commit suites (also the C001-NFR-009 second host); Windows 11-only faults surface nightly.
  2. Self-hosted Win 11 every push — Exact OS per push; machine kept online, queue slows when busy.
  3. Accept windows-2025 — No extra machine; needs a revision of C001-NFR-016 and G2 re-approval.
- **Sources:** C001-NFR-016, C001-DOD-027, C001-T-001, C001-T-100 (sdd-test-designer)
- **Answer:** Win 11 runner, release (Recommended)
- **Extracted instructions:** none

## Round 6 — 2026-11-19

### Q-filterreopen-01 — The snapshot (C001-IF-008) does not record which files are under a clean filter; a reopened process recomputes the set, which differs if a filter-driver setting changed between intake and reopen. How should this be handled?
- **Blocking:** no · **Material:** yes · **Candidates considered:** 4 (sdd-planner)
- **Why it matters:** Decides whether C001-T-067 only records this case or the spec stores the set (C001-IF-008 change, another G2).
- **Options:**
  1. Accept and document (Recommended) — No spec change; T-067 proves the sets match when settings are unchanged; user documentation states the limit.
  2. Store the set in snapshot — No difference possible; spec revision of C001-IF-008 and C001-IF-012, another G2.
  3. Detect and warn — Hash driver settings at intake, notice on mismatch at reopen; new notice code, spec revision.
- **Rejected:** Run intake again on reopen — contradicts C001-REQ-118.
- **Sources:** C001-RISK-008, C001-T-067, C001-IF-012, C001-IF-008, C001-ADR-006 (sdd-planner)
- **Answer:** Accept and document (Recommended)
- **Extracted instructions:** none

### Q-release-01 — Where should the sdd-review package be published for release candidates and 1.0.0?
- **Blocking:** no · **Material:** no
- **Why it matters:** Sets the publish and rollback steps of `75-rollout.md` and who can install the tool.
- **Options:**
  1. Public npm registry (Recommended) — Simplest install; dist-tags and deprecation support rollback; the package is public.
  2. GitHub Packages — Access tied to the GitHub repository; installers configure a registry and token.
  3. Release tarball only — No registry account; no dist-tags, manual updates.
- **Sources:** C001-ADR-001, C001-RB-001, C001-T-103 (sdd-planner)
- **Answer:** Public npm registry (Recommended)
- **Extracted instructions:** none

## Round 7 — 2026-11-19

### Q-secondhost-01 — How should the macOS 14+ x86-64 and arm64 machines be provided for the second-host connection test of C001-NFR-009 (b) at release?
- **Blocking:** yes · **Material:** yes · **Candidates considered:** 5 (sdd-test-designer)
- **Why it matters:** NFR-009 must hold on each supported OS; hosted macOS runners have no Docker or nested virtualisation and cannot be reached by another host; without this C001-DOD-020 lacks evidence for two OSes.
- **Options:**
  1. Two Macs you provide (Recommended) — One Intel, one Apple silicon, on one LAN with a second host; free if available; needed once per RC.
  2. Rented cloud Macs — e.g. EC2 mac1 (x86-64) and mac2 (arm64) in one virtual network with a Linux instance as the second host; always available and scriptable; billed at least 24 h each per use; needs a cloud account.
  3. Hosted runners + overlay net — Hosted macOS runners on e.g. Tailscale with a hosted Linux runner; adds a third-party account and secret; not a physical LAN.
- **Rejected:** Container on hosted macOS runners — no Docker or nested virtualisation; Same machine to its own non-loopback address — not a second host.
- **Sources:** C001-NFR-009, C001-NFR-016, C001-TC-009, C001-T-092 (sdd-test-designer)
- **Answer:** Rented cloud Macs
- **Extracted instructions:** none
