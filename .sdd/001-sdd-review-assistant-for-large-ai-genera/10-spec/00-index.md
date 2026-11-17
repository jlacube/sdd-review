---
id: "C001-SPEC-INDEX"
artifact: spec/index
change: "CHG-001"
phase: 10-spec
status: draft
---
# C001 — Specification index

## Reading order
1. `10-context/problem-and-goals.md`
2. `10-context/stakeholders-and-personas.md`
3. `10-context/scope.md`
4. `10-context/current-state.md`
5. `40-domain/glossary-delta.md`
6. `20-capabilities/CAP-01-…` to `CAP-09-…`, in number order: `stories.md`, then `requirements.md`, then `acceptance.md`
7. `30-nfr/nfr.md`
8. `40-domain/domain-model.md`, then `40-domain/state-machines.md`
9. `50-interfaces/README.md`, then the interface files it lists, then `50-interfaces/errors.md`
10. `60-architecture/architecture.md`, then `60-architecture/constraints.md` and `60-architecture/sequences/`
11. `70-dod.md`
12. `questions-log.md`

## Files
| File | Purpose |
|---|---|
| `10-context/problem-and-goals.md` | Goals, success criteria and non-goals, by reference to the ideation |
| `10-context/stakeholders-and-personas.md` | Personas P-01 to P-03 and the stakeholder map |
| `10-context/scope.md` | In and out of scope, assumptions, constraints, external dependencies |
| `10-context/current-state.md` | Greenfield baseline and today's review practice, by reference to the research notes |
| `20-capabilities/CAP-01-change-intake/stories.md` | Stories of C001-CAP-01 |
| `20-capabilities/CAP-01-change-intake/requirements.md` | Requirements of C001-CAP-01 |
| `20-capabilities/CAP-01-change-intake/acceptance.md` | Acceptance criteria and scenarios of C001-CAP-01 |
| `20-capabilities/CAP-02-architecture-delta/stories.md` | Stories of C001-CAP-02 |
| `20-capabilities/CAP-02-architecture-delta/requirements.md` | Requirements of C001-CAP-02 |
| `20-capabilities/CAP-02-architecture-delta/acceptance.md` | Acceptance criteria and scenarios of C001-CAP-02 |
| `20-capabilities/CAP-03-intent-map/stories.md` | Stories of C001-CAP-03 |
| `20-capabilities/CAP-03-intent-map/requirements.md` | Requirements of C001-CAP-03, with the link-signal table |
| `20-capabilities/CAP-03-intent-map/acceptance.md` | Acceptance criteria and scenarios of C001-CAP-03 |
| `20-capabilities/CAP-04-risk-triage/stories.md` | Stories of C001-CAP-04 |
| `20-capabilities/CAP-04-risk-triage/requirements.md` | Requirements of C001-CAP-04 |
| `20-capabilities/CAP-04-risk-triage/acceptance.md` | Acceptance criteria and scenarios of C001-CAP-04 |
| `20-capabilities/CAP-05-review-evidence/stories.md` | Stories of C001-CAP-05 |
| `20-capabilities/CAP-05-review-evidence/requirements.md` | Requirements of C001-CAP-05 |
| `20-capabilities/CAP-05-review-evidence/acceptance.md` | Acceptance criteria and scenarios of C001-CAP-05 |
| `20-capabilities/CAP-06-review-coverage/stories.md` | Stories of C001-CAP-06 |
| `20-capabilities/CAP-06-review-coverage/requirements.md` | Requirements of C001-CAP-06 |
| `20-capabilities/CAP-06-review-coverage/acceptance.md` | Acceptance criteria and scenarios of C001-CAP-06 |
| `20-capabilities/CAP-07-verdicts/stories.md` | Stories of C001-CAP-07 |
| `20-capabilities/CAP-07-verdicts/requirements.md` | Requirements of C001-CAP-07 |
| `20-capabilities/CAP-07-verdicts/acceptance.md` | Acceptance criteria and scenarios of C001-CAP-07 |
| `20-capabilities/CAP-08-model-provider/stories.md` | Stories of C001-CAP-08 |
| `20-capabilities/CAP-08-model-provider/requirements.md` | Requirements of C001-CAP-08 |
| `20-capabilities/CAP-08-model-provider/acceptance.md` | Acceptance criteria and scenarios of C001-CAP-08 |
| `20-capabilities/CAP-09-review-surfaces/stories.md` | Stories of C001-CAP-09 |
| `20-capabilities/CAP-09-review-surfaces/requirements.md` | Requirements of C001-CAP-09 |
| `20-capabilities/CAP-09-review-surfaces/acceptance.md` | Acceptance criteria and scenarios of C001-CAP-09 |
| `30-nfr/nfr.md` | Non-functional requirements, reference environment, G-8 comparison protocol, inherited constitution defaults |
| `40-domain/glossary-delta.md` | Terms and system names introduced by CHG-001 |
| `40-domain/domain-model.md` | Entities with attributes, relationships, owning components, invariants and identity rules |
| `40-domain/state-machines.md` | Nine lifecycles: hunk review state, intent verdict, review, test run, mutation evidence of a hunk, clearing rule in a snapshot, model request, sample membership of a hunk, grouping of a hunk |
| `50-interfaces/README.md` | Interface registry C001-IF-001 to C001-IF-013, names and locations, shared format rules |
| `50-interfaces/review-cli.md` | C001-IF-001 review assistant CLI |
| `50-interfaces/openapi.yaml` | C001-IF-002 local review HTTP API |
| `50-interfaces/core-api.md` | C001-IF-003 core API |
| `50-interfaces/review-config.schema.json` | C001-IF-004 review configuration file |
| `50-interfaces/builtin-policy.md` | C001-IF-005 built-in clearing policy and file conventions |
| `50-interfaces/workspace.schema.json` | C001-IF-006 neutral intent-and-architecture file |
| `50-interfaces/intent-sources.md` | C001-IF-007 intent-source reading rules |
| `50-interfaces/analysis-results.schema.json` | C001-IF-008 analysis results |
| `50-interfaces/review-record.schema.json` | C001-IF-009 review record |
| `50-interfaces/model-provider.md` | C001-IF-010 model-provider interface and adapters |
| `50-interfaces/model-output.schema.json` | C001-IF-011 model task output |
| `50-interfaces/git-access.md` | C001-IF-012 git access port |
| `50-interfaces/evidence-runs.md` | C001-IF-013 evidence run conventions |
| `50-interfaces/errors.md` | Error and notice catalogue with CLI exit codes and HTTP statuses |
| `60-architecture/architecture.md` | Context, components C001-COMP-001 to C001-COMP-019, runtime flows, data, deployment and cross-cutting concerns |
| `60-architecture/constraints.md` | Architecture constraints C001-CON-09 to C001-CON-22 |
| `60-architecture/sequences/` | One sequence diagram per runtime flow of `architecture.md` §3 |
| `70-dod.md` | Definition of Done: inherited global items and feature items C001-DOD-001 to C001-DOD-032 |
| `questions-log.md` | Questions and answers of the spec phase |
| `80-traceability.md` | Generated trace matrix (do not edit) |
| `85-open-items.md` | Generated list of open markers (do not edit) |

