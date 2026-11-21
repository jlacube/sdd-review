import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { RunReport } from './run.js';

const MIB = 1024 * 1024;

export function formatBytes(bytes: number): string {
  return bytes >= 1024 * MIB
    ? `${(bytes / (1024 * MIB)).toFixed(2)} GiB`
    : `${(bytes / MIB).toFixed(1)} MiB`;
}

export function formatDuration(ms: number): string {
  return ms >= 60_000 ? `${(ms / 60_000).toFixed(2)} min` : `${(ms / 1000).toFixed(2)} s`;
}

/** The markdown form of a run report. */
export function reportMarkdown(r: RunReport): string {
  const lines = [
    `# Bench run: ${r.name}`,
    '',
    `- Started: ${r.startedAt}`,
    `- Host: ${r.host.os} ${r.host.release}, ${r.host.cpu}, ${r.host.logicalCpus} logical CPUs, ` +
      `${formatBytes(r.host.totalMemBytes)} RAM, Node ${r.host.node}`,
    `- Wall-clock time: ${formatDuration(r.wallClockMs)} (${r.wallClockMs} ms)`,
    `- Peak resident memory: ${formatBytes(r.memory.peakResidentBytes)} ` +
      `(${r.memory.peakResidentBytes} bytes, ${r.memory.peakProcessCount} processes at the peak, ` +
      `at ${r.memory.peakAtMs} ms)`,
    `- Memory sampling: every ${r.memory.intervalMs} ms requested; ${r.memory.sampleCount} samples, ` +
      `mean gap ${r.memory.meanGapMs} ms, longest gap ${r.memory.maxGapMs} ms (${r.memory.source})`,
    `- Memory scope: ${r.memoryScope}`,
  ];
  if (r.command) {
    lines.push(
      `- Command: \`${[r.command.command, ...r.command.args].join(' ')}\` in \`${r.command.cwd}\``,
      `- Exit: code ${r.command.exitCode ?? 'none'}, signal ${r.command.signal ?? 'none'}`,
    );
  }
  lines.push('', '## Phases', '', '| Phase | Start (ms) | Duration (ms) |', '|---|---:|---:|');
  for (const p of r.phases) lines.push(`| ${p.name} | ${p.startMs} | ${p.durationMs} |`);
  if (r.phases.length === 0) lines.push('| (none) | | |');
  lines.push('');
  return lines.join('\n');
}

/** Write `<name>-<timestamp>.json` and `.md` into `outDir`; return both paths. */
export function writeReport(r: RunReport, outDir: string): { jsonPath: string; mdPath: string } {
  mkdirSync(outDir, { recursive: true });
  const stamp = r.startedAt.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const base = `${r.name.replace(/[^A-Za-z0-9._-]+/g, '_')}-${stamp}`;
  const jsonPath = path.join(outDir, `${base}.json`);
  const mdPath = path.join(outDir, `${base}.md`);
  writeFileSync(jsonPath, JSON.stringify(r, null, 2) + '\n', 'utf8');
  writeFileSync(mdPath, reportMarkdown(r), 'utf8');
  return { jsonPath, mdPath };
}
