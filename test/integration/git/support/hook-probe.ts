// Run by the `pre-commit` hook that hook-environment.test.ts installs: it calls the git access
// adapter the way a review started from a hook would, and writes what it saw to a file.
// Usage: node --import tsx hook-probe.ts <output file> <git program>
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { REMOVED_GIT_VARIABLES } from '../../../../src/core/git/environment.js';
import { GitProcessRunner } from '../../../../src/core/git/process.js';

const [out, gitPath] = process.argv.slice(2) as [string, string];
const runner = new GitProcessRunner({ gitPath });

// G-01: the repository is found from the directory, not through the variables.
const found = await runner.run('rev-parse', ['--show-toplevel', '--git-dir'], {
  target: { discoverFrom: process.cwd() },
});
const [workTree, gitDir] = found.stdout.toString('utf8').trim().split('\n') as [string, string];
const target = { gitDir: resolve(process.cwd(), gitDir), workTree };

const ls = await runner.run('ls-files', ['-s', '-z'], { target });
const head = await runner.run('rev-parse', ['HEAD'], { target });
const batch = runner.batch(target);
const blob = await batch.read('HEAD:src/cart.ts');
await batch.close();

// What a plain git command of this hook would read: the temporary index.
const raw = execFileSync(gitPath, ['ls-files', '-s', '-z'], { cwd: process.cwd() });

writeFileSync(
  out,
  JSON.stringify({
    present: REMOVED_GIT_VARIABLES.filter((n) => process.env[n] !== undefined),
    indexFile: process.env.GIT_INDEX_FILE ?? null,
    adapterIndex: ls.stdout.toString('latin1'),
    rawIndex: raw.toString('latin1'),
    head: head.stdout.toString('utf8').trim(),
    blob: blob?.content.toString('utf8') ?? null,
    status: [found.status, ls.status, head.status],
  }),
);
