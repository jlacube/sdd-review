import type { Labels, Notice } from '../../generated/analysis-results.js';
import { lookupError } from '../errors/catalogue.js';
import { fillMessage } from '../errors/review-error.js';
import type { ModelFreeResult, ProviderFailure } from './gateway.js';
import type { KeyLookup } from './keys/key-source.js';
import { reducedLabels, type ModelFreeCause, type ModelTask } from './labels.js';

/**
 * The failure fallback of the model gateway (C001-IF-010 §7, C001-REQ-816 to C001-REQ-818): one
 * catalogue code per cause, the notice that names the provider, the cause and the number of items
 * produced in model-free mode, and the model-free result of the request's items, labelled reduced.
 *
 * | Cause                                                                    | Code          |
 * |--------------------------------------------------------------------------|---------------|
 * | cloud opt-in setting missing (§6 check 3, no connection opened)           | ERR-MODEL-001 |
 * | model-excluded path (§6 check 4, the content is not sent)                 | ERR-MODEL-002 |
 * | connection refused or failed, TLS failure, closed before a status line    | ERR-MODEL-003 |
 * | no complete answer within the provider timeout                           | ERR-MODEL-004 |
 * | HTTP 200 with unusable output (§4, §5, C001-IF-011)                       | ERR-MODEL-005 |
 * | required key not found (no request sent)                                 | ERR-MODEL-006 |
 * | HTTP 401 or 403                                                          | ERR-MODEL-007 |
 * | HTTP 429                                                                 | ERR-MODEL-008 |
 * | HTTP 500 to 599                                                          | ERR-MODEL-009 |
 * | any other status than 200                                                | ERR-MODEL-010 |
 *
 * No cause leads to a retry (§3 item 4). A failure never carries the answer body of a failed
 * request, which can echo the request content, nor a key (C001-CON-21). And no failure touches the
 * review state (C001-REQ-818): nothing here, nor in the gateway, can write to the review record or
 * to a revision; the gateway's dependencies hold no store (`ModelGatewayDeps`), so verdicts, read
 * marks and hunk moves stay as they were whatever a request does.
 */

export type FailureCode = ProviderFailure['code'];

const failure = (
  code: FailureCode,
  params: Record<string, string>,
  cause: string,
): ProviderFailure => ({ code, params, cause });

/** ERR-MODEL-003: the endpoint cannot be reached; `cause` names the kind (`transport.ts`). */
export function unreachable(cause: string): ProviderFailure {
  return failure('ERR-MODEL-003', { cause }, cause);
}

/** ERR-MODEL-004: no complete answer within the provider timeout (§3 item 5). */
export function timedOut(timeoutSeconds: number): ProviderFailure {
  const s = String(timeoutSeconds);
  return failure('ERR-MODEL-004', { s }, `no complete answer within ${s} s`);
}

/** ERR-MODEL-005: an HTTP 200 answer that is not usable (§4, §5, C001-IF-011). */
export function unusableOutput(reason: string): ProviderFailure {
  return failure('ERR-MODEL-005', { reason }, reason);
}

/** ERR-MODEL-006: a required key that none of the lookups found; no request is sent (§7). */
export function keyNotFound(lookup: Pick<KeyLookup, 'location' | 'cause'>): ProviderFailure {
  return failure('ERR-MODEL-006', { location: lookup.location }, lookup.cause);
}

/** The failure of an HTTP status other than 200 (§7); the answer body is never read. */
export function statusFailure(status: number): ProviderFailure {
  const params = { status: String(status) };
  const cause = `HTTP ${status}`;
  if (status === 401 || status === 403) return failure('ERR-MODEL-007', params, cause);
  if (status === 429) return failure('ERR-MODEL-008', params, cause);
  if (status >= 500 && status <= 599) return failure('ERR-MODEL-009', params, cause);
  return failure('ERR-MODEL-010', params, cause);
}

/**
 * A notice of the catalogue with its parameters, before it is worded: the form in which notices of
 * one code are merged per review (§7). `count` is `<n>`, the number of items produced in
 * model-free mode (ERR-MODEL-001 to ERR-MODEL-010) or of hunks left without a link (ERR-MODEL-011).
 */
export interface ModelNotice {
  readonly code: string;
  /** Message parameters other than `n`: `name` and, by code, `host`, `cause`, `s`, `reason`… */
  readonly params: Readonly<Record<string, string>>;
  readonly count: number;
}

export function modelNotice(
  code: string,
  providerName: string,
  count: number,
  params: Readonly<Record<string, string>> = {},
): ModelNotice {
  return { code, params: { ...params, name: providerName }, count };
}

/** The notice of a failed request of `providerName` for `count` items. */
export function failureNotice(
  providerName: string,
  f: ProviderFailure,
  count: number,
): ModelNotice {
  return modelNotice(f.code, providerName, count, f.params);
}

/** A placeholder that holds placeholders: a choice of wording, filled whole from `location`. */
const NESTED_PLACEHOLDER = /<[^<>]*<[^>]*>[^<>]*(?:<[^>]*>[^<>]*)*>/;

/** The worded notice (C001-IF-008 `Notice`), message verbatim from the catalogue. */
export function renderNotice(n: ModelNotice): Notice {
  let template = lookupError(n.code).message;
  // ERR-MODEL-006: `<environment variable "<keyEnv>" or credential-store entry "<service>/<account>">`
  // names the sources the lookup tried (KeyLookup.location).
  if (typeof n.params.location === 'string') {
    const location = n.params.location;
    template = template.replace(NESTED_PLACEHOLDER, () => location);
  }
  return {
    code: n.code,
    message: fillMessage(template, { ...n.params, n: String(n.count) }),
    count: n.count,
  };
}

/**
 * Merges notices of one code (§7: "notices of one code are merged per review"): one notice per
 * code, in the order each code first appears, with the counts added up; a parameter whose values
 * differ lists each value once (for example `HTTP 502, 503`).
 */
export function mergeModelNotices(notices: readonly ModelNotice[]): ModelNotice[] {
  const byCode = new Map<string, { params: Map<string, string[]>; count: number }>();
  for (const n of notices) {
    let merged = byCode.get(n.code);
    if (!merged) {
      merged = { params: new Map(), count: 0 };
      byCode.set(n.code, merged);
    }
    merged.count += n.count;
    for (const [key, value] of Object.entries(n.params)) {
      const values = merged.params.get(key) ?? [];
      if (!values.includes(value)) values.push(value);
      merged.params.set(key, values);
    }
  }
  return [...byCode].map(([code, { params, count }]) => ({
    code,
    params: Object.fromEntries([...params].map(([key, values]) => [key, values.join(', ')])),
    count,
  }));
}

/** The model-free result of a request's items: labelled reduced, with the notices of its causes. */
export function modelFree<T extends ModelTask>(
  task: T,
  cause: ModelFreeCause,
  reports: readonly ModelNotice[],
  items: number,
  extra: readonly Notice[] = [],
): ModelFreeResult<T> {
  const merged = mergeModelNotices(reports);
  return {
    status: 'model-free',
    task,
    cause,
    labels: reducedLabels(task) as Labels & { reduced: string[] },
    notices: [...extra, ...merged.map(renderNotice)],
    reports: merged,
    items,
  };
}
