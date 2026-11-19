---
id: "C001-OA-006"
artifact: plan/option-analysis
change: "CHG-001"
phase: 20-plan
status: draft
---
# OA-006 — Git access implementation

## Problem
Decide how the git access adapter (C001-COMP-003) implements the operations G-01 to G-14 of the git
access port (C001-IF-012 §3) under its safety rules: read-only, no repository-configured program,
no network, values checked before use (C001-IF-012 §2, C001-CON-13). C001-CON-14 offers two
families: running the git program the developer installed, or a git library with an OSI-approved
permissive licence. The git program is GPL-2.0; it may only be run as a separate,
developer-installed program, never linked, bundled or redistributed, and this analysis must state
whether that use is a copyleft dependency under the constitution's forbidden technologies (NFR-D-03)
and reject the option if it is. Further forces: the platforms of C001-CON-15 (C001-NFR-016); the
budget of C001-NFR-001 for G-07 and G-09 on a 10,000-line change in a 500,000-line repository
(C001-IF-012 §5); results fixed per release (C001-CON-17); the repository untouched
(C001-REQ-120, C001-REQ-707). The decision assumes the runtime of C001-ADR-001.

Two design choices apply to every candidate and are fixed in C001-ADR-004: the adapter reads
working-tree content itself, as bytes, and applies the built-in end-of-line conversion
(C001-IF-012 §2 item 2); and hunks (G-07) and line attribution (G-09) are computed in process
from the file sides with the diff of the release, so that the results do not depend on the installed
git version (C001-CON-17).

**Licence position of the git program (C001-CON-14).** The review assistant would run the `git`
executable that the developer installed, as a separate process, exchanging data only through
command-line arguments, environment variables and pipes. It does not link git, load git code into
its process, or ship git in its package, so git is absent from the dependency tree that the licence
check of NFR-D-03 inspects. GPL-2.0 attaches its conditions to copying, distributing and modifying
the program and works based on it (GPL-2.0 sections 1 to 3); the review assistant does none of these,
and the Free Software Foundation's FAQ treats communication through pipes and command-line arguments
between separate programs as aggregation, not as a combined work. The architect's reading is
therefore that this use is not a copyleft dependency in the sense of the constitution: git is an
external prerequisite, like the operating system's shell that runs evidence commands (C001-IF-013
§1) and the browser (`10-context/scope.md` §5). This is an engineering reading, not legal advice.
The constitution's wording "copyleft-licensed dependencies" can also be read as any program the
tool needs to run; which reading applies is for P-01 to confirm. The score of candidate 1 on the
licence criterion reflects that open confirmation.

## Criteria
| Criterion | Weight (%) |
|---|---|
| Coverage of G-01 to G-14 with git's semantics | 30 |
| Safety rules enforceable | 25 |
| Licence compliance under the constitution | 20 |
| Platform support and packaging | 10 |
| Low effort and fast enough | 15 |

- **Coverage of G-01 to G-14 with git's semantics:** git's merge-base choice (G-04), the effective
  configuration with includes (G-05, G-10, `core.excludesFile`, end-of-line settings), ignore rules
  (G-07), attributes (G-11), and every repository format a developer may have: SHA-256 object
  format, the reftable reference format, linked worktrees, partial clones and sparse indexes. 5 =
  all operations and formats; 4 = all operations, some formats missing; 3 = most operations; 2 =
  several operations built in house.
- **Safety rules enforceable:** how surely C001-IF-012 §2 holds: nothing written, no program from
  the repository's configuration run, no network.
- **Licence compliance under the constitution:** C001-CON-14, NFR-D-03, C001-CON-07.
- **Platform support and packaging:** every target of C001-CON-15 from one npm package, with no
  build at install time.
- **Low effort and fast enough:** in-house code needed, maintenance, and the fit of G-07 and G-09
  in the budget of C001-NFR-001.

## Candidates
- **1 — Installed git program, read-only plumbing:** the adapter runs the `git` executable found on
  the developer's `PATH` (resolved to an absolute path, never from the repository or the current
  directory), only for commands that read the object database, references, configuration and file
  listings, with a fixed hardening profile of options and environment variables; blobs through one
  long-lived `cat-file --batch` process. The simplest option: git itself answers every question.
