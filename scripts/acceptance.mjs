// `npm run acceptance -- --scenario <TS-ID> [--scenario ...] [--repo <ecosystem>] [--tags <expr>]
//  [--offline] [--all-browsers] [--scenarios-file <path>]` and `npm run acceptance:browser -- ...` (C001-T-004).
// Runs Cucumber.js over the Gherkin of the acceptance files, selected by scenario ID, and prints
// one line per scenario: passed, failed or undefined.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractFeatures } from './extract-features.mjs';

/** The scenario IDs of a file: one per line, blank lines and `#` comments ignored (CI list). */
export function readScenarioIds(path) {
  if (!path) throw new Error('--scenarios-file needs a path');
  return readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*$/, '').trim())
    .filter((line) => line.length > 0);
}

export function parseArgs(argv) {
  const opts = { scenarios: [], repos: [], tags: undefined, offline: false, browser: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--scenario') opts.scenarios.push(argv[++i]);
    else if (a === '--scenarios-file') opts.scenarios.push(...readScenarioIds(argv[++i]));
    else if (a === '--repo') opts.repos.push(argv[++i]);
    else if (a === '--tags') opts.tags = argv[++i];
    else if (a === '--offline') opts.offline = true;
    else if (a === '--browser') opts.browser = true;
    else if (a === '--all-browsers') opts.allBrowsers = true;
    else throw new Error(`unknown option ${a}`);
  }
  return opts;
}

/** "C001-TS-101" or "TS-101" or "101" → the name prefix Cucumber filters on. */
export function scenarioNamePattern(id) {
  const n = /(\d+)$/.exec(id)?.[1];
  if (!n) throw new Error(`not a scenario ID: ${id}`);
  return `^C001-TS-${n}( |$)`;
}

export function statusOf(featuresJson) {
  const out = [];
  for (const feature of featuresJson) {
    for (const el of feature.elements ?? []) {
      if (el.type !== 'scenario') continue;
      const statuses = (el.steps ?? []).map((s) => s.result?.status ?? 'undefined');
      const status = statuses.includes('failed')
        ? 'failed'
        : statuses.some((s) => s === 'undefined' || s === 'pending')
          ? 'undefined'
          : statuses.every((s) => s === 'passed')
            ? 'passed'
            : statuses.every((s) => s === 'passed' || s === 'skipped')
              ? 'skipped'
              : 'failed';
      const bad = (el.steps ?? []).find((s) =>
        ['failed', 'undefined', 'pending', 'ambiguous'].includes(s.result?.status ?? 'undefined'),
      );
      out.push({
        name: el.name,
        status,
        step: bad ? `${(bad.keyword ?? '').trim()} ${bad.name ?? ''}`.trim() : undefined,
        error: bad?.result?.error_message,
      });
    }
  }
  return out;
}

/** A GitHub Actions error annotation for a scenario that did not pass (shown without log access). */
export function annotationOf(s) {
  const escape = (text) =>
    String(text).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  const detail = [
    s.step ?? '',
    ...String(s.error ?? '')
      .split('\n')
      .slice(0, 6),
  ]
    .filter((line) => line.trim().length > 0)
    .join('\n');
  return `::error title=${escape(`${s.status}: ${s.name}`).replace(/[:,]/g, ' ')}::${escape(detail)}`;
}

// Main-module check by real path: the old URL comparison built `file:////home/...` on POSIX, so on
// Linux and macOS the script ran no scenario and exited 0.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const opts = parseArgs(process.argv.slice(2));
  // Each run extracts into its own folder, so runs started at the same time do not delete or
  // overwrite each other's feature files and report.
  const runDir = `test/acceptance/.features/run-${process.pid}-${Date.now()}`;
  const written = extractFeatures(runDir);
  const total = written.reduce((n, w) => n + w.scenarios, 0);
  console.log(`acceptance: ${total} Gherkin blocks from ${written.length} acceptance files`);
  const report = `${runDir}/report.json`;
  const args = [
    'node_modules/@cucumber/cucumber/bin/cucumber.js',
    `${runDir}/*.feature`,
    '--import',
    'test/acceptance/support/**/*.ts',
    '--import',
    'test/acceptance/steps/**/*.steps.ts',
    '--format',
    `json:${report}`,
    '--format',
    'summary',
  ];
  for (const id of opts.scenarios) args.push('--name', scenarioNamePattern(id));
  if (opts.tags) args.push('--tags', opts.tags);
  const env = {
    ...process.env,
    NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --import tsx`.trim(),
    SDD_ACCEPT_REPOS: opts.repos.join(','),
    SDD_ACCEPT_OFFLINE: opts.offline ? '1' : '',
    SDD_ACCEPT_BROWSER: opts.browser ? '1' : '',
    ...(opts.allBrowsers ? { SDD_ACCEPT_BROWSERS: 'chrome,edge,firefox' } : {}),
  };
  const r = spawnSync(process.execPath, args, { stdio: 'inherit', env });
  if (existsSync(report)) {
    const json = JSON.parse(readFileSync(report, 'utf8'));
    for (const s of statusOf(json)) {
      console.log(`${s.status.toUpperCase().padEnd(10)} ${s.name}`);
      if (process.env.GITHUB_ACTIONS && s.status !== 'passed' && s.status !== 'skipped') {
        console.log(annotationOf(s));
      }
    }
  }
  rmSync(runDir, { recursive: true, force: true });
  process.exit(r.status ?? 1);
}
