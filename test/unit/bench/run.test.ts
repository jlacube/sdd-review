import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  reportMarkdown,
  writeReport,
  formatBytes,
  formatDuration,
} from '../../../bench/harness/report.js';
import { runCommand, runFunction } from '../../../bench/harness/run.js';
import {
  checkCommandReport,
  checkFunctionReport,
  runSelftest,
} from '../../../bench/harness/selftest.js';

const fixture = path.resolve('bench', 'harness', 'fixtures', 'allocate.mjs');

describe('bench run', () => {
  it('times phases of a command from its markers and reports exit and peak memory', async () => {
    const report = await runCommand({
      name: 'unit-command',
      command: process.execPath,
      args: [fixture, '60', '700'],
      firstPhase: 'start',
    });
    expect(report.command?.exitCode).toBe(0);
    expect(report.phases.map((p) => p.name)).toEqual(['start', 'allocate', 'hold']);
    expect(report.wallClockMs).toBeGreaterThanOrEqual(650);
    expect(report.memory.peakResidentBytes).toBeGreaterThanOrEqual(60 * 1024 * 1024);
    const hold = report.phases.find((p) => p.name === 'hold');
    expect(hold?.durationMs).toBeGreaterThanOrEqual(600);
  }, 90_000);

  it('reports a command that cannot start, with a non-zero outcome', async () => {
    const report = await runCommand({
      name: 'unit-missing',
      command: path.join(tmpdir(), 'no-such-program-sdd-bench'),
    });
    expect(report.command?.exitCode).not.toBe(0);
    expect(report.command?.outputTail).toContain('spawn failed');
  }, 90_000);

  it('times an in-process function by phases', async () => {
    const report = await runFunction('unit-function', async (run) => {
      await run.phase('a', () => new Promise((r) => setTimeout(r, 120)));
      await run.phase('b', () => new Promise((r) => setTimeout(r, 60)));
    });
    expect(report.phases.map((p) => p.name)).toEqual(['a', 'b']);
    expect(report.phases[0].durationMs).toBeGreaterThanOrEqual(100);
    expect(report.wallClockMs).toBeGreaterThanOrEqual(
      report.phases[0].durationMs + report.phases[1].durationMs - 1,
    );
    expect(report.memory.peakResidentBytes).toBeGreaterThan(0);
  }, 90_000);

  it('still stops the sampler and rethrows when the function throws', async () => {
    await expect(
      runFunction('unit-throw', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
  }, 90_000);
});

describe('report files', () => {
  it('writes a JSON and a markdown report that agree', async () => {
    const out = mkdtempSync(path.join(tmpdir(), 'sdd-bench-report-'));
    try {
      const report = await runFunction('unit report/name', async (run) => {
        await run.phase('p', () => new Promise((r) => setTimeout(r, 50)));
      });
      const { jsonPath, mdPath } = writeReport(report, out);
      expect(readdirSync(out).sort()).toHaveLength(2);
      expect(path.basename(jsonPath)).toMatch(/^unit_report_name-\d{8}T\d{6}Z\.json$/);
      const parsed = JSON.parse(readFileSync(jsonPath, 'utf8'));
      expect(parsed.schema).toBe('sdd-review-bench-run/1');
      expect(parsed.memory.peakResidentBytes).toBe(report.memory.peakResidentBytes);
      const md = readFileSync(mdPath, 'utf8');
      expect(md).toContain('Wall-clock time');
      expect(md).toContain('| p |');
      expect(md).toBe(reportMarkdown(report));
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  }, 90_000);

  it('formats bytes and durations', () => {
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MiB');
    expect(formatBytes(3 * 1024 ** 3)).toBe('3.00 GiB');
    expect(formatDuration(1500)).toBe('1.50 s');
    expect(formatDuration(150_000)).toBe('2.50 min');
  });
});

describe('harness self-test', () => {
  it('passes every check on a small fixture run', async () => {
    const lines: string[] = [];
    const checks = await runSelftest((l) => lines.push(l));
    const failed = checks.filter((c) => !c.ok);
    expect(failed).toEqual([]);
    expect(lines.join('\n')).toMatch(/wall-clock .* peak memory /);
  }, 120_000);

  it('detects a report whose memory or timing is wrong', async () => {
    const report = await runCommand({
      name: 'unit-bad',
      command: process.execPath,
      args: [fixture, '20', '300'],
    });
    // The fixture holds 20 MiB in one process; claiming 400 MiB per process must fail.
    const checks = checkCommandReport(report, 400, 300);
    expect(checks.find((c) => c.name.startsWith('peak memory'))?.ok).toBe(false);
    expect(checkFunctionReport(report, 5000).some((c) => !c.ok)).toBe(true);
  }, 90_000);
});
