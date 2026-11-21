import { readFileSync } from 'node:fs';
import type { Notice } from '../../generated/analysis-results.js';
import { ReviewError, fillMessage } from '../errors/review-error.js';
import { lookupError } from '../errors/catalogue.js';
import type { GitAccessPort } from '../git/port.js';
import type { ContextualLog } from '../log/log.js';
import {
  CONFIGURATION_PATH,
  mergeWithBuiltinPolicy,
  type ConfigurationSource,
  type EffectiveConfiguration,
} from './effective.js';
import { failureCause, validateConfigurationBytes } from './validate.js';

/**
 * The configuration loader (C001-COMP-006, C001-T-035): reads `.sdd-review/config.json` from the
 * base commit of a snapshot through the git access port (G-08), never from the working tree
 * (C001-REQ-426), so a change cannot loosen the clearing of its own hunks. A base commit without
 * the file gives the defaults. Only `config validate` reads a file of the working tree
 * (`validateConfigurationFile`, C001-IF-001).
 */

export interface LoadDeps {
  readonly git: Pick<GitAccessPort, 'readBlob'>;
  readonly log?: ContextualLog;
}

const OPERATION = 'load-configuration';

function notice(code: string, params: Record<string, string>, subject?: string): Notice {
  const message = fillMessage(lookupError(code).message, params);
  return subject === undefined ? { code, message } : { code, message, subject };
}

/** The effective configuration of the snapshot whose base commit is `baseCommit`. */
export async function loadReviewConfiguration(
  deps: LoadDeps,
  baseCommit: string,
): Promise<EffectiveConfiguration> {
  const path = CONFIGURATION_PATH;
  const inputs = { commit: baseCommit, path };
  const source = (readable: boolean, isDefault = false): ConfigurationSource => ({
    default: isDefault,
    commit: baseCommit,
    path,
    readable,
  });

  const unreadable = (
    code: 'ERR-CFG-001' | 'ERR-CFG-004',
    cause: string,
    params: Record<string, string>,
    ignoredSettings: readonly string[],
    earlier: readonly Notice[],
  ): EffectiveConfiguration => {
    deps.log?.record(code, { operation: OPERATION, inputs, params, cause });
    return {
      readable: false,
      source: source(false),
      ignoredSettings,
      notices: [...earlier, notice(code, params)],
      error: { code, cause },
    };
  };

  let bytes: Buffer | null;
  try {
    bytes = await deps.git.readBlob(baseCommit, path);
  } catch (error) {
    const cause = error instanceof Error ? error.message : String(error);
    return unreadable('ERR-CFG-001', cause, { path, hash: baseCommit, cause }, [], []);
  }
  if (bytes === null) {
    return {
      readable: true,
      source: source(true, true),
      ignoredSettings: [],
      notices: [],
      settings: mergeWithBuiltinPolicy(null),
    };
  }

  const outcome = validateConfigurationBytes(bytes);
  const ignoredNotices = outcome.ignoredSettings.map((pointer) => {
    const params = { 'JSON pointer': pointer };
    deps.log?.record('ERR-CFG-002', {
      operation: OPERATION,
      inputs: { ...inputs, setting: pointer },
      params,
      cause: 'the setting removes or narrows a built-in guarded area',
    });
    return notice('ERR-CFG-002', params, pointer);
  });

  if (!outcome.valid) {
    const { failure } = outcome;
    if (failure.kind === 'service') {
      return unreadable(
        'ERR-CFG-004',
        failure.reason,
        { path, hash: baseCommit, service: failure.service },
        outcome.ignoredSettings,
        ignoredNotices,
      );
    }
    const cause = failureCause(failure);
    return unreadable(
      'ERR-CFG-001',
      cause,
      { path, hash: baseCommit, cause },
      outcome.ignoredSettings,
      ignoredNotices,
    );
  }
  return {
    readable: true,
    source: source(true),
    ignoredSettings: outcome.ignoredSettings,
    notices: ignoredNotices,
    settings: mergeWithBuiltinPolicy(outcome.configuration),
  };
}

export interface FileValidation {
  readonly valid: true;
  readonly ignoredSettings: readonly string[];
  /** ERR-CFG-002 per ignored setting. */
  readonly notices: readonly Notice[];
}

/**
 * `config validate` (C001-IF-001, C001-IF-003 `validateConfiguration`): validates a file, by
 * default the working tree's `.sdd-review/config.json`, and lists the ignored settings; changes
 * nothing. An invalid or unreadable file rejects with ERR-CFG-003 naming the JSON pointer of the
 * first problem (a foreign credential-store service included, C001-TS-861).
 */
export function validateConfigurationFile(
  filePath: string,
  options: { readonly displayPath?: string; readonly log?: ContextualLog } = {},
): FileValidation {
  const path = options.displayPath ?? filePath;
  const operation = 'validate-configuration';
  const invalid = (pointer: string, reason: string, cause: unknown): ReviewError => {
    const context = {
      operation,
      inputs: { path: filePath },
      params: { path, 'JSON pointer': pointer || '/', reason },
      cause,
    };
    options.log?.record('ERR-CFG-003', context);
    return new ReviewError('ERR-CFG-003', context);
  };

  let bytes: Buffer;
  try {
    bytes = readFileSync(filePath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    const reason =
      code === 'ENOENT' ? 'the file does not exist' : `the file cannot be read (${code ?? error})`;
    throw invalid('', reason, error);
  }
  const outcome = validateConfigurationBytes(bytes);
  if (!outcome.valid) {
    const { failure } = outcome;
    throw invalid(failure.pointer, failure.reason, failureCause(failure));
  }
  const notices = outcome.ignoredSettings.map((pointer) =>
    notice('ERR-CFG-002', { 'JSON pointer': pointer }, pointer),
  );
  return { valid: true, ignoredSettings: outcome.ignoredSettings, notices };
}
