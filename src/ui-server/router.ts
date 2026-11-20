import { Ajv2020, type ValidateFunction } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {
  ANALYSIS_RESULTS_SCHEMA,
  API_COMPONENTS,
  API_ROUTES,
  type ApiRoute,
} from '../generated/api-contract.js';
import { ReviewError, isReviewError, type CoreApi } from '../core/api/index.js';
import { API_PREFIX } from './guards.js';

/**
 * The router of the local review HTTP API (C001-IF-002): a small hand-written table over the
 * routes of `openapi.yaml`. Each operation calls the core operation of the same name (`operationId`)
 * through the core API only (C001-CON-09). A request body is validated against the schema of the
 * contract before the core is called. The router runs only after the guards passed.
 */

export const API_BASE = `${API_PREFIX}/v1`;

export interface ApiRequest {
  readonly method: string;
  /** Normalised path, starting with `/api`. */
  readonly pathname: string;
  readonly query: URLSearchParams;
  /** The raw request body. */
  readonly body: Buffer;
  readonly contentType: string | undefined;
}

export interface ApiResponse {
  readonly status: number;
  /** `application/problem+json` for a failure, `application/json` otherwise. */
  readonly problem: boolean;
  readonly body: unknown;
  readonly headers?: Readonly<Record<string, string>>;
}

/** RFC 9457 problem details with the code of the error catalogue (C001-IF-002). */
export interface Problem {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly code: string;
  readonly detail: string;
  readonly fix?: string;
}

/** The failure sink: the contextual log of the core, seen through its shape only. */
export interface ErrorSink {
  recordError(error: unknown, operation: string, inputs?: Record<string, unknown>): unknown;
}

interface Args {
  readonly path: Readonly<Record<string, string>>;
  readonly query: URLSearchParams;
  readonly body: Record<string, unknown>;
}
type Handler = (core: CoreApi, snapshotId: string, args: Args) => Promise<unknown>;

const id = (args: Args, name: string): string => args.path[name] ?? '';

/** operationId → the core call. The input values were checked against the contract's schemas. */
const HANDLERS: Readonly<Record<string, Handler>> = {
  getSession: (c, s) => c.getSession(s),
  checkMovedOn: (c, s) => c.checkMovedOn(s),
  listJobs: (c, s) => c.listJobs(s),
  async cancelJob(c, s, a) {
    const jobs = await c.cancelJob(s, id(a, 'jobId'));
    return jobs.find((job) => job.jobId === id(a, 'jobId')) ?? jobs[0];
  },
  getIntakeSummary: (c, s) => c.getIntakeSummary(s),
  getArchitectureDelta: (c, s) => c.getArchitectureDelta(s),
  getComponent: (c, s, a) => c.getComponent(s, id(a, 'componentId')),
  getIntentMap: (c, s) => c.getIntentMap(s),
  createIntent: (c, s, a) =>
    c.createIntent(s, a.body.name as string, a.body.hunkIds as readonly string[]),
  getIntent: (c, s, a) => c.getIntent(s, id(a, 'intentId')),
  getWalkthrough: (c, s, a) => c.getWalkthrough(s, id(a, 'intentId')),
  markIntentRead: (c, s, a) => c.markIntentRead(s, id(a, 'intentId')),
  setTestJudgement: (c, s, a) =>
    c.setTestJudgement(s, id(a, 'intentId'), a.body.value as 'expresses' | 'does-not-express'),
  giveVerdict: (c, s, a) =>
    c.giveVerdict(s, id(a, 'intentId'), a.body as unknown as Parameters<CoreApi['giveVerdict']>[2]),
  getEvidenceBundle: (c, s, a) => c.getEvidenceBundle(s, id(a, 'intentId')),
  addBundleCommand: (c, s, a) => c.addBundleCommand(s, id(a, 'intentId'), a.body.command as string),
  confirmBundleCommand: (c, s, a) =>
    c.confirmBundleCommand(s, id(a, 'intentId'), id(a, 'commandId')),
  runEvidenceBundle: (c, s, a) => c.runEvidenceBundle(s, id(a, 'intentId')),
  markRead: (c, s, a) => c.markRead(s, a.body.hunkIds as readonly string[]),
  getHunk: (c, s, a) => c.getHunk(s, id(a, 'hunkId')),
  reopenHunk: (c, s, a) => c.reopenHunk(s, id(a, 'hunkId')),
  moveHunk: (c, s, a) =>
    c.moveHunk(s, id(a, 'hunkId'), a.body.target as Parameters<CoreApi['moveHunk']>[2]),
  reportDefect: (c, s, a) => c.reportDefect(s, id(a, 'hunkId'), a.body.text as string),
  rejectOrphanHunk: (c, s, a) => c.rejectOrphanHunk(s, id(a, 'hunkId'), a.body.reason as string),
  getFileContent: (c, s, a) =>
    c.getFileContent(s, a.query.get('path') ?? '', id(a, 'side') as 'base' | 'snapshot'),
  getReadingQueue: (c, s) => c.getReadingQueue(s),
  setAttentionBudget: (c, s, a) => c.setAttentionBudget(s, a.body.minutes, a.body.readingRate),
  getCoverageStatement: (c, s) => c.getCoverageStatement(s),
  getDecisionStatus: (c, s) => c.getDecisionStatus(s),
  getRecord: (c, s) => c.getRecord(s),
};

