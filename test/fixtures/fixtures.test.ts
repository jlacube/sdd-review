import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FixtureRepo } from './builder/fixture-repo.js';
import { buildFxIntake } from './repos/fx-intake.js';
import { StubLlm } from '../acceptance/support/stub-llm/stub-llm.js';
import { HEADLESS_FILES, HeadlessOutput } from '../acceptance/support/headless-output.js';
import { parseArgs, scenarioNamePattern, statusOf } from '../../scripts/acceptance.mjs';
import { extractFeatures } from '../../scripts/extract-features.mjs';

const toDispose: FixtureRepo[] = [];
const track = (r: FixtureRepo) => (toDispose.push(r), r);
afterEach(() => toDispose.splice(0).forEach((r) => r.dispose()));

describe('fixture repository builder', () => {
  it('records hash and subject per label', () => {
    const repo = track(buildFxIntake());
    const c1 = repo.commit('C1', { subject: 'C1: change', files: { 'src/a.ts': 'a\n' } });
    expect(repo.label('B0').hash).toMatch(/^[0-9a-f]{40}$/);
    expect(repo.git('rev-parse', 'HEAD')).toBe(c1.hash);
    expect(repo.git('log', '-1', '--format=%s', repo.label('B0').hash)).toBe('B0: base');
    expect(repo.recordedLabels.map((l) => l.label)).toEqual(['B0', 'C1']);
    expect(() => repo.label('Z9')).toThrow(/no commit labelled/);
  });

  it('builds working-tree edits, renames and ignore rules', () => {
    const repo = track(buildFxIntake());
    repo.moveInWorkingTree('src/util.ts', 'src/helpers.ts').remove('src/legacy.ts');
    repo.ignore('dist/').attribute('*.bin -text');
    const status = repo.git('status', '--porcelain');
    expect(status).toContain('src/helpers.ts');
    expect(status).toContain('D src/legacy.ts');
    expect(repo.read('.gitignore')).toBe('dist/\n');
  });

  it('starts from an empty repository by default', () => {
    const repo = track(FixtureRepo.create());
    expect(() => repo.git('rev-parse', '--verify', 'HEAD')).toThrow();
  });

  it('starts from a base repository at its recorded commit with files on top', () => {
    const base = track(buildFxIntake());
    const baseHash = base.label('B0').hash;
    base.commit('B1', { files: { 'src/later.ts': 'x\n' } });
    const repo = track(FixtureRepo.create({ base: { repository: base.dir, commit: baseHash } }));
    expect(repo.git('rev-parse', 'HEAD')).toBe(baseHash);
    expect(repo.read('src/cart.ts')).toContain('cart');
    const c = repo.commit('D1', { files: { 'src/declared.ts': 'd\n' } });
    expect(repo.git('rev-parse', 'HEAD')).toBe(c.hash);
    expect(repo.read('src/declared.ts')).toBe('d\n');
  });

  it('fails with a clear message while the benchmark set does not exist', () => {
    expect(() => FixtureRepo.baseFromBenchmarkSet('typescript', 'no/such/file.json')).toThrow(
      /does not exist yet \(C001-T-013 writes it\)/,
    );
  });

  it('puts a chosen git first on PATH and clears repository-locating variables', () => {
    const bin = mkdtempSync(join(tmpdir(), 'gitbin-'));
    process.env.GIT_DIR = 'bogus';
    try {
      const repo = track(FixtureRepo.create({ gitBinDir: bin }));
      const env = repo.env();
      expect(env.PATH?.startsWith(bin)).toBe(true);
      expect(env.GIT_DIR).toBeUndefined();
    } finally {
      delete process.env.GIT_DIR;
    }
  });
});

describe('stub-llm', () => {
  it('records every request and answers in both provider shapes', async () => {
    const stub = new StubLlm();
    await stub.start();
    try {
      stub
        .enqueue({ output: { ok: 1 } })
        .enqueue({ output: { ok: 2 } })
        .enqueue({ status: 429 });
      const openai = await fetch(`${stub.endpoint}/v1/chat/completions`, {
        method: 'POST',
        body: JSON.stringify({ model: 'stub-model-1', messages: [] }),
      });
      const o = (await openai.json()) as {
        model: string;
        choices: { message: { content: string } }[];
      };
      expect(o.model).toBe('stub-model-1');
      expect(JSON.parse(o.choices[0]!.message.content)).toEqual({ ok: 1 });

      const anth = await fetch(`${stub.endpoint}/v1/messages`, {
        method: 'POST',
        body: JSON.stringify({ model: 'stub-model-1' }),
      });
      const a = (await anth.json()) as { content: { name: string; input: unknown }[] };
      expect(a.content[0]).toMatchObject({ name: 'submit_result', input: { ok: 2 } });

      const failing = await fetch(`${stub.endpoint}/v1/chat/completions`, {
        method: 'POST',
        body: '{}',
      });
      expect(failing.status).toBe(429);

      expect(stub.requests).toHaveLength(3);
      expect(stub.requests[0]).toMatchObject({ method: 'POST', path: '/v1/chat/completions' });
    } finally {
      await stub.stop();
    }
  });
});

describe('headless output reader', () => {
  it('lists the missing result files', () => {
    const out = new HeadlessOutput(mkdtempSync(join(tmpdir(), 'hl-')));
    expect(out.missing()).toEqual([...HEADLESS_FILES]);
  });
});

describe('scenario selection', () => {
  it('maps scenario IDs to name filters and parses options', () => {
    expect(scenarioNamePattern('C001-TS-101')).toBe('^C001-TS-101( |$)');
    expect(scenarioNamePattern('TS-926')).toBe('^C001-TS-926( |$)');
    expect(
      parseArgs(['--scenario', 'TS-1', '--scenario', 'TS-2', '--repo', 'python']),
    ).toMatchObject({
      scenarios: ['TS-1', 'TS-2'],
      repos: ['python'],
    });
  });

  it('extracts every Gherkin block of the acceptance files and finds C001-TS-101', () => {
    const out = mkdtempSync(join(tmpdir(), 'feat-'));
    const written = extractFeatures(out);
    expect(written).toHaveLength(9);
    expect(
      written.reduce((n: number, w: { scenarios: number }) => n + w.scenarios, 0),
    ).toBeGreaterThan(600);
  });

  it('reports passed, failed and undefined per scenario', () => {
    const feature = (name: string, statuses: string[]) => ({
      elements: [
        { type: 'scenario', name, steps: statuses.map((status) => ({ result: { status } })) },
      ],
    });
    expect(
      statusOf([
        feature('a', ['passed']),
        feature('b', ['passed', 'failed']),
        feature('c', ['undefined']),
      ]),
    ).toEqual([
      { name: 'a', status: 'passed' },
      { name: 'b', status: 'failed' },
      { name: 'c', status: 'undefined' },
    ]);
  });
});
