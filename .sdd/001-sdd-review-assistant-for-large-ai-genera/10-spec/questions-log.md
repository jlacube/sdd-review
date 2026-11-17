# Questions log — CHG-001 · 10-spec

## Round 1 — 2026-11-17

### Q-extras-01 — Which extra review approaches (from the allowed list in ideation §8, numbers from C001-R-002) go into the first version on top of the core flow?
- **Blocking:** yes · **Material:** yes · **Candidates considered:** 5 (inline, conductor)
- **Why it matters:** Decides which capabilities exist in the first version (ideation §11 open question).
- **Options:**
  1. Evidence + budget (Recommended) — Paradigms 6 test-first reading, 7 executable evidence bundle, 8 mutation/property evidence on changed lines, 15 sampling with escalation, 16 attention budget: makes clearing trustworthy and review coverage explicit, directly serving G-2 and G-5.
  2. Evidence + comprehension — Paradigms 6, 7, 8 plus 10 provenance-linked hunks, 12 behavioural diff, 19 interrogation mode: richer understanding of the change, but heavier dependence on a language model and on agent transcripts.
  3. Core flow only — No extras in v1: smallest first version (architecture delta, intent map, triage, verdict); extras come in later changes.
- **Rejected:** All ten allowed paradigms — too large for a first version; Adversarial verifier + spec-delta review (9, 13) — LLM review comments did not find more serious defects (C001-R-002 §B) and spec-delta review relies on a trusted spec.
- **Sources:** `00-ideation/ideation.md` §8, §11; C001-R-002 candidate paradigms
- **Answer:** Evidence + budget (Recommended)
- **Extracted instructions:** none

### Q-clearing-01 — Which evidence may clear (collapse) a hunk, and which areas are never cleared automatically?
- **Blocking:** yes · **Material:** yes · **Candidates considered:** 4 (inline, conductor)
- **Why it matters:** Bounds the triage engine under C001-DEC-003 (ideation §11 open question).
- **Options:**
  1. Mechanical + tests, guarded (Recommended) — Clear pure renames, moves, formatting and generated files (deterministic proof) and hunks exercised by passing tests; never clear security/auth, data migrations, dependency/build/config changes or public API changes; rules adjustable per repository.
  2. Mechanical only — Only deterministic proof clears (renames, moves, formatting, generated files); tests never suffice, which is safest but leaves far more open and puts G-2 at risk.
  3. Fully per-repo policy — No built-in rule set; each repository writes its own clearing policy; flexible, but unsafe defaults and more setup.
- **Rejected:** Test coverage alone, without guarded areas — agent-written tests can be weak (C001-R-002).
- **Sources:** `00-ideation/ideation.md` §11; C001-DEC-003
- **Answer:** Mechanical + tests, guarded (Recommended)
- **Extracted instructions:** none

### Q-g2-target-01 — What is the G-2 threshold: the maximum share of changed lines left open for human reading on a 10,000-line change?
- **Blocking:** yes · **Material:** yes · **Candidates considered:** 3 (inline, conductor)
- **Why it matters:** Replaces `[ASSUMPTION: G-2 target of 30 %]` with an NFR threshold.
- **Options:**
  1. At most 30 % (Recommended) — About 3,000 lines left open: roughly 6–10 hours at the 300–500 lines/hour inspection rates in C001-R-002, a demanding but credible target given the clearing guards.
  2. At most 50 % — Easier to reach with strict clearing rules, but still about 5,000 lines to read, which weakens the case against today's diff review.
  3. At most 15 % — About 1,500 lines, very ambitious; likely forces clearing on test evidence in areas where tests are weak.
- **Sources:** `00-ideation/ideation.md` §4.1 G-2, §10
- **Answer:** At most 30 % (Recommended)
- **Extracted instructions:** none

### Q-g8-target-01 — What are the G-8 targets for the comparison with a standard diff review on seeded-defect agent changes of 2,000–10,000 lines?
- **Blocking:** yes · **Material:** yes · **Candidates considered:** 3 (inline, conductor)
- **Why it matters:** Replaces `[ASSUMPTION: G-8 targets]` with NFR thresholds.
- **Options:**
  1. ≥50 % faster, no fewer (Recommended) — Review time at least 50 % lower and share of seeded defects found not lower than with the diff review; a clear disruptive claim that stays measurable.
  2. ≥30 % faster, no fewer — Easier to demonstrate early, but a modest gain for a tool positioned as disruptive.
  3. Same time, more defects — Optimise for finding at least 25 % more seeded defects at equal time; quality-first claim, harder to measure with few participants.
