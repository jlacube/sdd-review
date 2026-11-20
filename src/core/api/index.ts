import type { components } from '../../generated/openapi.js';
import type { Entry } from '../../generated/review-record.js';
import type {
  ArchitectureDeltaDocument,
  IntakeSummary,
  IntentMapDocument,
  Notice,
  TriageDocument,
} from '../../generated/analysis-results.js';
import { ReviewError } from '../errors/review-error.js';
import type { GitAccessPort } from '../git/port.js';
import { takeInChange } from '../intake/snapshot.js';
import { SnapshotEventLoop, SnapshotLoops } from '../orchestrator/event-loop.js';
import { JobScheduler } from '../orchestrator/jobs.js';
import type { StoreContext } from '../store/fsutil.js';
import { RevisionStore, type RevisionDocuments } from '../store/revisions.js';
import type { ReviewIndexEntry, SnapshotStore } from '../store/snapshots.js';

/**
 * The core API (C001-IF-003, C001-COMP-002): the only entry point into the analysis core. The CLI
 * and the UI server call it in process; the core imports neither of them (C001-CON-09,
 * C001-REQ-913). One async function per operation of §3 and §4; a failing operation rejects with a
 * `ReviewError` carrying one code of `errors.md` and changes no state.
 *
 * Binding (§1 leaves it to the implementation): `createCoreApi` binds the operations to one
 * repository (its git access port, its review state store and its root), so "takes the repository
 * root" of §2 is the binding and the operations take the snapshot ID and their own inputs.
 *
 * This task (C001-T-009) implements `startReview`, `getSession`, `getIntakeSummary`, `listReviews`
 * and the job operations; every other operation rejects with `NotImplementedError` until its task.
 */

type Schemas = components['schemas'];
export type SessionInfo = Schemas['SessionInfo'];
export type ProviderStatus = Schemas['ProviderStatus'];
export type ActionResult = Schemas['ActionResult'];
export type EscalationResult = Schemas['EscalationResult'];
export type VerdictResult = Schemas['VerdictResult'];
export type VerdictRequest = Schemas['VerdictRequest'];
export type MovedOnNotice = Schemas['MovedOnNotice'];
export type { Job } from '../orchestrator/jobs.js';

/** Intake options of C001-IF-003 §3; only the named base is read until the tasks that read the rest. */
export interface StartReviewOptions {
  /** The commit the developer named (C001-REQ-102). */
  readonly namedBase: string;
  readonly sddChange?: string;
  readonly namedFiles?: ReadonlyArray<{
    readonly role: 'pull-request-text' | 'agent-plan' | 'agent-transcript';
    readonly path: string;
  }>;
  readonly testCommand?: string;
}

export interface StartReviewResult {
  readonly snapshotId: string;
  readonly intakeSummary: IntakeSummary;
  /** True when a review of the same snapshot existed and was reopened, not recomputed. */
  readonly reopened: boolean;
  readonly notices: readonly Notice[];
}

export interface StaticAnalysisResult {
  readonly architectureDelta: ArchitectureDeltaDocument;
  readonly intentMap: IntentMapDocument;
  readonly triage: TriageDocument;
}

export type GroupingTarget = { readonly intentId: string } | { readonly orphan: true };

export interface ExportResult {
  readonly files: readonly string[];
}

export interface ConfigurationValidation {
  readonly valid: boolean;
  readonly ignoredSettings: readonly string[];
}

