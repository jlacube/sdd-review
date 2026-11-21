import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  mergeWithBuiltinPolicy,
  type EffectiveConfiguration,
} from '../../../src/core/config/effective.js';
import type { ReviewConfiguration } from '../../../src/core/config/validate.js';
import { ContextualLog } from '../../../src/core/log/log.js';
import { PROVIDER_ADAPTERS } from '../../../src/core/model/adapters/index.js';
import { createEgressPolicy } from '../../../src/core/model/egress.js';
import {
  failureNotice,
  mergeModelNotices,
  modelNotice,
  renderNotice,
  statusFailure,
} from '../../../src/core/model/failures.js';
import { ModelGateway, type TaskInputs } from '../../../src/core/model/gateway.js';
import { createKeySource } from '../../../src/core/model/keys/key-source.js';
import { RecordStore, type EntryInput } from '../../../src/core/store/record.js';
import {
  STUB_MODEL,
  StubLlm,
  type ScriptedAnswer,
} from '../../acceptance/support/stub-llm/stub-llm.js';

// C001-T-089, C001-TC-816 to C001-TC-818 at unit level: every cause of C001-IF-010 §7 (and the two
// refusals of §6, ERR-MODEL-001 and ERR-MODEL-002) gives its own notice code, naming the provider,
// the cause and the number of items, and model-free items labelled reduced; no request is retried;
// the body of a failed request is neither in the notice nor in the log; and the review record of
// the snapshot is byte for byte the same after every failure (C001-REQ-818).

const H = (n: number) => `h-${String(n).repeat(16)}`;
const I1 = `i-${'1'.repeat(16)}`;
const SECRET_BODY = 'ECHO-OF-THE-REQUEST-MARKER-a1';

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => {
  for (const c of cleanups.splice(0).reverse()) await c();
  vi.unstubAllEnvs();
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'sdd-failures-'));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

async function stub(): Promise<StubLlm> {
  const s = new StubLlm();
  await s.start();
  cleanups.push(() => s.stop());
  return s;
}

function configuration(model: Record<string, unknown>): EffectiveConfiguration {
  return {
    readable: true,
    source: {
      default: false,
      commit: 'a'.repeat(40),
      path: '.sdd-review/config.json',
      readable: true,
    },
    ignoredSettings: [],
    notices: [],
    settings: mergeWithBuiltinPolicy({ formatVersion: 1, model } as ReviewConfiguration),
  };
}

/** The gateway as `openCore` assembles it, over the real adapters and egress policy. */
function gateway(model: Record<string, unknown>, logFile: string) {
  return new ModelGateway({
    configuration: () => configuration(model),
    adapters: PROVIDER_ADAPTERS,
    egress: createEgressPolicy(),
    keys: createKeySource({ env: {} }),
    log: new ContextualLog(logFile),
  });
}

const linking = (hunks: number): TaskInputs['hunk-linking'] => ({
  intents: [{ intentId: I1, title: 'Retry', sourceText: 'Add retry to the HTTP client' }],
  hunks: Array.from({ length: hunks }, (_, i) => ({
    hunkId: H(i + 1),
    path: `src/f${i + 1}.ts`,
    text: `+export const v${i + 1} = ${i + 1};`,
  })),
});

