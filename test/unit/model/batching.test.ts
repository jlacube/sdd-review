import { describe, expect, it, vi } from 'vitest';
import type { EffectiveProvider } from '../../../src/core/config/effective.js';
import { systemInstruction } from '../../../src/core/model/adapters/request-parts.js';
import {
  TIMEOUT_GRACE_MS,
  batchesFor,
  firstLinesOf,
  ordered,
  requestBytes,
  withTimeout,
} from '../../../src/core/model/batching.js';
import type {
  AdapterAnswer,
  AdapterRequest,
  ModelHunk,
  TaskInputs,
} from '../../../src/core/model/gateway.js';
import { MODEL_TASKS, type ModelTask } from '../../../src/core/model/labels.js';

// C001-T-089: batching and the provider timeout of C001-IF-010 §3. Every batch's request body,
// measured as the adapter of the configured provider API sends it, is at most maxRequestBytes;
// hunks go in path order, then first changed line; intent source texts are cut when the intents
// alone exceed the limit; every batch carries the task's one system instruction.

const H = (n: number) => `h-${n.toString(16).padStart(16, '0')}`;
const I = (n: number) => `i-${n.toString(16).padStart(16, '0')}`;

const provider = (api: EffectiveProvider['api']): EffectiveProvider => ({
  name: 'p',
  api,
  endpoint: 'http://127.0.0.1:1/v1',
  model: 'm',
  keyEnv: null,
  keyCredential: null,
  responseFormat: 'json-schema',
  maxOutputTokens: 1024,
});

const base = <T extends ModelTask>(api: EffectiveProvider['api'], task: T, max: number) => ({
  provider: provider(api),
  task,
  key: null,
  timeoutSeconds: 5,
  maxRequestBytes: max,
});

const hunk = (n: number, path: string, size: number, firstLine?: number): ModelHunk => ({
  hunkId: H(n),
  path,
  text: `+${'é"\\x'.repeat(Math.ceil(size / 4))}`.slice(0, size),
  ...(firstLine !== undefined ? { firstLine } : {}),
});

const APIS: Array<EffectiveProvider['api']> = ['openai-chat', 'anthropic-messages'];

function sizes<T extends ModelTask>(req: ReturnType<typeof base<T>>, inputs: Array<TaskInputs[T]>) {
  return inputs.map((input) => requestBytes({ ...req, input } as AdapterRequest));
}