- **Sources:** `00-ideation/ideation.md` §4.1 G-8, §10
- **Answer:** ≥50 % faster, no fewer (Recommended)
- **Extracted instructions:** none

## Round 2 — 2026-11-17

### Q-languages-01 — Which programming languages and test ecosystems must the first version analyse with language-specific features (syntax-aware move/rename detection, public API and dependency extraction, per-hunk test coverage, mutation testing)?
- **Blocking:** yes · **Material:** yes · **Candidates considered:** 4 (sdd-spec-writer)
- **Why it matters:** Decides which parsers, language adapters and mutation tools are in scope (scope.md §1; CAP-02, CAP-04, CAP-05), and with them the size of the first version and its dependencies.
- **Options:**
  1. Agnostic core, TS + Python (Recommended) — Core reads git diffs, generic syntax trees and standard coverage/mutation report formats so any language gets basic support; deep signals and acceptance tests are built for TypeScript/JavaScript and Python.
  2. TypeScript/JavaScript only — Smallest first version with deep signals, but repositories in other languages cannot use the tool until a later change.
  3. Line-based only — Works on any repository at once, but cannot reliably detect moves, renames, public API changes or component dependencies, weakening clearing and the architecture delta.
- **Rejected:** Deep support for five or more ecosystems — too large for a first version (constitution principles 1 and 5).
- **Sources:** C001-DEC-004, C001-R-001, C001-R-002; scope.md §1
- **Answer:** 1 + C# / .Net
- **Extracted instructions:**
  - "+ C# / .Net" → deep language-specific signals and acceptance tests cover three ecosystems in the first version: TypeScript/JavaScript, Python and C#/.NET; other languages get the language-agnostic core. Applied in scope.md §1 and the requirements and NFRs of CAP-02, CAP-04 and CAP-05.

### Q-clearing-02 — May a repository's review configuration remove a built-in guarded area (security/auth, data migrations, dependency/build/config files, public API changes), or only add guarded areas and tune the other clearing rules?
- **Blocking:** yes · **Material:** yes · **Candidates considered:** 4 (sdd-spec-writer)
- **Why it matters:** Decides whether the never-clear list is a fixed safety floor or only a default (US-404, US-405), and what the repository configuration interface allows.
- **Options:**
  1. Add-only (Recommended) — Built-in guards stay in every repository, a fixed safety floor and the simplest rule to loosen later; a file wrongly detected as guarded stays open and costs reading time.
  2. Narrow, never remove — A repository may exclude named paths from a guarded area (e.g. generated migration files) but cannot switch an area off; fixes false positives at the cost of richer configuration.
  3. Removable with notice — A repository may switch a built-in area off; every review shows the removal and the record keeps it; most flexible, but one maintainer lowers safety for everyone.
- **Rejected:** Fully adjustable without notice — contradicts "never cleared automatically" in Q-clearing-01 and the visible-evidence rule of C001-DEC-003.
- **Sources:** Q-clearing-01, C001-DEC-003, US-404, US-405
- **Answer:** Add-only (Recommended)
- **Extracted instructions:** none

## Round 3 — 2026-11-17

### Q-signing-01 — May the developer sign an intent while some of its open hunks are not marked as read, and under which condition?
- **Blocking:** yes · **Material:** no
- **Why it matters:** Sets C001-REQ-703: whether a signature needs every open hunk read, which decides how a review ends when the attention budget (C001-US-605) runs out.
- **Options:**
  1. Confirm and record (Recommended) — Signing goes ahead after you confirm a prompt stating how many open hunks and changed lines are unread, and the review record keeps that unread share; the decision stays yours and fits the attention budget, but unread code can be signed.
  2. Guarded hunks block — Signing is refused while hunks in guarded areas or design-quality findings of the intent are unread; other unread hunks need the confirmation of option 1; strongest on high-impact code, but forces reading them first.
  3. All open hunks block — Signing is refused until every open hunk is marked read; simplest rule, but conflicts with the attention budget and invites bulk read marks that hide the gap.
- **Sources:** C001-DEC-003, C001-US-701, C001-US-605, C001-US-606 (sdd-spec-writer C)
- **Answer:** Confirm and record (Recommended)
- **Extracted instructions:** none