/**
 * No code of the error catalogue names a malformed request, an unknown route or a method that a
 * route does not take (spec defect reported with this task). Until the catalogue has them, these
 * answers carry the catalogue's closest codes: ERR-ACT-003 (status 400) and ERR-ACT-004 (404).
 */
const CODE_INVALID_REQUEST = 'ERR-ACT-003';
const CODE_UNKNOWN_ROUTE = 'ERR-ACT-004';

export function problem(status: number, code: string, title: string, detail: string): Problem {
  return { type: 'about:blank', title, status, code, detail };
}

function failure(
  status: number,
  code: string,
  title: string,
  detail: string,
  headers?: Record<string, string>,
): ApiResponse {
  return {
    status,
    problem: true,
    body: problem(status, code, title, detail),
    ...(headers ? { headers } : {}),
  };
}

const unknownRoute = (): ApiResponse =>
  failure(404, CODE_UNKNOWN_ROUTE, 'Unknown route', 'No such API route.');
const invalid = (detail: string): ApiResponse =>
  failure(400, CODE_INVALID_REQUEST, 'Invalid request', detail);

interface Matcher {
  readonly route: ApiRoute;
  readonly pattern: RegExp;
  readonly names: readonly string[];
}

function matcherOf(route: ApiRoute): Matcher {
  const names: string[] = [];
  const source = route.path
    .split('/')
    .map((segment) => {
      const name = /^\{(\w+)\}$/.exec(segment)?.[1];
      if (name === undefined) return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      names.push(name);
      return '([^/]+)';
    })
    .join('/');
  return { route, pattern: new RegExp(`^${source}$`), names };
}

export interface RouterOptions {
  readonly core: CoreApi;
  readonly snapshotId: string;
  readonly log?: ErrorSink;
  /** Largest request body accepted, in bytes. */
  readonly maxBodyBytes?: number;
}

export const DEFAULT_MAX_BODY_BYTES = 1024 * 1024;

export class ApiRouter {
  private readonly matchers = API_ROUTES.map(matcherOf);
  private readonly ajv: Ajv2020;
  private readonly validators = new Map<string, ValidateFunction>();

  constructor(private readonly options: RouterOptions) {
    // strict is off: the contract uses keywords of OpenAPI 3.1 documents (components, descriptions).
    this.ajv = new Ajv2020({ strict: false, allErrors: true });
    addFormats.default(this.ajv);
    this.ajv.addSchema(ANALYSIS_RESULTS_SCHEMA, 'analysis-results.schema.json');
    this.ajv.addSchema(API_COMPONENTS, 'openapi.yaml');
  }

  /** The operation IDs the router serves (every operation of C001-IF-002). */
  get operations(): string[] {
    return API_ROUTES.map((route) => route.operationId);
  }

