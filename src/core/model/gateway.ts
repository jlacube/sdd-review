import type { components } from '../../generated/openapi.js';
import type { Labels, ModelOutputMarker, Notice } from '../../generated/analysis-results.js';
import type {
  DesignCritique,
  HunkLinking,
  IntentExtraction,
  WalkthroughAccount,
} from '../../generated/model-output.js';
import {
  configuredProvider,
  type EffectiveConfiguration,
  type EffectiveProvider,
  type EffectiveSettings,
} from '../config/effective.js';
import { lookupError } from '../errors/catalogue.js';
import { fillMessage } from '../errors/review-error.js';
import type { ContextualLog } from '../log/log.js';
import { CloudUseAnnouncer } from './announce.js';
import { excludeModelPaths, excludedCount, type ExcludedItems, type Exclusion } from './egress.js';
import type { KeyLookup } from './keys/key-source.js';
import { reducedLabels, type ModelFreeCause, type ModelTask } from './labels.js';
import { classifyEndpoint } from './locality.js';

/**
 * The model gateway (C001-COMP-015, C001-IF-010 §1): the single egress to model providers
 * (C001-CON-11, C001-CON-12). No other module of the review assistant opens a network connection;
 * the lint rule of `eslint.config.js` keeps outbound network clients inside `src/core/model/`.
 *
 * The use of a model is decided per request from the effective configuration of the snapshot's
 * base commit (C001-COMP-006): no provider named, or a configuration that cannot be read, means
 * model-free mode, and no connection is opened (C001-REQ-801, C001-REQ-803, C001-REQ-819). Every
 * result made without a model carries the reduced label of its feature (C001-REQ-804, `labels.ts`).
 * The port never throws to its caller (§1): every failure becomes a model-free result.
 *
 * Seams for the tasks that complete the gateway; each is fail-safe when absent:
 * - `egress` (C001-T-088, `egress.ts`): §6 checks 2 and 3, endpoint locality from the endpoint text
 *   (`locality.ts`) and the cloud opt-in. Without it nothing is sent.
 * - `cloudUse` (C001-T-088, `announce.ts`): §6 check 5, the cloud-use event emitted before the
 *   first request of a process to a cloud provider. Without it the gateway uses an announcer of
 *   its own, so the event is still emitted (to no listener).
 * - `adapters` (C001-T-087): one adapter per provider API (§4, §5). Without the adapter of the
 *   configured API nothing is sent.
 * - `keys` (C001-T-086, `keys/key-source.ts`): the key lookup of §7, run when a request is
 *   prepared, never cached and never logged (C001-CON-21). Without it no key is found. A required
 *   key that is not found sends no request (ERR-MODEL-006).
 * - `validate` (C001-T-089): C001-IF-011 and the ID checks; batching, the provider timeout, the
 *   marker and the failure mapping of §7 are refined there.
 *
 * §6 check 4, the model-excluded paths (C001-REQ-814, C001-REQ-815), is not a seam: the gateway
 * runs it before every request (`egress.ts › excludeModelPaths`), and the input that leaves holds
 * only the fields of §2.
 */

type Schemas = components['schemas'];
export type ProviderStatus = Schemas['ProviderStatus'];

/** A hunk as a model task sends it: ID, path, changed lines with 3 context lines (§2). */
export interface ModelHunk {
  readonly hunkId: string;
  /** The file's path in the snapshot. */
  readonly path: string;
  /**
   * The file's path at the base commit when it differs (a renamed file), else null or absent.
   * Matched against the model-excluded paths with `path` (C001-REQ-814: both paths); never sent.
   */
  readonly basePath?: string | null;
  /** The changed lines with up to 3 lines of context on each side, as unified-diff text. */
  readonly text: string;
}

/** An intent as a model task sends it: ID, title and its source text (cut to 2,000 characters). */
export interface ModelIntent {
  readonly intentId: string;
  readonly title: string;
  readonly sourceText: string;
}