### Q-provider-01 — Which model-provider APIs does the first version connect to?
- **Blocking:** yes · **Material:** yes · **Candidates considered:** 5 (sdd-spec-writer C)
- **Why it matters:** Sets C001-REQ-805: which provider adapters are in scope and the dependencies they bring.
- **Options:**
  1. OpenAI-compat + Anthropic (Recommended) — Two adapters: the OpenAI-compatible chat API (also exposed by local runtimes such as Ollama and llama.cpp server) and the Anthropic Messages API; covers local models and main cloud vendors without lock-in, at the cost of two adapters.
  2. OpenAI-compatible only — One adapter for local runtimes and any cloud service with an OpenAI-compatible endpoint; smallest, but other cloud APIs need a proxy or a later change.
  3. Native adapter per vendor — Separate adapters for Ollama, OpenAI, Anthropic and Google; widest reach but the most code, tests and dependencies for a first version.
- **Rejected:** Local runtimes only — contradicts C001-DEC-004; Provider interface only, no built-in adapter — every repository would write its own adapter.
- **Sources:** C001-DEC-004, C001-US-802, C001-US-803, C001-CON-05
- **Answer:** OpenAI-compat + Anthropic (Recommended)
- **Extracted instructions:** none

## Round 4 — 2026-11-17

### Q-clearing-03 — When the change under review edits the repository's review configuration (clearing rules, guarded areas, generated-file patterns, test command), which version of that configuration applies to its own review?
- **Blocking:** yes · **Material:** yes · **Candidates considered:** 5 (sdd-spec-writer B)
- **Why it matters:** Decides whether a change can loosen the rules that clear its own hunks (C001-REQ-426, REQ-409, REQ-505, US-405).
- **Options:**
  1. Base commit's (Recommended) — Rules in force before the change judge it, so a change cannot loosen its own clearing and its config edit is read as a guarded hunk; a maintainer's edit applies to reviews whose base contains it.
  2. Snapshot's, tightening only — Stricter edits in the change apply at once, loosening ones wait until they reach the base; most responsive, but every setting needs a defined stricter direction.
  3. Snapshot's, with notice — The working-tree version applies and the review shows that the configuration changed; simplest, but a change can relax the clearing of its own hunks.
- **Rejected:** Developer picks the version per review — moves a safety decision into every review and breaks the shared policy of US-405; Per-user configuration outside the repository — not versioned or shared, contradicts US-405.
- **Sources:** Q-clearing-01, Q-clearing-02, C001-DEC-003, US-405, REQ-426
- **Answer:** Base commit's (Recommended)
- **Extracted instructions:** none

### Q-sampling-01 — What share of the hunks each clearing rule has cleared goes into the random sample you read (at least one hunk per rule in every option)?
- **Blocking:** yes · **Material:** yes · **Candidates considered:** 5 (sdd-spec-writer B)
- **Why it matters:** Sets the spot-check load and the chance of revealing a failing clearing rule (REQ-604, US-603, US-604); adds to the time measured by NFR-006.
- **Options:**
  1. 10 % per rule (Recommended) — About 700 lines on a 10,000-line change (1.5–2.5 h); a rule failing on 10 % of 100 hunks is caught with ~65 % probability; leaves room for the G-8 time target.
  2. 20 % per rule — Low end of the 20–33 % spot-check range in C001-R-002; catches that failing rule with ~88 % probability, but about 1,400 lines (3–5 h).
  3. 5 % per rule — About 350 lines and the least time, but the same failing rule is caught with only ~41 % probability.
- **Rejected:** 33 % per rule — about 2,300 lines, puts the NFR-006 time target at risk; Sampling only on request — skipped under time pressure, escalation would rarely trigger.
- **Sources:** C001-R-002, US-603, US-604, NFR-005, NFR-006
- **Answer:** 10 % per rule (Recommended)
- **Extracted instructions:** none

### Q-intent-sources-01 — Which formats does the first version read for SDD workspaces, documented architectures, and agent plans and transcripts?
- **Blocking:** yes · **Material:** yes · **Candidates considered:** 5 (sdd-spec-writer A)
- **Why it matters:** Decides which input readers are in scope (REQ-111, REQ-112, REQ-207, REQ-314).
- **Options:**
  1. .sdd/ + neutral file (Recommended) — Reads this workspace's .sdd/ format natively plus a documented neutral intent-and-architecture file any other tool can produce; plans and transcripts read as Markdown or plain text; smallest scope serving every repository.
  2. + Spec Kit, Kiro, OpenSpec — Native readers for three more SDD tools plus the neutral file; widest reach, but four readers to keep current while those tools change formats.
  3. Neutral file only — Least code, but no SDD tool works without an export step, including this repository's own .sdd/.
