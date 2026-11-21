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
 * Adapter of the OpenAI-compatible chat API (C001-COMP-016, C001-IF-010 §4), also served by local
 * runtimes: `POST <endpoint>/chat/completions`, where the endpoint is the base URL including its
 * version path, or `/v1/chat/completions` over a local socket (`unix:/path`, `npipe:name`).
 */

/** The request body of §4. */
export function openAiChatBody(request: AdapterRequest): Record<string, unknown> {
  const { provider, task, input } = request;
  const body: Record<string, unknown> = {
    model: provider.model,
    messages: [
      { role: 'system', content: systemInstruction(task) },
      { role: 'user', content: userMessage(input) },
    ],
    temperature: 0,
    max_tokens: provider.maxOutputTokens,
  };
  if (provider.responseFormat === 'json-schema') {
    body.response_format = {
      type: 'json_schema',
      json_schema: { name: task, schema: taskSchema(task), strict: false },
    };
  } else if (provider.responseFormat === 'json-object') {
    body.response_format = { type: 'json_object' };
  }
  return body;
}

/** The request headers of §4: the `Authorization` header only when a key was found (§7). */
export function openAiChatHeaders(key: string | null): Record<string, string> {
  return {
    'content-type': 'application/json',
    ...(key !== null ? { authorization: `Bearer ${key}` } : {}),
  };
}

/** The output object of an HTTP 200 answer of §4, or the unusable-output failure (ERR-MODEL-005). */
export function readOpenAiChatAnswer(body: string): AdapterAnswer {
  const parsed = parseAnswer(body);
  if (!parsed.ok) return parsed;
  const answer = parsed.answer;
  const choices = answer.choices;
  if (!Array.isArray(choices) || choices.length === 0) return unusable('the answer has no choices');
  const choice: unknown = choices[0];
  if (!isObject(choice)) return unusable('the answer has no choices');
  if (choice.finish_reason !== 'stop') {
    return unusable(`finish_reason ${quoted(choice.finish_reason)} instead of "stop"`);
  }
  const content = isObject(choice.message) ? choice.message.content : undefined;
  if (typeof content !== 'string') return unusable('the answer has no message content');
  let output: unknown;
  try {
    output = JSON.parse(content);
  } catch {
    return unusable('the message content is not one JSON object');
  }
  if (!isObject(output)) return unusable('the message content is not one JSON object');
  return { ok: true, output, model: answerModel(answer) };
}

export const openAiChatAdapter: ProviderAdapter = {
  async send(request: AdapterRequest): Promise<AdapterAnswer> {
    const { endpoint, path } = resolveTarget(
      request.provider.endpoint,
      '/chat/completions',
      '/v1/chat/completions',
    );
    const outcome = await postJson({
      endpoint,
      path,
      headers: openAiChatHeaders(request.key),
      body: JSON.stringify(openAiChatBody(request)),
      timeoutSeconds: request.timeoutSeconds,
    });
    return outcome.ok ? readOpenAiChatAnswer(outcome.body) : outcome;
  },
};
