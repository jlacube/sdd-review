import type { ModelOutputMarker } from '../../generated/analysis-results.js';
import type {
  DesignCritique,
  HunkLinking,
  IntentExtraction,
} from '../../generated/model-output.js';
import type { EffectiveProvider } from '../config/effective.js';
import type { TaskOutputs } from './gateway.js';
import type { ModelTask } from './labels.js';

/**
 * The model-output marker (C001-REQ-810, C001-REQ-811, C001-IF-010 §1, C001-IF-008
 * `ModelOutputMarker`): every item a model produced carries the provider name of the
 * configuration, the model name of the provider's answer (or the configured model when the answer
 * has none) and the confidence level low.
 *
 * The level is set here and nowhere else, and never from the answer: a model that writes
 * "confidence: high" into a reason or an account does not raise it (C001-TS-831). The output
 * definitions of C001-IF-011 have no confidence member, so no answer that passed validation can
 * carry one.
 */

export const MODEL_CONFIDENCE = 'low' as const;

/** The marker of the output of one answer of `provider`. */
export function modelOutputMarker(
  provider: Pick<EffectiveProvider, 'name' | 'model'>,
  answerModel: string | null,
): ModelOutputMarker {
  return {
    provider: provider.name,
    model: answerModel !== null && answerModel.length > 0 ? answerModel : provider.model,
    confidence: MODEL_CONFIDENCE,
  };
}

/** The items of each task's output, as the model wrote them (C001-IF-011). */
export interface ModelItems {
  readonly 'intent-extraction': IntentExtraction['intents'][number];
  readonly 'hunk-linking': HunkLinking['links'][number];
  readonly 'design-critique': DesignCritique['findings'][number];
  readonly 'walkthrough-account': { readonly intentId: string; readonly account: string };
}

/** One item of model output with its mark: what the analysis results show of it. */
export type MarkedItem<T extends ModelTask> = ModelItems[T] & {
  readonly confidence: typeof MODEL_CONFIDENCE;
  readonly labels: { readonly modelOutput: ModelOutputMarker };
};

/** Each item of `output` (extracted intent, link, finding or account) marked as model output. */
export function markItems<T extends ModelTask>(
  task: T,
  output: TaskOutputs[T],
  marker: ModelOutputMarker,
): Array<MarkedItem<T>> {
  let items: Array<ModelItems[ModelTask]>;
  switch (task) {
    case 'intent-extraction':
      items = (output as TaskOutputs['intent-extraction']).intents;
      break;
    case 'hunk-linking':
      items = (output as TaskOutputs['hunk-linking']).links;
      break;
    case 'design-critique':
      items = (output as TaskOutputs['design-critique']).findings;
      break;
    default: {
      const { intentId, account } = output as TaskOutputs['walkthrough-account'];
      items = [{ intentId, account }];
    }
  }
  return items.map(
    (item) =>
      ({
        ...item,
        confidence: MODEL_CONFIDENCE,
        labels: { modelOutput: { ...marker, confidence: MODEL_CONFIDENCE } },
      }) as unknown as MarkedItem<T>,
  );
}
