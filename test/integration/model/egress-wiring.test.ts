import dns from 'node:dns';
import net from 'node:net';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { FixtureRepo } from '../../fixtures/builder/fixture-repo.js';
import { announceCloudUse } from '../../../src/cli/commands/analyse.js';
import { openCore } from '../../../src/core/api/open.js';
import { CONFIGURATION_PATH } from '../../../src/core/config/effective.js';
import type { TaskInputs } from '../../../src/core/model/gateway.js';
import { STUB_MODEL, StubLlm } from '../../acceptance/support/stub-llm/stub-llm.js';
import { cleanTempDirs, tempDir } from '../../unit/store/helpers.js';

// C001-T-088 in the production wiring (`api/open.ts`): the egress policy registered with the real
// adapters and key source is what lets a request leave. A local provider is used without the opt-in
// (C001-TS-816, C001-TS-848); a non-local one is not used without it, and no connection is opened
// (C001-TS-814, C001-TS-849); with the opt-in, the CLI's announcement is printed before the first
// request (C001-TS-822, C001-TS-823) and once only; model-excluded content never leaves (C001-TS-835,
// C001-TS-838: the base commit's patterns apply, not the working tree's).

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const MARKER = 'MARKER-7f3c';
const H = (n: number) => `h-${String(n).repeat(16)}`;

const input = (): TaskInputs['hunk-linking'] => ({
  intents: [{ intentId: `i-${'1'.repeat(16)}`, title: 'Auth', sourceText: 'REQ-012' }],
  hunks: [
    { hunkId: H(1), path: 'src/auth.ts', text: "+const a = 'MARKER-a1';" },
    { hunkId: H(2), path: 'secrets/tokens.ts', text: `+const t = '${MARKER}';` },
  ],
});

