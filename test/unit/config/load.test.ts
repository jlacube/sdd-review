import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { FixtureRepo } from '../../fixtures/builder/fixture-repo.js';
import { GitAdapter } from '../../../src/core/git/operations.js';
import { ContextualLog } from '../../../src/core/log/log.js';
import { loadReviewConfiguration } from '../../../src/core/config/load.js';
import {
  CONFIGURATION_PATH,
  clearingAllowed,
  configuredProvider,
  triageConfiguration,
  type EffectiveConfiguration,
} from '../../../src/core/config/effective.js';

// C001-COMP-006 configuration loader over a real repository (C001-T-035): the configuration is
// read from the base commit through the git port (C001-REQ-426, C001-TS-476 to C001-TS-479), an
// edit in the working tree has no effect, and an unreadable file gives the state in which triage
// clears nothing (C001-REQ-427) and the gateway uses no model (C001-REQ-819, C001-REQ-820).

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

describe('loadReviewConfiguration', () => {
  let fx: FixtureRepo;
  let git: GitAdapter;
  let scratch: string;
  let log: ContextualLog;
  let logFile: string;
  const commits: Record<string, string> = {};

  beforeAll(async () => {
    scratch = mkdtempSync(join(tmpdir(), 'sddcfg-'));
    logFile = join(scratch, 'log.jsonl');
    log = new ContextualLog(logFile);
    fx = FixtureRepo.create();
    commits.none = fx.commit('none', {
      files: { 'src/cart/total.ts': 'export const t = 1;\n' },
    }).hash;
    commits.generated = fx.commit('generated', {
      files: {
        [CONFIGURATION_PATH]: json({
          formatVersion: 1,
          clearing: { rules: { passingTests: false }, generatedFiles: ['src/api/generated/**'] },
        }),
      },
    }).hash;
    commits.weakening = fx.commit('weakening', {
      files: {
        [CONFIGURATION_PATH]: json({
          formatVersion: 1,
          clearing: {
            guardedAreas: [{ name: 'billing', paths: ['src/billing/**'] }],
            builtinGuardedAreas: { 'public-api': false },
          },
        }),
      },
    }).hash;
    commits.syntax = fx.commit('syntax', {
      files: { [CONFIGURATION_PATH]: '{\n  "formatVersion": 1,\n  "clearing": {,\n}\n' },
    }).hash;
    commits.foreign = fx.commit('foreign', {
      files: {
        [CONFIGURATION_PATH]: json({
          formatVersion: 1,
          clearing: { builtinGuardedAreas: { 'security-auth': false } },
          model: {
            cloudOptIn: true,
            provider: {
              name: 'team-model',
              api: 'google-gemini',
              endpoint: 'https://llm.example.test',
              model: 'm',
              keyCredential: { service: 'git:https://github.com', account: 'team-model' },
            },
          },
        }),
      },
    }).hash;
    commits.provider = fx.commit('provider', {
      files: {
        [CONFIGURATION_PATH]: json({
          formatVersion: 1,
          model: {
            provider: {
              name: 'local',
              api: 'openai-chat',
              endpoint: 'http://localhost:11434/v1',
              model: 'm',
              keyCredential: { service: 'sdd-review', account: 'local' },
            },
          },
        }),
      },
    }).hash;
    // The working tree holds yet another configuration that loosens everything: never read.
    fx.write(
      CONFIGURATION_PATH,
      json({
        formatVersion: 1,
        clearing: { generatedFiles: ['src/**'], rules: { passingTests: true } },
      }),
    );
    git = new GitAdapter();
    await git.discover(fx.dir);
  });

  afterAll(async () => {
    await git.close();
    fx.dispose();
    rmSync(scratch, { recursive: true, force: true });
  });

  const load = (commit: string) => loadReviewConfiguration({ git, log }, commit);
  const readable = (c: EffectiveConfiguration) => {
    if (!c.readable) throw new Error(`unreadable: ${c.error.cause}`);
    return c;
  };

  it('a base commit without the file gives the default configuration (C001-TS-478)', async () => {
    const c = readable(await load(commits.none!));
    expect(c.source).toEqual({
      default: true,
      commit: commits.none,
      path: CONFIGURATION_PATH,
      readable: true,
    });
    expect(c.settings.clearing.generatedFiles).toEqual([]);
    expect(c.settings.clearing.rules).toEqual({
      pureMove: true,
      pureRename: true,
      formatting: true,
      generatedFile: true,
      passingTests: true,
    });
    expect(c.settings.clearing.guardedAreas.map((a) => a.id)).toEqual([
      'security-auth',
      'data-migration',
      'dependency-build-config',
      'public-api',
    ]);
    expect(c.settings.design.minCloneLength).toBe(6);
    expect(c.settings.model).toEqual({
      provider: null,
      cloudOptIn: false,
      timeoutSeconds: 120,
      excludedPaths: [],
      maxRequestBytes: 60_000,
    });
    expect(c.notices).toEqual([]);
  });

  it('reads the base commit, never the working tree (C001-TS-476, C001-TS-479)', async () => {
    const c = readable(await load(commits.generated!));
    expect(c.source.default).toBe(false);
    expect(c.settings.clearing.generatedFiles).toEqual(['src/api/generated/**']);
    expect(c.settings.clearing.rules.passingTests).toBe(false);
    // The working tree's file (src/**, passingTests: true) was not read.
    expect(readFileSync(fx.path(CONFIGURATION_PATH), 'utf8')).toContain('src/**');
  });

  it('each base commit gives its own configuration (C001-TS-477)', async () => {
    expect(readable(await load(commits.none!)).settings.clearing.generatedFiles).toEqual([]);
    expect(readable(await load(commits.generated!)).settings.clearing.generatedFiles).toEqual([
      'src/api/generated/**',
    ]);
  });

  it('ignores a weakening setting with a notice while adding settings apply (C001-TS-475)', async () => {
    const c = readable(await load(commits.weakening!));
    expect(c.ignoredSettings).toEqual(['/clearing/builtinGuardedAreas/public-api']);
    expect(c.notices).toEqual([
      {
        code: 'ERR-CFG-002',
        subject: '/clearing/builtinGuardedAreas/public-api',
        message:
          'Ignored setting "/clearing/builtinGuardedAreas/public-api": built-in guarded areas cannot be removed or narrowed.',
      },
    ]);
    expect(c.settings.clearing.guardedAreas.map((a) => a.id)).toEqual([
      'security-auth',
      'data-migration',
      'dependency-build-config',
      'public-api',
      'billing',
    ]);
    expect(triageConfiguration(c)).toEqual({
      readable: true,
      ignoredSettings: ['/clearing/builtinGuardedAreas/public-api'],
    });
    expect(clearingAllowed(c)).toBe(true);
  });

  it('a syntax error makes the configuration unreadable with ERR-CFG-001 naming the line', async () => {
    const c = await load(commits.syntax!);
    expect(c.readable).toBe(false);
    if (c.readable) return;
    expect(c.error.code).toBe('ERR-CFG-001');
    expect(c.error.cause).toMatch(/line 3/);
    expect(c.source).toMatchObject({ default: false, readable: false });
    expect(c.notices).toHaveLength(1);
    expect(c.notices[0]!.message).toBe(
      `The review configuration ".sdd-review/config.json" at base commit ${commits.syntax} cannot be read: ${c.error.cause}. No hunk is cleared and no model provider is used in this review.`,
    );
    expect(clearingAllowed(c)).toBe(false);
    expect(configuredProvider(c)).toBeNull();
    expect(triageConfiguration(c)).toEqual({ readable: false, ignoredSettings: [] });
  });

  it('a foreign credential-store service gives ERR-CFG-004 in place of ERR-CFG-001 (C001-TS-859, C001-TS-860)', async () => {
    const c = await load(commits.foreign!);
    expect(c.readable).toBe(false);
    if (c.readable) return;
    expect(c.error.code).toBe('ERR-CFG-004');
    expect(c.notices.map((n) => n.code)).toEqual(['ERR-CFG-002', 'ERR-CFG-004']);
    expect(c.notices[1]!.message).toContain('credential-store service "git:https://github.com"');
    expect(c.notices[1]!.message).toContain(`at base commit ${commits.foreign}`);
    expect(configuredProvider(c)).toBeNull();
    expect(clearingAllowed(c)).toBe(false);
  });

  it('an accepted service keeps the provider (C001-TS-858)', async () => {
    const c = readable(await load(commits.provider!));
    expect(configuredProvider(c)).toEqual({
      name: 'local',
      api: 'openai-chat',
      endpoint: 'http://localhost:11434/v1',
      model: 'm',
      keyEnv: null,
      keyCredential: { service: 'sdd-review', account: 'local' },
      responseFormat: 'json-schema',
      maxOutputTokens: 4096,
    });
  });

  it('a git failure while reading makes the configuration unreadable', async () => {
    const failing = { readBlob: () => Promise.reject(new Error('object missing')) };
    const c = await loadReviewConfiguration({ git: failing }, commits.none!);
    expect(c).toMatchObject({
      readable: false,
      error: { code: 'ERR-CFG-001', cause: 'object missing' },
    });
  });

  it('logs every notice with operation, inputs and cause (NFR-D-04)', () => {
    const lines = readFileSync(logFile, 'utf8')
      .trim()
      .split('\n')
      .map(
        (l) =>
          JSON.parse(l) as {
            code: string;
            operation: string;
            inputs: Record<string, unknown>;
            cause: string;
          },
      );
    const codes = new Set(lines.map((l) => l.code));
    expect(codes).toEqual(new Set(['ERR-CFG-001', 'ERR-CFG-002', 'ERR-CFG-004']));
    for (const line of lines) {
      expect(line.operation).toBe('load-configuration');
      expect(line.inputs.path).toBe(CONFIGURATION_PATH);
      expect(line.inputs.commit).toMatch(/^[0-9a-f]{40}$/);
      expect(line.cause).not.toBe('');
    }
  });
});