/** A record with review work: 3 read marks, 1 hunk move, a sign and a defer verdict. */
async function recordWithWork(dir: string): Promise<RecordStore> {
  const record = new RecordStore({ log: new ContextualLog(join(dir, 'store.log')) }, dir, 'snap-1');
  await record.create({
    repositoryRoot: dir,
    baseCommit: 'a'.repeat(40),
    headCommit: 'b'.repeat(40),
    createdAt: new Date(0).toISOString(),
  });
  const user = { name: 'Reviewer', email: 'reviewer@example.test' };
  const verdict = (title: string, v: 'sign' | 'defer') =>
    ({
      kind: 'verdict',
      surface: 'cli',
      user,
      intent: {
        intentId: I1,
        intentKey: `developer:${title}`,
        title,
        source: { type: 'developer', reference: title, textHash: 'c'.repeat(64) },
      },
      verdict: v,
      note: v,
      basis: {
        hunks: [],
        evidenceRecordIds: [],
        evidenceItems: [],
        bundleRunIds: [],
        clearings: [],
      },
      shares: { changedLines: 1, read: 1, cleared: 0, open: 0 },
      coverageStatement: {},
    }) as unknown as EntryInput;
  await record.append([
    ...[1, 2, 3].map(
      (n) => ({ kind: 'read-mark', surface: 'cli', user, hunkIds: [H(n)] }) as EntryInput,
    ),
    {
      kind: 'hunk-move',
      surface: 'cli',
      user,
      hunkId: H(1),
      from: { orphan: true },
      to: { intentId: I1 },
    } as EntryInput,
    verdict('REQ-012', 'sign'),
    verdict('REQ-013', 'defer'),
  ]);
  return record;
}

interface Cause {
  readonly name: string;
  readonly code: string;
  /** The cause words of the notice. */
  readonly words: RegExp;
  /** Sets the scene; returns the model settings. */
  readonly setup: (s: StubLlm) => Promise<Record<string, unknown>> | Record<string, unknown>;
  /** Requests the provider should have received. */
  readonly requests: number;
}

const local = (s: StubLlm, extra: Record<string, unknown> = {}) => ({
  provider: { name: 'team-model', api: 'openai-chat', endpoint: `${s.endpoint}/v1`, model: 'm' },
  timeoutSeconds: 1,
  ...extra,
});

const scripted = (answer: ScriptedAnswer) => (s: StubLlm) => {
  s.enqueue(answer);
  return local(s);
};

