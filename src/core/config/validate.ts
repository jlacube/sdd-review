import { Ajv2020, type ErrorObject, type ValidateFunction } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import type { ReviewConfigurationC001IF004 as ReviewConfiguration } from '../../generated/review-config.js';
import { REVIEW_CONFIG_SCHEMA } from '../../generated/review-config-schema.js';
import { isBuiltinAreaId } from './builtin-policy.js';
import { JsonTextError, parseJsonText } from './json-text.js';
import { PatternSyntaxError, checkPattern } from './pattern.js';

/**
 * Validation of a review configuration file (C001-IF-004), in the order the interface fixes:
 *
 * 1. parse the JSON text;
 * 2. remove every setting that weakens a built-in guarded area, each reported as ignored with its
 *    JSON pointer (ERR-CFG-002, C001-REQ-425): every member of `clearing.builtinGuardedAreas`,
 *    whatever its value, and every entry of `clearing.guardedAreas` named with a built-in area ID;
 * 3. check `model.provider.keyCredential.service` before the rest of the file (C001-REQ-820);
 * 4. validate the rest against the schema, then the syntax of every path pattern
 *    (C001-IF-005 §1).
 *
 * The outcome is data; the loader (base commit, ERR-CFG-001 / ERR-CFG-004) and `config validate`
 * (working-tree file, ERR-CFG-003) turn it into their own notices.
 */

export type { ReviewConfiguration };

export const CREDENTIAL_SERVICE = /^sdd-review(\/.*)?$/;
export const SERVICE_POINTER = '/model/provider/keyCredential/service';

export type ValidationFailure =
  | {
      readonly kind: 'syntax';
      readonly pointer: '';
      readonly line: number;
      readonly reason: string;
    }
  | {
      readonly kind: 'service';
      readonly pointer: string;
      readonly service: string;
      readonly reason: string;
    }
  | { readonly kind: 'schema'; readonly pointer: string; readonly reason: string }
  | {
      readonly kind: 'pattern';
      readonly pointer: string;
      readonly pattern: string;
      readonly reason: string;
    };

export type ValidationOutcome =
  | {
      readonly valid: true;
      readonly configuration: ReviewConfiguration;
      readonly ignoredSettings: readonly string[];
    }
  | {
      readonly valid: false;
      readonly failure: ValidationFailure;
      readonly ignoredSettings: readonly string[];
    };

let compiled: ValidateFunction | undefined;
function schemaValidator(): ValidateFunction {
  if (!compiled) {
    const ajv = new Ajv2020({ strict: false, allErrors: false });
    addFormats.default(ajv);
    compiled = ajv.compile(REVIEW_CONFIG_SCHEMA);
  }
  return compiled;
}

