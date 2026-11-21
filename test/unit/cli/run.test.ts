import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { FixtureRepo } from '../../fixtures/builder/fixture-repo.js';
import { buildFxIntake } from '../../fixtures/repos/fx-intake.js';
import { HEADLESS_FILES } from '../../acceptance/support/headless-output.js';
import { FILE_DEFINITIONS, schemaValidator } from '../../support/schemas.js';
import { run } from '../../../src/cli/run.js';
import type { CliIo } from '../../../src/cli/io.js';

// C001-IF-001 through the real command runner over a real fixture repository: the headless output
// files, and every exit code that a real command can reach (the rest: exit-codes.test.ts).

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const scratch: string[] = [];
const temp = (label: string) => {
  const dir = mkdtempSync(join(tmpdir(), `sddcli-${label}-`));
  scratch.push(dir);
  return dir;
};

interface Result {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

describe('CLI commands over a fixture repository', () => {
  let fx: FixtureRepo;
  let clean: FixtureRepo;
  let store: string;

  beforeAll(() => {
    fx = buildFxIntake();
    fx.write('src/cart.ts', `${fx.read('src/cart.ts')}// edited\n`);
    clean = buildFxIntake();
    store = temp('store');
    vi.stubEnv('HOME', store);
    vi.stubEnv('USERPROFILE', store);
    vi.stubEnv('LOCALAPPDATA', store);
    vi.stubEnv('XDG_DATA_HOME', store);
  });
  afterAll(() => {
    fx.dispose();
    clean.dispose();
    vi.unstubAllEnvs();
  });
  afterEach(() => undefined);
  afterAll(() => {
    for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  async function cli(
    args: string[],
    cwd: string,
    options: { signal?: AbortSignal; env?: NodeJS.ProcessEnv } = {},
  ): Promise<Result> {
    let stdout = '';
    let stderr = '';
    const io: CliIo = {
      stdout: { write: (t) => (stdout += t) },
      stderr: { write: (t) => (stderr += t) },
      cwd,
      env: options.env ?? process.env,
      signal: options.signal ?? new AbortController().signal,
    };
    return { status: await run(args, io), stdout, stderr };
  }

  it('analyse --headless writes the six files, each valid against its schema, and exits 0', async () => {
    const out = join(temp('out'), 'review');
    const result = await cli(['analyse', '--headless', '--out', out], fx.dir);
    expect(result.status).toBe(0);
    expect(readdirSync(out).sort()).toEqual([...HEADLESS_FILES].sort());
    const validator = schemaValidator();
    for (const [file, definition] of Object.entries(FILE_DEFINITIONS)) {
      const document: unknown = JSON.parse(readFileSync(join(out, file), 'utf8'));
      expect(validator.document(definition, document), file).toEqual([]);
    }
    const lines = readFileSync(join(out, 'review-record.jsonl'), 'utf8')
      .split('\n')
      .filter(Boolean);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) expect(validator.recordLine(JSON.parse(line) as unknown)).toEqual([]);
    expect(result.stdout).toContain('Changed files: 1');
    expect(result.stdout).toContain('Results written to');
    expect(result.stderr).not.toMatch(/ERR-/);
  });

  it('prints the intake summary as JSON with --format json', async () => {
    const out = temp('out');
    const result = await cli(['analyse', '--headless', '--out', out, '--format', 'json'], fx.dir);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ changedFiles: 1 });
  });

  it('gives equal architecture delta, intent map and triage files on two runs of one snapshot', async () => {
    const a = temp('a');
    const b = temp('b');
    expect((await cli(['analyse', '--headless', '--out', a], fx.dir)).status).toBe(0);
    expect((await cli(['analyse', '--headless', '--out', b], fx.dir)).status).toBe(0);
    for (const file of ['architecture-delta.json', 'intent-map.json', 'triage.json']) {
      expect(readFileSync(join(b, file), 'utf8')).toBe(readFileSync(join(a, file), 'utf8'));
    }
  });

  it('flags the analyses that do not exist yet in the labels of the documents', async () => {
    const out = temp('out');
    await cli(['analyse', '--headless', '--out', out], fx.dir);
    const delta = JSON.parse(readFileSync(join(out, 'architecture-delta.json'), 'utf8')) as {
      labels: { reduced: string[] };
    };
    expect(delta.labels.reduced).toEqual(['architecture delta: not yet analysed']);
  });

  it('replaces the files of the output directory and leaves other files alone', async () => {
    const out = temp('out');
    writeFileSync(join(out, 'intake.json'), 'old');
    writeFileSync(join(out, 'notes.txt'), 'keep');
    expect((await cli(['analyse', '--headless', '--out', out], fx.dir)).status).toBe(0);
    expect(readFileSync(join(out, 'intake.json'), 'utf8')).not.toBe('old');
    expect(readFileSync(join(out, 'notes.txt'), 'utf8')).toBe('keep');
    expect(readdirSync(out).filter((n) => n.endsWith('.tmp'))).toEqual([]);
  });

  it('works on the repository named with --repo from another directory', async () => {
    const out = temp('out');
    const elsewhere = temp('elsewhere');
    const result = await cli(['--repo', fx.dir, 'analyse', '--headless', '--out', out], elsewhere);
    expect(result.status).toBe(0);
  });

  describe('exit codes of real commands', () => {
    it('1: a command whose operation is built by a later task says which task', async () => {
      for (const [args, task] of [
        [['status'], 'C001-T-082'],
        [['intents'], 'C001-T-082'],
        [['sign', 'REQ-1'], 'C001-T-082'],
        [['reject', 'REQ-1', '--reason', 'x'], 'C001-T-082'],
        [['defer', 'REQ-1', '--note', 'x'], 'C001-T-082'],
      ] as const) {
        const r = await cli([...args], fx.dir);
        expect(r.status, args.join(' ')).toBe(1);
        expect(r.stderr).toContain(task);
      }
    });

    it('5: open of an unknown snapshot, or with no review to default to (ERR-STORE-004)', async () => {
      const unknown = `s-${'f'.repeat(64)}`;
      const named = await cli(['open', unknown, '--no-browser'], fx.dir);
      expect(named.status).toBe(5);
      expect(named.stderr).toContain(
        `ERR-STORE-004: No review of snapshot "${unknown}" in this repository.`,
      );
      const none = await cli(['open', '--no-browser'], clean.dir);
      expect(none.status).toBe(5);
      expect(none.stderr).toMatch(/^ERR-STORE-004: /m);
      expect(named.stdout + none.stdout).toBe('');
    });

    it('2: an unknown command, an unknown option and a missing argument', async () => {
      for (const args of [
        ['revew'],
        ['analyse', '--headless', '--bogus'],
        ['analyse', '--headless', '--out'],
      ]) {
        const result = await cli(args, fx.dir);
        expect(result.status, args.join(' ')).toBe(2);
        expect(result.stderr).toMatch(/^ERR-CLI-001: .*Run `sdd-review --help`\.\n$/m);
        expect(result.stdout).toBe('');
      }
    });

    it('3: a directory outside every git working tree', async () => {
      const result = await cli(['review', '--no-browser'], temp('plain'));
      expect(result.status).toBe(3);
      expect(result.stderr).toMatch(/^ERR-INTAKE-001: /m);
    });

    it('3: a repository directory that does not exist', async () => {
      const result = await cli(['--repo', join(temp('plain'), 'missing'), 'reviews'], fx.dir);
      expect(result.status).toBe(3);
      expect(result.stderr).toMatch(/^ERR-INTAKE-001: /m);
    });

    it('3: a named value that is shaped as a command option is data, refused as a commit', async () => {
      const out = join(temp('out'), 'o');
      const result = await cli(
        ['analyse', '--headless', '--out', out, '--base', '--output=pwned.txt'],
        fx.dir,
      );
      expect(result.status).toBe(3);
      expect(result.stderr).toContain('ERR-INTAKE-003');
      expect(result.stderr).toContain('--output=pwned.txt');
      expect(existsSync(out)).toBe(false);
      expect(existsSync(join(fx.dir, 'pwned.txt'))).toBe(false);
    });

    it('3: no usable git program, before any git read (ERR-INTAKE-008)', async () => {
      const empty = temp('nogit');
      const env: NodeJS.ProcessEnv = { ...process.env, PATH: empty, Path: empty };
      for (const command of [['reviews'], ['analyse', '--headless', '--out', temp('out')]]) {
        const result = await cli(command, fx.dir, { env });
        expect(result.status, command.join(' ')).toBe(3);
        expect(result.stderr).toMatch(/^ERR-INTAKE-008: /m);
      }
    });

    it('4: an empty change writes no file', async () => {
      const out = join(temp('out'), 'o');
      const result = await cli(['analyse', '--headless', '--out', out], clean.dir);
      expect(result.status).toBe(4);
      expect(result.stderr).toMatch(/^ERR-INTAKE-005: /m);
      expect(existsSync(out)).toBe(false);
    });

    it('7: an output path that is an existing file', async () => {
      const dir = temp('out');
      const file = join(dir, 'review');
      writeFileSync(file, 'a file');
      const result = await cli(['analyse', '--headless', '--out', file], fx.dir);
      expect(result.status).toBe(7);
      expect(result.stderr).toMatch(/^ERR-CLI-002: Cannot write results to /m);
      expect(readFileSync(file, 'utf8')).toBe('a file');
    });

    it('7: a command that cannot write every file removes the files it wrote', async () => {
      const out = temp('out');
      // A directory where a result file belongs: the third file cannot be placed.
      mkdirSync(join(out, 'intent-map.json'));
      writeFileSync(join(out, 'notes.txt'), 'keep');
      const result = await cli(['analyse', '--headless', '--out', out], fx.dir);
      expect(result.status).toBe(7);
      expect(result.stderr).toMatch(/^ERR-CLI-002: /m);
      expect(readdirSync(out).sort()).toEqual(['intent-map.json', 'notes.txt']);
    });

    it('7: an interrupted headless run writes nothing and does not exit 0', async () => {
      const out = join(temp('out'), 'o');
      const controller = new AbortController();
      controller.abort();
      const result = await cli(['analyse', '--headless', '--out', out], fx.dir, {
        signal: controller.signal,
      });
      expect(result.status).toBe(7);
      expect(result.stderr).toContain('interrupted');
      expect(existsSync(out)).toBe(false);
    });
  });

  describe('reviews and open (C001-T-034)', () => {
    it('reviews lists every review with base, HEAD, times and record path; earlier snapshots stay', async () => {
      const empty = await cli(['reviews'], clean.dir);
      expect(empty).toMatchObject({ status: 0, stdout: 'No reviews in this repository.\n' });
      expect(JSON.parse((await cli(['reviews', '--format', 'json'], clean.dir)).stdout)).toEqual(
        [],
      );

      const repo = buildFxIntake();
      try {
        repo.write('src/util.ts', `${repo.read('src/util.ts')}// one\n`);
        expect((await cli(['analyse', '--headless', '--out', temp('o1')], repo.dir)).status).toBe(
          0,
        );
        repo.write('src/util.ts', `${repo.read('src/util.ts')}// two\n`);
        expect((await cli(['analyse', '--headless', '--out', temp('o2')], repo.dir)).status).toBe(
          0,
        );
        const json = await cli(['reviews', '--format', 'json'], repo.dir);
        expect(json.status).toBe(0);
        const listed = JSON.parse(json.stdout) as Array<Record<string, string | null>>;
        expect(listed).toHaveLength(2);
        const head = repo.git('rev-parse', 'HEAD').trim();
        for (const review of listed) {
          expect(review).toMatchObject({
            baseCommit: head,
            headCommit: head,
            decisionStatus: null,
          });
          expect(review.snapshotId).toMatch(/^s-[0-9a-f]{64}$/);
          expect(existsSync(review.recordFile as string)).toBe(true);
          expect(readFileSync(review.recordFile as string, 'utf8')).toContain(review.snapshotId);
        }
        const text = await cli(['reviews'], repo.dir);
        expect(text.status).toBe(0);
        for (const review of listed) {
          expect(text.stdout).toContain(`Snapshot: ${review.snapshotId}`);
          expect(text.stdout).toContain(`Review record: ${review.recordFile}`);
        }
        expect(text.stderr).toBe('');
      } finally {
        repo.dispose();
      }
    });

    it('open reopens the most recent review without intake, serves it and exits 0 when stopped', async () => {
      const repo = buildFxIntake();
      try {
        repo.write('src/order.ts', `${repo.read('src/order.ts')}// open\n`);
        expect((await cli(['analyse', '--headless', '--out', temp('o')], repo.dir)).status).toBe(0);
        const [review] = JSON.parse(
          (await cli(['reviews', '--format', 'json'], repo.dir)).stdout,
        ) as Array<{
          snapshotId: string;
          lastOpenedAt: string;
        }>;
        // An edit after the review: `open` takes nothing in, so the snapshot stays the same.
        repo.write('src/order.ts', `${repo.read('src/order.ts')}// later\n`);
        const controller = new AbortController();
        let stdout = '';
        let stderr = '';
        const io: CliIo = {
          stdout: {
            write: (t) => {
              stdout += t;
              if (stdout.includes('Review address:')) controller.abort();
            },
          },
          stderr: { write: (t) => (stderr += t) },
          cwd: repo.dir,
          env: process.env,
          signal: controller.signal,
        };
        const status = await run(['open', '--no-browser'], io);
        expect(status, stderr).toBe(0);
        expect(stdout).toContain(`Snapshot: ${review!.snapshotId}`);
        expect(stdout).toMatch(/Review address: http:\/\/127\.0\.0\.1:\d+\//);
        // The edit after the review raises the moved-on notice when it is resumed (C001-REQ-117).
        expect(stderr).toContain(
          `ERR-INTAKE-007: The working tree has moved on since snapshot ${review!.snapshotId}: 1 files differ (src/order.ts).`,
        );
        const after = JSON.parse(
          (await cli(['reviews', '--format', 'json'], repo.dir)).stdout,
        ) as Array<{
          snapshotId: string;
          lastOpenedAt: string;
        }>;
        expect(after.map((r) => r.snapshotId)).toEqual([review!.snapshotId]);
        expect(after[0]!.lastOpenedAt >= review!.lastOpenedAt).toBe(true);
      } finally {
        repo.dispose();
      }
    });
  });

  it('--version and --help need no repository', async () => {
    const outside = temp('plain');
    const version = await cli(['--version'], outside);
    expect(version).toMatchObject({ status: 0 });
    expect(version.stdout).toMatch(/^\d+\.\d+\.\d+\n$/);
    const help = await cli(['--help'], outside);
    expect(help.status).toBe(0);
    expect(help.stdout).toContain('sdd-review analyse --headless --out <directory>');
  });
});
