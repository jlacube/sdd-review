import { spawn } from 'node:child_process';
import { cpus, platform, release, totalmem } from 'node:os';
import { createInterface } from 'node:readline';
import { MemorySampler, type MemoryStats, type ProcessSource } from './sampler.js';

/** A line `@@bench-phase <name>` on the output of a measured command starts a named phase. */
export const PHASE_MARKER = '@@bench-phase ';

export interface PhaseRecord {
  name: string;
  /** Milliseconds from the start of the run. */
  startMs: number;
  durationMs: number;
}

export interface RunReport {
  schema: 'sdd-review-bench-run/1';
  name: string;
  startedAt: string;
  host: {
    os: string;
    release: string;
    cpu: string;
    logicalCpus: number;
    totalMemBytes: number;
    node: string;
  };
  /** Wall-clock time of the whole run, in milliseconds. */
  wallClockMs: number;
  phases: PhaseRecord[];
  memory: MemoryStats;
  command: null | {
    command: string;
    args: string[];
    cwd: string;
    exitCode: number | null;
    signal: string | null;
    outputTail: string;
  };
  /** What the memory figure covers. */
  memoryScope: string;
}

export function hostInfo(): RunReport['host'] {
  const cpu = cpus();
  return {
    os: platform(),
    release: release(),
    cpu: cpu[0]?.model.trim() ?? 'unknown',
    logicalCpus: cpu.length,
    totalMemBytes: totalmem(),
    node: process.version,
  };
}

export interface BenchRunOptions {
  name: string;
  /** Roots of the measured process tree; the current process by default. */
  rootPids?: number[] | (() => number[]);
  intervalMs?: number;
  source?: ProcessSource;
  memoryScope?: string;
}

/** Times named phases and samples the resident memory of a process tree for one run. */
export class BenchRun {
  private readonly sampler: MemorySampler;
  private readonly phases: PhaseRecord[] = [];
  private t0 = 0;
  private startedAt = '';
  private open: { name: string; startMs: number } | null = null;
  private command: RunReport['command'] = null;

  constructor(private readonly options: BenchRunOptions) {
    this.sampler = new MemorySampler({
      rootPids: options.rootPids ?? [process.pid],
      intervalMs: options.intervalMs,
      source: options.source,
    });
  }

  async start(): Promise<void> {
    await this.sampler.start();
    this.startedAt = new Date().toISOString();
    this.t0 = performance.now();
  }

  /** Milliseconds since `start()`. */
  elapsedMs(): number {
    return performance.now() - this.t0;
  }

  /** Time `fn` as a phase. */
  async phase<T>(name: string, fn: () => Promise<T> | T): Promise<T> {
    this.beginPhase(name);
    try {
      return await fn();
    } finally {
      this.endPhase();
    }
  }

  /** Start a phase; a phase still open is ended at this instant. */
  beginPhase(name: string): void {
    this.endPhase();
    this.open = { name, startMs: this.elapsedMs() };
  }

  endPhase(): void {
    if (!this.open) return;
    const end = this.elapsedMs();
    this.phases.push({
      name: this.open.name,
      startMs: round(this.open.startMs),
      durationMs: round(end - this.open.startMs),
    });
    this.open = null;
  }

  setCommand(info: NonNullable<RunReport['command']>): void {
    this.command = info;
  }

  async finish(): Promise<RunReport> {
    this.endPhase();
    const wallClockMs = round(this.elapsedMs());
    const memory = await this.sampler.stop();
    return {
      schema: 'sdd-review-bench-run/1',
      name: this.options.name,
      startedAt: this.startedAt,
      host: hostInfo(),
      wallClockMs,
      phases: this.phases,
      memory,
      command: this.command,
      memoryScope:
        this.options.memoryScope ??
        'sum of the resident set of every process in the measured tree (shared pages count once per process)',
    };
  }
}

function round(ms: number): number {
  return Math.round(ms * 10) / 10;
}

export interface CommandOptions {
  name: string;
  command: string;
  args?: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /** Run through the platform shell (needed for `.cmd` files on Windows). */
  shell?: boolean;
  intervalMs?: number;
  source?: ProcessSource;
  /** Name of the phase that covers the whole command until it prints a phase marker. */
  firstPhase?: string;
  /** Pass the command's output through to this process. */
  echo?: boolean;
}

/**
 * Run a command, time it and sample the memory of its process tree. The command's own phases
 * are the lines `@@bench-phase <name>` it prints.
 */
export async function runCommand(options: CommandOptions): Promise<RunReport> {
  const args = options.args ?? [];
  const cwd = options.cwd ?? process.cwd();
  let pid = -1;
  const run = new BenchRun({
    name: options.name,
    rootPids: () => (pid > 0 ? [pid] : []),
    intervalMs: options.intervalMs,
    source: options.source,
    memoryScope: 'sum of the resident set of every process of the command tree',
  });
  await run.start();
  run.beginPhase(options.firstPhase ?? 'command');
  const child = spawn(options.command, args, {
    cwd,
    env: options.env ?? process.env,
    shell: options.shell ?? false,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  pid = child.pid ?? -1;
  let tail = '';
  const onLine = (line: string) => {
    if (line.startsWith(PHASE_MARKER)) run.beginPhase(line.slice(PHASE_MARKER.length).trim());
    if (options.echo) process.stdout.write(line + '\n');
    tail = (tail + line + '\n').slice(-4096);
  };
  createInterface({ input: child.stdout }).on('line', onLine);
  createInterface({ input: child.stderr }).on('line', onLine);
  const exit = await new Promise<{ code: number | null; signal: string | null; error?: Error }>(
    (resolve) => {
      child.once('error', (error) => resolve({ code: null, signal: null, error }));
      child.once('close', (code, signal) => resolve({ code, signal }));
    },
  );
  if (exit.error) tail += `spawn failed: ${exit.error.message}\n`;
  run.setCommand({
    command: options.command,
    args,
    cwd,
    exitCode: exit.code,
    signal: exit.signal,
    outputTail: tail,
  });
  return run.finish();
}

/** Run an in-process async function as one measured run; the process tree is this process's. */
export async function runFunction(
  name: string,
  fn: (run: BenchRun) => Promise<void>,
  options: Omit<BenchRunOptions, 'name'> = {},
): Promise<RunReport> {
  const run = new BenchRun({ name, ...options });
  await run.start();
  try {
    await fn(run);
  } catch (err) {
    await run.finish(); // stops the sampler and its helper
    throw err;
  }
  return run.finish();
}
