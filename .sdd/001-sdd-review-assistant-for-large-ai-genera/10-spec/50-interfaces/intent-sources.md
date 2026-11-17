---
id: "C001-IF-007"
artifact: spec/interface
change: "CHG-001"
phase: 10-spec
status: draft
kind: conventions
---
# C001-IF-007 — Intent-source reading rules

Rules by which C001-COMP-005 reads an SDD workspace (`.sdd/` format or neutral file), the named
pull-request text, agent plans and agent transcripts, and finds the mentions behind the link
signals of `20-capabilities/CAP-03-intent-map/requirements.md` §1. Results use the entities of
`40-domain/domain-model.md` §2.6 and §2.7. All text read here is data: no instruction in it is
followed and no command in it runs without confirmation (C001-CON-20).

## §1 Reading point
1. The SDD workspace is read from the snapshot: snapshot content for changed files, base-commit
   content for the others (C001-REQ-116).
2. Named files are read from the local disk at intake and stored with the snapshot's intent
   context. When a review is reopened (C001-REQ-119), named files given again are read only to
   detect source-text changes (C001-REQ-717); the intents are not recomputed.
3. Line endings are normalised to LF before any hash. A `textHash` is the SHA-256 of the text with
   trailing whitespace removed from every line.

## §2 `.sdd/` workspace and SDD changes
1. The snapshot holds a `.sdd/` workspace when the repository root has a `.sdd/` folder with at
   least one change folder.
2. A change folder is a direct sub-folder of `.sdd/` whose name matches `^[0-9]{3}-[a-z0-9-]+$`
   and that holds `change.md`. Folders under `.sdd/_archive/` are not change folders.
3. The SDD change ID is the `id` value of the YAML frontmatter of `change.md` (for example
   `CHG-042`); its title is the `title` value.
4. A change is open unless its frontmatter `status` is `archived` (glossary, SDD change).
5. A change folder whose `change.md` has no YAML frontmatter, frontmatter that is not YAML, or no
   `id` value is left out of the intent context with notice ERR-SDD-005, naming `change.md` and
   the line of the fault (line 1 when the frontmatter is missing) (C001-REQ-123).

## §3 Spec items in the `.sdd/` format
| Item | Where | Rule |
|---|---|---|
| Requirement | `10-spec/20-capabilities/*/requirements.md` (profile full), `10-spec/spec.md` (profile lite) | each heading `### <ID> — <title>` whose ID matches `^C[0-9]{3}-REQ-[0-9]{3,}$`; text from the line after the heading to the line before the next heading of level 1 to 3 |
| Acceptance criterion | `10-spec/20-capabilities/*/acceptance.md`, `10-spec/spec.md` | each heading `#### <ID> — <title>` whose ID matches `^C[0-9]{3}-AC-[0-9]{3,}\.[0-9]+$`; linked to the requirement with the same number |
| Scenario | same files, in fenced `gherkin` blocks | each `Scenario: <ID> — <title>` or `Scenario Outline: <ID> — <title>` whose ID matches `^C[0-9]{3}-TS-[0-9]{3,}$`, to the next `Scenario` line or the end of the block; kind `scenario`, linked to the acceptance criterion above it |
| Task | `20-plan/50-tasks/T-*.md` (profile full) | frontmatter `id`, `title`, `implements` (requirement IDs, link type implements), `satisfies_ac`; body text is the task text; files named by §10 |
| Task (lite) | `20-plan/plan.md` | each heading `### <ID> — <title>` whose ID matches `^C[0-9]{3}-T-[0-9]{3,}$`; the requirement IDs in its `**Implements:**` bullet |

- The **linked items of a requirement** are its acceptance criteria, their scenarios and the tasks
  that implement it.
- An entry that has the form of a spec item but cannot be read is left out of the intent context
  with notice ERR-SDD-005, naming the file and line (C001-REQ-123): a heading of the item's level
  whose ID token has the shape `C<digits>-REQ-…`, `C<digits>-AC-…` or a `Scenario:` line with a
  `C<digits>-TS-…` token that does not match the pattern of the table, or lacks the ` — <title>`
  part; a second item with an ID already read in the same SDD change (the first one is kept); a
  task file whose frontmatter is not YAML or has no `id`.