- **Rejected:** Native readers for all six surveyed SDD tools — too large for a first version; Per-agent structured session-log readers — formats differ per agent and change often.
- **Sources:** C001-DEC-006, C001-R-002, REQ-111, REQ-112, REQ-207, REQ-314
- **Answer:** .sdd/ + neutral file (Recommended)
- **Extracted instructions:** none

### Q-intent-unit-01 — When intents come from an SDD change, which spec items become the intents you sign, reject or defer?
- **Blocking:** yes · **Material:** yes · **Candidates considered:** 5 (sdd-spec-writer A)
- **Why it matters:** Sets what a signature means and what an unmet intent is (REQ-305, SC-03).
- **Options:**
  1. Requirements (Recommended) — One intent per requirement; linked tasks and acceptance scenarios feed link signals and test-first reading; a signature means 'this specified outcome is met' and unmet intents are unmet requirements.
  2. Tasks — Matches how agents work, but a signature means 'task done', and a requirement no task implements is not shown as unmet.
  3. Requirements over tasks — Two levels, requirements with their tasks beneath; richest view, but adds a level to the map, shares and verdicts.
- **Rejected:** Acceptance scenarios — many per requirement, grouping ambiguous; One intent per SDD change — brings back diff-sized review.
- **Sources:** C001-DEC-001, C001-DEC-006, REQ-305, SC-03
- **Answer:** Requirements (Recommended)
- **Extracted instructions:** none

## Round 5 — 2026-11-17

### Q-perf-01 — Which performance thresholds apply to a 10,000-line, 300-file change (reference machine: 8 logical cores, 16 GiB RAM, SSD, repositories up to 500,000 lines)?
- **Blocking:** yes · **Material:** yes · **Candidates considered:** 5 (sdd-spec-writer A)
- **Why it matters:** Sets NFR-001 to NFR-004 and the reference environment in nfr.md §0 (constitution NFR-D-05).
- **Options:**
  1. Balanced (Recommended) — Static analysis ≤ 120 s, model-assisted ≤ 15 min with the reference cloud provider, UI p95 ≤ 200 ms (max 1 s), memory ≤ 2 GiB; reachable with a deterministic pre-pass, and the wait is short next to hours of reading.
  2. Tight — Static ≤ 30 s, model-assisted ≤ 5 min, UI p95 ≤ 100 ms, memory ≤ 1 GiB; best experience, but needs incremental parsing and caching in v1 and raises delivery risk.
  3. Relaxed — Static ≤ 5 min, model-assisted ≤ 30 min, UI p95 ≤ 500 ms, memory ≤ 4 GiB; easiest, but a 5-minute wait before every review eats into the G-8 saving.
- **Rejected:** Measure only, no thresholds — contradicts constitution NFR-D-05; Separate thresholds per language ecosystem — more to test, no user-visible benefit.
- **Sources:** C001-DEC-007, NFR-001…004, NFR-D-05
- **Answer:** Balanced (Recommended)
- **Extracted instructions:** none

### Q-g8-protocol-01 — How many developers take part in the G-8 comparison against standard diff review, and what is the time cap per review session?
- **Blocking:** yes · **Material:** yes · **Candidates considered:** 5 (sdd-spec-writer A)
- **Why it matters:** Fills the comparison protocol behind NFR-006 and NFR-007 (nfr.md §3).
- **Options:**
  1. 8 devs, 3 h cap (Recommended) — Smallest balanced crossover over four changes (each reviewed twice per method); up to 6 h per participant; capped diff reviews make the time comparison conservative.
  2. 16 devs, 3 h cap — Allows a paired statistical test, but doubles recruiting and moderation effort.
  3. 4 devs incl. P-01, 3 h cap — Cheapest balanced design, but the result is anecdotal and your knowledge of the tool biases it.
- **Rejected:** Separate groups per method — needs about twice the participants; No session cap — a full read of 10,000 lines takes 20–33 hours.
- **Sources:** SC-08, NFR-006, NFR-007, Q-g8-target-01, C001-R-002
- **Answer:** 8 devs, 3 h cap (Recommended)
- **Extracted instructions:** none

