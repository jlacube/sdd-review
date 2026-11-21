// Spike C001-T-020 (spike-grade): the document set of a revision (C001-IF-008) as the spike can fill
// it, saved through the production revision store (C001-COMP-014, C001-ADR-005 item 5). The
// architecture-delta, intent-map and triage documents are stand-ins sized from the snapshot's
// hunks (C001-T-042, C001-T-045, C001-T-055 write the real ones); the evidence document holds the
// test run, the mutation results and the bundle runs of the spike. C001-T-060 to C001-T-065 replace it.
import type { BundleRun, Hunk, MutationResult } from '../../src/generated/analysis-results.js';
import type { RevisionStore } from '../../src/core/store/revisions.js';
import type { PerTestCoverage } from './changed.js';

export interface SpikeEvidence {
  testCommand: string;
  coverage: PerTestCoverage | null;
  mutationResults: MutationResult[];
  bundleRuns: BundleRun[];
  bundleCommands: Array<{ commandId: string; command: string }>;
}

/** The evidence document (C001-IF-008 `EvidenceDocument`) of the spike's state. */
export function evidenceDocument(snapshotId: string, e: SpikeEvidence): Record<string, unknown> {
  const testRuns = e.coverage
    ? [
        {
          testRunId: 'spike-run-1',
          command: e.testCommand,
          origin: 'developer',
          status: 'completed',
          reason: null,
          results: e.coverage.tests.map((t) => ({
            testId: t.testId,
            name: t.testId,
            outcome: t.outcome,
          })),
          coverage: [...e.coverage.lines].flatMap(([path, byLine]) =>
            [...byLine].map(([line, tests]) => ({ path, line, tests })),
          ),
        },
      ]
    : [];
  return {
    document: 'evidence',
    formatVersion: 1,
    snapshotId,
    testRuns,
    evidenceItems: [],
    mutationResults: e.mutationResults,
    propertyCounterExamples: [],
    evidenceBundles:
      e.bundleCommands.length > 0
        ? [
            {
              intentId: 'spike-intent',
              commands: e.bundleCommands.map((c) => ({
                ...c,
                origin: 'developer',
                confirmed: true,
              })),
              runs: e.bundleRuns,
            },
          ]
        : [],
    testJudgements: [],
    notices: [],
  };
}

/** Stand-ins for the other three documents, with one entry per hunk (their size scales so). */
export function standInDocuments(
  snapshotId: string,
  hunks: readonly Hunk[],
): Record<string, unknown> {
  return {
    'architecture-delta': {
      document: 'architecture-delta',
      formatVersion: 1,
      snapshotId,
      spikeStandIn: true,
      files: [...new Set(hunks.map((h) => h.path))].map((path) => ({
        path,
        componentId: 'undocumented',
      })),
    },
    'intent-map': {
      document: 'intent-map',
      formatVersion: 1,
      snapshotId,
      spikeStandIn: true,
      intents: [{ intentId: 'spike-intent', hunkIds: hunks.map((h) => h.hunkId) }],
    },
    triage: {
      document: 'triage',
      formatVersion: 1,
      snapshotId,
      spikeStandIn: true,
      hunks: hunks.map((h) => ({
        hunkId: h.hunkId,
        path: h.path,
        newStart: h.newStart,
        changedLines: h.changedLines,
        state: 'open',
        lines: h.lines,
      })),
    },
  };
}

/** Saves the next revision; returns its number and the save time in milliseconds. */
export async function saveRevision(
  store: RevisionStore,
  snapshotId: string,
  hunks: readonly Hunk[],
  evidence: SpikeEvidence,
  standIns: Record<string, unknown> = standInDocuments(snapshotId, hunks),
): Promise<{ revision: number; durationMs: number }> {
  const t0 = performance.now();
  const revision = store.nextRevision();
  await store.commit(revision, 0, {
    'architecture-delta': standIns['architecture-delta'],
    'intent-map': standIns['intent-map'],
    triage: standIns.triage,
    evidence: evidenceDocument(snapshotId, evidence),
  });
  return { revision, durationMs: Math.round((performance.now() - t0) * 10) / 10 };
}
