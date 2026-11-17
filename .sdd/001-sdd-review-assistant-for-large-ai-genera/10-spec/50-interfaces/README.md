---
id: "C001-SPEC-IF"
artifact: spec/interfaces-registry
change: "CHG-001"
phase: 10-spec
status: draft
---
# C001 — Interface registry

## 1. Interfaces
| ID | Name | Kind | File | Provider | Consumers | REQs |
|---|---|---|---|---|---|---|
| C001-IF-001 | Review assistant CLI | CLI | `review-cli.md` | C001-COMP-001 | P-02 developer, scripts | C001-REQ-104, C001-REQ-114, C001-REQ-121, C001-REQ-326, C001-REQ-712, C001-REQ-721, C001-REQ-808, C001-REQ-901, C001-REQ-902, C001-REQ-912, C001-REQ-914 to C001-REQ-916 |
| C001-IF-002 | Local review HTTP API | HTTP API | `openapi.yaml` | C001-COMP-018 | C001-COMP-019 | C001-REQ-905 to C001-REQ-907, C001-REQ-920, C001-REQ-201, C001-REQ-220, C001-REQ-328, C001-REQ-520, C001-REQ-601, C001-REQ-615, C001-REQ-703, C001-REQ-712, C001-REQ-719 to C001-REQ-721, C001-REQ-909 |
| C001-IF-003 | Core API | conventions | `core-api.md` | C001-COMP-002 | C001-COMP-001, C001-COMP-018 | C001-REQ-520, C001-REQ-615, C001-REQ-617, C001-REQ-712, C001-REQ-719 to C001-REQ-722, C001-REQ-913, C001-REQ-915, C001-REQ-917 to C001-REQ-920 |
| C001-IF-004 | Review configuration file | JSON document | `review-config.schema.json` | P-03 repository maintainer (file in the repository) | C001-COMP-006 | C001-REQ-215, C001-REQ-409, C001-REQ-423 to C001-REQ-427, C001-REQ-501, C001-REQ-505, C001-REQ-801, C001-REQ-805, C001-REQ-806, C001-REQ-809, C001-REQ-814, C001-REQ-816, C001-REQ-819 |
| C001-IF-005 | Built-in clearing policy and file conventions | conventions | `builtin-policy.md` | C001-COMP-006 | C001-COMP-007, C001-COMP-008, C001-COMP-010 | C001-REQ-205, C001-REQ-215, C001-REQ-414 to C001-REQ-417, C001-REQ-501, C001-REQ-816, C001-NFR-005 |
| C001-IF-006 | Neutral intent-and-architecture file | JSON document | `workspace.schema.json` | any SDD tool (file in the repository) | C001-COMP-005 | C001-REQ-111, C001-REQ-124, C001-REQ-207 |
| C001-IF-007 | Intent-source reading rules | conventions | `intent-sources.md` | C001-COMP-005 | C001-COMP-004, C001-COMP-008, C001-COMP-009, C001-COMP-011 | C001-REQ-111, C001-REQ-112, C001-REQ-113, C001-REQ-123, C001-REQ-124, C001-REQ-207, C001-REQ-222, C001-REQ-223, C001-REQ-302 to C001-REQ-304, C001-REQ-306, C001-REQ-314, C001-REQ-326, C001-REQ-328, C001-REQ-510 |
| C001-IF-008 | Analysis results | JSON document | `analysis-results.schema.json` | C001-COMP-002 | C001-COMP-001, C001-COMP-018, scripts | C001-REQ-104, C001-REQ-222, C001-REQ-224, C001-REQ-328, C001-REQ-604, C001-REQ-616, C001-REQ-912, C001-REQ-919, C001-NFR-015 |
| C001-IF-009 | Review record | JSON document | `review-record.schema.json` | C001-COMP-014 | C001-COMP-013, C001-COMP-001, C001-COMP-018, scripts | C001-REQ-321, C001-REQ-607, C001-REQ-617, C001-REQ-710, C001-REQ-712 to C001-REQ-714, C001-REQ-721, C001-REQ-917, C001-REQ-918, C001-REQ-920 |
| C001-IF-010 | Model-provider interface and adapters | conventions | `model-provider.md` | C001-COMP-015 (port); C001-COMP-016, C001-COMP-017 (adapters) | C001-COMP-008, C001-COMP-009 | C001-REQ-327, C001-REQ-805, C001-REQ-806, C001-REQ-808 to C001-REQ-811, C001-REQ-814, C001-REQ-816 to C001-REQ-819 |
| C001-IF-011 | Model task output | JSON document | `model-output.schema.json` | model provider (through C001-COMP-016, C001-COMP-017) | C001-COMP-015, C001-COMP-009 | C001-REQ-327, C001-REQ-816 |
| C001-IF-012 | Git access port | conventions | `git-access.md` | C001-COMP-003 | C001-COMP-002, C001-COMP-004, C001-COMP-006, C001-COMP-011 | C001-REQ-101 to C001-REQ-106, C001-REQ-109, C001-REQ-110, C001-REQ-117, C001-REQ-120, C001-REQ-409, C001-REQ-426, C001-REQ-521, C001-REQ-522, C001-REQ-707, C001-REQ-712, C001-REQ-721 |
| C001-IF-013 | Evidence run conventions | conventions | `evidence-runs.md` | C001-COMP-011 | C001-COMP-010, C001-COMP-002 | C001-REQ-505 to C001-REQ-517, C001-REQ-521, C001-REQ-522, C001-REQ-523, C001-REQ-524 |

Error codes of every interface: `errors.md`.

## 2. Names and locations
These names appear in several interfaces and are defined here only. The tool name `sdd-review`
was chosen in Q-naming-01 (`questions-log.md`, round 8).

| Item | Value |
|---|---|
| Executable of the CLI | `sdd-review` |
| Configuration folder in the repository | `.sdd-review/` (same name as the executable) |
| Review configuration file | `.sdd-review/config.json`, read from the base commit (C001-REQ-426) |
| Neutral intent-and-architecture file | `.sdd-review/workspace.json`, read from the snapshot (C001-REQ-111) |
| Default credential-store entry of a provider key | service `sdd-review`, account = provider name (C001-IF-010 §7, C001-REQ-809) |
| Review state store | outside the working tree on the local machine; exact location set by ADR in 20-plan (`60-architecture/constraints.md`, C001-CON-16) |
| Evidence workspaces | on the local machine outside the working-tree root and the git directory, below neither; exact location set by ADR in 20-plan (C001-IF-013 §2, C001-CON-22) |
| HTTP API base path | `/api/v1` on `http://127.0.0.1:<port>` |

## 3. Format rules shared by the JSON documents
- Encoding UTF-8 without byte-order mark; line endings LF; JSON Schema 2020-12.
- Paths are repository-relative with `/` separators.
- Times are ISO 8601 with a UTC offset, for example `2026-11-17T14:03:22+01:00`.
- Hashes are lower-case hexadecimal: SHA-256 for content and identifiers, the repository's object
  format for commits.
- Identifier formats: `40-domain/domain-model.md` §3.
- Every document, the review configuration, the neutral file and the header line of a review
  record carry `formatVersion` 1. A later version that removes or renames a field increments it;
  a reader rejects a version it does not know.
