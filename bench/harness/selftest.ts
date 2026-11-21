import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatBytes, formatDuration, writeReport } from './report.js';
import { runCommand, runFunction, type RunReport } from './run.js';

const MIB = 1024 * 1024;
const fixture = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'allocate.mjs');

export interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

/** Checks of a report of the fixture command: a parent that holds `mib` MiB and one child. */
export function checkCommandReport(r: RunReport, mib: number, holdMs: number): Check[] {
  const phaseNames = r.phases.map((p) => p.name);
  return [
    {
      name: 'command exits 0',
      ok: r.command?.exitCode === 0,
      detail: `exit ${r.command?.exitCode}`,
    },
    {
      name: 'wall-clock covers the hold time',
      ok: r.wallClockMs >= holdMs * 0.9 && r.wallClockMs < holdMs + 30_000,
      detail: formatDuration(r.wallClockMs),
    },
    {
      name: 'phases allocate and hold are timed',
      ok: phaseNames.includes('allocate') && phaseNames.includes('hold'),
      detail: phaseNames.join(', '),
    },
    {
      name: 'phase durations add up to at most the wall-clock time',
      ok: r.phases.reduce((s, p) => s + p.durationMs, 0) <= r.wallClockMs + 5,
      detail: `${r.phases.map((p) => p.durationMs).join(' + ')} ms of ${r.wallClockMs} ms`,
    },
    {
      name: 'peak memory covers parent and child',
      ok: r.memory.peakResidentBytes >= 2 * mib * MIB && r.memory.peakProcessCount >= 2,
      detail: `${formatBytes(r.memory.peakResidentBytes)} in ${r.memory.peakProcessCount} processes`,
    },
    {
      name: 'memory sampled about every 100 ms',
      ok:
        r.memory.sampleCount >= Math.floor((holdMs * 0.6) / 100) &&
        r.memory.meanGapMs >= 50 &&
        r.memory.meanGapMs <= 400,
      detail: `${r.memory.sampleCount} samples, mean gap ${r.memory.meanGapMs} ms`,
    },
  ];
}

/** Checks of a report of an in-process run that holds `mib` MiB. */
export function checkFunctionReport(r: RunReport, mib: number): Check[] {
  return [
    {
      name: 'in-process phase timed',
      ok: r.phases.length === 1 && r.phases[0].durationMs >= 250,
      detail: r.phases.map((p) => `${p.name} ${p.durationMs} ms`).join(', '),
    },
    {
      name: 'in-process peak memory covers the held buffer',
      ok: r.memory.peakResidentBytes >= mib * MIB,
      detail: formatBytes(r.memory.peakResidentBytes),
    },
  ];
}

/** Run the harness on a small fixture; the reports go to a temporary directory. */
export async function runSelftest(log: (line: string) => void = console.log): Promise<Check[]> {
  const out = mkdtempSync(path.join(tmpdir(), 'sdd-bench-selftest-'));
  const checks: Check[] = [];
  try {
    const mib = 80;
    const holdMs = 900;
    const cmd = await runCommand({
      name: 'selftest-command',
      firstPhase: 'start',
      command: process.execPath,
      args: [fixture, String(mib), String(holdMs), 'child'],
    });
    checks.push(...checkCommandReport(cmd, mib, holdMs));

    const held: Buffer[] = [];
    const fn = await runFunction('selftest-function', async (run) => {
      await run.phase('hold-60-MiB', async () => {
        held.push(Buffer.alloc(60 * MIB, 1));
        await new Promise((resolve) => setTimeout(resolve, 400));
      });
    });
    checks.push(...checkFunctionReport(fn, 60));
    held.length = 0;

    const { jsonPath, mdPath } = writeReport(cmd, out);
    const parsed = JSON.parse(readFileSync(jsonPath, 'utf8')) as RunReport;
    checks.push({
      name: 'report JSON and markdown written',
      ok:
        parsed.schema === 'sdd-review-bench-run/1' &&
        parsed.wallClockMs === cmd.wallClockMs &&
        readFileSync(mdPath, 'utf8').includes('Peak resident memory'),
      detail: `${path.basename(jsonPath)}, ${path.basename(mdPath)}`,
    });
    log(
      `fixture run: wall-clock ${formatDuration(cmd.wallClockMs)}, ` +
        `peak memory ${formatBytes(cmd.memory.peakResidentBytes)} ` +
        `(${cmd.memory.peakProcessCount} processes, ${cmd.memory.sampleCount} samples, ` +
        `${cmd.memory.source})`,
    );
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
  return checks;
}