/** C001-IF-003 §3 (read and lifecycle) and §4 (write) in one type. */
export interface CoreApi {
  // §3
  startReview(options: StartReviewOptions): Promise<StartReviewResult>;
  runStaticAnalysis(snapshotId: string): Promise<StaticAnalysisResult>;
  startJobs(snapshotId: string): Promise<Schemas['Job'][]>;
  listJobs(snapshotId: string): Promise<Schemas['Job'][]>;
  cancelJob(snapshotId: string, jobId: string): Promise<Schemas['Job'][]>;
  openReview(snapshotId: string): Promise<SessionInfo>;
  listReviews(): Promise<ReviewIndexEntry[]>;
  getSession(snapshotId: string): Promise<SessionInfo>;
  checkMovedOn(snapshotId: string): Promise<MovedOnNotice | null>;
  getIntakeSummary(snapshotId: string): Promise<IntakeSummary>;
  getArchitectureDelta(snapshotId: string): Promise<Schemas['ArchitectureDeltaView']>;
  getComponent(snapshotId: string, componentId: string): Promise<Schemas['ComponentView']>;
  getIntentMap(snapshotId: string): Promise<Schemas['IntentMapView']>;
  getIntent(snapshotId: string, intentId: string): Promise<Schemas['IntentView']>;
  getWalkthrough(snapshotId: string, intentId: string): Promise<Schemas['Walkthrough']>;
  getEvidenceBundle(snapshotId: string, intentId: string): Promise<Schemas['EvidenceBundle']>;
  getHunk(snapshotId: string, hunkId: string): Promise<Schemas['HunkView']>;
  getFileContent(
    snapshotId: string,
    path: string,
    side: 'base' | 'snapshot',
  ): Promise<Schemas['FileContent']>;
  getReadingQueue(snapshotId: string): Promise<Schemas['ReadingQueue']>;
  getCoverageStatement(snapshotId: string): Promise<Schemas['CoverageStatement']>;
  getDecisionStatus(snapshotId: string): Promise<Schemas['DecisionStatus']>;
  getRecord(snapshotId: string): Promise<Entry[]>;
  exportResults(snapshotId: string, directory: string): Promise<ExportResult>;
  validateConfiguration(filePath: string): Promise<ConfigurationValidation>;
  // §4: recorded actions (each also refuses with ERR-ACT-006, ERR-STORE-001 and ERR-STORE-003)
  markRead(snapshotId: string, hunkIds: readonly string[]): Promise<ActionResult>;
  markIntentRead(snapshotId: string, intentId: string): Promise<ActionResult>;
  reopenHunk(snapshotId: string, hunkId: string): Promise<ActionResult>;
  moveHunk(snapshotId: string, hunkId: string, target: GroupingTarget): Promise<ActionResult>;
  createIntent(
    snapshotId: string,
    name: string,
    hunkIds: readonly string[],
  ): Promise<ActionResult & { readonly intentId: string }>;
  rejectOrphanHunk(snapshotId: string, hunkId: string, reason: string): Promise<ActionResult>;
  setTestJudgement(
    snapshotId: string,
    intentId: string,
    value: 'expresses' | 'does-not-express',
  ): Promise<ActionResult>;
  reportDefect(snapshotId: string, hunkId: string, text: string): Promise<EscalationResult>;
  setAttentionBudget(
    snapshotId: string,
    minutes: unknown,
    readingRate?: unknown,
  ): Promise<ActionResult>;
  addBundleCommand(snapshotId: string, intentId: string, command: string): Promise<ActionResult>;
  confirmBundleCommand(
    snapshotId: string,
    intentId: string,
    commandId: string,
  ): Promise<ActionResult>;
  giveVerdict(
    snapshotId: string,
    intentId: string,
    request: VerdictRequest,
  ): Promise<VerdictResult>;
  // §4: not a recorded action
  runEvidenceBundle(snapshotId: string, intentId: string): Promise<Schemas['Job']>;
}