- **Lines read** (C001-REQ-328): the lines from which a spec item is read are, for a requirement,
  an acceptance criterion or a lite task, its heading line and its text lines as delimited in the
  table; for a scenario, its `Scenario` line to its last line; for a task file, every line of the
  file. In the neutral file they are the lines of the item's JSON object, from its opening to its
  closing brace. The same rules applied to the base commit's content give the lines read at the
  base commit; the base side reads the SDD change with the same ID as the selected one.

## §4 Documented architecture
1. **Source order:** the `architecture` object of the neutral file (§5) when present; otherwise
   `10-spec/60-architecture/architecture.md` of the selected SDD change (§6); otherwise none. No
   other place is searched: not the other change folders, not `.sdd/_archive/`, not
   `.sdd/_living/` (C001-REQ-207, C001-REQ-211). Fallback to the newest `architecture.md` of the
   other change folders was considered and rejected: the architecture of another open change
   describes a state not yet built, so its components would report the present code as drift; the
   architecture of a brownfield change lists only the components that change touches, so every
   other file would be reported as "Undocumented". A repository that wants drift checked in every review,
   intent fallback and lite changes included, keeps its architecture in the neutral file, which
   comes first in the order.
2. **`.sdd/` components:** each heading `### <ID> — <name>` under `## 2. Component catalogue`
   whose ID matches `^C[0-9]{3}-COMP-[0-9]{2,}$`. Bullets read:
   - `**Depends on:**` — the component IDs it lists are its allowed dependencies (C001-REQ-208);
   - `**Paths:**` — comma-separated glob patterns in backticks (read by the review assistant only;
     the sdd template does not require it);
   - `**Layer:**` — `<rank> — <name>`, rank 1 being the top layer (C001-REQ-214);
   - `**Evidence:**` — when `Paths` is absent, each backticked file path it cites (`path:line`
     allowed) contributes the pattern `<directory of the path>/**`.
3. A file matching several components belongs to the one with the longest matching pattern; a
   tie goes to the component listed first.
4. An architecture in which no component has a path pattern is not a documented architecture:
   notice ERR-SDD-004 naming the file that holds it, and components are derived (C001-REQ-223,
   C001-REQ-210, C001-REQ-211).
5. A component heading under the catalogue whose ID token has the shape `C<digits>-COMP-…` but
   does not match the pattern of item 2, or that lacks the ` — <name>` part, or a component whose
   `**Paths:**` bullet holds no backticked pattern or whose `**Layer:**` bullet does not have the
   form `<rank> — <name>`, is left out of the documented architecture with notice ERR-SDD-005
   naming the file and line (C001-REQ-123); the files it would have placed fall under the other
   components or "Undocumented" (C001-REQ-209).
6. **Lines read** (C001-REQ-222): the lines from which a documented architecture is read are, in
   the `.sdd/` format, the `## 2. Component catalogue` heading, every component heading of item 2
   and every line of its `Depends on`, `Paths`, `Layer` and `Evidence` bullets, continuation lines
   included; in the neutral file, every line of the value of its `architecture` member. The same
   rules applied to the base commit's content, with the source order of item 1, give the lines read
   at the base commit.

## §5 Neutral intent-and-architecture file
1. Path and schema: `README.md` §2 and C001-IF-006. A file that is not JSON or does not validate
   stops intake with ERR-SDD-003, which names the file, the line and JSON pointer of the first
   nonconformity and the reason (C001-REQ-124).
2. Each entry of `changes` is an SDD change; `status` `open` makes it an open SDD change. Each item
   is a spec item of its kind; `links` and `files` are taken as given.
3. When the snapshot holds both a `.sdd/` workspace and a neutral file, the open SDD changes of
   both are candidates for §6. A neutral-file change ID equal to a `.sdd/` change ID is prefixed
   `neutral:` in the intent context.

## §6 Selecting the SDD change
1. `--sdd-change <value>` selects the open SDD change whose ID, three-digit folder number or folder
   name equals the value (C001-REQ-302). A value that matches no open SDD change of the snapshot,
   including one that names an archived change or a folder under `.sdd/_archive/`, stops intake
   with ERR-SDD-002, which lists the open SDD changes (C001-REQ-326).
2. Without the option: exactly one open SDD change is selected (C001-REQ-303); more than one stops
   intake with ERR-SDD-001 (C001-REQ-304); none puts the review in intent fallback.

