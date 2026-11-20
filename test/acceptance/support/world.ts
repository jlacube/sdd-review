import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { After, setWorldConstructor, World } from '@cucumber/cucumber';
import { FixtureRepo } from '../../fixtures/builder/fixture-repo.js';
import { NAMED_FIXTURES } from '../../fixtures/repos/fx-intake.js';
import { HeadlessOutput } from './headless-output.js';
import { StubLlm } from './stub-llm/stub-llm.js';

const CLI = resolve('dist/cli/main.js');
const INTERRUPT_HOOK = pathToFileURL(resolve('test/acceptance/support/interrupt-hook.mjs')).href;
const LISTEN_SPY = pathToFileURL(resolve('test/acceptance/support/listen-spy.mjs')).href;

export interface CliResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
  /** The signal that ended the process, when one did. */
  readonly signal?: NodeJS.Signals | null;
}

/** A CLI command that keeps running until it is interrupted. */
export interface RunningCli {
  stdout(): string;
  stderr(): string;
  /** Waits until standard output matches; fails when the CLI ends first or on timeout. */
  waitForStdout(pattern: RegExp, timeoutMs?: number): Promise<RegExpExecArray>;
  /** Interrupts the command (the signal of Ctrl+C) and waits for its end. */
  stop(): Promise<CliResult>;
  result: CliResult | undefined;
}

/** State of one scenario: its fixture repository, the CLI run and the stub provider. */
export class AcceptanceWorld extends World {
  repo: FixtureRepo | undefined;
  stub: StubLlm | undefined;
  lastRun: CliResult | undefined;
  headless: HeadlessOutput | undefined;
  private readonly scratch: string[] = [];
  private readonly running: RunningCli[] = [];
  private storeHome: string | undefined;
  private listenLog: string | undefined;

  /** The calls that made a CLI process listen on a socket during this scenario (none expected). */
  listenCalls(): string[] {
    return this.listenLog && existsSync(this.listenLog)
      ? readFileSync(this.listenLog, 'utf8').split('\n').filter(Boolean)
      : [];
  }

  /** The environment of a CLI run: the review state store lies in a folder of this scenario. */
  cliEnv(): NodeJS.ProcessEnv {
    this.storeHome ??= this.tempDir('sddstore-');
    return {
      ...process.env,
      NODE_OPTIONS: '',
      SDD_LISTEN_LOG: (this.listenLog ??= join(this.tempDir('sddlisten-'), 'listen.log')),
      LOCALAPPDATA: this.storeHome,
      XDG_DATA_HOME: this.storeHome,
      HOME: this.storeHome,
      USERPROFILE: this.storeHome,
    };
  }

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
    const r = spawnSync(process.execPath, ['--import', LISTEN_SPY, CLI, ...args], {
      cwd,
      encoding: 'utf8',
      env: this.cliEnv(),
    });
    this.lastRun = { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
    return this.lastRun;
  }

  /**
   * Runs the built CLI and interrupts it (SIGINT, the signal of Ctrl+C) as soon as it has printed
   * its first line of progress, that is, once it is running and before it can have ended. On
   * Windows Node cannot deliver SIGINT to a handler, so `interrupt-hook.mjs` raises the signal
   * event in the child on a message instead.
   */
  cliInterrupted(args: string[], cwd = this.repo?.dir): Promise<CliResult> {
    return new Promise((resolveRun, reject) => {
      const windows = process.platform === 'win32';
      const child = spawn(
        process.execPath,
        ['--import', LISTEN_SPY, ...(windows ? ['--import', INTERRUPT_HOOK] : []), CLI, ...args],
        { cwd, env: this.cliEnv(), stdio: windows ? ['ignore', 'pipe', 'pipe', 'ipc'] : undefined },
      );
      let stdout = '';
      let stderr = '';
      let sent = false;
      child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString('utf8')));
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
        if (!sent && stderr.includes('\n')) {
          sent = true;
          if (windows) child.send('SIGINT');
          else child.kill('SIGINT');
        }
      });
      const timer = setTimeout(() => child.kill('SIGKILL'), 55_000);
      child.on('error', reject);
      child.on('close', (status, signal) => {
        clearTimeout(timer);
        this.lastRun = { status, stdout, stderr, signal };
        resolveRun(this.lastRun);
      });
    });
  }

  /**
   * Starts a long-running CLI command (`review`) and returns a handle to read its output and to
   * stop it with the interrupt signal (see `cliInterrupted` for the Windows mechanism).
   */
  cliStart(args: string[], extraEnv: NodeJS.ProcessEnv = {}, cwd = this.repo?.dir): RunningCli {
    const windows = process.platform === 'win32';
    const child = spawn(
      process.execPath,
      [...(windows ? ['--import', INTERRUPT_HOOK] : []), CLI, ...args],
      {
        cwd,
        env: { ...this.cliEnv(), ...extraEnv },
        stdio: windows ? ['ignore', 'pipe', 'pipe', 'ipc'] : ['ignore', 'pipe', 'pipe'],
      },
    );
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk: Buffer) => (stdout += chunk.toString('utf8')));
    child.stderr?.on('data', (chunk: Buffer) => (stderr += chunk.toString('utf8')));
    const ended = new Promise<CliResult>((resolveRun) => {
      child.on('close', (status, signal) => resolveRun({ status, stdout, stderr, signal }));
    });
    const killer = setTimeout(() => child.kill('SIGKILL'), 120_000);
    void ended.then(() => clearTimeout(killer));
    const running: RunningCli = {
      stdout: () => stdout,
      stderr: () => stderr,
      async waitForStdout(pattern, timeoutMs = 60_000) {
        const started = Date.now();
        for (;;) {
          const match = pattern.exec(stdout);
          if (match) return match;
          if (child.exitCode !== null) {
            throw new Error(
              `the CLI ended (${child.exitCode}) before it printed ${pattern}: ${stderr}`,
            );
          }
          if (Date.now() - started > timeoutMs) {
            throw new Error(`no ${pattern} in: ${stdout}${stderr}`);
          }
          await new Promise((r) => setTimeout(r, 50));
        }
      },
      async stop() {
        if (child.exitCode === null) {
          if (windows) child.send('SIGINT');
          else child.kill('SIGINT');
        }
        this.result = await ended;
        return this.result;
      },
      result: undefined,
    };
    this.running.push(running);
    return running;
  }

  async cleanup(): Promise<void> {
    for (const run of this.running) if (!run.result) await run.stop().catch(() => undefined);
    await this.stub?.stop();
    this.repo?.dispose();
    for (const dir of this.scratch) rmSync(dir, { recursive: true, force: true });
  }
}

setWorldConstructor(AcceptanceWorld);

After(async function (this: AcceptanceWorld) {
  await this.cleanup();
});