describe('the egress policy in the production wiring', () => {
  const repos: FixtureRepo[] = [];
  const stubs: StubLlm[] = [];
  afterEach(async () => {
    vi.restoreAllMocks();
    for (const s of stubs.splice(0)) await s.stop();
    cleanTempDirs();
  });
  afterAll(() => repos.forEach((r) => r.dispose()));

  async function stub(): Promise<StubLlm> {
    const s = new StubLlm();
    await s.start();
    stubs.push(s);
    return s;
  }

  /** A repository whose base commit holds `model`, with a working-tree edit (and config). */
  function repoWith(model: Record<string, unknown>, workingTreeModel?: Record<string, unknown>) {
    const fx = FixtureRepo.create();
    repos.push(fx);
    fx.commit('B0', {
      files: {
        'src/auth.ts': 'export const a = 1;\n',
        [CONFIGURATION_PATH]: json({ formatVersion: 1, model }),
      },
    });
    fx.write('src/auth.ts', 'export const a = 2;\n');
    if (workingTreeModel) {
      fx.write(CONFIGURATION_PATH, json({ formatVersion: 1, model: workingTreeModel }));
    }
    return fx;
  }

  async function open(fx: FixtureRepo, stderr: string[], onLine?: () => void) {
    const home = tempDir('egress-home');
    const env = {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      LOCALAPPDATA: home,
      XDG_DATA_HOME: home,
    };
    const opened = await openCore(fx.dir, {
      env,
      onCloudUse: announceCloudUse({
        stderr: {
          write: (t: string) => {
            onLine?.();
            stderr.push(t);
          },
        },
      }),
    });
    const started = await opened.core.api.startReview({});
    return { opened, gateway: opened.core.gateway(started.snapshotId), started };
  }

  it('a local provider is used without the opt-in, and nothing is announced', async () => {
    const s = await stub();
    s.enqueue({ output: { task: 'hunk-linking', links: [] } });
    const fx = repoWith({
      provider: {
        name: 'local',
        api: 'openai-chat',
        endpoint: `${s.endpoint}/v1`,
        model: STUB_MODEL,
      },
    });
    const stderr: string[] = [];
    const { opened, gateway, started } = await open(fx, stderr);
    try {
      expect((await opened.core.api.getSession(started.snapshotId)).providerStatus).toEqual({
        mode: 'local-provider',
        providerName: 'local',
        contentSentOffMachine: false,
      });
      const result = await gateway.runTask('hunk-linking', {
        ...input(),
        hunks: [input().hunks[0]!],
      });
      expect(result.status).toBe('accepted');
      expect(s.requests).toHaveLength(1);
      expect(stderr).toEqual([]);
    } finally {
      await opened.close();
    }
  });

  it('a non-local provider without the opt-in gets no connection and no request', async () => {
    const s = await stub();
    const fx = repoWith({
      provider: {
        name: 'lan',
        api: 'openai-chat',
        endpoint: `http://devbox.lan:${s.port}/v1`,
        model: STUB_MODEL,
      },
    });
    const stderr: string[] = [];
    const { opened, gateway, started } = await open(fx, stderr);
    const connect = vi.spyOn(net.Socket.prototype, 'connect');
    const lookup = vi.spyOn(dns, 'lookup');
    try {
      const result = await gateway.runTask('hunk-linking', input());
      expect(result).toMatchObject({ status: 'model-free', cause: 'cloud-opt-in-missing' });
      expect(result.notices.map((n) => n.code)).toEqual(['ERR-MODEL-001']);
      expect(result.notices[0]!.message).toContain('"devbox.lan"');
      expect(connect).not.toHaveBeenCalled();
      expect(lookup).not.toHaveBeenCalled();
      expect(s.requests).toEqual([]);
      expect(stderr).toEqual([]);
      expect((await opened.core.api.getSession(started.snapshotId)).providerStatus.mode).toBe(
        'model-free',
      );
    } finally {
      await opened.close();
    }
  });

  it('with the opt-in: the announcement is printed once, before the first request; excluded content stays', async () => {
    const s = await stub();
    s.enqueue({ output: { task: 'hunk-linking', links: [] } });
    s.enqueue({ output: { task: 'hunk-linking', links: [] } });
    const host = 'llm.cloud.test';
    // Stands in for the isolated test network of C001-T-095: the cloud host name resolves to the
    // loopback stub, so the request really travels the adapter's path to a "cloud" provider.
    const realLookup = dns.lookup.bind(dns);
    vi.spyOn(dns, 'lookup').mockImplementation(((
      hostname: string,
      options: unknown,
      callback: (...args: unknown[]) => void,
    ) => {
      if (hostname !== host)
        return (realLookup as (...a: unknown[]) => void)(hostname, options, callback);
      const cb = typeof options === 'function' ? (options as typeof callback) : callback;
      const all =
        typeof options === 'object' && options !== null && 'all' in options && options.all;
      if (all) cb(null, [{ address: '127.0.0.1', family: 4 }]);
      else cb(null, '127.0.0.1', 4);
    }) as typeof dns.lookup);
    const fx = repoWith(
      {
        provider: {
          name: 'team-cloud',
          api: 'openai-chat',
          endpoint: `http://${host}:${s.port}/v1`,
          model: STUB_MODEL,
        },
        cloudOptIn: true,
        excludedPaths: ['secrets/**'],
      },
      // C001-TS-838: the change lifts the exclusion in its working tree; not applied to its review.
      {
        provider: {
          name: 'team-cloud',
          api: 'openai-chat',
          endpoint: `http://${host}:${s.port}/v1`,
          model: STUB_MODEL,
        },
        cloudOptIn: true,
      },
    );
    const stderr: string[] = [];
    let requestsWhenAnnounced = -1;
    const { opened, gateway, started } = await open(fx, stderr, () => {
      requestsWhenAnnounced = s.requests.length;
    });
    try {
      expect((await opened.core.api.getSession(started.snapshotId)).providerStatus).toEqual({
        mode: 'cloud-provider',
        providerName: 'team-cloud',
        contentSentOffMachine: true,
      });
      const first = await gateway.runTask('hunk-linking', input());
      const second = await opened.core.gateway(started.snapshotId).runTask('hunk-linking', input());
      expect(first.status).toBe('accepted');
      expect(second.status).toBe('accepted');
      expect(stderr).toEqual([
        'Repository content is sent to model provider "team-cloud" at llm.cloud.test.\n',
      ]);
      expect(requestsWhenAnnounced).toBe(0);
      expect(s.requests).toHaveLength(2);
      for (const request of s.requests) expect(JSON.stringify(request)).not.toContain(MARKER);
      expect(first.notices.map((n) => n.code)).toEqual(['ERR-MODEL-002']);
    } finally {
      await opened.close();
    }
  });
});
