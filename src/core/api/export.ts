import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import type { IntakeDocument } from '../../generated/analysis-results.js';
import { ReviewError } from '../errors/review-error.js';
import type { RevisionDocuments } from '../store/revisions.js';
import { createIntents, intentSourcesOf, planKeyPath } from '../intent-map/intents.js';

/** The files of the headless output directory (C001-IF-001 Output), in the order they are written. */
export const EXPORT_FILES = [
  'intake.json',
  'architecture-delta.json',
  'intent-map.json',
  'triage.json',
  'evidence.json',
  'review-record.jsonl',
] as const;

const json = (value: unknown) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');

const NOT_YET = (what: string) => `${what}: not yet analysed`;

/**
 * The documents of a snapshot as the schemas of C001-IF-008 require them: what the revision holds
 * over a minimal valid document of the parts that no task has analysed yet. Every part that the
 * revision lacks is the starting state (all hunks open, nothing cleared, one catch-all component);
 * the architecture delta and the intent map say so in `labels.reduced`. The triage and evidence
 * documents have no member that can carry that statement (spec defect, reported by C001-T-010), so
 * they are valid and empty until their analyses exist.
 *
 * The intent map holds the deterministic intents of the snapshot (C001-T-044) with every hunk in
 * orphan code and every intent unmet until the hunks are linked (C001-T-045). No model task creates
 * intents yet (C001-T-090), so the intents are those of model-free mode (C001-REQ-313).
 * `repositoryRoot` makes the plan file paths of the intent keys repository-relative (domain model
 * §3); named plans were resolved against the current directory at intake (C001-IF-007 §7).
 */
export function completeDocuments(
  intake: IntakeDocument,
  revision: Partial<RevisionDocuments> | null,
  repositoryRoot?: string,
): Record<'architecture-delta' | 'intent-map' | 'triage' | 'evidence', unknown> {
  const { snapshotId } = intake.snapshot;
  const head = (document: string) => ({ document, formatVersion: 1, snapshotId });
  const hunkIds = intake.hunks.map((hunk) => hunk.hunkId);
  const changedLines = intake.snapshot.changedLines;
  const shares = (lines: number) => ({
    changedLines: lines,
    read: 0,
    cleared: 0,
    open: lines > 0 ? 1 : 0,
  });
  const stored = (name: keyof RevisionDocuments): Record<string, unknown> => {
    const value = revision?.[name];
    return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  };

  const architectureDelta = {
    ...head('architecture-delta'),
    documented: false,
    driftChecked: false,
    components: [
      {
        componentId: 'undocumented',
        name: 'Undocumented',
        origin: 'undocumented',
        layer: null,
        changedFiles: intake.snapshot.changedFiles.length,
        changedLines,
        hunks: hunkIds.length,
      },
    ],
    dependencies: [],
    packageChanges: [],
    unanalysedManifests: [],
    designFindings: [],
    driftFindings: [],
    labels: { reduced: [NOT_YET('architecture delta')] },
    notices: [],
    ...stored('architecture-delta'),
  };
  const sources = intentSourcesOf(intake);
  const intents = createIntents(sources, {
    modelFree: true,
    ...(repositoryRoot !== undefined
      ? { planKeyPath: (file: string) => planKeyPath(file, repositoryRoot, process.cwd()) }
      : {}),
  });
  const intentIds = intents.map((intent) => intent.intentId);
  const intentMap = {
    ...head('intent-map'),
    mode: sources.sddChange !== null ? 'sdd-change' : 'intent-fallback',
    sddChangeId: sources.sddChange?.id ?? null,
    intents,
    links: [],
    specEdits: [],
    orphanHunkIds: hunkIds,
    unmetIntentIds: intentIds,
    displayOrder: ['orphan', ...intentIds],
    labels: { reduced: [NOT_YET('hunk links')] },
    notices: [],
    ...stored('intent-map'),
  };
  const triage = {
    ...head('triage'),
    configuration: { readable: true, ignoredSettings: [] },
    risk: [],
    hunkStates: hunkIds.map((hunkId) => ({
      hunkId,
      state: 'open',
      reopenCause: null,
      inSample: false,
    })),
    evidenceRecords: [],
    rules: [],
    intentOrder: [],
    shares: {
      change: shares(changedLines),
      orphan: shares(changedLines),
      intents: [],
      components: [{ componentId: 'undocumented', shares: shares(changedLines) }],
    },
    notices: [],
    ...stored('triage'),
  };
  const evidence = {
    ...head('evidence'),
    testRuns: [],
    evidenceItems: [],
    mutationResults: [],
    propertyCounterExamples: [],
    evidenceBundles: [],
    testJudgements: [],
    notices: [],
    ...stored('evidence'),
  };
  return {
    'architecture-delta': architectureDelta,
    'intent-map': intentMap,
    triage,
    evidence,
  };
}

/** The review record bytes up to its last complete line (an unfinished last line is not an entry). */
export function completeRecordBytes(file: string): Buffer {
  const bytes = readFileSync(file);
  return bytes.subarray(0, bytes.lastIndexOf(0x0a) + 1);
}

export interface ExportInput {
  readonly intake: IntakeDocument;
  readonly revision: Partial<RevisionDocuments> | null;
  readonly recordBytes: Buffer;
  /** The working-tree root of the repository (plan file paths of intent keys). */
  readonly repositoryRoot?: string;
}

/** Everything `writeExport` writes, by file name. */
export function exportContents(input: ExportInput): ReadonlyMap<string, Buffer> {
  const documents = completeDocuments(input.intake, input.revision, input.repositoryRoot);
  return new Map<string, Buffer>([
    ['intake.json', json(input.intake)],
    ['architecture-delta.json', json(documents['architecture-delta'])],
    ['intent-map.json', json(documents['intent-map'])],
    ['triage.json', json(documents.triage)],
    ['evidence.json', json(documents.evidence)],
    ['review-record.jsonl', input.recordBytes],
  ]);
}

const causeOf = (error: unknown): string => {
  return error instanceof Error ? error.message : String(error);
};

/**
 * Writes the files into `directory` (created when missing, other files left alone) and returns
 * their paths. Every file is staged under a temporary name first and renamed over its target only
 * when all are staged; when any step fails, every file this call wrote is removed again and the
 * call rejects with ERR-CLI-002 (C001-IF-001 Output).
 */
export function writeExport(
  directory: string,
  contents: ReadonlyMap<string, Buffer>,
  isAborted: () => boolean = () => false,
): string[] {
  const dir = resolve(directory);
  const staged: Array<{ temporary: string; target: string }> = [];
  const placed: string[] = [];
  try {
    mkdirSync(dir, { recursive: true });
    const stamp = `${process.pid}-${Date.now().toString(36)}`;
    for (const [name, bytes] of contents) {
      const temporary = join(dir, `.${name}.${stamp}.tmp`);
      staged.push({ temporary, target: join(dir, name) });
      const fd = openSync(temporary, 'wx', 0o644);
      try {
        writeSync(fd, bytes);
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
    }
    if (isAborted()) throw new Error('interrupted');
    for (const { temporary, target } of staged) {
      renameSync(temporary, target);
      placed.push(target);
    }
    return placed;
  } catch (error) {
    for (const { temporary } of staged) rmSync(temporary, { force: true });
    for (const target of placed) rmSync(target, { force: true });
    throw new ReviewError('ERR-CLI-002', {
      operation: 'export-results',
      inputs: { directory: dir },
      params: { directory: dir, cause: causeOf(error) },
      cause: error,
    });
  }
}