/** The name of every operation of C001-IF-003 §3 and §4. */
export const CORE_OPERATIONS = [
  'startReview',
  'runStaticAnalysis',
  'startJobs',
  'listJobs',
  'cancelJob',
  'openReview',
  'listReviews',
  'getSession',
  'checkMovedOn',
  'getIntakeSummary',
  'getArchitectureDelta',
  'getComponent',
  'getIntentMap',
  'getIntent',
  'getWalkthrough',
  'getEvidenceBundle',
  'getHunk',
  'getFileContent',
  'getReadingQueue',
  'getCoverageStatement',
  'getDecisionStatus',
  'getRecord',
  'exportResults',
  'validateConfiguration',
  'markRead',
  'markIntentRead',
  'reopenHunk',
  'moveHunk',
  'createIntent',
  'rejectOrphanHunk',
  'setTestJudgement',
  'reportDefect',
  'setAttentionBudget',
  'addBundleCommand',
  'confirmBundleCommand',
  'giveVerdict',
  'runEvidenceBundle',
] as const satisfies ReadonlyArray<keyof CoreApi>;

/**
 * The operation exists but its task has not been built. ERR-CLI-003 (internal error) is the only
 * code of the catalogue that fits; `runStaticAnalysis` lists it in C001-IF-003 §3.
 */
export class NotImplementedError extends ReviewError {
  readonly operation: string;

  constructor(operation: string) {
    const cause = 'not implemented yet';
    super('ERR-CLI-003', { operation, inputs: { operation }, params: { operation, cause }, cause });
    this.name = 'NotImplementedError';
    this.operation = operation;
  }
}

export interface CoreDeps {
  readonly git: GitAccessPort;
  readonly store: SnapshotStore;
  /** The context the store was built with; the revision store of each snapshot shares it. */
  readonly ctx: StoreContext;
  /** The working-tree root of the repository (record header). */
  readonly repositoryRoot: string;
  readonly now?: () => Date;
  /** Model-free until the provider tasks; the gateway sets it then (C001-REQ-807). */
  readonly providerStatus?: ProviderStatus;
}

/** The core: the API and the orchestrator parts that later tasks register their work with. */
export interface Core {
  readonly api: CoreApi;
  /** Later tasks register their jobs here (`jobs.register`). */
  readonly jobs: JobScheduler;
  /** The one writer of each snapshot. */
  readonly loops: SnapshotLoops;
  /** Waits for the running events, then refuses new ones. */
  close(): Promise<void>;
}

const MODEL_FREE: ProviderStatus = {
  mode: 'model-free',
  providerName: null,
  contentSentOffMachine: false,
};

/**
 * The documents of the first revision, written right after intake: identity only. The static
 * analysis (C001-T-036 and later) replaces them with the architecture delta, the intent map and the
 * triage, and the test run and mutation jobs add the evidence.
 */
function firstRevisionDocuments(snapshotId: string): RevisionDocuments {
  const doc = (document: string) => ({ document, formatVersion: 1, snapshotId });
  return {
    'architecture-delta': doc('architecture-delta'),
    'intent-map': doc('intent-map'),
    triage: doc('triage'),
    evidence: doc('evidence'),
  };
}