### Q-platform-01 — Which operating systems and browsers must the first version support?
- **Blocking:** yes · **Material:** yes · **Candidates considered:** 4 (sdd-spec-writer A)
- **Why it matters:** Decides platform-specific code paths and the CI test matrix (NFR-016, NFR-017).
- **Options:**
  1. Win, macOS, Linux; 3 browsers (Recommended) — Windows 11, macOS 14+ (x86-64 and arm64), Ubuntu 22.04 LTS+; two latest major versions of Chrome, Edge and Firefox; covers where developers run agents, at the cost of a three-OS CI matrix.
  2. Windows + Linux; Chrome, Edge — Smaller test matrix, but excludes developers on macOS.
  3. Windows only; Chrome, Edge — Fastest to deliver, but only serves your own platform.
- **Rejected:** Add Safari — adds WebKit testing for a local tool where a supported browser can be installed.
- **Sources:** C001-DEC-002, NFR-016, NFR-017
- **Answer:** Win, macOS, Linux; 3 browsers (Recommended)
- **Extracted instructions:** none

## Round 6 — 2026-11-17

### Q-evidence-time-01 — Which time limits apply to evidence runs on a 10,000-line change (reference machine): the tool's test run with per-test coverage, mutation testing on executed changed lines, and the time added to each evidence-bundle command?
- **Blocking:** yes · **Material:** yes · **Candidates considered:** 5 (sdd-spec-writer)
- **Why it matters:** Sets the threshold of NFR-018, the only bound on test, mutation and evidence-bundle runs; decides whether v1 needs mutant sampling or incremental test selection, and how late mutation results can reopen test-cleared hunks (REQ-411).
- **Options:**
  1. Balanced (Recommended) — Test run with coverage ≤ 3.0× the project's own test time, mutation testing ≤ 60 min per change, ≤ 1 s added per bundle command; reachable with mutants on executed changed lines in parallel on 8 cores, results arrive while you read.
  2. Tight — ≤ 2.0×, ≤ 30 min, ≤ 0.5 s; results arrive early, but v1 likely needs mutant sampling or incremental test selection, raising delivery risk.
  3. Relaxed — ≤ 5.0×, ≤ 3 h (the G-8 session cap), ≤ 2 s; easiest, but mutation results can arrive after a session ends and reopen hunks you already passed.
- **Rejected:** Measure only, no threshold — contradicts constitution NFR-D-05; Absolute bound on the whole test run — the project's own suite duration is outside the tool's control.
- **Sources:** NFR-018, NFR-001, AS-06, C001-R-002
- **Answer:** Balanced (Recommended)
- **Extracted instructions:** none

## Round 7 — 2026-11-17

### Q-identity-01 — What should happen when you record a verdict in a repository where git user.name or user.email is not configured?
- **Blocking:** yes · **Material:** no
- **Why it matters:** REQ-712 requires the git identity in every review record entry but gives no behaviour when it is missing; sets the error scenario of AC-712.1 (SC-05).
- **Options:**
  1. Refuse until set (Recommended) — Every review record entry stays attributable to a git identity; the cost is one git config step on a fresh machine before the first verdict.
  2. OS user name, flagged — A review is never blocked; the entry names the operating-system account, which is not the identity used in commits.
  3. Empty identity, flagged — Never blocked, but the entry cannot be attributed, which weakens the verdict ledger.
- **Sources:** REQ-712, US-705, SC-05 (sdd-test-designer C)
- **Answer:** Refuse until set (Recommended)
- **Extracted instructions:** none

### Q-provider-02 — How should a model-provider endpoint given as a host name (e.g. http://localhost:11434, the default of local runtimes) be classified: local or non-local (needing the cloud opt-in)?
- **Blocking:** yes · **Material:** no
- **Why it matters:** REQ-806 defines local endpoints only as loopback addresses or local sockets; decides whether US-802 works with default local-runtime configuration and whether DNS can send content off the machine without opt-in (NFR-011).
- **Options:**
  1. localhost local, others not (Recommended) — Default local-runtime endpoints work without the opt-in, and no DNS answer can turn a cloud host into a local one; a LAN host name always needs the opt-in.
  2. Resolve, classify by address — Accepts any name pointing to loopback, but the DNS answer can change between the check and the request, so content could leave without the opt-in.
  3. Literal addresses only — Strictest and simplest to test; configurations using localhost must switch to 127.0.0.1 or set the opt-in.