/** The input of each task of C001-IF-010 §2: only IDs and text the gateway may send. */
export interface TaskInputs {
  readonly 'intent-extraction': {
    readonly commits: ReadonlyArray<{
      readonly hash: string;
      readonly subject: string;
      readonly message: string;
    }>;
    /** Pull-request text, agent plans and agent transcripts, with their lines numbered from 1. */
    readonly namedFiles: ReadonlyArray<{
      readonly role: 'pull-request-text' | 'agent-plan' | 'agent-transcript';
      readonly path: string;
      /**
       * The path relative to the repository root when the file lies inside the repository, else
       * null or absent. Matched against the model-excluded paths (§6 check 4); never sent.
       */
      readonly repositoryPath?: string | null;
      readonly lines: readonly string[];
    }>;
  };
  readonly 'hunk-linking': {
    readonly intents: readonly ModelIntent[];
    /** Only hunks with no deterministic link signal. */
    readonly hunks: readonly ModelHunk[];
  };
  readonly 'design-critique': {
    readonly components: ReadonlyArray<{
      readonly componentName: string;
      readonly hunks: readonly ModelHunk[];
    }>;
  };
  readonly 'walkthrough-account': {
    readonly intent: ModelIntent;
    /** The intent's hunks in intent order. */
    readonly hunks: readonly ModelHunk[];
  };
}

/** The output object of each task (C001-IF-011). */
export interface TaskOutputs {
  readonly 'intent-extraction': IntentExtraction;
  readonly 'hunk-linking': HunkLinking;
  readonly 'design-critique': DesignCritique;
  readonly 'walkthrough-account': WalkthroughAccount;
}

/** The items of a request, which a failure produces in model-free mode (`<n>` of the notices). */
export function itemCount<T extends ModelTask>(task: T, input: TaskInputs[T]): number {
  switch (task) {
    case 'hunk-linking':
      return (input as TaskInputs['hunk-linking']).hunks.length;
    case 'design-critique':
      return (input as TaskInputs['design-critique']).components.length;
    default:
      return 1; // the intent list of a change, or the account of one intent
  }
}

/** Accepted model output, marked (C001-REQ-810, C001-REQ-811). */
export interface AcceptedResult<T extends ModelTask> {
  readonly status: 'accepted';
  readonly task: T;
  readonly output: TaskOutputs[T];
  readonly labels: Labels & { readonly modelOutput: ModelOutputMarker };
  /** ERR-MODEL-002 when items of the request lay on model-excluded paths. */
  readonly notices: readonly Notice[];
  /**
   * The items removed from the request as lying on model-excluded paths (§6 check 4), when any:
   * the caller produces them in model-free mode, labelled reduced (C001-REQ-815).
   */
  readonly excluded?: ExcludedItems;
}

/** The items of the request, to be produced without a model, labelled reduced. */
export interface ModelFreeResult<T extends ModelTask> {
  readonly status: 'model-free';
  readonly task: T;
  readonly cause: ModelFreeCause;
  /** `reduced` names the feature of the task (C001-REQ-804). */
  readonly labels: Labels & { readonly reduced: string[] };
  /** The notice of the cause, when the catalogue has one (C001-REQ-817). */
  readonly notices: readonly Notice[];
  /** The number of items produced in model-free mode. */
  readonly items: number;
  /** The items that lay on model-excluded paths (§6 check 4), when any. */
  readonly excluded?: ExcludedItems;
}

export type TaskResult<T extends ModelTask> = AcceptedResult<T> | ModelFreeResult<T>;

/** The outcome of the use decision for one request (§6). */
export type ModelUseDecision =
  | {
      readonly use: false;
      readonly cause: ModelFreeCause;
      readonly provider: EffectiveProvider | null;
      /** The configuration loader's notice of an unreadable configuration. */
      readonly notices: readonly Notice[];
      /** The catalogue code of a refusal by the egress policy; `<n>` is filled per request. */
      readonly refusal?: EgressRefusal;
    }
  | {
      readonly use: true;
      readonly provider: EffectiveProvider;
      readonly locality: 'local' | 'cloud';
      readonly settings: EffectiveSettings['model'];
    };

export interface EgressRefusal {
  readonly cause: Extract<ModelFreeCause, 'cloud-opt-in-missing'>;
  readonly code: 'ERR-MODEL-001';
  /** Message parameters other than `name` and `n`, for example `host`. */
  readonly params: Readonly<Record<string, string>>;
}