export function createCore(deps: CoreDeps): Core {
  const { git, store, ctx } = deps;
  const revisionsOf = (snapshotId: string) => new RevisionStore(ctx, store.snapshotDir(snapshotId));
  const loops = new SnapshotLoops(
    (snapshotId) => new SnapshotEventLoop(snapshotId, revisionsOf(snapshotId)),
  );
  const jobs = new JobScheduler({ store, loops, log: ctx.log });

  /** Intake's last step: the first revision, so that a result is only ever shown from a revision. */
  async function ensureFirstRevision(snapshotId: string): Promise<void> {
    if (revisionsOf(snapshotId).readCurrent() !== null) return;
    await loops.get(snapshotId).submit({
      kind: 'intake',
      run: () => ({
        result: undefined,
        documents: firstRevisionDocuments(snapshotId),
        appliedSeq: 0,
      }),
    });
  }

  async function getIntakeSummary(snapshotId: string): Promise<IntakeSummary> {
    return (await store.readSnapshot(snapshotId)).intakeSummary;
  }

  async function getSession(snapshotId: string): Promise<SessionInfo> {
    const intake = await store.readSnapshot(snapshotId); // ERR-STORE-004
    const revision = await revisionsOf(snapshotId).load();
    const delta = revision?.documents['architecture-delta'] as
      { components?: unknown[] } | undefined;
    return {
      snapshotId,
      revision: revision?.revision ?? 0,
      staticAnalysisComplete: Array.isArray(delta?.components) && delta.components.length > 0,
      providerStatus: deps.providerStatus ?? MODEL_FREE,
      movedOn: null, // checkMovedOn is C001-REQ-117's task
      sizeWarning: (intake.intakeSummary.sizeWarning ?? null) as SessionInfo['sizeWarning'],
      notices: intake.notices as SessionInfo['notices'],
      jobs: await jobs.list(snapshotId),
    };
  }

  const later = (operation: string) => (): Promise<never> =>
    Promise.reject(new NotImplementedError(operation));

  const api: CoreApi = {
    async startReview(options) {
      const result = await takeInChange(
        {
          git,
          store,
          log: ctx.log,
          repositoryRoot: deps.repositoryRoot,
          ...(deps.now ? { now: deps.now } : {}),
        },
        { namedBase: options.namedBase },
      );
      const { snapshotId } = result;
      const intake =
        result.status === 'created' ? result.intake : await store.readSnapshot(snapshotId);
      if (result.status === 'existing') await store.markOpened(snapshotId);
      await ensureFirstRevision(snapshotId);
      return {
        snapshotId,
        intakeSummary: intake.intakeSummary,
        reopened: result.status === 'existing',
        notices: intake.notices,
      };
    },
    getSession,
    getIntakeSummary,
    listReviews: () => store.listReviews(),
    async startJobs(snapshotId) {
      await store.readSnapshot(snapshotId); // ERR-STORE-004
      return jobs.start(snapshotId);
    },
    listJobs: (snapshotId) => jobs.list(snapshotId),
    cancelJob: (snapshotId, jobId) => jobs.cancel(snapshotId, jobId),

    runStaticAnalysis: later('runStaticAnalysis'),
    openReview: later('openReview'),
    checkMovedOn: later('checkMovedOn'),
    getArchitectureDelta: later('getArchitectureDelta'),
    getComponent: later('getComponent'),
    getIntentMap: later('getIntentMap'),
    getIntent: later('getIntent'),
    getWalkthrough: later('getWalkthrough'),
    getEvidenceBundle: later('getEvidenceBundle'),
    getHunk: later('getHunk'),
    getFileContent: later('getFileContent'),
    getReadingQueue: later('getReadingQueue'),
    getCoverageStatement: later('getCoverageStatement'),
    getDecisionStatus: later('getDecisionStatus'),
    getRecord: later('getRecord'),
    exportResults: later('exportResults'),
    validateConfiguration: later('validateConfiguration'),
    markRead: later('markRead'),
    markIntentRead: later('markIntentRead'),
    reopenHunk: later('reopenHunk'),
    moveHunk: later('moveHunk'),
    createIntent: later('createIntent'),
    rejectOrphanHunk: later('rejectOrphanHunk'),
    setTestJudgement: later('setTestJudgement'),
    reportDefect: later('reportDefect'),
    setAttentionBudget: later('setAttentionBudget'),
    addBundleCommand: later('addBundleCommand'),
    confirmBundleCommand: later('confirmBundleCommand'),
    giveVerdict: later('giveVerdict'),
    runEvidenceBundle: later('runEvidenceBundle'),
  };

  return { api, jobs, loops, close: () => loops.closeAll() };
}

/** The operations of C001-IF-003 bound to one repository. */
export function createCoreApi(deps: CoreDeps): CoreApi {
  return createCore(deps).api;
}

/** The identity check that every recorded action passes first (C001-IF-003 §4 step 4). */
export { requireGitIdentity } from '../orchestrator/identity.js';
