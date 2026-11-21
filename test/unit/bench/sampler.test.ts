import { spawn } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MemorySampler,
  createProcessSource,
  parseProcStatus,
  parsePsOutput,
  parseWindowsTable,
  treeMembers,
  type ProcInfo,
} from '../../../bench/harness/sampler.js';

const MIB = 1024 * 1024;
const table: ProcInfo[] = [
  { pid: 1, ppid: 0, rssBytes: 1000 },
  { pid: 10, ppid: 1, rssBytes: 100 },
  { pid: 11, ppid: 10, rssBytes: 10 },
  { pid: 12, ppid: 10, rssBytes: 20 },
  { pid: 20, ppid: 1, rssBytes: 7 },
  { pid: 30, ppid: 99, rssBytes: 5 },
];

describe('process tree (nfr.md C001-NFR-004 sampling)', () => {
  it('takes the root and all its descendants, and nothing else', () => {
    const pids = treeMembers(table, [10])
      .map((p) => p.pid)
      .sort((a, b) => a - b);
    expect(pids).toEqual([10, 11, 12]);
  });

  it('counts a process once when roots overlap and ignores absent roots', () => {
    const members = treeMembers(table, [10, 11, 4242]);
    expect(members.map((p) => p.pid).sort((a, b) => a - b)).toEqual([10, 11, 12]);
  });

  it('survives a parent cycle from pid reuse', () => {
    const cyclic: ProcInfo[] = [
      { pid: 5, ppid: 6, rssBytes: 1 },
      { pid: 6, ppid: 5, rssBytes: 1 },
    ];
    expect(treeMembers(cyclic, [5])).toHaveLength(2);
  });
});

describe('process table parsers', () => {
  it('parses ps output in KiB', () => {
    expect(parsePsOutput('  1     0  2048\n 22  1 100\nbad line\n')).toEqual([
      { pid: 1, ppid: 0, rssBytes: 2048 * 1024 },
      { pid: 22, ppid: 1, rssBytes: 100 * 1024 },
    ]);
  });

  it('parses the Windows helper lines in bytes', () => {
    expect(parseWindowsTable('4 0 8192\r\n100 4 1048576\nEND\n')).toEqual([
      { pid: 4, ppid: 0, rssBytes: 8192 },
      { pid: 100, ppid: 4, rssBytes: 1048576 },
    ]);
  });

  it('parses /proc/<pid>/status, with and without VmRSS', () => {
    const status = 'Name:\tnode\nPid:\t7\nPPid:\t3\nVmRSS:\t  5120 kB\n';
    expect(parseProcStatus(7, status)).toEqual({ pid: 7, ppid: 3, rssBytes: 5120 * 1024 });
    expect(parseProcStatus(2, 'Name:\tkthreadd\nPPid:\t0\n')).toEqual({
      pid: 2,
      ppid: 0,
      rssBytes: 0,
    });
    expect(parseProcStatus(2, 'garbage')).toBeNull();
  });
});

describe('MemorySampler on the real operating system', () => {
  it('reads this machine, and sees this process with a plausible size', async () => {
    const source = await createProcessSource();
    try {
      const procs = await source.snapshot();
      const me = procs.find((p) => p.pid === process.pid);
      expect(me).toBeDefined();
      expect(me?.ppid).toBeGreaterThan(0);
      expect(me?.rssBytes).toBeGreaterThan(10 * MIB);
    } finally {
      await source.close();
    }
  }, 90_000);

  it('samples about every 100 ms and sees the peak of a child tree', async () => {
    const fixture = path.resolve('bench', 'harness', 'fixtures', 'allocate.mjs');
    const child = spawn(process.execPath, [fixture, '100', '1200', 'child'], { stdio: 'ignore' });
    const sampler = new MemorySampler({ rootPids: [child.pid as number] });
    await sampler.start();
    await new Promise((resolve) => child.once('close', resolve));
    const stats = await sampler.stop();
    expect(stats.intervalMs).toBe(100);
    // The suite runs test files in parallel, so the machine is loaded: require repeated sampling,
    // not the idle-machine cadence the measurements themselves run with (their reports record the
    // mean and longest gap).
    expect(stats.sampleCount).toBeGreaterThanOrEqual(3);
    expect(stats.meanGapMs).toBeLessThan(600);
    expect(stats.peakProcessCount).toBeGreaterThanOrEqual(2);
    expect(stats.peakResidentBytes).toBeGreaterThanOrEqual(200 * MIB);
    expect(stats.series.length).toBeGreaterThan(0);
  }, 90_000);

  it('leaves out the processes outside the root tree', async () => {
    const sampler = new MemorySampler({ rootPids: [] });
    await sampler.start();
    const stats = await sampler.stop();
    expect(stats.peakResidentBytes).toBe(0);
    expect(stats.peakProcessCount).toBe(0);
  }, 90_000);
});
