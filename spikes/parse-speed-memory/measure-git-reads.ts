// Times G-07 (changeAgainst) and G-09 (attributeLines) of the git adapter on a large fixture:
// 500,000 lines of code in 2,500 files, a change of about 10,000 changed lines over 300 files
// (100 files edited in each of two commits, 100 edited in the working tree). Input for C001-T-014.
// Usage: npx tsx spikes/parse-speed-memory/measure-git-reads.ts [runs]
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { cpus, platform, release, tmpdir, totalmem } from 'node:os';
import { dirname, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { GitAdapter } from '../../src/core/git/operations.js';

const FILES = 2500;
const LINES = 200;
const EDIT_LINES = 33;
const runs = Number(process.argv[2] ?? 3);

const dir = mkdtempSync(join(tmpdir(), 'sddperf-'));
const env = {
  ...process.env,
  GIT_AUTHOR_NAME: 'Perf',
  GIT_AUTHOR_EMAIL: 'perf@example.test',
  GIT_COMMITTER_NAME: 'Perf',
  GIT_COMMITTER_EMAIL: 'perf@example.test',
};
const git = (...args: string[]) =>
  execFileSync('git', args, {
    cwd: dir,
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
const pathOf = (i: number) => `pkg${i % 250}/mod${Math.floor(i / 250)}/file${i}.ts`;
const body = (i: number) =>
  Array.from(
    { length: LINES },
    (_, l) => `export const v${i}_${l} = (x: number) => x * ${l} + ${i};\n`,
  ).join('');
const extra = (i: number, tag: string) =>
  Array.from({ length: EDIT_LINES }, (_, l) => `export const ${tag}${i}_${l} = ${l};\n`).join('');
const write = (i: number, content: string) => {
  const p = join(dir, pathOf(i));
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
};

const ms = (t: number) => Math.round(t);
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

try {
  git('init', '-q', '-b', 'main');
  git('config', 'core.autocrlf', 'false');
  for (let i = 0; i < FILES; i++) write(i, body(i));
  git('add', '-A');
  git('commit', '-q', '-m', 'base');
  const base = git('rev-parse', 'HEAD');
  for (const [tag, from] of [
    ['c1', 0],
    ['c2', 100],
  ] as const) {
    for (let i = from; i < from + 100; i++) write(i, body(i) + extra(i, tag));
    git('add', '-A');
    git('commit', '-q', '-m', tag);
  }
  for (let i = 200; i < 300; i++) write(i, body(i) + extra(i, 'wt'));
  const head = git('rev-parse', 'HEAD');

  const adapter = new GitAdapter();
  await adapter.discover(dir);
  const g07: number[] = [];
  let changed = 0;
  for (let r = 0; r < runs; r++) {
    const t = performance.now();
    changed = (await adapter.changeAgainst(base)).length;
    g07.push(performance.now() - t);
  }
  const paths = Array.from({ length: 300 }, (_, i) => pathOf(i));
  const g09All: number[] = [];
  let addedLines = 0;
  for (let r = 0; r < runs; r++) {
    const per: number[] = [];
    const t = performance.now();
    addedLines = 0;
    for (const p of paths) {
      const s = performance.now();
      addedLines += (await adapter.attributeLines(base, head, p)).added.length;
      per.push(performance.now() - s);
    }
    g09All.push(performance.now() - t);
    if (r === 0)
      console.log(`G-09 per file: median ${ms(median(per))} ms, max ${ms(Math.max(...per))} ms`);
  }
  await adapter.close();
  console.log(
    JSON.stringify(
      {
        host: {
          platform: platform(),
          release: release(),
          cpu: cpus()[0]?.model,
          cores: cpus().length,
          memGiB: Math.round(totalmem() / 2 ** 30),
          node: process.version,
          git: git('--version'),
        },
        fixture: { files: FILES, lines: FILES * LINES, changedFiles: changed, addedLines },
        runs,
        g07Ms: g07.map(ms),
        g09TotalMs: g09All.map(ms),
      },
      null,
      2,
    ),
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}