/** §6 checks 2 and 3 (C001-T-088). */
export type EgressCheck =
  | { readonly allowed: true; readonly locality: 'local' | 'cloud' }
  | ({ readonly allowed: false } & EgressRefusal);

export interface EgressPolicy {
  check(provider: EffectiveProvider, settings: EffectiveSettings['model']): EgressCheck;
}

/** One request as an adapter sends it (C001-T-087). */
export interface AdapterRequest<T extends ModelTask = ModelTask> {
  readonly provider: EffectiveProvider;
  readonly task: T;
  readonly input: TaskInputs[T];
  /** Held only for this request (C001-CON-21); null when no key was found. */
  readonly key: string | null;
  readonly timeoutSeconds: number;
  readonly maxRequestBytes: number;
}

/** A failed request, one catalogue code per cause (§7). */
export interface ProviderFailure {
  readonly code:
    | 'ERR-MODEL-003'
    | 'ERR-MODEL-004'
    | 'ERR-MODEL-005'
    | 'ERR-MODEL-006'
    | 'ERR-MODEL-007'
    | 'ERR-MODEL-008'
    | 'ERR-MODEL-009'
    | 'ERR-MODEL-010';
  /** Message parameters other than `name` and `n`, for example `status` or `cause`. */
  readonly params: Readonly<Record<string, string>>;
  /** For the log; never the answer body (§7) and never the key. */
  readonly cause: string;
}

export type AdapterAnswer =
  | {
      readonly ok: true;
      readonly output: unknown;
      /** The model name of the provider's answer, when it has one (§1). */
      readonly model: string | null;
    }
  | { readonly ok: false; readonly failure: ProviderFailure };

export interface ProviderAdapter {
  send(request: AdapterRequest): Promise<AdapterAnswer>;
}

export type OutputCheck = { readonly ok: true } | { readonly ok: false; readonly reason: string };

export interface ModelGatewayDeps {
  /**
   * The effective configuration of the snapshot's base commit, asked for at every request so that
   * the decision is made per request (C001-COMP-006; never the working tree, C001-REQ-426).
   */
  readonly configuration: () => Promise<EffectiveConfiguration> | EffectiveConfiguration;
  readonly egress?: EgressPolicy;
  readonly adapters?: Partial<Record<EffectiveProvider['api'], ProviderAdapter>>;
  /**
   * The key lookup of §7 for one request. A bare string or null is a key found or not found for
   * a provider whose key is optional.
   */
  readonly keys?: (provider: EffectiveProvider) => Promise<KeyLookup | string | null>;
  /** §6 check 5: the cloud-use state of the process (`announce.ts`). */
  readonly cloudUse?: CloudUseAnnouncer;
  readonly validate?: <T extends ModelTask>(
    task: T,
    output: unknown,
    input: TaskInputs[T],
  ) => OutputCheck;
  readonly log?: Pick<ContextualLog, 'record' | 'recordError'>;
}

const OPERATION = 'model-request';

export const MODEL_FREE_STATUS: ProviderStatus = {
  mode: 'model-free',
  providerName: null,
  contentSentOffMachine: false,
};

/** A placeholder that holds placeholders: a choice of wording, filled whole from `location`. */
const NESTED_PLACEHOLDER = /<[^<>]*<[^>]*>[^<>]*(?:<[^>]*>[^<>]*)*>/;

function notice(code: string, params: Readonly<Record<string, unknown>>): Notice {
  let template = lookupError(code).message;
  // ERR-MODEL-006: `<environment variable "<keyEnv>" or credential-store entry "<service>/<account>">`
  // names the sources the lookup tried (KeyLookup.location).
  if (typeof params.location === 'string') {
    template = template.replace(NESTED_PLACEHOLDER, () => params.location as string);
  }
  return { code, message: fillMessage(template, params) };
}

/** The configuration loader's notice of an unreadable configuration (ERR-CFG-001, ERR-CFG-004). */
function unreadableNotices(configuration: EffectiveConfiguration): Notice[] {
  if (configuration.readable) return [];
  return configuration.notices.filter((n) => n.code === configuration.error.code);
}

