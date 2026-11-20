import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { After, setWorldConstructor, World } from '@cucumber/cucumber';
import { FixtureRepo } from '../../fixtures/builder/fixture-repo.js';
import { NAMED_FIXTURES } from '../../fixtures/repos/fx-intake.js';
import { HeadlessOutput } from './headless-output.js';
import { StubLlm } from './stub-llm/stub-llm.js';

const CLI = resolve('dist/cli/main.js');

export interface CliResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/** State of one scenario: its fixture repository, the CLI run and the stub provider. */
export class AcceptanceWorld extends World {
  repo: FixtureRepo | undefined;
  stub: StubLlm | undefined;
  lastRun: CliResult | undefined;
  headless: HeadlessOutput | undefined;
  private readonly scratch: string[] = [];

  /** Builds a named fixture, on the base repository of `--repo <ecosystem>` when one is given. */
  fixture(name: string): FixtureRepo {
    const build = NAMED_FIXTURES[name];
    if (!build) throw new Error(`fixture "${name}" is not automated yet`);
    const ecosystem = (process.env.SDD_ACCEPT_REPOS ?? '').split(',').filter(Boolean)[0];
    this.repo = build(ecosystem ? { base: FixtureRepo.baseFromBenchmarkSet(ecosystem) } : {});
    return this.repo;
  }

  tempDir(prefix = 'sddacc-'): string {
    const dir = mkdtempSync(join(tmpdir(), prefix));
    this.scratch.push(dir);
    return dir;
  }

  /** Runs the built CLI in the fixture repository (the system under test). */
  cli(args: string[], cwd = this.repo?.dir): CliResult {
    const r = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });
    this.lastRun = { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
    return this.lastRun;
  }

  async cleanup(): Promise<void> {
    await this.stub?.stop();
    this.repo?.dispose();
    for (const dir of this.scratch) rmSync(dir, { recursive: true, force: true });
  }
}

setWorldConstructor(AcceptanceWorld);

After(async function (this: AcceptanceWorld) {
  await this.cleanup();
});
