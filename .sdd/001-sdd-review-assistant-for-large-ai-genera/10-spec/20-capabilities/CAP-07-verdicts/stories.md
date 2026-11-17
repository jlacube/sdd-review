---
id: "C001-CAP-07"
artifact: spec/stories
change: "CHG-001"
phase: 10-spec
status: draft
capability: "Verdicts and review record"
---
# C001-CAP-07 — Verdicts and review record: user stories

Scope: the developer's sign, reject and defer decisions per intent, decisions on orphan code, and
the durable record of verdicts against the snapshot (`ideation.md` §8 step 5, C001-DEC-003). The
tool records decisions; it never acts on the code (C001-CON-04).

### C001-US-701 — Sign an intent
- **As a** P-02 developer accepting agent output
- **I want** to sign an intent as accepted when I am satisfied with its open hunks, its tests and
  its evidence
- **So that** acceptance is a deliberate, attributable act on a unit I understand
- **Value / outcome:** nothing is accepted without my signature (C001-SC-05)
- **Priority:** Must · **Size hint:** S · **Capability:** C001-CAP-07
- **Context & notes:** C001-DEC-003. With open hunks not yet read, I sign after confirming a
  prompt that states what is unread, and the record keeps the unread share (Q-signing-01,
  C001-REQ-703).
- **Out of scope:** staging or committing the accepted code (C001-NG-03).
- **Requirements:** C001-REQ-701, C001-REQ-702, C001-REQ-703, C001-REQ-707
- **Traces to:** C001-GOAL-05, C001-DEC-003, Q-signing-01

### C001-US-702 — Reject an intent with a reason
- **As a** P-02 developer accepting agent output
- **I want** to reject an intent and write why
- **So that** the reason stays with the change and I can take it to the agent myself
- **Value / outcome:** rejections are explained, not implicit
- **Priority:** Must · **Size hint:** S · **Capability:** C001-CAP-07
- **Context & notes:** sending structured feedback to the agent is a later change (`ideation.md`
  §5 Later).
- **Out of scope:** sending the rejection to the agent; reverting code (C001-NG-01, C001-NG-03).
- **Requirements:** C001-REQ-704, C001-REQ-706, C001-REQ-707
- **Traces to:** C001-GOAL-05, C001-DEC-003

### C001-US-703 — Defer an intent
- **As a** P-02 developer accepting agent output
- **I want** to defer an intent with a note
- **So that** I can finish the rest of the review and come back to it
- **Value / outcome:** one hard intent does not block the others
- **Priority:** Must · **Size hint:** S · **Capability:** C001-CAP-07
- **Context & notes:** a deferred intent is neither accepted nor rejected (C001-DEC-003).
- **Requirements:** C001-REQ-705, C001-REQ-706, C001-REQ-707, C001-REQ-708, C001-REQ-711
- **Traces to:** C001-GOAL-05, `ideation.md` §8 step 5

### C001-US-704 — Decide on orphan code
- **As a** P-02 developer accepting agent output
- **I want** to attach each orphan hunk to an existing intent or to a new intent I name, and then
  decide on that intent, or to reject the hunk
- **So that** no code reaches acceptance without a decision, even code nobody asked for
- **Value / outcome:** C001-DEC-003 holds for orphan code too
- **Priority:** Must · **Size hint:** S · **Capability:** C001-CAP-07
- **Context & notes:** orphan code comes from C001-US-303. A new intent I name has no spec source
  and shows that in the record. A hunk I rejected and later attach to an intent is decided by
  that intent's verdict (C001-REQ-722).
- **Requirements:** C001-REQ-706, C001-REQ-707, C001-REQ-709, C001-REQ-710, C001-REQ-711, C001-REQ-715, C001-REQ-719, C001-REQ-720, C001-REQ-722
- **Traces to:** C001-GOAL-03, C001-GOAL-05, C001-DEC-003

### C001-US-705 — Keep a review record
- **As a** P-02 developer accepting agent output
- **I want** every verdict recorded with the snapshot, the intent, my reason, the evidence and
  clearings it relied on, the read, cleared and open shares, and the time
- **So that** I, or anyone I show it to, can see later what was accepted and on what basis
- **Value / outcome:** a durable verdict ledger (C001-R-001 Gap 3)
- **Priority:** Must · **Size hint:** M · **Capability:** C001-CAP-07
- **Context & notes:** where the record is stored (in the repository or in local state) is an
  architecture decision (`ideation.md` §11, sdd-architect). The record is readable without the UI
  (C001-US-904). Besides verdicts, the record keeps every other recorded action, for example
  read marks, test judgements and defect reports (glossary: review record).
- **Requirements:** C001-REQ-617, C001-REQ-708, C001-REQ-712, C001-REQ-713, C001-REQ-714, C001-REQ-721
- **Traces to:** C001-GOAL-05, C001-DEC-003, `ideation.md` §8 step 5

### C001-US-706 — Be told when a verdict has gone stale
- **As a** P-02 developer accepting agent output
- **I want** a verdict marked stale when the hunks, the evidence or the source of its intent
  change after I gave it
- **So that** I never rely on a signature given on different code
- **Value / outcome:** verdicts stay tied to what was reviewed
- **Priority:** Must · **Size hint:** M · **Capability:** C001-CAP-07
- **Context & notes:** `ideation.md` §9 (flag stale verdicts); snapshot detection in C001-US-104.
- **Out of scope:** re-presenting only the changed units (incremental re-review, C001-R-002
  paradigm 20; `ideation.md` §5 Later).
- **Requirements:** C001-REQ-711, C001-REQ-715, C001-REQ-716, C001-REQ-717, C001-REQ-718, C001-REQ-911
- **Traces to:** C001-GOAL-05, `ideation.md` §9