/**
 * The use decision of C001-IF-010 §6 for one request, in its order: provider configured and
 * configuration readable (check 1), then locality and cloud opt-in (checks 2 and 3, the egress
 * policy), then an adapter for the configured provider API. Opens no connection.
 */
export function decideModelUse(
  configuration: EffectiveConfiguration,
  seams: Pick<ModelGatewayDeps, 'egress' | 'adapters'> = {},
): ModelUseDecision {
  if (!configuration.readable) {
    return {
      use: false,
      cause: 'configuration-unreadable',
      provider: null,
      notices: unreadableNotices(configuration),
    };
  }
  const provider = configuredProvider(configuration);
  if (provider === null) return { use: false, cause: 'no-provider', provider: null, notices: [] };
  const settings = configuration.settings.model;
  if (!seams.egress) return { use: false, cause: 'gateway-incomplete', provider, notices: [] };
  const egress = seams.egress.check(provider, settings);
  if (!egress.allowed) {
    const { cause, code, params } = egress;
    return { use: false, cause, provider, notices: [], refusal: { cause, code, params } };
  }
  if (!seams.adapters?.[provider.api]) {
    return { use: false, cause: 'gateway-incomplete', provider, notices: [] };
  }
  return { use: true, provider, locality: egress.locality, settings };
}

/** `SessionInfo.providerStatus` of C001-IF-002 from a use decision (C001-REQ-807). */
export function providerStatusOf(decision: ModelUseDecision): ProviderStatus {
  if (!decision.use) return MODEL_FREE_STATUS;
  const cloud = decision.locality === 'cloud';
  return {
    mode: cloud ? 'cloud-provider' : 'local-provider',
    providerName: decision.provider.name,
    contentSentOffMachine: cloud,
  };
}

export class ModelGateway {
  private readonly cloudUse: CloudUseAnnouncer;

  constructor(private readonly deps: ModelGatewayDeps) {
    this.cloudUse = deps.cloudUse ?? new CloudUseAnnouncer();
  }

  /** The use decision for a request made now (§6); opens no connection. */
  async decide(): Promise<ModelUseDecision> {
    return decideModelUse(await this.deps.configuration(), this.deps);
  }

  /** The provider status of the session (C001-IF-002 `ProviderStatus`). */
  async status(): Promise<ProviderStatus> {
    try {
      return providerStatusOf(await this.decide());
    } catch {
      return MODEL_FREE_STATUS;
    }
  }

  /**
   * The port of C001-IF-010 §1: accepted output with its marker, or a model-free result labelled
   * reduced with the notice of its cause. Never throws. In model-free mode no adapter is called,
   * so no connection is opened and no content leaves the machine (C001-REQ-803).
   */
  async runTask<T extends ModelTask>(task: T, input: TaskInputs[T]): Promise<TaskResult<T>> {
    const items = itemCount(task, input);
    let decision: ModelUseDecision;
    try {
      decision = await this.decide();
    } catch (error) {
      // The configuration could not be obtained at all: nothing is known, so nothing is sent.
      this.deps.log?.recordError(error, OPERATION, { task });
      return modelFree(task, 'configuration-unreadable', [], items);
    }
    if (!decision.use) {
      const { refusal, provider } = decision;
      const notices = [...decision.notices];
      if (refusal && provider) {
        notices.push(notice(refusal.code, { ...refusal.params, name: provider.name, n: items }));
      }
      return modelFree(task, decision.cause, notices, items);
    }
    return this.send(task, input, decision, items);
  }

