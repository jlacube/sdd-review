import { Ajv2020, type ErrorObject, type ValidateFunction } from 'ajv/dist/2020.js';
import { MODEL_OUTPUT_SCHEMA } from '../../generated/model-output-schema.js';
import type { OutputCheck, TaskInputs, TaskOutputs } from './gateway.js';
import type { ModelTask } from './labels.js';

/**
 * Output validation of the model gateway (C001-COMP-015, C001-IF-011, C001-IF-010 §4 and §5
 * "unusable output"): every answer is checked against the definition of its task, and every hunk,
 * intent and component ID it names must have been part of the request it answers. An answer that
 * fails either check is unusable output: the request falls back to model-free mode with
 * ERR-MODEL-005 (C001-REQ-816).
 *
 * One exception, set by C001-IF-010 §2: a `hunk-linking` link whose `intentId` is not an intent of
 * the request is not a failure of the answer. The intent mapper (C001-COMP-009) drops that link
 * alone and reports ERR-MODEL-011 (C001-REQ-327), so this check leaves link intent IDs to it.
 *
 * The reason of a failure names the place in the output and the rule it breaks, never a value of
 * the answer: the answer can echo the request content (§7), and the reason reaches the notice and
 * the log.
 */

/** The output definition of C001-IF-011 for each task. */
const DEFINITION: Readonly<Record<ModelTask, string>> = {
  'intent-extraction': 'IntentExtraction',
  'hunk-linking': 'HunkLinking',
  'design-critique': 'DesignCritique',
  'walkthrough-account': 'WalkthroughAccount',
};

const validators = new Map<ModelTask, ValidateFunction>();

function validatorOf(task: ModelTask): ValidateFunction {
  let validate = validators.get(task);
  if (!validate) {
    const ajv = new Ajv2020({ strict: false, allErrors: false });
    const { $defs } = MODEL_OUTPUT_SCHEMA as { $defs: Record<string, unknown> };
    validate = ajv.compile({ $defs, $ref: `#/$defs/${DEFINITION[task]}` });
    validators.set(task, validate);
  }
  return validate;
}

/** A path segment of the output: a schema member name or an index; anything else is masked. */
const segment = (s: string) => (/^[A-Za-z0-9_-]{1,40}$/.test(s) ? s : '…');

/** The place and the rule of the first schema error, without any value from the answer. */
export function schemaReason(task: ModelTask, error: ErrorObject | undefined): string {
  const place = (error?.instancePath ?? '').split('/').slice(1).map(segment).join('/');
  const rule = error?.keyword ?? 'schema';
  const missing =
    error?.keyword === 'required' && typeof error.params.missingProperty === 'string'
      ? ` "${segment(error.params.missingProperty)}"`
      : '';
  return `the output does not match ${DEFINITION[task]} at /${place} (${rule}${missing})`;
}

const unknown = (what: string, place: string): OutputCheck => ({
  ok: false,
  reason: `the output names a ${what} that the request does not hold at ${place}`,
});

const hunkIdsOf = (hunks: ReadonlyArray<{ hunkId: string }>) => new Set(hunks.map((h) => h.hunkId));

/** The ID checks: every hunk, intent and component ID of the answer was part of the request. */
function checkIds<T extends ModelTask>(task: T, output: TaskOutputs[T], input: TaskInputs[T]) {
  switch (task) {
    case 'hunk-linking': {
      const sent = hunkIdsOf((input as TaskInputs['hunk-linking']).hunks);
      const links = (output as TaskOutputs['hunk-linking']).links;
      for (const [i, link] of links.entries()) {
        if (!sent.has(link.hunkId)) return unknown('hunk ID', `/links/${i}/hunkId`);
      }
      return { ok: true } as const;
    }
    case 'design-critique': {
      const components = (input as TaskInputs['design-critique']).components;
      const sent = hunkIdsOf(components.flatMap((c) => c.hunks));
      const names = new Set(components.map((c) => c.componentName));
      const findings = (output as TaskOutputs['design-critique']).findings;
      for (const [i, finding] of findings.entries()) {
        for (const [j, hunkId] of finding.hunkIds.entries()) {
          if (!sent.has(hunkId)) return unknown('hunk ID', `/findings/${i}/hunkIds/${j}`);
        }
        if (finding.componentId !== undefined && !names.has(finding.componentId)) {
          return unknown('component', `/findings/${i}/componentId`);
        }
      }
      return { ok: true } as const;
    }
    case 'walkthrough-account': {
      const sent = (input as TaskInputs['walkthrough-account']).intent.intentId;
      return (output as TaskOutputs['walkthrough-account']).intentId === sent
        ? ({ ok: true } as const)
        : unknown('intent ID', '/intentId');
    }
    default:
      // Intent extraction names no ID: its sources are commit hashes and file paths as sent.
      return { ok: true } as const;
  }
}

/**
 * The `validate` seam of the gateway: C001-IF-011 for the task, then the ID checks against the
 * request (`input` is what was sent in that request, after the model-excluded paths and batching).
 */
export function validateOutput<T extends ModelTask>(
  task: T,
  output: unknown,
  input: TaskInputs[T],
): OutputCheck {
  const validate = validatorOf(task);
  if (!validate(output)) return { ok: false, reason: schemaReason(task, validate.errors?.[0]) };
  return checkIds(task, output as TaskOutputs[T], input);
}
