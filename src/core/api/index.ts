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
import { completeRecordBytes, exportContents, writeExport } from './export.js';
import type { GitAccessPort } from '../git/port.js';
import { loadReviewConfiguration, validateConfigurationFile } from '../config/load.js';
import type { EffectiveConfiguration } from '../config/effective.js';
import { ModelGateway, type ModelGatewayDeps } from '../model/gateway.js';
import { takeInChange } from '../intake/snapshot.js';
import { SnapshotEventLoop, SnapshotLoops } from '../orchestrator/event-loop.js';
import { JobScheduler } from '../orchestrator/jobs.js';
import type { StoreContext } from '../store/fsutil.js';
import { RevisionStore, type RevisionDocuments } from '../store/revisions.js';
import type { ReviewIndexEntry, SnapshotStore } from '../store/snapshots.js';
export { mostRecentlyOpened } from '../store/reviews-index.js';

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
 * and the job operations, C001-T-010 adds `exportResults` (the headless output), C001-T-034 the
 * reopen of an existing snapshot (`startReview`, `openReview`) and the record path of
 * `listReviews`; every other operation rejects with `NotImplementedError` until its task.
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
  /** The commit the developer named (C001-REQ-102); without one, the default rules apply. */
  readonly namedBase?: string;
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

/** One review of the repository as `listReviews` gives it (C001-IF-003 §3, C001-IF-001 `reviews`). */
export interface ReviewListing extends ReviewIndexEntry {
  /** The path of the review record file (C001-IF-009), which the developer can give to others. */
  readonly recordFile: string;
  /** Null until the decision status is computed (C001-REQ-711, C001-T-078). */
  readonly decisionStatus: null;
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
  listReviews(): Promise<ReviewListing[]>;
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
  /**
   * The parts of the model gateway that later tasks provide: keys (C001-T-086), adapters
   * (C001-T-087), the egress policy (C001-T-088) and output validation (C001-T-089). Without them
   * every request runs in model-free mode (C001-T-085).
   */
  readonly model?: Omit<ModelGatewayDeps, 'configuration' | 'log'>;
}