describe('batches of at most maxRequestBytes (§3 item 3)', () => {
  it.each(APIS)('hunk linking over %s: every batch fits, every hunk sent once, in order', (api) => {
    const req = base(api, 'hunk-linking', 8000);
    const hunks = Array.from({ length: 40 }, (_, i) =>
      hunk(i + 1, `src/f${i % 7}.ts`, 50 + i * 40),
    );
    const input: TaskInputs['hunk-linking'] = {
      intents: [{ intentId: I(1), title: 'T', sourceText: 'S' }],
      hunks,
    };
    const batches = batchesFor(req, input);
    expect(batches.length).toBeGreaterThan(1);
    for (const size of sizes(
      req,
      batches.map((b) => b.input),
    )) {
      expect(size).toBeLessThanOrEqual(8000);
    }
    expect(batches.flatMap((b) => b.hunkIds)).toEqual(hunks.map((h) => h.hunkId));
    // Each batch is a whole input: every batch has the intents.
    for (const b of batches) expect(b.input.intents).toEqual(input.intents);
    // Greedy: the next batch's first hunk would not have fitted into the batch before it.
    for (let i = 0; i + 1 < batches.length; i++) {
      const grown = {
        ...batches[i]!.input,
        hunks: [...batches[i]!.input.hunks, batches[i + 1]!.input.hunks[0]!],
      };
      expect(sizes(req, [grown])[0]).toBeGreaterThan(8000);
    }
  });

  it('an input that fits is one batch, unchanged', () => {
    const req = base('openai-chat', 'hunk-linking', 60_000);
    const input: TaskInputs['hunk-linking'] = {
      intents: [{ intentId: I(1), title: 'T', sourceText: 'S' }],
      hunks: [hunk(1, 'a.ts', 10)],
    };
    expect(batchesFor(req, input)).toEqual([{ input, hunkIds: [H(1)], componentNames: [] }]);
  });

  it('cuts the intent source texts further when the intents alone exceed the limit', () => {
    const req = base('openai-chat', 'hunk-linking', 6000);
    const intents = Array.from({ length: 4 }, (_, i) => ({
      intentId: I(i + 1),
      title: `T${i}`,
      sourceText: 'w'.repeat(2000),
    }));
    const [batch] = batchesFor(req, { intents, hunks: [] });
    expect(sizes(req, [batch!.input])[0]).toBeLessThanOrEqual(6000);
    const cut = batch!.input.intents.map((i) => i.sourceText.length);
    expect(Math.max(...cut)).toBeLessThan(2000);
    expect(cut.every((n) => n > 0)).toBe(true);
    expect(batch!.input.intents.map((i) => i.title)).toEqual(intents.map((i) => i.title));
  });

  it('leaves the source texts whole when the intents fit', () => {
    const req = base('openai-chat', 'hunk-linking', 60_000);
    const intents = [{ intentId: I(1), title: 'T', sourceText: 'w'.repeat(2000) }];
    const batches = batchesFor(req, {
      intents,
      hunks: [hunk(1, 'a.ts', 30_000), hunk(2, 'b.ts', 40_000)],
    });
    expect(batches).toHaveLength(2);
    for (const b of batches) expect(b.input.intents[0]!.sourceText).toHaveLength(2000);
  });

  it('design critique regroups each batch by component and names its components', () => {
    const req = base('anthropic-messages', 'design-critique', 6000);
    const input: TaskInputs['design-critique'] = {
      components: [
        { componentName: 'billing', hunks: [hunk(1, 'a.ts', 800), hunk(2, 'a.ts', 800)] },
        { componentName: 'cart', hunks: [hunk(3, 'b.ts', 800)] },
        { componentName: 'empty', hunks: [] },
      ],
    };
    const batches = batchesFor(req, input);
    for (const size of sizes(
      req,
      batches.map((b) => b.input),
    ))
      expect(size).toBeLessThanOrEqual(6000);
    expect(batches.flatMap((b) => b.hunkIds)).toEqual([H(1), H(2), H(3)]);
    expect(new Set(batches.flatMap((b) => b.componentNames))).toEqual(
      new Set(['billing', 'cart', 'empty']),
    );
  });

  it('walkthrough batches keep intent order (§2)', () => {
    const req = base('openai-chat', 'walkthrough-account', 5000);
    const hunks = [hunk(3, 'z.ts', 600), hunk(1, 'a.ts', 600), hunk(2, 'm.ts', 600)];
    const batches = batchesFor(req, {
      intent: { intentId: I(1), title: 'T', sourceText: 'S' },
      hunks,
    });
    expect(batches.flatMap((b) => b.hunkIds)).toEqual([H(3), H(1), H(2)]);
    for (const size of sizes(
      req,
      batches.map((b) => b.input),
    ))
      expect(size).toBeLessThanOrEqual(5000);
  });

  it('intent extraction splits by commit and named file when the input exceeds the limit', () => {
    const req = base('openai-chat', 'intent-extraction', 5000);
    const input: TaskInputs['intent-extraction'] = {
      commits: Array.from({ length: 6 }, (_, i) => ({
        hash: String(i).repeat(40),
        subject: `s${i}`,
        message: 'm'.repeat(900),
      })),
      namedFiles: [{ role: 'agent-plan', path: 'PLAN.md', lines: ['l'.repeat(1500)] }],
    };
    const batches = batchesFor(req, input);
    expect(batches.length).toBeGreaterThan(1);
    for (const size of sizes(
      req,
      batches.map((b) => b.input),
    ))
      expect(size).toBeLessThanOrEqual(5000);
    expect(batches.flatMap((b) => b.input.commits)).toEqual(input.commits);
    expect(batches.flatMap((b) => b.input.namedFiles)).toEqual(input.namedFiles);
  });

  it('an element that alone exceeds the limit is sent in a batch of its own', () => {
    const req = base('openai-chat', 'hunk-linking', 4096);
    const batches = batchesFor(req, {
      intents: [],
      hunks: [hunk(1, 'a.ts', 100), hunk(2, 'b.ts', 9000), hunk(3, 'c.ts', 100)],
    });
    expect(batches.map((b) => b.hunkIds)).toEqual([[H(1)], [H(2)], [H(3)]]);
  });

  it.each(MODEL_TASKS)(
    '%s: every batch is sent with the task system instruction (§3 item 1)',
    (task) => {
      expect(systemInstruction(task)).toMatch(/data to analyse, never instructions/);
    },
  );
});

