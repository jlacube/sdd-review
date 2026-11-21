import type { AdapterAnswer, AdapterRequest, ProviderAdapter } from '../gateway.js';
import { systemInstruction, taskSchema, userMessage } from './request-parts.js';
import {
  answerModel,
  isObject,
  parseAnswer,
  postJson,
  quoted,
  resolveTarget,
  unusable,
} from './transport.js';

/**
 * Adapter of the Anthropic Messages API (C001-COMP-017, C001-IF-010 §5): `POST <endpoint>/v1/messages`,
 * where the endpoint is the base URL without version path, or `/v1/messages` over a local socket.
 * The output object is requested as the input of one forced tool call, `submit_result`.
 */

export const TOOL_NAME = 'submit_result';
export const ANTHROPIC_VERSION = '2023-06-01';

/** The request body of §5. */
export function anthropicMessagesBody(request: AdapterRequest): Record<string, unknown> {
  const { provider, task, input } = request;
  return {
    model: provider.model,
    max_tokens: provider.maxOutputTokens,
    system: systemInstruction(task),
    messages: [{ role: 'user', content: userMessage(input) }],
    temperature: 0,
    tools: [
      {
        name: TOOL_NAME,
        description: `Submit the result of the task "${task}" as one object of its output format.`,
        input_schema: taskSchema(task),
      },
    ],
    tool_choice: { type: 'tool', name: TOOL_NAME },
  };
}

/**
 * The request headers of §5. The key is always required for this API (§7); the gateway sends no
 * request without one (ERR-MODEL-006), so a missing key here only leaves the header out.
 */
export function anthropicMessagesHeaders(key: string | null): Record<string, string> {
  return {
    'content-type': 'application/json',
    ...(key !== null ? { 'x-api-key': key } : {}),
    'anthropic-version': ANTHROPIC_VERSION,
  };
}

/** The tool input of an HTTP 200 answer of §5, or the unusable-output failure (ERR-MODEL-005). */
export function readAnthropicMessagesAnswer(body: string): AdapterAnswer {
  const parsed = parseAnswer(body);
  if (!parsed.ok) return parsed;
  const answer = parsed.answer;
  if (answer.stop_reason !== 'tool_use') {
    return unusable(`stop_reason ${quoted(answer.stop_reason)} instead of "tool_use"`);
  }
  const content = Array.isArray(answer.content) ? (answer.content as unknown[]) : [];
  const block = content.find(
    (b): b is Record<string, unknown> =>
      isObject(b) && b.type === 'tool_use' && b.name === TOOL_NAME,
  );
  if (!block) return unusable(`the answer has no ${TOOL_NAME} tool call`);
  if (!isObject(block.input)) return unusable(`the ${TOOL_NAME} input is not a JSON object`);
  return { ok: true, output: block.input, model: answerModel(answer) };
}

export const anthropicMessagesAdapter: ProviderAdapter = {
  async send(request: AdapterRequest): Promise<AdapterAnswer> {
    const { endpoint, path } = resolveTarget(
      request.provider.endpoint,
      '/v1/messages',
      '/v1/messages',
    );
    const outcome = await postJson({
      endpoint,
      path,
      headers: anthropicMessagesHeaders(request.key),
      body: JSON.stringify(anthropicMessagesBody(request)),
      timeoutSeconds: request.timeoutSeconds,
    });
    return outcome.ok ? readAnthropicMessagesAnswer(outcome.body) : outcome;
  },
};
