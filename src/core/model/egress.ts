import type { EffectiveProvider, EffectiveSettings } from '../config/effective.js';
import { PatternSet } from '../config/pattern.js';
import type { EgressCheck, EgressPolicy, ModelHunk, ModelIntent, TaskInputs } from './gateway.js';
import type { ModelTask } from './labels.js';
import { classifyEndpoint } from './locality.js';

/**
 * The egress rules of the model gateway, C001-IF-010 §6 checks 2 to 4 (C001-REQ-806,
 * C001-REQ-814, C001-REQ-815, C001-CON-11):
 *
 * - `createEgressPolicy`: checks 2 and 3, endpoint locality from the endpoint text alone
 *   (`locality.ts`) and the cloud opt-in. A non-local endpoint without `model.cloudOptIn` true is
 *   refused with ERR-MODEL-001 and no connection is opened. The settings are those of the
 *   snapshot's base commit (C001-COMP-006), so a change cannot opt itself in (C001-TS-818).
 * - `excludeModelPaths`: check 4, run by the gateway before every request whatever the policy:
 *   hunks whose path at the base commit or in the snapshot matches `model.excludedPaths`, and named
 *   files whose repository path matches, are removed from the input. The input that leaves is
 *   rebuilt member by member from the fields of C001-IF-010 §2, so no field that only serves the
 *   matching (`basePath`, `repositoryPath`) and no field a caller adds by mistake is ever sent.
 */

/** §6 checks 2 and 3. */
export function createEgressPolicy(): EgressPolicy {
  return {
    check(provider: EffectiveProvider, settings: EffectiveSettings['model']): EgressCheck {
      const { locality, host } = classifyEndpoint(provider.endpoint);
      if (locality === 'local') return { allowed: true, locality: 'local' };
      if (settings.cloudOptIn === true) return { allowed: true, locality: 'cloud' };
      return {
        allowed: false,
        cause: 'cloud-opt-in-missing',
        code: 'ERR-MODEL-001',
        params: { host },
      };
    },
  };
}

/** What check 4 removed from one request. */
export interface ExcludedItems {
  /** Hunk IDs on model-excluded paths, in input order, each once. */
  readonly hunkIds: readonly string[];
  /** Paths (as sent in the input) of named files on model-excluded paths. */
  readonly namedFiles: readonly string[];
}

export type Exclusion<T extends ModelTask> =
  | {
      /** Something is left to send: the input rebuilt from the fields of §2. */
      readonly send: true;
      readonly input: TaskInputs[T];
      readonly excluded: ExcludedItems;
    }
  | {
      /** Every item the request was for lies on a model-excluded path: nothing is sent. */
      readonly send: false;
      readonly excluded: ExcludedItems;
    };

/** The number of items ERR-MODEL-002 names (`<n>`). */
export function excludedCount(excluded: ExcludedItems): number {
  return excluded.hunkIds.length + excluded.namedFiles.length;
}

/** Repository-relative paths are matched with `/` separators (C001-IF-005 §1 item 1). */
const slashed = (path: string) => path.replace(/\\/g, '/').replace(/^\.\/+/, '');

function onExcludedPath(patterns: PatternSet, ...paths: Array<string | null | undefined>): boolean {
  return paths.some((p) => typeof p === 'string' && p.length > 0 && patterns.match(slashed(p)));
}

const hunkOut = (h: ModelHunk): ModelHunk => ({ hunkId: h.hunkId, path: h.path, text: h.text });
const intentOut = (i: ModelIntent): ModelIntent => ({
  intentId: i.intentId,
  title: i.title,
  sourceText: i.sourceText,
});

/**
 * §6 check 4 for one request. `excludedPaths` are the configured patterns of the base commit's
 * configuration (validated by the loader; configured patterns match case-sensitively, C001-IF-005
 * §1 item 4). A pattern that does not compile is a defect upstream: the caller treats the throw as
 * "send nothing".
 */
export function excludeModelPaths<T extends ModelTask>(
  task: T,
  input: TaskInputs[T],
  excludedPaths: readonly string[],
): Exclusion<T> {
  const patterns = new PatternSet(excludedPaths);
  const hunkIds: string[] = [];
  const keep = (hunks: readonly ModelHunk[]): ModelHunk[] =>
    hunks.filter((h) => {
      if (!onExcludedPath(patterns, h.path, h.basePath)) return true;
      if (!hunkIds.includes(h.hunkId)) hunkIds.push(h.hunkId);
      return false;
    });
  const namedFiles: string[] = [];
  const result = <U extends ModelTask>(send: boolean, out?: TaskInputs[U]): Exclusion<U> =>
    send
      ? { send: true, input: out!, excluded: { hunkIds, namedFiles } }
      : { send: false, excluded: { hunkIds, namedFiles } };

  switch (task) {
    case 'intent-extraction': {
      const given = input as TaskInputs['intent-extraction'];
      const files = given.namedFiles.filter((f) => {
        if (!onExcludedPath(patterns, f.repositoryPath, f.path)) return true;
        namedFiles.push(f.path);
        return false;
      });
      const out: TaskInputs['intent-extraction'] = {
        commits: given.commits.map((c) => ({
          hash: c.hash,
          subject: c.subject,
          message: c.message,
        })),
        namedFiles: files.map((f) => ({ role: f.role, path: f.path, lines: [...f.lines] })),
      };
      const empty = out.commits.length === 0 && out.namedFiles.length === 0;
      return result(!(empty && namedFiles.length > 0), out as TaskInputs[T]);
    }
    case 'hunk-linking': {
      const given = input as TaskInputs['hunk-linking'];
      const hunks = keep(given.hunks);
      const out: TaskInputs['hunk-linking'] = {
        intents: given.intents.map(intentOut),
        hunks: hunks.map(hunkOut),
      };
      return result(!(hunks.length === 0 && hunkIds.length > 0), out as TaskInputs[T]);
    }
    case 'design-critique': {
      const given = input as TaskInputs['design-critique'];
      const components = given.components
        .map((c) => ({ componentName: c.componentName, hunks: keep(c.hunks).map(hunkOut) }))
        // A component whose every hunk was excluded is left out; one sent without hunks stays.
        .filter((c, i) => c.hunks.length > 0 || given.components[i]!.hunks.length === 0);
      const out: TaskInputs['design-critique'] = { components };
      return result(!(components.length === 0 && hunkIds.length > 0), out as TaskInputs[T]);
    }
    default: {
      const given = input as TaskInputs['walkthrough-account'];
      const hunks = keep(given.hunks);
      const out: TaskInputs['walkthrough-account'] = {
        intent: intentOut(given.intent),
        hunks: hunks.map(hunkOut),
      };
      return result(!(hunks.length === 0 && hunkIds.length > 0), out as TaskInputs[T]);
    }
  }
}