/** The core: the API and the orchestrator parts that later tasks register their work with. */
export interface Core {
  readonly api: CoreApi;
  /** Later tasks register their jobs here (`jobs.register`). */
  readonly jobs: JobScheduler;
  /** The one writer of each snapshot. */
  readonly loops: SnapshotLoops;
  /**
   * The model gateway of a snapshot (C001-IF-010 §1), deciding per request from the effective
   * configuration of the snapshot's base commit; the model tasks (C001-T-090) call it.
   */
  gateway(snapshotId: string): ModelGateway;
  /** Waits for the running events, then refuses new ones. */
  close(): Promise<void>;
}

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

  /**
   * The effective configuration of a snapshot, read from its base commit (C001-REQ-426). The base
   * commit of a snapshot never changes, so it is read once per process; the gateway still decides
   * per request from it.
   */
  const configurations = new Map<string, Promise<EffectiveConfiguration>>();
  function configurationOf(snapshotId: string): Promise<EffectiveConfiguration> {
    let loaded = configurations.get(snapshotId);
    if (!loaded) {
      loaded = store
        .readSnapshot(snapshotId)
        .then((intake) =>
          loadReviewConfiguration({ git, log: ctx.log }, intake.snapshot.baseCommit.hash),
        );
      loaded.catch(() => configurations.delete(snapshotId));
      configurations.set(snapshotId, loaded);
    }
    return loaded;
  }
  const gateway = (snapshotId: string) =>
    new ModelGateway({
      ...deps.model,
      configuration: () => configurationOf(snapshotId),
      log: ctx.log,
    });

  /**
   * The notice of a configuration that cannot be read (ERR-CFG-001, ERR-CFG-004): the review then
   * runs in model-free mode (C001-REQ-819) and reports why (C001-TS-856).
   */
  async function modelFreeNotices(snapshotId: string): Promise<Notice[]> {
    const decision = await gateway(snapshotId).decide();
    return !decision.use && decision.cause === 'configuration-unreadable'
      ? [...decision.notices]
      : [];
  }

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

  /**
   * Reopens a stored review (C001-REQ-119): its last-opened time is set and its current revision
   * is what every view reads; nothing is analysed again and no event is submitted, except the
   * first revision when the snapshot's creation ended before it was written. Re-applying record
   * entries that no revision holds yet is C001-T-080.
   */
  async function reopen(snapshotId: string): Promise<void> {
    await store.markOpened(snapshotId);
    await ensureFirstRevision(snapshotId);
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
      providerStatus: await gateway(snapshotId).status(),
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
        {
          ...(options.namedBase !== undefined ? { namedBase: options.namedBase } : {}),
          ...(options.namedFiles !== undefined ? { namedFiles: options.namedFiles } : {}),
          ...(options.sddChange !== undefined ? { sddChange: options.sddChange } : {}),
        },
      );
      const { snapshotId } = result;
      if (result.status === 'existing') {
        // The snapshot ID of an existing review: reopen it with its recorded results, without
        // recomputing them (C001-REQ-119). Earlier snapshots are never touched (C001-REQ-118).
        const intake = await store.readSnapshot(snapshotId);
        await reopen(snapshotId);
        return {
          snapshotId,
          intakeSummary: intake.intakeSummary,
          reopened: true,
          notices: [...intake.notices, ...(await modelFreeNotices(snapshotId))],
        };
      }
      const { intake } = result;
      await ensureFirstRevision(snapshotId);
      return {
        snapshotId,
        intakeSummary: intake.intakeSummary,
        reopened: false,
        notices: [...intake.notices, ...(await modelFreeNotices(snapshotId))],
      };
    },
    getSession,
    getIntakeSummary,
    async listReviews() {
      return (await store.listReviews()).map((entry) => ({
        ...entry,
        recordFile: store.record(entry.snapshotId).file,
        decisionStatus: null,
      }));
    },
    async openReview(snapshotId) {
      store.requireReview(snapshotId); // ERR-STORE-004
      await reopen(snapshotId);
      return getSession(snapshotId);
    },
    async startJobs(snapshotId) {
      await store.readSnapshot(snapshotId); // ERR-STORE-004
      return jobs.start(snapshotId);
    },
    listJobs: (snapshotId) => jobs.list(snapshotId),
    cancelJob: (snapshotId, jobId) => jobs.cancel(snapshotId, jobId),

    async exportResults(snapshotId, directory) {
      const intake = await store.readSnapshot(snapshotId); // ERR-STORE-004
      const record = store.record(snapshotId);
      await record.read(); // ERR-STORE-002: a damaged record is not exported
      const revision = await revisionsOf(snapshotId).load();
      const contents = exportContents({
        intake,
        revision: revision?.documents ?? null,
        recordBytes: completeRecordBytes(record.file),
      });
      return { files: writeExport(directory, contents) }; // ERR-CLI-002
    },

    runStaticAnalysis: later('runStaticAnalysis'),
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
    async validateConfiguration(filePath) {
      const { valid, ignoredSettings } = validateConfigurationFile(filePath, { log: ctx.log }); // ERR-CFG-003
      return { valid, ignoredSettings };
    },
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

  return { api, jobs, loops, gateway, close: () => loops.closeAll() };
}

/** The operations of C001-IF-003 bound to one repository. */
export function createCoreApi(deps: CoreDeps): CoreApi {
  return createCore(deps).api;
}

/** The identity check that every recorded action passes first (C001-IF-003 §4 step 4). */
export { requireGitIdentity } from '../orchestrator/identity.js';

/** The error type every operation rejects with, for surfaces that map it to their own outcome. */
export { ReviewError, isReviewError } from '../errors/review-error.js';
export type { ProblemDetails } from '../errors/review-error.js';

/** `config validate` without a repository: the working-tree file needs no git data (C001-IF-001). */
export { validateConfigurationFile } from '../config/load.js';
export { CONFIGURATION_PATH } from '../config/effective.js';
export type { FileValidation } from '../config/load.js';
