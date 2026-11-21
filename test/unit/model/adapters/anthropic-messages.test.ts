import { afterEach, describe, expect, it } from 'vitest';
import {
  anthropicMessagesAdapter,
  readAnthropicMessagesAnswer,
} from '../../../../src/core/model/adapters/anthropic-messages.js';
import {
  systemInstruction,
  taskSchema,
} from '../../../../src/core/model/adapters/request-parts.js';
import { MODEL_TASKS } from '../../../../src/core/model/labels.js';
import { STUB_MODEL, StubLlm } from '../../../acceptance/support/stub-llm/stub-llm.js';
import { INPUTS, OUTPUTS, localSocket, provider, request } from './support.js';

// C001-T-087, C001-TC-805 at unit level: the Anthropic Messages adapter (C001-COMP-017,
// C001-IF-010 §5) with its forced tool call, against the stub provider.

let stub: StubLlm;
const cleanups: Array<() => void | Promise<void>> = [];

async function startStub(): Promise<StubLlm> {
  stub = new StubLlm();
  await stub.start();
  cleanups.push(() => stub.stop());
  return stub;
}

afterEach(async () => {
  for (const c of cleanups.splice(0).reverse()) await c();
});

describe('Anthropic Messages adapter: request (§5)', () => {
  it.each(MODEL_TASKS)(
    'sends %s as POST <endpoint>/v1/messages with a forced tool call',
    async (task) => {
      await startStub();
      stub.enqueue({ output: OUTPUTS[task] });
      const answer = await anthropicMessagesAdapter.send(
        request(provider('anthropic-messages', stub.endpoint), task, { key: 'sk-ant-test' }),
      );

      expect(answer).toEqual({ ok: true, output: OUTPUTS[task], model: STUB_MODEL });
      expect(stub.requests).toHaveLength(1);
      const req = stub.requests[0]!;
      expect(req.method).toBe('POST');
      expect(req.path).toBe('/v1/messages');
      expect(req.headers['content-type']).toBe('application/json');
      expect(req.headers['x-api-key']).toBe('sk-ant-test');
      expect(req.headers['anthropic-version']).toBe('2023-06-01');
      expect(req.headers.authorization).toBeUndefined();
      expect(req.body).toEqual({
        model: STUB_MODEL,
        max_tokens: 1024,
        system: systemInstruction(task),
        messages: [{ role: 'user', content: JSON.stringify(INPUTS[task]) }],
        temperature: 0,
        tools: [
          {
            name: 'submit_result',
            description: expect.any(String) as unknown,
            input_schema: taskSchema(task),
          },
        ],
        tool_choice: { type: 'tool', name: 'submit_result' },
      });
    },
  );

  it('appends /v1/messages to a base URL with a trailing slash', async () => {
    await startStub();
    await anthropicMessagesAdapter.send(
      request(provider('anthropic-messages', `${stub.endpoint}/`), 'hunk-linking', { key: 'k' }),
    );
    expect(stub.requests[0]!.path).toBe('/v1/messages');
  });

  it('reaches a local socket at /v1/messages (§5)', async () => {
    const socket = localSocket();
    cleanups.push(socket.cleanup);
    stub = new StubLlm();
    await stub.startOnSocket(socket.listenPath);
    cleanups.push(() => stub.stop());
    stub.enqueue({ output: OUTPUTS['design-critique'] });
    const answer = await anthropicMessagesAdapter.send(
      request(provider('anthropic-messages', socket.endpoint), 'design-critique', { key: 'k' }),
    );
    expect(answer).toEqual({ ok: true, output: OUTPUTS['design-critique'], model: STUB_MODEL });
    expect(stub.requests.map((r) => r.path)).toEqual(['/v1/messages']);
  });
});

describe('Anthropic Messages adapter: answer (§5)', () => {
  const tool = (input: unknown, name = 'submit_result') => ({
    type: 'tool_use',
    id: 'toolu_1',
    name,
    input,
  });

  it('returns the tool input after other blocks, with the model of the answer', () => {
    const body = JSON.stringify({
      model: 'claude-test',
      stop_reason: 'tool_use',
      content: [{ type: 'text', text: 'Submitting.' }, tool({ task: 'x' })],
    });
    expect(readAnthropicMessagesAnswer(body)).toEqual({
      ok: true,
      output: { task: 'x' },
      model: 'claude-test',
    });
  });

  it.each([
    [
      'stop_reason end_turn',
      { stop_reason: 'end_turn', content: [tool({})] },
      'stop_reason "end_turn" instead of "tool_use"',
    ],
    [
      'stop_reason max_tokens',
      { stop_reason: 'max_tokens', content: [tool({})] },
      'stop_reason "max_tokens" instead of "tool_use"',
    ],
    [
      'no tool_use block',
      { stop_reason: 'tool_use', content: [{ type: 'text', text: '{}' }] },
      'the answer has no submit_result tool call',
    ],
    [
      'another tool',
      { stop_reason: 'tool_use', content: [tool({}, 'other_tool')] },
      'the answer has no submit_result tool call',
    ],
    ['no content', { stop_reason: 'tool_use' }, 'the answer has no submit_result tool call'],
    [
      'input not an object',
      { stop_reason: 'tool_use', content: [tool('{"task":"x"}')] },
      'the submit_result input is not a JSON object',
    ],
  ])('%s is unusable output (ERR-MODEL-005)', (_name, answer, reason) => {
    expect(readAnthropicMessagesAnswer(JSON.stringify({ model: 'm', ...answer }))).toEqual({
      ok: false,
      failure: { code: 'ERR-MODEL-005', params: { reason }, cause: reason },
    });
  });

  it('turns a malformed answer of the stub into ERR-MODEL-005', async () => {
    await startStub();
    stub.enqueue({ body: { model: STUB_MODEL, stop_reason: 'end_turn', content: [] } });
    const answer = await anthropicMessagesAdapter.send(
      request(provider('anthropic-messages', stub.endpoint), 'hunk-linking', { key: 'k' }),
    );
    expect(answer).toMatchObject({ ok: false, failure: { code: 'ERR-MODEL-005' } });
  });
});