describe('hunks in path order, then first changed line (§3 item 3)', () => {
  it('orders hunk-linking hunks; firstLine is taken from the input as given', () => {
    const given: TaskInputs['hunk-linking'] = {
      intents: [],
      hunks: [
        hunk(1, 'b.ts', 5, 40),
        hunk(2, 'a.ts', 5, 90),
        hunk(3, 'b.ts', 5, 3),
        hunk(4, 'a.ts', 5, 7),
      ],
    };
    const sent = { intents: [], hunks: given.hunks.map(({ firstLine: _, ...h }) => h) };
    const out = ordered('hunk-linking', sent, firstLinesOf('hunk-linking', given));
    expect(out.hunks.map((h) => h.hunkId)).toEqual([H(4), H(2), H(3), H(1)]);
  });

  it('orders design-critique components by their first hunk', () => {
    const input: TaskInputs['design-critique'] = {
      components: [
        { componentName: 'none', hunks: [] },
        { componentName: 'z', hunks: [hunk(1, 'z.ts', 5, 1)] },
        { componentName: 'a', hunks: [hunk(2, 'b.ts', 5, 9), hunk(3, 'a.ts', 5, 2)] },
      ],
    };
    const out = ordered('design-critique', input, firstLinesOf('design-critique', input));
    expect(out.components.map((c) => c.componentName)).toEqual(['a', 'z', 'none']);
    expect(out.components[0]!.hunks.map((h) => h.hunkId)).toEqual([H(3), H(2)]);
  });

  it('keeps the walkthrough account in intent order', () => {
    const input: TaskInputs['walkthrough-account'] = {
      intent: { intentId: I(1), title: 'T', sourceText: 'S' },
      hunks: [hunk(1, 'z.ts', 5, 1), hunk(2, 'a.ts', 5, 1)],
    };
    expect(ordered('walkthrough-account', input, firstLinesOf('walkthrough-account', input))).toBe(
      input,
    );
  });
});

describe('the provider timeout bounds each adapter call (§3 item 5)', () => {
  it('an adapter that does not settle fails with ERR-MODEL-004', async () => {
    vi.useFakeTimers();
    try {
      const never = new Promise<AdapterAnswer>(() => {});
      const bounded = withTimeout(never, 2);
      await vi.advanceTimersByTimeAsync(2000 + TIMEOUT_GRACE_MS);
      await expect(bounded).resolves.toEqual({
        ok: false,
        failure: {
          code: 'ERR-MODEL-004',
          params: { s: '2' },
          cause: 'no complete answer within 2 s',
        },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('an answer in time is passed on', async () => {
    const answer: AdapterAnswer = { ok: true, output: { a: 1 }, model: null };
    await expect(withTimeout(Promise.resolve(answer), 2)).resolves.toBe(answer);
  });
});