  private validator(route: ApiRoute): ValidateFunction {
    let validate = this.validators.get(route.operationId);
    if (!validate) {
      validate = this.ajv.compile(route.bodySchema ?? {});
      this.validators.set(route.operationId, validate);
    }
    return validate;
  }

  async handle(request: ApiRequest): Promise<ApiResponse> {
    if (!request.pathname.startsWith(`${API_BASE}/`)) return unknownRoute();
    const rest = request.pathname.slice(API_BASE.length);
    const candidates = this.matchers.filter((m) => m.pattern.test(rest));
    if (candidates.length === 0) return unknownRoute();
    const matched = candidates.find((m) => m.route.method === request.method.toUpperCase());
    if (!matched) {
      const allow = [...new Set(candidates.map((m) => m.route.method))].join(', ');
      return failure(405, CODE_INVALID_REQUEST, 'Method not allowed', `Use ${allow}.`, {
        Allow: allow,
      });
    }
    const { route } = matched;
    const operation = route.operationId;

    const path: Record<string, string> = {};
    const values = matched.pattern.exec(rest)?.slice(1) ?? [];
    try {
      matched.names.forEach((name, i) => (path[name] = decodeURIComponent(values[i] ?? '')));
    } catch {
      return invalid('A path value is not valid.');
    }
    for (const name of route.requiredQuery) {
      if (!request.query.has(name)) return invalid(`Query value "${name}" is required.`);
    }

    let body: Record<string, unknown> = {};
    if (route.bodySchema) {
      const parsed = this.parseBody(route, request);
      if ('response' in parsed) return parsed.response;
      body = parsed.body;
    }

    const handler = HANDLERS[operation];
    if (!handler) {
      return this.fail(
        operation,
        new ReviewError('ERR-CLI-003', {
          operation,
          params: { operation, cause: 'no handler for the operation' },
        }),
      );
    }
    try {
      const result = await handler(this.options.core, this.options.snapshotId, {
        path,
        query: request.query,
        body,
      });
      return { status: route.successStatus, problem: false, body: result ?? null };
    } catch (error) {
      return this.fail(operation, error);
    }
  }

  private parseBody(
    route: ApiRoute,
    request: ApiRequest,
  ): { body: Record<string, unknown> } | { response: ApiResponse } {
    const max = this.options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
    if (request.body.length > max) {
      return {
        response: failure(
          413,
          CODE_INVALID_REQUEST,
          'Request too large',
          `The body exceeds ${max} bytes.`,
        ),
      };
    }
    if (request.body.length === 0 && !route.bodyRequired) return { body: {} };
    const type = (request.contentType ?? '').split(';')[0]?.trim().toLowerCase();
    if (type !== 'application/json') {
      return {
        response: failure(
          415,
          CODE_INVALID_REQUEST,
          'Unsupported media type',
          'Send application/json.',
        ),
      };
    }
    let value: unknown;
    try {
      value = JSON.parse(request.body.toString('utf8'));
    } catch {
      return { response: invalid('The body is not valid JSON.') };
    }
    const validate = this.validator(route);
    if (!validate(value)) {
      // Names the faulty places and rules, never the submitted values.
      const detail = (validate.errors ?? [])
        .slice(0, 5)
        .map((e) => `${e.instancePath || '/'} ${e.message ?? 'is invalid'}`)
        .join('; ');
      return { response: invalid(detail || 'The body does not match the schema.') };
    }
    return { body: (value ?? {}) as Record<string, unknown> };
  }

  /** A core failure as problem details: its catalogue code and HTTP status, or ERR-CLI-003. */
  private fail(operation: string, error: unknown): ApiResponse {
    const reviewError = isReviewError(error)
      ? error
      : new ReviewError('ERR-CLI-003', {
          operation,
          params: { operation, cause: error instanceof Error ? error.message : String(error) },
          cause: error,
        });
    try {
      this.options.log?.recordError(reviewError, operation, { operation });
    } catch {
      // A failing log never changes the answer.
    }
    return { status: reviewError.httpStatus, problem: true, body: reviewError.toProblem() };
  }
}