- **Sources:** REQ-806, US-802, NFR-011, Q-provider-01 (sdd-test-designer C)
- **Answer:** localhost local, others not (Recommended)
- **Extracted instructions:** none

## Round 8 — 2026-11-17

### Q-naming-01 — Which name should the command-line tool use (also its config folder .<name>/ in each repository and its credential-store entry)?
- **Blocking:** yes · **Material:** no
- **Why it matters:** The name is the CLI executable, the folder of the review configuration and neutral file, and the default credential-store entry (`50-interfaces/README.md` §2).
- **Options:**
  1. sdd-review (Recommended) — Matches the repository name and states the SDD focus, though it sits close to the existing sdd workspace CLI.
  2. intent-review — Names the review paradigm and cannot be confused with the sdd workspace CLI, but drops the visible SDD link.
- **Sources:** C001-IF-001, `50-interfaces/README.md` (sdd-architect)
- **Answer:** sdd-review (Recommended)
- **Extracted instructions:** none

### Q-clearing-04 — Does a design critique item from the model keep the hunk it points to open, or does it only appear in the findings list (REQ-217 and REQ-418 currently contradict each other)?
- **Blocking:** no · **Material:** no
- **Why it matters:** REQ-217 and REQ-418 contradict each other.
- **Options:**
  1. Findings list only (Recommended) — Matches REQ-217 and ideation §9; REQ-418 is narrowed to deterministic findings, so model output never changes which hunks clear.
  2. Any finding keeps it open — Applies REQ-418 as written; safest, but a model can hold any hunk open, so the open share (G-2) depends on model output.
- **Sources:** REQ-217, REQ-418, C001-DEC-004 (sdd-test-designer A)
- **Answer:** Findings list only (Recommended)
- **Extracted instructions:** none

### Q-drift-01 — When the change under review edits the documented architecture (components, layers, allowed dependencies), which version judges its drift?
- **Blocking:** no · **Material:** no
- **Why it matters:** REQ-207 reads the documented architecture from the snapshot, so a change can allow its own new dependency and hide the drift.
- **Options:**
  1. Snapshot's, edits flagged (Recommended) — Spec-driven changes that add a component still work, and one new requirement flags every edit of the documented architecture as drift, so a change cannot silently allow its own dependency.
  2. Base commit's — Same rule as the review configuration (Q-clearing-03); a change cannot loosen its own drift check, but files of a legitimately added component show as drift until the edit reaches the base.
  3. Snapshot's, as written — No spec change; an edited allowed-dependency list silently removes the drift finding.
- **Sources:** REQ-207, REQ-208, Q-clearing-03 (sdd-test-designer A)
- **Answer:** Snapshot's, edits flagged (Recommended)
- **Extracted instructions:** none

## Round 9 — 2026-11-17

### Q-identity-02 — Should the 'no git identity, no verdict' rule (Q-identity-01) also apply to the other actions written to the review record: read marks, hunk moves, orphan-hunk rejections, test judgements and defect reports?
- **Blocking:** no · **Material:** no
- **Why it matters:** Every review record entry carries a git identity, but only verdicts had a rule for a missing one (REQ-721).
- **Options:**
  1. Refuse every recorded action (Recommended) — Same rule for every record entry, so the whole record stays attributable; the git identity must be set before the first action of a review, not only before the first verdict.
  2. Decisions only — Verdicts and orphan-hunk rejections are refused; read marks, moves and judgements are recorded with the identity marked missing; reading starts at once, but part of the record is unattributed.
  3. Check at review start — Intake refuses to start a review without an identity: one check before any work, but it also blocks headless analysis, which writes no record entry.
- **Sources:** Q-identity-01, REQ-721, REQ-712, `40-domain/domain-model.md` §2.22 (sdd-spec-writer)
- **Answer:** Refuse every recorded action (Recommended)
- **Extracted instructions:** none

## Round 10 — 2026-11-17