const CAUSES: readonly Cause[] = [
  {
    name: 'cloud opt-in setting missing',
    code: 'ERR-MODEL-001',
    words:
      /endpoint "llm\.cloud\.test" is not on this machine and the cloud opt-in setting is missing/,
    setup: () => ({
      provider: {
        name: 'team-model',
        api: 'openai-chat',
        endpoint: 'https://llm.cloud.test/v1',
        model: 'm',
      },
    }),
    requests: 0,
  },
  {
    name: 'model-excluded path',
    code: 'ERR-MODEL-002',
    words: /was not used for 3 items on model-excluded paths/,
    setup: (s) => local(s, { excludedPaths: ['src/**'] }),
    requests: 0,
  },
  {
    name: 'provider unreachable',
    code: 'ERR-MODEL-003',
    words: /is unreachable \(connection refused\)/,
    setup: async (s) => {
      const settings = local(s);
      await s.stop();
      return settings;
    },
    requests: 0,
  },
  {
    name: 'connection closed before a status line',
    code: 'ERR-MODEL-003',
    words: /is unreachable \(connection closed before an HTTP status line\)/,
    setup: scripted({ destroy: true }),
    requests: 1,
  },
  {
    name: 'timeout',
    code: 'ERR-MODEL-004',
    words: /did not answer within 1 s/,
    setup: scripted({ output: { task: 'hunk-linking', links: [] }, delayMs: 2500 }),
    requests: 1,
  },
  {
    name: 'unusable output: not JSON',
    code: 'ERR-MODEL-005',
    words: /returned unusable output \(the answer is not JSON\)/,
    setup: scripted({ body: `not json ${SECRET_BODY}` }),
    requests: 1,
  },
  {
    name: 'unusable output: fails C001-IF-011',
    code: 'ERR-MODEL-005',
    words:
      /returned unusable output \(the output does not match HunkLinking at \/ \(required "links"\)\)/,
    setup: scripted({ output: { task: 'hunk-linking', note: SECRET_BODY } }),
    requests: 1,
  },
  {
    name: 'unusable output: a hunk ID the request does not hold',
    code: 'ERR-MODEL-005',
    words: /the output names a hunk ID that the request does not hold at \/links\/0\/hunkId/,
    setup: scripted({
      output: {
        task: 'hunk-linking',
        links: [{ hunkId: H(9), intentId: I1, reason: SECRET_BODY }],
      },
    }),
    requests: 1,
  },
  {
    name: 'provider key not found',
    code: 'ERR-MODEL-006',
    words: /no key found in environment variable "SDD_T089_NO_SUCH_KEY"/,
    setup: (s) =>
      local(s, {
        provider: {
          name: 'team-model',
          api: 'openai-chat',
          endpoint: `${s.endpoint}/v1`,
          model: 'm',
          keyEnv: 'SDD_T089_NO_SUCH_KEY',
          // An entry no store holds, so that the lookup cannot find a developer's real key.
          keyCredential: { service: 'sdd-review/t089-test', account: `none-${process.pid}` },
        },
      }),
    requests: 0,
  },
  ...[401, 403].map((status) => ({
    name: `key rejected (HTTP ${status})`,
    code: 'ERR-MODEL-007',
    words: new RegExp(`rejected the key \\(HTTP ${status}\\)`),
    setup: scripted({ body: SECRET_BODY, status }),
    requests: 1,
  })),
  {
    name: 'rate or quota limit reached (HTTP 429)',
    code: 'ERR-MODEL-008',
    words: /rate or quota limit reached \(HTTP 429\)/,
    setup: scripted({ body: SECRET_BODY, status: 429 }),
    requests: 1,
  },
  ...[500, 502, 599].map((status) => ({
    name: `provider server error (HTTP ${status})`,
    code: 'ERR-MODEL-009',
    words: new RegExp(`failed with a server error \\(HTTP ${status}\\)`),
    setup: scripted({ body: SECRET_BODY, status }),
    requests: 1,
  })),
  ...[204, 400, 402, 404, 413, 428, 430, 499].map((status) => ({
    name: `provider refused the request (HTTP ${status})`,
    code: 'ERR-MODEL-010',
    words: new RegExp(`refused the request \\(HTTP ${status}\\)`),
    setup: scripted({ body: SECRET_BODY, status }),
    requests: 1,
  })),
];

