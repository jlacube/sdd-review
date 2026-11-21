import type { Labels } from '../../generated/analysis-results.js';

/**
 * Reduced labels of the model-assisted features (C001-REQ-804, C001-CON-05): a result that a model
 * would have improved and that was produced without one carries `labels.reduced` naming the
 * feature that ran without a model (C001-IF-008 `Labels`). The cause of model-free mode travels
 * with the model-free result of the gateway (`ModelFreeCause`) and, where the catalogue has one, as
 * its notice (C001-IF-010 §6 and §7, C001-REQ-817).
 */

/** The tasks of C001-IF-010 §2. */
export const MODEL_TASKS = [
  'intent-extraction',
  'hunk-linking',
  'design-critique',
  'walkthrough-account',
] as const;

export type ModelTask = (typeof MODEL_TASKS)[number];

/** The feature each task serves, as the reduced label names it (C001-AC-804.1, C001-TS-809). */
export const REDUCED_FEATURE: Readonly<Record<ModelTask, string>> = {
  'intent-extraction': 'intent extraction',
  'hunk-linking': 'hunk-to-intent grouping',
  'design-critique': 'design critique',
  'walkthrough-account': 'walkthrough account',
};

/**
 * Why a request ran in model-free mode, in the order of the gateway checks (C001-IF-010 §6, §7).
 *
 * - `no-provider`: the review configuration names no model provider (C001-REQ-801); no notice.
 * - `configuration-unreadable`: the review configuration of the base commit cannot be read
 *   (C001-REQ-819, C001-REQ-820); notice ERR-CFG-001 or ERR-CFG-004 of the configuration loader.
 * - `gateway-incomplete`: the egress policy of §6 checks 2 and 3 (C001-T-088) or the adapter of the
 *   provider API (C001-T-087) is not registered with the gateway; nothing is sent, fail-safe.
 * - `cloud-opt-in-missing`: non-local endpoint without the cloud opt-in setting (ERR-MODEL-001).
 * - `model-excluded-path`: the content lies on a model-excluded path (ERR-MODEL-002).
 * - `provider-failure`: the request failed, or the key it needs was not found (ERR-MODEL-003 to
 *   ERR-MODEL-010).
 */
export type ModelFreeCause =
  | 'no-provider'
  | 'configuration-unreadable'
  | 'gateway-incomplete'
  | 'cloud-opt-in-missing'
  | 'model-excluded-path'
  | 'provider-failure';

/** The labels of a result of `task` produced without a model. */
export function reducedLabels(task: ModelTask): Labels {
  return { reduced: [REDUCED_FEATURE[task]] };
}

/**
 * Adds the reduced label of `task` to the labels of a result, keeping the entries it already has
 * (a result can lack a model and a language-specific signal at once, C001-REQ-911) and naming
 * each feature once.
 */
export function withReduced(labels: Labels | undefined, task: ModelTask): Labels {
  const feature = REDUCED_FEATURE[task];
  const reduced = labels?.reduced ?? [];
  return { ...labels, reduced: reduced.includes(feature) ? [...reduced] : [...reduced, feature] };
}

/** True when the labels say the result of `task` was produced without a model. */
export function isReducedFor(labels: Labels | undefined, task: ModelTask): boolean {
  return (labels?.reduced ?? []).includes(REDUCED_FEATURE[task]);
}