## §7 Named files
1. Roles: `--pr-text` pull-request text, `--plan` agent plan, `--transcript` agent transcript
   (C001-IF-001, C001-REQ-112).
2. **Text-file rule:** the file must be valid UTF-8 (a byte-order mark is removed) with no NUL
   byte and, in its first 8 KiB, no control character other than tab, line feed, carriage return
   and form feed. It is Markdown when its extension is `.md` or `.markdown` (any case) and plain
   text otherwise.
3. Errors (C001-REQ-113): missing file ERR-CTX-001; read failure ERR-CTX-002; text-file rule not met
   ERR-CTX-003.

## §8 Plan-item rule
**Markdown plans.** Fenced code blocks, HTML comments and YAML frontmatter are ignored. The first
rule that yields at least one item applies:
1. task-list items (`- [ ]`, `- [x]`, also with `*`, `+` or an ordered marker), at the smallest
   indentation among task-list items;
2. numbered headings — ATX headings whose text starts with a number followed by `.`, `)` or a
   space, or with `Step`, `Phase`, `Stage`, `Task` or `Part` followed by a number — at the
   shallowest level among them;
3. ordered-list items (`1.` or `1)`) at the smallest indentation among them;
4. unordered-list items (`-`, `*`, `+`) at the smallest indentation among them;
5. headings at the shallowest level present, a single level-1 title excluded;
6. otherwise the whole file is one plan item.

**Plain-text plans.** The first rule that yields at least one item applies, each at the smallest
indentation among its lines: lines starting with `[ ]` or `[x]` (optionally after `-` or `*`);
lines starting with a number followed by `.` or `)` and a space; lines starting with `-`, `*`, `+`
or `•` and a space; otherwise each paragraph separated by blank lines is a plan item.

**Extent, title and ordinal.** An item extends to the line before the next item of the same rule
and level, or before a heading of the same or a higher level, or to the end of its list. Its title
is its first line without list, checkbox and heading markers and inline Markdown markup (link text
kept), trimmed and cut to 200 characters. Ordinals count from 1 in file order. The files an item
names are found by §10 (link signal "plan item names the file").

## §9 Transcript passages and recorded runs
1. **Passages:** a Markdown transcript is split at headings, a plain-text one at blank lines; each
   passage has a location (file, first line). Passages are the sources of model-extracted intents
   (C001-REQ-315).
2. **Recorded runs** (C001-REQ-510) in Markdown: in a fenced block whose info string is `console`,
   `terminal`, `shell-session`, `sh`, `bash`, `zsh`, `shell`, `powershell`, `pwsh`, `ps1`, `cmd` or
   `bat`, a line starting with a prompt (`$ `, `> `, `PS> `, `PS <path>> ` or `<drive>:\<path>>`) is
   a command and the lines up to the next prompt line are its recorded output. In such a block
   without any prompt line, each non-empty line that is not a comment is a command, and a fenced
   block that follows with only blank lines between, whose info string is empty, `text` or
   `output`, is the recorded output of the last command. In plain text, lines starting with `$ `
   are commands and the lines up to the next blank line are their output.
3. A recorded run is **linked** to an intent when it lies in the passage or plan item that is the
   intent's source, or when its command or output names a linked spec item of the intent (§10) or a
   file of one of the intent's hunks (§10).

## §10 Mention rules
1. **ID mention:** a text names a spec item when it contains the item's ID as a whole token: not
   preceded or followed by a letter, a digit, `-` or `_`. For `.sdd/` items the short form without
   the `C<NNN>-` prefix also counts when the item belongs to the selected SDD change. Commit
   messages, added lines of hunks and recorded runs are searched.
2. **File mention:** a text names a changed file when it contains the file's repository-relative
   path (with `/` or `\` separators, optionally after `./`), or the file's name with its extension
   when no other changed file of the snapshot has that name. The match must start at the beginning
   of the text, after whitespace or after one of `` ` ' " ( [ < ``, and end at the end of the text,
   before whitespace, before one of `` ` ' " ) ] > , ; : ! ? `` or before a `.` that ends a
   sentence.

## §11 Commits
The commits of the change (C001-REQ-109) are read through C001-IF-012. The subject line is the
first line of the message; the whole message is searched by §10. An extracted intent taken from a
commit (C001-REQ-313) has the commit as its source; the commit-of-origin signal links the hunks
whose changed lines that commit added or deleted (C001-REQ-110).