/** RFC 6901 escaping of one reference token. */
export function pointerToken(token: string | number): string {
  return String(token).replace(/~/g, '~0').replace(/\//g, '~1');
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Step 2: removes the weakening settings from a copy of the parsed document. `areaIndex` maps an
 * index of the kept `clearing.guardedAreas` entries back to its index in the file, so that later
 * pointers name the file's own entries.
 */
export function removeWeakeningSettings(document: unknown): {
  readonly document: unknown;
  readonly ignoredSettings: string[];
  readonly areaIndex: number[];
} {
  const ignoredSettings: string[] = [];
  const areaIndex: number[] = [];
  if (!isObject(document) || !isObject(document.clearing)) {
    return { document, ignoredSettings, areaIndex };
  }
  const clearing: Record<string, unknown> = { ...document.clearing };
  if (Object.hasOwn(clearing, 'builtinGuardedAreas')) {
    const reserved = clearing.builtinGuardedAreas;
    const members = isObject(reserved) ? Object.keys(reserved) : null;
    if (members === null) ignoredSettings.push('/clearing/builtinGuardedAreas');
    else {
      for (const member of members) {
        ignoredSettings.push(`/clearing/builtinGuardedAreas/${pointerToken(member)}`);
      }
    }
    delete clearing.builtinGuardedAreas;
  }
  if (Array.isArray(clearing.guardedAreas)) {
    const kept: unknown[] = [];
    clearing.guardedAreas.forEach((area: unknown, index) => {
      if (isObject(area) && typeof area.name === 'string' && isBuiltinAreaId(area.name)) {
        ignoredSettings.push(`/clearing/guardedAreas/${index}`);
      } else {
        kept.push(area);
        areaIndex.push(index);
      }
    });
    clearing.guardedAreas = kept;
  }
  return { document: { ...document, clearing }, ignoredSettings, areaIndex };
}

/** Step 3: the credential-store service when it is a string outside the accepted names. */
export function foreignCredentialService(document: unknown): string | null {
  if (!isObject(document) || !isObject(document.model)) return null;
  const provider = document.model.provider;
  if (!isObject(provider) || !isObject(provider.keyCredential)) return null;
  const service = provider.keyCredential.service;
  return typeof service === 'string' && !CREDENTIAL_SERVICE.test(service) ? service : null;
}

function mapAreaPointer(pointer: string, areaIndex: readonly number[]): string {
  return pointer.replace(
    /^\/clearing\/guardedAreas\/(\d+)(?=\/|$)/,
    (whole, k: string) => `/clearing/guardedAreas/${areaIndex[Number(k)] ?? k}`,
  );
}

function schemaFailure(error: ErrorObject): { pointer: string; reason: string } {
  const params = error.params as Record<string, unknown>;
  let pointer = error.instancePath;
  let reason = error.message ?? 'is not valid';
  if (error.keyword === 'additionalProperties' && typeof params.additionalProperty === 'string') {
    pointer += `/${pointerToken(params.additionalProperty)}`;
    reason = 'is not a setting of the review configuration';
  } else if (error.keyword === 'required' && typeof params.missingProperty === 'string') {
    pointer += `/${pointerToken(params.missingProperty)}`;
    reason = 'is required';
  } else if (error.keyword === 'enum' && Array.isArray(params.allowedValues)) {
    reason = `must be one of ${params.allowedValues.map((v) => JSON.stringify(v)).join(', ')}`;
  } else if (error.keyword === 'const') {
    reason = `must be ${JSON.stringify(params.allowedValue)}`;
  }
  return { pointer, reason };
}

/** The path-pattern settings of a schema-valid configuration, with their JSON pointers. */
export function pathPatternSettings(
  configuration: ReviewConfiguration,
): Array<{ pointer: string; pattern: string }> {
  const out: Array<{ pointer: string; pattern: string }> = [];
  const add = (base: string, patterns: readonly string[] | undefined) =>
    patterns?.forEach((pattern, i) => out.push({ pointer: `${base}/${i}`, pattern }));
  add('/clearing/generatedFiles', configuration.clearing?.generatedFiles);
  configuration.clearing?.guardedAreas?.forEach((area, i) =>
    add(`/clearing/guardedAreas/${i}/paths`, area.paths),
  );
  add('/tests/pathPatterns', configuration.tests?.pathPatterns);
  add('/tests/coverageReports', configuration.tests?.coverageReports);
  add('/model/excludedPaths', configuration.model?.excludedPaths);
  return out;
}

/** Validates the bytes of a review configuration file (steps 1 to 4). */
export function validateConfigurationBytes(bytes: Uint8Array): ValidationOutcome {
  let parsed: unknown;
  try {
    parsed = parseJsonText(bytes);
  } catch (error) {
    if (!(error instanceof JsonTextError)) throw error;
    const failure = {
      kind: 'syntax',
      pointer: '',
      line: error.line,
      reason: error.message,
    } as const;
    return { valid: false, failure, ignoredSettings: [] };
  }
  return validateConfigurationDocument(parsed);
}

/** Steps 2 to 4 on a parsed document. */
export function validateConfigurationDocument(parsed: unknown): ValidationOutcome {
  const { document, ignoredSettings, areaIndex } = removeWeakeningSettings(parsed);

  const service = foreignCredentialService(document);
  if (service !== null) {
    const reason = `credential-store service "${service}" is outside the names the review assistant accepts ("sdd-review" and names beginning with "sdd-review/")`;
    return {
      valid: false,
      failure: { kind: 'service', pointer: SERVICE_POINTER, service, reason },
      ignoredSettings,
    };
  }

  const validate = schemaValidator();
  if (!validate(document)) {
    const { pointer, reason } = schemaFailure(validate.errors![0]!);
    return {
      valid: false,
      failure: { kind: 'schema', pointer: mapAreaPointer(pointer, areaIndex), reason },
      ignoredSettings,
    };
  }
  const configuration = document as ReviewConfiguration;

  for (const { pointer, pattern } of pathPatternSettings(configuration)) {
    try {
      checkPattern(pattern);
    } catch (error) {
      if (!(error instanceof PatternSyntaxError)) throw error;
      const failure = {
        kind: 'pattern',
        pointer: mapAreaPointer(pointer, areaIndex),
        pattern,
        reason: error.message,
      } as const;
      return { valid: false, failure, ignoredSettings };
    }
  }
  return { valid: true, configuration, ignoredSettings };
}

/** The cause text of a failure, as the notices ERR-CFG-001 and ERR-CFG-003 give it. */
export function failureCause(failure: ValidationFailure): string {
  switch (failure.kind) {
    case 'syntax':
      return failure.reason;
    case 'pattern':
      return `${failure.reason} at ${failure.pointer}`;
    default:
      return `${failure.pointer || '/'} ${failure.reason}`;
  }
}