## Capabilities and ID blocks
| Capability | Folder | US | REQ | AC | TS |
|---|---|---|---|---|---|
| C001-CAP-01 Change intake | `CAP-01-change-intake/` | US-101 to US-105 | REQ-101 to REQ-124 | AC-1nn.n | TS-1nn |
| C001-CAP-02 Architecture delta | `CAP-02-architecture-delta/` | US-201 to US-206 | REQ-201 to REQ-224 | AC-2nn.n | TS-2nn |
| C001-CAP-03 Intent map | `CAP-03-intent-map/` | US-301 to US-307 | REQ-301 to REQ-328 | AC-3nn.n | TS-3nn |
| C001-CAP-04 Risk triage and guarded clearing | `CAP-04-risk-triage/` | US-401 to US-406 | REQ-401 to REQ-427 | AC-4nn.n | TS-4nn |
| C001-CAP-05 Test-first reading and executable evidence | `CAP-05-review-evidence/` | US-501 to US-506 | REQ-501 to REQ-524 | AC-5nn.n | TS-5nn |
| C001-CAP-06 Review coverage, sampling and attention budget | `CAP-06-review-coverage/` | US-601 to US-606 | REQ-601 to REQ-617 | AC-6nn.n | TS-6nn |
| C001-CAP-07 Verdicts and review record | `CAP-07-verdicts/` | US-701 to US-706 | REQ-701 to REQ-722 | AC-7nn.n | TS-7nn |
| C001-CAP-08 Model provider and model-free mode | `CAP-08-model-provider/` | US-801 to US-806 | REQ-801 to REQ-819 (REQ-813 retired) | AC-8nn.n | TS-8nn |
| C001-CAP-09 CLI and local review UI | `CAP-09-review-surfaces/` | US-901 to US-907 | REQ-901 to REQ-922 (REQ-903 retired) | AC-9nn.n | TS-9nn |

## ID counts
| Type | Count |
|---|---|
| GOAL | 8 |
| SC | 8 |
| NG | 5 |
| AS | 8 |
| CON | 22 (C001-CON-01 to C001-CON-08 in `10-context/scope.md`, C001-CON-09 to C001-CON-22 in `60-architecture/constraints.md`) |
| CAP | 9 |
| US | 55 |
| REQ | 205 (2 retired: C001-REQ-813, C001-REQ-903) |
| NFR | 18 |
| AC | one or more per requirement; current count and coverage: `80-traceability.md` (generated) |
| TS | current count and coverage: `80-traceability.md` (generated) |
| INV | 16 |
| IF | 13 |
| COMP | 19 |
| DOD | 32 |