- **2 — isomorphic-git plus in-house code:** the MIT-licensed pure-JavaScript git implementation for
  objects, references, merge base and ignore rules; in-house code for the configuration cascade with
  includes, rename detection, attribution, attributes and end-of-line rules.
- **3 — gitoxide through an in-house native module:** the Rust git implementation (MIT or
  Apache-2.0), wrapped in a native module that this project builds for each target.
- **4 — libgit2 through nodegit:** the C git library through its Node.js binding.
- **5 — In-house git reader:** this project reads loose objects, pack files, references, the index
  and the configuration itself, with no git dependency.

## Scores
| Candidate | Coverage of G-01 to G-14 with git's semantics | Safety rules enforceable | Licence compliance under the constitution | Platform support and packaging | Low effort and fast enough | Weighted |
|---|---|---|---|---|---|---|
| Weights | 30 | 25 | 20 | 10 | 15 | 100 |
| 1 — Installed git program, read-only plumbing | 5 | 4 | 3 | 4 | 4 | 4.10 |
| 2 — isomorphic-git plus in-house code | 2 | 5 | 5 | 5 | 2 | 3.65 |
| 3 — gitoxide through an in-house native module | 4 | 4 | 5 | 3 | 2 | 3.80 |
| 4 — libgit2 through nodegit | 4 | 4 | 1 | 2 | 3 | 3.05 |
| 5 — In-house git reader | 2 | 5 | 5 | 5 | 1 | 3.50 |

Justifications:

- **1 — git program.** Coverage 5: the installed git is the reference implementation and reads
  every format the developer's own git writes, reftable and SHA-256 included. Safety 4: git runs
  only reading plumbing (no command that writes, so no hook fires); the profile sets
  `GIT_OPTIONAL_LOCKS=0` and `--no-optional-locks`, turns off `core.fsmonitor`, sets
  `protocol.allow=never` so that no transport, a partial clone's lazy fetch included, can connect,
  empties the credential helpers, disables the pager and terminal prompts, and passes values after
  `--end-of-options`; git never reads the working tree's content, so no clean or smudge filter,
  textconv or external diff runs. The profile is a deny list that a new git release could outgrow,
  so 4, not 5; an integration test with a hostile repository fixture runs on the oldest supported and
  the latest git. Licence 3: allowed under the reading in the Problem section, pending P-01's
  confirmation. Platforms 4: git exists on every target, but it is a prerequisite and its version
  varies (Ubuntu 22.04 LTS ships 2.34). Effort 4: little in-house code beyond the working-tree read
  and the end-of-line rule; one process start costs tens of milliseconds on Windows, so the adapter
  batches reads.
- **2 — isomorphic-git.** Coverage 2: no rename detection or blame; reads only the repository's
  own configuration file, so global `user.name`, `core.excludesFile` and `core.autocrlf` need an
  in-house configuration cascade with includes; SHA-1 repositories only; no reftable; limited linked
  worktree support. Safety 5: a library that runs no program and opens no connection unless given
  one. Licence 5: MIT. Platforms 5: pure JavaScript. Effort 2: the gaps above are built in house,
  and reading large pack histories in JavaScript is slower.
- **3 — gitoxide.** Coverage 4: configuration cascade, ignore rules, attributes, merge base, tree
  diff with rename tracking and blame exist; the reftable format is not supported and SHA-256
  support is incomplete. Safety 4: it can run filters when asked, which the adapter does not ask.
  Licence 5. Platforms 3: no maintained Node.js binding, so this project builds and ships a native
  module for each target. Effort 2: a Rust toolchain and binding code in a TypeScript project.
- **4 — libgit2.** Coverage 4: broad operations; no reftable; SHA-256 experimental. Safety 4.
  Licence 1: libgit2 is GPL-2.0 with a linking exception and would be shipped inside the package;
  that is a copyleft licence, not a permissive one, which C001-CON-14 requires of a library.
  Platforms 2: the binding's prebuilt native modules lag new Node.js releases. Effort 3.
