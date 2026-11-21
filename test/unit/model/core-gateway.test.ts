import net from 'node:net';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { FixtureRepo } from '../../fixtures/builder/fixture-repo.js';
import { createCore } from '../../../src/core/api/index.js';
import { CONFIGURATION_PATH } from '../../../src/core/config/effective.js';
import { GitAdapter } from '../../../src/core/git/operations.js';
import { ContextualLog } from '../../../src/core/log/log.js';
import type { EgressPolicy, ProviderAdapter } from '../../../src/core/model/gateway.js';
import { StoreLayout } from '../../../src/core/store/root.js';
import { SnapshotStore } from '../../../src/core/store/snapshots.js';
import { cleanTempDirs, tempDir } from '../store/helpers.js';

// C001-T-085 wiring in the core: the gateway of a snapshot decides from the configuration of the
// snapshot's base commit, never the working tree (C001-REQ-426, C001-TS-803, C001-TS-857); an
// unreadable configuration gives model-free mode and its notice (C001-REQ-819, C001-TS-856); a
// review in model-free mode opens no connection (C001-REQ-803).

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const provider = {
  name: 'local-stub',
  api: 'openai-chat',
  endpoint: 'http://127.0.0.1:11434/v1',
  model: 'stub-model-1',
};
const allowLocal: EgressPolicy = { check: () => ({ allowed: true, locality: 'local' }) };
const adapter: ProviderAdapter = { send: vi.fn() };

describe('the model gateway in the core', () => {
  const repos: FixtureRepo[] = [];
  const opened: GitAdapter[] = [];
  afterEach(async () => {
    for (const git of opened.splice(0)) await git.close();
    cleanTempDirs();
  });
  afterAll(() => repos.forEach((r) => r.dispose()));

  let connect: ReturnType<typeof vi.spyOn>;
  beforeAll(() => {
    connect = vi.spyOn(net.Socket.prototype, 'connect');
  });
  afterAll(() => connect.mockRestore());

  function repoWith(baseConfig: string | null, workingTreeConfig?: string): FixtureRepo {
    const fx = FixtureRepo.create();
    repos.push(fx);
    fx.commit('B0', {
      files: {
        'src/cart.ts': 'export const total = 1;\n',
        ...(baseConfig === null ? {} : { [CONFIGURATION_PATH]: baseConfig }),
      },
    });
    fx.write('src/cart.ts', 'export const total = 2;\n');
    if (workingTreeConfig !== undefined) fx.write(CONFIGURATION_PATH, workingTreeConfig);
    return fx;
  }

  async function coreFor(
    fx: FixtureRepo,
    model = { egress: allowLocal, adapters: { 'openai-chat': adapter } },
  ) {
    const root = tempDir('gw');
    const log = new ContextualLog(join(root, 'log.jsonl'));
    const git = new GitAdapter({ log });
    opened.push(git);
    const location = await git.discover(fx.dir);
    const ctx = { log, lockPollMs: 5 };
    const store = new SnapshotStore(ctx, new StoreLayout(join(root, 'store'), 'k'.repeat(64)));
    return createCore({ git, store, ctx, repositoryRoot: location.workTreeRoot, model });
  }

  it('no configuration: model-free session, no notice, no connection', async () => {
    const before = connect.mock.calls.length;
    const core = await coreFor(repoWith(null));
    const started = await core.api.startReview({});
    expect(started.notices).toEqual([]);
    expect((await core.api.getSession(started.snapshotId)).providerStatus).toEqual({
      mode: 'model-free',
      providerName: null,
      contentSentOffMachine: false,
    });
    expect((await core.gateway(started.snapshotId).decide()).use).toBe(false);
    expect(connect.mock.calls.length).toBe(before);
    await core.close();
  });

  it('a provider added in the working tree only is not used (C001-TS-803)', async () => {
    const core = await coreFor(
      repoWith(json({ formatVersion: 1 }), json({ formatVersion: 1, model: { provider } })),
    );
    const started = await core.api.startReview({});
    expect(await core.gateway(started.snapshotId).decide()).toMatchObject({
      use: false,
      cause: 'no-provider',
    });
    expect((await core.api.getSession(started.snapshotId)).providerStatus.mode).toBe('model-free');
    await core.close();
  });

  it('a provider in the base commit is used despite a broken working-tree file (C001-TS-857)', async () => {
    const core = await coreFor(
      repoWith(
        json({ formatVersion: 1, model: { provider } }),
        '{\n  "formatVersion": 1,\n  oops\n}\n',
      ),
    );
    const started = await core.api.startReview({});
    expect(started.notices.map((n) => n.code)).not.toContain('ERR-CFG-001');
    expect(await core.gateway(started.snapshotId).decide()).toMatchObject({
      use: true,
      locality: 'local',
    });
    expect((await core.api.getSession(started.snapshotId)).providerStatus).toEqual({
      mode: 'local-provider',
      providerName: 'local-stub',
      contentSentOffMachine: false,
    });
    await core.close();
  });

  it('without the egress policy and adapters a configured provider is withheld', async () => {
    const core = await coreFor(
      repoWith(json({ formatVersion: 1, model: { provider } })),
      {} as never,
    );
    const started = await core.api.startReview({});
    expect(await core.gateway(started.snapshotId).decide()).toMatchObject({
      use: false,
      cause: 'gateway-incomplete',
    });
    expect((await core.api.getSession(started.snapshotId)).providerStatus.mode).toBe('model-free');
    await core.close();
  });

  it.each([
    [
      'another provider API',
      json({
        formatVersion: 1,
        model: { provider: { ...provider, api: 'google-gemini' }, cloudOptIn: true },
      }),
    ],
    ['a syntax error on line 3', '{\n  "formatVersion": 1,\n  "model": oops\n}\n'],
  ])(
    'an unreadable base configuration (%s) gives model-free mode and ERR-CFG-001 (C001-TS-856)',
    async (_n, text) => {
      const before = connect.mock.calls.length;
      const core = await coreFor(repoWith(text));
      const started = await core.api.startReview({});
      expect(started.notices.map((n) => n.code)).toEqual(['ERR-CFG-001']);
      expect((await core.api.getSession(started.snapshotId)).providerStatus.mode).toBe(
        'model-free',
      );
      const result = await core.gateway(started.snapshotId).runTask('walkthrough-account', {
        intent: { intentId: `i-${'1'.repeat(16)}`, title: 't', sourceText: 's' },
        hunks: [],
      });
      expect(result).toMatchObject({ status: 'model-free', cause: 'configuration-unreadable' });
      expect(result.labels.reduced).toEqual(['walkthrough account']);
      // Reopening the review reports the notice again: it is recomputed from the base commit.
      const again = await core.api.startReview({});
      expect(again.reopened).toBe(true);
      expect(again.notices.map((n) => n.code)).toEqual(['ERR-CFG-001']);
      expect(adapter.send).not.toHaveBeenCalled();
      expect(connect.mock.calls.length).toBe(before);
      await core.close();
    },
  );
});