describe('the failure fallback, one code per cause (C001-IF-010 §7, C001-REQ-816, -817, -818)', () => {
  it.each(CAUSES)(
    '$name gives $code, model-free items, no retry and an unchanged review record',
    async (cause) => {
      const dir = tempDir();
      const record = await recordWithWork(dir);
      const before = readFileSync(record.file);
      const s = await stub();
      const logFile = join(dir, 'log.jsonl');
      const model = await cause.setup(s);

      const result = await gateway(model, logFile).runTask('hunk-linking', linking(3));

      // C001-REQ-816: the items of the request in model-free mode, none of its output.
      expect(result.status).toBe('model-free');
      expect(result).not.toHaveProperty('output');
      expect(result.labels).toEqual({ reduced: ['hunk-to-intent grouping'] });
      if (result.status === 'model-free') expect(result.items).toBe(3);
      // C001-REQ-817: one notice, its code, naming the provider, the cause and the count.
      expect(result.notices.map((n) => n.code)).toEqual([cause.code]);
      const [notice] = result.notices;
      expect(notice!.message).toContain('Model provider "team-model"');
      expect(notice!.message).toMatch(cause.words);
      expect(notice!.message).toMatch(/\b3 items\b/);
      expect(notice!.count).toBe(3);
      // §3 item 4: no retry.
      expect(s.requests).toHaveLength(cause.requests);
      // §7: the body of a failed request is neither shown nor logged.
      expect(JSON.stringify(result)).not.toContain(SECRET_BODY);
      let log = '';
      try {
        log = readFileSync(logFile, 'utf8');
      } catch {
        /* nothing logged */
      }
      expect(log).not.toContain(SECRET_BODY);
      // C001-REQ-818: verdicts, read marks and hunk moves untouched; the record byte for byte.
      expect(readFileSync(record.file).equals(before)).toBe(true);
      expect((await record.read()).entries.map((e) => e.kind)).toEqual([
        'read-mark',
        'read-mark',
        'read-mark',
        'hunk-move',
        'verdict',
        'verdict',
      ]);
    },
  );

  it('logs every provider failure with its code, the provider, the task and the cause (NFR-D-04)', async () => {
    const dir = tempDir();
    const s = await stub();
    s.enqueue({ status: 502 });
    const logFile = join(dir, 'log.jsonl');
    await gateway(local(s), logFile).runTask('hunk-linking', linking(2));
    const entry = JSON.parse(readFileSync(logFile, 'utf8').trim()) as Record<string, unknown>;
    expect(entry).toMatchObject({
      code: 'ERR-MODEL-009',
      operation: 'model-request',
      inputs: { provider: 'team-model', api: 'openai-chat', task: 'hunk-linking' },
      cause: 'HTTP 502',
    });
  });

  it('a request split into batches keeps the output of the batches that succeeded (C001-TS-843)', async () => {
    const dir = tempDir();
    const s = await stub();
    const hunkLinks = (ids: number[]) => ({
      output: {
        task: 'hunk-linking',
        links: ids.map((n) => ({ hunkId: H(n), intentId: I1, reason: `r${n}` })),
      },
    });
    const big = linking(3);
    // Hunk texts large enough that each batch holds one hunk at the smallest request size.
    const input: TaskInputs['hunk-linking'] = {
      ...big,
      hunks: big.hunks.map((h) => ({ ...h, text: `+${'x'.repeat(2500)}` })),
    };
    s.enqueue(hunkLinks([1]))
      .enqueue({ status: 503 })
      .enqueue(hunkLinks([3]));
    const result = await gateway(
      local(s, { maxRequestBytes: 4096 }),
      join(dir, 'log.jsonl'),
    ).runTask('hunk-linking', input);
    expect(s.requests).toHaveLength(3);
    expect(result.status).toBe('accepted');
    if (result.status !== 'accepted') return;
    expect(result.output.links.map((l) => l.hunkId)).toEqual([H(1), H(3)]);
    expect(result.failed).toEqual({ items: 1, hunkIds: [H(2)], componentNames: [] });
    expect(result.notices).toEqual([
      {
        code: 'ERR-MODEL-009',
        message:
          'Model provider "team-model" failed with a server error (HTTP 503). 1 items were produced in model-free mode.',
        count: 1,
      },
    ]);
    expect(result.marked.every((m) => m.labels.modelOutput.confidence === 'low')).toBe(true);
  });

  it('a one-item task is model-free when one of its batches fails, and sends no further batch', async () => {
    const dir = tempDir();
    const s = await stub();
    s.enqueue({ output: { task: 'walkthrough-account', intentId: I1, account: 'part 1' } });
    s.enqueue({ status: 500 });
    const input: TaskInputs['walkthrough-account'] = {
      intent: { intentId: I1, title: 'Retry', sourceText: 'Add retry' },
      hunks: [1, 2, 3].map((n) => ({ hunkId: H(n), path: `src/f${n}.ts`, text: 'y'.repeat(2500) })),
    };
    const result = await gateway(local(s, { maxRequestBytes: 4096 }), join(dir, 'l.jsonl')).runTask(
      'walkthrough-account',
      input,
    );
    expect(s.requests).toHaveLength(2);
    expect(result).toMatchObject({ status: 'model-free', items: 1 });
    expect(result.notices.map((n) => n.code)).toEqual(['ERR-MODEL-009']);
  });

  it('an excluded path and a failure are both reported, with their own counts (C001-TS-845)', async () => {
    const dir = tempDir();
    const s = await stub();
    s.enqueue({ output: { task: 'design-critique', findings: [] }, delayMs: 2500 });
    const comp = (name: string, n: number, path = `src/${name}.ts`) => ({
      componentName: name,
      hunks: [{ hunkId: H(n), path, text: '+x' }],
    });
    const input: TaskInputs['design-critique'] = {
      components: [
        comp('a', 1),
        comp('b', 2),
        comp('c', 3),
        comp('d', 4),
        comp('e', 5),
        comp('s1', 6, 'secrets/a.ts'),
        comp('s2', 7, 'secrets/b.ts'),
        comp('s3', 8, 'secrets/c.ts'),
      ],
    };
    const result = await gateway(
      local(s, { excludedPaths: ['secrets/**'] }),
      join(dir, 'l'),
    ).runTask('design-critique', input);
    expect(result.status).toBe('model-free');
    expect(result.reports.map((r) => [r.code, r.count])).toEqual([
      ['ERR-MODEL-002', 3],
      ['ERR-MODEL-004', 5],
    ]);
  });
});

