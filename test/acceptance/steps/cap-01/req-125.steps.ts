import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Given, Then } from '@cucumber/cucumber';
import type { AcceptanceWorld } from '../../support/world.js';

// C001-TC-125: C001-TS-165, C001-TS-166 (C001-REQ-125). TS-162 to TS-164 and TS-178 are bound by
// the task that builds the commands they run (C001-T-010).

const configBefore = new WeakMap<AcceptanceWorld, string>();
const fileBefore = new WeakMap<AcceptanceWorld, string>();

const output = (w: AcceptanceWorld) => `${w.lastRun?.stderr ?? ''}${w.lastRun?.stdout ?? ''}`;

function hashOf(path: string): string {
  return existsSync(path)
    ? createHash('sha256').update(readFileSync(path)).digest('hex')
    : 'absent';
}

/** The global and the system git configuration, as git lists it, and the user files by hash. */
function userAndSystemConfig(): string {
  const list = (scope: string) => {
    try {
      return execFileSync('git', ['config', scope, '--list', '--show-origin'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    } catch {
      return '';
    }
  };
  const files = [join(homedir(), '.gitconfig'), join(homedir(), '.config', 'git', 'config')];
  return [list('--global'), list('--system'), ...files.map(hashOf)].join('\n--\n');
}

Given(
  'the fixture repository {string} whose working-tree root and git directory are owned by another operating-system user than the developer',
  function (this: AcceptanceWorld, name: string) {
    const repo = this.fixture(name);
    // Changing the owner needs the privilege of the super-user (POSIX); on Windows it needs another
    // account. Without it the precondition cannot be built, so the scenario is pending, not passed.
    if (process.platform === 'win32' || process.getuid?.() !== 0) {
      return 'pending';
    }
    execFileSync('chown', ['-R', '65534:65534', repo.dir]);
    return undefined;
  },
);

Given(
  /^neither the developer's global nor the system git configuration holds a `safe\.directory` entry, and the environment sets no git configuration variable$/,
  function (this: AcceptanceWorld) {
    assert.ok(!userAndSystemConfig().includes('safe.directory'), 'a safe.directory entry exists');
    for (const name of Object.keys(process.env)) {
      assert.ok(
        !/^GIT_CONFIG(_|$)/i.test(name),
        `the environment sets ${name}; the scenario needs none`,
      );
    }
    configBefore.set(this, userAndSystemConfig());
  },
);

Then(
  /^the error message names the path of "fx-intake", the version 2\.45\.1 and git's first error line, which reports the ownership of the repository$/,
  function (this: AcceptanceWorld) {
    const text = output(this);
    assert.ok(text.includes(this.repo!.dir), 'the message does not name the repository path');
    assert.ok(text.includes('2.45.1'), 'the message does not name git 2.45.1');
    assert.match(text, /dubious ownership|owned by someone else/);
  },
);

Then(
  /^the developer's global and system git configurations are byte-identical to their content before the review was started$/,
  function (this: AcceptanceWorld) {
    assert.equal(userAndSystemConfig(), configBefore.get(this));
  },
);

Given(
  'the fixture repository {string} whose git configuration sets `core.repositoryformatversion` to {int} and `extensions.futureformat` to {string}, an extension unknown to git 2.45.1',
  function (this: AcceptanceWorld, name: string, version: number, value: string) {
    const repo = this.fixture(name);
    repo.setConfig('core.repositoryformatversion', String(version));
    repo.setConfig('extensions.futureformat', value);
    fileBefore.set(this, hashOf(repo.path('.git/config')));
  },
);

Then(
  /^the error message contains git's first error line, which names "futureformat"$/,
  function (this: AcceptanceWorld) {
    assert.match(output(this), /fatal: unknown repository extension.*futureformat/);
  },
);

Then(
  /^the git configuration of "fx-intake" is byte-identical to its content before the review was started$/,
  function (this: AcceptanceWorld) {
    assert.equal(hashOf(this.repo!.path('.git/config')), fileBefore.get(this));
  },
);
