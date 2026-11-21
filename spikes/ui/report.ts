// Spike C001-T-023: the report of one browser's run, as JSON (`sdd-review-ui-spike/1`) and
// markdown, written to bench/results/ui-spike-<bench-id>-<browser>-<time>.json and .md.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { RunReport } from '../../bench/harness/run.js';
import {
  ACTION_TYPES,
  NFR_003,
  type ActionTiming,
  type Evaluation,
  type Summary,
} from './stats.js';

export interface UiSpikeReport {
  schema: 'sdd-review-ui-spike/1';
  task: 'C001-T-023';
  benchId: string;
  startedAt: string;
  host: RunReport['host'];
  browser: {
    kind: string;
    channel: string | null;
    version: string | null;
    userAgent: string | null;
    headless: boolean;
    viewport: { width: number; height: number };
  };
  dataset: {
    source: 'benchmark' | 'synthetic';
    changedLines: number;
    files: number;
    hunks: number;
    groups: number;
    hunkListRows: number;
    largestFileContextRows: number;
  };
  session: { actions: number; seed: number; pauseMs: number };
  threshold: typeof NFR_003;
  /** pass/miss: C001-NFR-003 over the whole session; not-run: the browser did not start. */
  result: 'pass' | 'miss' | 'not-run' | 'error';
  error: string | null;
  /** Navigation to the first rendered view (not an action, no threshold). */
  pageReadyMs: number | null;
  evaluation: Evaluation | null;
  cspViolations: string[];
  actions: ActionTiming[];
}

const fmt = (n: number) => (Number.isNaN(n) ? '—' : n.toFixed(1));

function summaryRow(name: string, s: Summary): string {
  return `| ${name} | ${s.count} | ${fmt(s.meanMs)} | ${fmt(s.p50Ms)} | ${fmt(s.p95Ms)} | ${fmt(s.maxMs)} | ${s.timedOut} | ${s.verdict.toUpperCase()} |`;
}

export function uiSpikeMarkdown(r: UiSpikeReport): string {
  const b = r.browser;
  const lines = [
    `# UI spike (C001-T-023): ${r.benchId} in ${b.kind}`,
    '',
    `**Result: ${r.result.toUpperCase()}** against C001-NFR-003 (p95 ≤ ${r.threshold.p95Ms} ms and ` +
      `maximum ≤ ${r.threshold.maxMs} ms over the session)` +
      (r.dataset.source === 'synthetic'
        ? ' — synthetic change: a harness check, not a result'
        : ''),
    '',
    `- Started: ${r.startedAt}`,
    `- Browser: ${b.kind}${b.channel ? ` (channel ${b.channel})` : ''}, version ${b.version ?? 'unknown'}, ` +
      `${b.headless ? 'headless' : 'headed'}, viewport ${b.viewport.width}x${b.viewport.height}`,
    `- User agent: ${b.userAgent ?? 'unknown'}`,
    `- Host: ${r.host.os} ${r.host.release}, ${r.host.cpu}, ${r.host.logicalCpus} logical CPUs, ` +
      `${(r.host.totalMemBytes / 1024 ** 3).toFixed(1)} GiB RAM, Node ${r.host.node}`,
    `- Data: ${r.dataset.source} change ${r.benchId}, ${r.dataset.changedLines} changed lines, ` +
      `${r.dataset.files} files, ${r.dataset.hunks} hunks, ${r.dataset.groups} groups; hunk list ` +
      `${r.dataset.hunkListRows} rows, largest file context ${r.dataset.largestFileContextRows} rows`,
    `- Session: ${r.session.actions} actions, seed ${r.session.seed}, ${r.session.pauseMs} ms pause ` +
      'between actions',
    `- Page ready (navigation to first view, no threshold): ${r.pageReadyMs === null ? '—' : `${r.pageReadyMs.toFixed(0)} ms`}`,
    `- CSP violations: ${r.cspViolations.length === 0 ? 'none' : r.cspViolations.join('; ')}`,
  ];
  if (r.error) lines.push(`- Error: ${r.error}`);
  if (r.evaluation) {
    lines.push(
      '',
      '## Input to rendered view (ms)',
      '',
      '| Actions | Count | Mean | p50 | p95 | Max | Timed out | Pass/miss |',
      '|---|---:|---:|---:|---:|---:|---:|---|',
      summaryRow('**all (C001-NFR-003)**', r.evaluation.overall),
      ...ACTION_TYPES.map((t) => summaryRow(t, r.evaluation!.byType[t])),
    );
    const slowest = [...r.actions].sort((a, b2) => b2.ms - a.ms).slice(0, 10);
    lines.push(
      '',
      '## Ten slowest actions',
      '',
      '| Seq | Type | Input | ms |',
      '|---:|---|---|---:|',
      ...slowest.map(
        (a) =>
          `| ${a.seq} | ${a.type} | ${a.variant} | ${a.ms.toFixed(1)}${a.timedOut ? ' (timed out)' : ''} |`,
      ),
    );
  }
  lines.push(
    '',
    'p95 is the nearest-rank percentile (a measured value, no interpolation). Each action is timed ' +
      'from the input event (`event.timeStamp`) to the end of the first frame after which React ' +
      'has committed the action and both virtualised lists have rows over their whole visible ' +
      'area (performance marks and measures; spikes/ui/app/timing.ts).',
    '',
  );
  return lines.join('\n');
}

export function writeUiSpikeReport(
  r: UiSpikeReport,
  outDir: string,
): { jsonPath: string; mdPath: string } {
  mkdirSync(outDir, { recursive: true });
  const stamp = r.startedAt.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const safe = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, '_');
  const base = `ui-spike-${safe(r.benchId)}-${safe(r.browser.kind)}-${stamp}`;
  const jsonPath = path.join(outDir, `${base}.json`);
  const mdPath = path.join(outDir, `${base}.md`);
  writeFileSync(jsonPath, JSON.stringify(r, null, 2) + '\n', 'utf8');
  writeFileSync(mdPath, uiSpikeMarkdown(r), 'utf8');
  return { jsonPath, mdPath };
}