- **5 — In-house reader.** Coverage 2: every operation and format built and maintained here;
  formats such as reftable and SHA-256 arrive late. Safety 5, licence 5, platforms 5. Effort 1:
  the largest amount of in-house code of all candidates.

Sources (not opened in this session: no web tool was available on 2026-11-18; facts are the
architect's knowledge as of 2026-06; licences and versions are verified by the git adapter task and
the licence check of C001-CON-07): git licence <https://git-scm.com/about/free-and-open-source>
(GPL-2.0); git configuration reference <https://git-scm.com/docs/git-config> (`core.fsmonitor`,
`protocol.allow`, `credential.helper`); git environment variables
<https://git-scm.com/docs/git#_environment_variables> (`GIT_OPTIONAL_LOCKS`); git breaking-changes
plan <https://git-scm.com/docs/BreakingChanges> (SHA-256 and reftable as defaults in Git 3.0);
GNU GPL FAQ on aggregation <https://www.gnu.org/licenses/gpl-faq.html#MereAggregation>; Ubuntu 22.04
git package <https://packages.ubuntu.com/jammy/git> (2.34.1); isomorphic-git
<https://isomorphic-git.org> (MIT); gitoxide <https://github.com/GitoxideLabs/gitoxide> (MIT or
Apache-2.0); libgit2 <https://libgit2.org> (GPL-2.0 with linking exception); nodegit
<https://github.com/nodegit/nodegit> (MIT).

## Sensitivity
- **Top two: 1 (4.10) and 3 (3.80), gap 0.30.** The largest swing is the licence reading. If P-01
  confirms that running the installed git program is not a copyleft dependency, candidate 1's
  licence score becomes 5 and its total 4.50. If P-01 reads it as forbidden, C001-CON-14 rejects
  candidate 1; candidate 3 (3.80) then leads candidate 2 (3.65) by 0.15, a lead that rests on
  coverage against the cost of building a native module.
- **Weights.** 1 − 3 = w(coverage) − 2·w(licence) + w(platforms) + 2·w(effort). Moving 10 points
  from coverage to licence (20, 25, 30, 10, 15) ties them at 3.90. That shift is the weight form of
  the licence question; P-01's answer settles it more directly, by giving candidate 1 a licence
  score of 5 or by rejecting it.
- **Safety score.** If the hostile-repository test showed a program run that the profile cannot
  prevent (safety 2 for candidate 1), candidate 1 falls to 3.60, below candidates 3 and 2; the
  decision would return to P-01.
- **Runtime.** If C001-ADR-001 chose Rust, candidate 3 needs no binding (platforms 4, effort 4) and
  reaches 4.20, ahead of candidate 1 under the pending licence reading (4.10) and behind it once the
  reading is confirmed (4.50).

## Presented
1. **1 — Installed git program, read-only plumbing** (4.10) — recommended.
2. **3 — gitoxide through an in-house native module** (3.80) — the permissive library with the
   broadest coverage.
3. **2 — isomorphic-git plus in-house code** (3.65) — the pure-JavaScript permissive library.

## Recommendation
**1 — Installed git program, read-only plumbing:** git answers every operation of C001-IF-012 with
its own semantics, for every repository format the developer's git can write, with the least
in-house code, and the review assistant neither links nor ships it. No near tie applies (0.30
ahead), but the recommendation stands only if P-01 confirms the licence reading; otherwise
candidate 3 is recommended. Tie-breaker for a close call: reversibility (constitution principle 2),
since every consumer uses the port C001-IF-012, so a library adapter can replace the program
adapter later without changing C001-COMP-004, C001-COMP-006, C001-COMP-011 or C001-COMP-002.

## Rejected
- **4 — libgit2 through nodegit** (3.05) — libgit2 is GPL-2.0 with a linking exception and would
  be shipped in the package; C001-CON-14 admits only a permissively licensed library.
- **5 — In-house git reader** (3.50) — rebuilds and maintains every git format here, with the
  highest effort and the latest support for new formats.