### Q-intake-01 — When you start a review without naming a base commit and the current branch has no upstream (e.g. a new local branch the agent committed on), which commit should the review compare against? Today REQ-104 uses HEAD, which drops the agent's commits from the review.
- **Blocking:** yes · **Material:** yes · **Candidates considered:** 5 (sdd-critic, CR-1)
- **Why it matters:** With HEAD as base, agent commits on a new local branch are left out of the review (US-102) and a committed config edit becomes the configuration that judges the change, defeating Q-clearing-03.
- **Options:**
  1. Merge base w/ default (Recommended) — Merge base of HEAD and the remote's default branch, else local main/master, HEAD only when none exists; covers agent commits on new local branches and keeps committed config edits out of the base.
  2. Refuse without --base — With no upstream and HEAD off the default branch, stop and list candidate bases; fully explicit, but adds a step to the one-command start.
  3. HEAD with a warning — Keep HEAD and warn when HEAD has commits on no remote-tracking branch; smallest change, but the default review still leaves the agent's commits out.
- **Rejected:** First commit after the agent session started — needs session times the tool does not have; Nearest remote-tracking branch by merge-base distance — ambiguous with several remotes and forks.
- **Sources:** REQ-104, US-102, REQ-426, Q-clearing-03, CR-1
- **Answer:** Merge base w/ default (Recommended)
- **Extracted instructions:** none

### Q-clearing-05 — May tests that the change itself adds or edits clear code (passing-tests rule) before you have judged that the intent's tests express the intent (REQ-504), and how is the 30 % open-share target (NFR-005) measured with respect to those judgements?
- **Blocking:** yes · **Material:** yes · **Candidates considered:** 5 (sdd-critic, CR-2, CR-3)
- **Why it matters:** Decides whether the 30 % target of Q-g2-target-01 is reachable and what the first steps of every review are.
- **Options:**
  1. Judge first, measure after (Recommended) — Keep REQ-504: tests that clear code have been read and judged; NFR-005 is measured with the test command set and an 'expresses' judgement on every intent with test hunks. Safe and measurable, but clearing of new code waits for your judgement.
  2. Clear now, judgement withdraws — Changed tests qualify at once (evidence strength 3) and a 'does not express' judgement withdraws their clearings; best open share, but agent-written tests clear code before anyone reads them.
  3. Judge first, measure before — Keep REQ-504 and NFR-005 as written; strictest reading of 30 %, likely missed on feature changes whose tests are new.
- **Rejected:** Changed tests never clear — stricter with no added safety once tests are judged; Read marks on test hunks replace the judgement — confuses reading with judging.
- **Sources:** REQ-504, NFR-005, US-501, Q-clearing-01, Q-g2-target-01, CR-2, CR-3
- **Answer:** Judge first, measure after (Recommended)
- **Extracted instructions:** none

## Round 11 — 2026-11-17

### Q-workspace-01 — Evidence runs now use a fresh copy of the snapshot, so the first test run of each session also pays for the copy and a cold build. You set 3.0x the project's test time and rejected 'measure only'; this extra wait currently has no threshold (assumption C001-AS-08, reported only, back to you if a mitigation fails). Accept that, or set a bound now?
- **Blocking:** yes · **Material:** yes · **Candidates considered:** 4 (sdd-critic)
- **Why it matters:** The session-start wait is only reported by DOD-014; NFR-018 (a) now compares two cold runs.
- **Options:**
  1. Accept AS-08 (Recommended) — Keeps your three thresholds; the extra wait is measured on every benchmark change and comes back to you with numbers if a mitigation cannot keep it within 3.0x. Risk: release can close with a long first run, covered only by a report.
  2. Bound first run at 3.0x — Makes the wait you actually see a DoD threshold, true to your earlier answer; on large .NET or Node repos v1 likely has to keep workspaces and build outputs across sessions (disk space, stale-workspace handling).
  3. Bound first run at 5.0x — Enforced with room for one cold build; the largest repositories may still need workspace reuse, and it adds a second number to NFR-018.
- **Rejected:** Run the first test run of each session in the working tree — brings back what CR-6 fixed.
- **Sources:** C001-AS-08, NFR-018, DOD-014, CON-22, Q-evidence-time-01
- **Answer:** Accept AS-08 (Recommended)
- **Extracted instructions:** none

### Q-clearing-06 — If the 30 % open-share target is missed, C001-AS-07 allows narrowing what counts as a public API change (REQ-417), e.g. to symbols reachable from a package entry point. That loosens a guarded area you set as a fixed floor. Who decides such a narrowing?
- **Blocking:** no · **Material:** yes · **Candidates considered:** 4 (sdd-critic)
- **Why it matters:** Q-clearing-01/02 made the public API area a floor; narrowing its recognition clears more hunks in every repository.
- **Options:**
  1. You decide (Recommended) — The floor stays yours: specialists bring the measured split by reason and a proposal; costs one more decision round if the target is missed.
  2. Specialists, within a limit — Narrowing allowed only to symbols reachable from a package entry point or listed in __all__, reported at the next gate; you see it after the fact.
  3. Never narrow — The guard stays as it is; if 30 % is missed, only the target comes back to you.