describe('notices of one code are merged per review (§7)', () => {
  it('adds up the counts and lists each differing value once', () => {
    const merged = mergeModelNotices([
      failureNotice('team-model', statusFailure(502), 2),
      modelNotice('ERR-MODEL-002', 'team-model', 3),
      failureNotice('team-model', statusFailure(503), 1),
      failureNotice('team-model', statusFailure(502), 4),
    ]);
    expect(merged).toEqual([
      { code: 'ERR-MODEL-009', params: { status: '502, 503', name: 'team-model' }, count: 7 },
      { code: 'ERR-MODEL-002', params: { name: 'team-model' }, count: 3 },
    ]);
    expect(renderNotice(merged[0]!)).toEqual({
      code: 'ERR-MODEL-009',
      message:
        'Model provider "team-model" failed with a server error (HTTP 502, 503). 7 items were produced in model-free mode.',
      count: 7,
    });
  });

  it('maps every status to one code (C001-TS-854)', () => {
    const codes = Object.fromEntries(
      [400, 401, 402, 403, 428, 429, 430, 499, 500, 599, 204].map((s) => [
        s,
        statusFailure(s).code,
      ]),
    );
    expect(codes).toEqual({
      400: 'ERR-MODEL-010',
      401: 'ERR-MODEL-007',
      402: 'ERR-MODEL-010',
      403: 'ERR-MODEL-007',
      428: 'ERR-MODEL-010',
      429: 'ERR-MODEL-008',
      430: 'ERR-MODEL-010',
      499: 'ERR-MODEL-010',
      500: 'ERR-MODEL-009',
      599: 'ERR-MODEL-009',
      204: 'ERR-MODEL-010',
    });
  });
});

describe('accepted output is marked (C001-REQ-810, C001-REQ-811)', () => {
  it('carries the provider name, the model of the answer and confidence low', async () => {
    const dir = tempDir();
    const s = await stub();
    s.enqueue({
      output: {
        task: 'hunk-linking',
        links: [{ hunkId: H(1), intentId: I1, reason: 'confidence: high (0.99)' }],
      },
    });
    const result = await gateway(local(s), join(dir, 'l')).runTask('hunk-linking', linking(1));
    expect(result.status).toBe('accepted');
    if (result.status !== 'accepted') return;
    expect(result.labels).toEqual({
      modelOutput: { provider: 'team-model', model: STUB_MODEL, confidence: 'low' },
    });
    expect(result.marked).toEqual([
      {
        hunkId: H(1),
        intentId: I1,
        reason: 'confidence: high (0.99)',
        confidence: 'low',
        labels: { modelOutput: { provider: 'team-model', model: STUB_MODEL, confidence: 'low' } },
      },
    ]);
    expect(result.notices).toEqual([]);
  });
});