  private async send<T extends ModelTask>(
    task: T,
    given: TaskInputs[T],
    decision: Extract<ModelUseDecision, { use: true }>,
    givenItems: number,
  ): Promise<TaskResult<T>> {
    const { provider, settings } = decision;
    const adapter = this.deps.adapters?.[provider.api];
    if (!adapter) return modelFree(task, 'gateway-incomplete', [], givenItems);
    const inputs = { provider: provider.name, api: provider.api, task };

    // §6 check 4: content on model-excluded paths never leaves the machine (C001-REQ-814).
    let exclusion: Exclusion<T>;
    try {
      exclusion = excludeModelPaths(task, given, settings.excludedPaths);
    } catch (error) {
      // The loader validates the patterns; one that still does not compile sends nothing.
      this.deps.log?.recordError(error, OPERATION, inputs);
      return modelFree(task, 'model-excluded-path', [], givenItems);
    }
    const excluded = exclusion.excluded;
    const excludedItems = excludedCount(excluded);
    const excludedNotices: Notice[] = [];
    if (excludedItems > 0) {
      const params = { name: provider.name, n: String(excludedItems) };
      this.deps.log?.record('ERR-MODEL-002', {
        operation: OPERATION,
        inputs: { ...inputs, hunkIds: excluded.hunkIds, namedFiles: excluded.namedFiles },
        params,
        cause: 'content on model-excluded paths',
      });
      excludedNotices.push(notice('ERR-MODEL-002', params));
    }
    if (!exclusion.send) {
      return { ...modelFree(task, 'model-excluded-path', excludedNotices, givenItems), excluded };
    }
    const input = exclusion.input;
    const items = itemCount(task, input);
    const withExcluded = <R extends TaskResult<T>>(result: R): R =>
      excludedItems > 0
        ? { ...result, notices: [...excludedNotices, ...result.notices], excluded }
        : result;

    try {
      // Read at each request preparation, held only for this request (§7, C001-CON-21).
      const found = await this.deps.keys?.(provider);
      const lookup: KeyLookup | null = typeof found === 'object' && found !== null ? found : null;
      const key: string | null = lookup ? lookup.key : typeof found === 'string' ? found : null;
      if (key === null && lookup?.required) {
        // A required key that none of the lookups finds: no request is sent (ERR-MODEL-006).
        const failure: ProviderFailure = {
          code: 'ERR-MODEL-006',
          params: { location: lookup.location },
          cause: lookup.cause,
        };
        return withExcluded(this.failed(task, provider, failure, items));
      }
      if (decision.locality === 'cloud') {
        // §6 check 5: the cloud-use event, before the first request of the process (C001-REQ-808).
        this.cloudUse.announce(
          { provider: provider.name, host: classifyEndpoint(provider.endpoint).host },
          (error) => this.deps.log?.recordError(error, OPERATION, inputs),
        );
      }
      const answer = await adapter.send({
        provider,
        task,
        input,
        key,
        timeoutSeconds: settings.timeoutSeconds,
        maxRequestBytes: settings.maxRequestBytes,
      });
      if (!answer.ok) return withExcluded(this.failed(task, provider, answer.failure, items));
      const check = this.deps.validate?.(task, answer.output, input) ?? { ok: true };
      if (!check.ok) {
        const failure: ProviderFailure = {
          code: 'ERR-MODEL-005',
          params: { reason: check.reason },
          cause: check.reason,
        };
        return withExcluded(this.failed(task, provider, failure, items));
      }
      return withExcluded<AcceptedResult<T>>({
        status: 'accepted',
        task,
        output: answer.output as TaskOutputs[T],
        labels: {
          modelOutput: {
            provider: provider.name,
            model: answer.model ?? provider.model,
            confidence: 'low',
          },
        },
        notices: [],
      });
    } catch (error) {
      // An adapter or key lookup that throws is a defect of the review assistant, not of the
      // provider: logged as an internal error; the items are still produced without a model.
      this.deps.log?.recordError(error, OPERATION, inputs);
      return withExcluded(modelFree(task, 'provider-failure', [], items));
    }
  }

  private failed<T extends ModelTask>(
    task: T,
    provider: EffectiveProvider,
    failure: ProviderFailure,
    items: number,
  ): ModelFreeResult<T> {
    const params = { ...failure.params, name: provider.name, n: String(items) };
    this.deps.log?.record(failure.code, {
      operation: OPERATION,
      inputs: { provider: provider.name, api: provider.api, task },
      params,
      cause: failure.cause,
    });
    return modelFree(task, 'provider-failure', [notice(failure.code, params)], items);
  }
}

function modelFree<T extends ModelTask>(
  task: T,
  cause: ModelFreeCause,
  notices: readonly Notice[],
  items: number,
): ModelFreeResult<T> {
  return {
    status: 'model-free',
    task,
    cause,
    labels: reducedLabels(task) as Labels & { reduced: string[] },
    notices,
    items,
  };
}