- **Rejected:** Let each repository's review configuration narrow it — contradicts Q-clearing-02.
- **Sources:** C001-AS-07, NFR-005, REQ-417, Q-clearing-01, Q-clearing-02
- **Answer:** You decide (Recommended)
- **Extracted instructions:** none

## Round 12 — 2026-11-17

### Q-overhead-01 — NFR-018 (c) caps the time the tool adds to each evidence-bundle command at 1 s. Should that cap also hold while mutation testing runs on all cores right after the test run, or only once mutation testing has ended?
- **Blocking:** no · **Material:** yes · **Candidates considered:** 4 (sdd-critic)
- **Why it matters:** Decides whether the 1 s of Q-evidence-time-01 covers bundle runs early in a review, and whether v1 must keep CPU capacity free during mutation testing.
- **Options:**
  1. In both states (Recommended) — Bounds the wait you actually see, since you run bundles while mutation results still arrive; may require the mutation runner to leave CPU capacity free, at some cost to mutation time.
  2. Only after mutation ends — Measures the tool's own work on an idle machine and is easiest to meet; bundle runs during the up-to-60-minute mutation phase get no bound.
  3. Both, 3 s during mutation — Keeps a bound in both states while allowing for CPU contention; adds a second number to NFR-018.
- **Rejected:** Queue bundle runs until mutation testing ends — delays bundle evidence by up to 60 minutes.
- **Sources:** NFR-018, DOD-014, IF-013, Q-evidence-time-01
- **Answer:** In both states (Recommended)
- **Extracted instructions:** none

### Q-finish-01 — How should the specification phase finish, given CR-28 (major) and CR-29 to CR-32 (minor) are open and no blocker remains?
- **Blocking:** yes · **Material:** no
- **Why it matters:** Decides whether one more fix cycle runs before gate G2.
- **Options:**
  1. Fix all, then gate (Recommended) — One more fix pass by spec-writer, architect and test-designer on CR-28 to CR-32, a short critic check, then gate G2; cleanest spec, one more cycle.
  2. Fix CR-28 only, then gate — Fix the one major, show the four minors at G2 as proposed waivers; shorter, minors carried into the plan phase.
  3. Gate now — Present G2 with CR-28 to CR-32 open as proposed waivers; fastest, but a known measurement hole goes into planning.
- **Sources:** `90-critic-report.md` Focused re-review 3 (conductor)
- **Answer:** Fix all, then gate (Recommended)
- **Extracted instructions:** none

### Q-fatigue-01 — This phase is past its fifth interview round. Should any further non-blocking questions from the specialists in this phase be resolved with their recommended options (each logged and marked as an assumption) instead of being asked?
- **Blocking:** no · **Material:** no
- **Why it matters:** Fatigue guard (interview-protocol §7).
- **Options:**
  1. Use recommendations (Recommended) — Resolve remaining non-blocking questions with their recommended options; each is logged and marked as an assumption you can review at G2. Blocking questions are still asked.
  2. Keep asking — Every question keeps coming to you as a round, as so far.
- **Sources:** interview-protocol §7 (conductor)
- **Answer:** Use recommendations (Recommended)
- **Extracted instructions:** none

## Resolved under the fatigue guard (Q-fatigue-01) — 2026-11-18

### Q-copy-window-01 — While the mutation copy of the test run's workspace is being made, does a bundle run that needs that workspace wait for the copy, or get a newly prepared workspace?
- **Blocking:** no · **Material:** no
- **Why it matters:** CR-32; decides the copy window in `50-interfaces/evidence-runs.md` §2 item 3 and what NFR-018 (c) excludes.
- **Options:**
  1. Wait for the copy (Recommended) — No extra workspace preparation; the wait is excluded from (c).
  2. Prepare a new workspace — No wait, but adds a preparation outside any threshold.
- **Sources:** CR-32 (sdd-critic), sdd-architect
- **Answer:** (fatigue guard — recommended option applied)
- **Extracted instructions:** none
