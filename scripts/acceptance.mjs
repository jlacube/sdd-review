// `npm run acceptance -- --scenario <TS-ID> [--scenario ...] [--repo <ecosystem>] [--tags <expr>]
//  [--offline] [--all-browsers]` and `npm run acceptance:browser -- ...` (C001-T-004).
// Runs Cucumber.js over the Gherkin of the acceptance files, selected by scenario ID, and prints
// one line per scenario: passed, failed or undefined.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { extractFeatures } from './extract-features.mjs';

export function parseArgs(argv) {
  const opts = { scenarios: [], repos: [], tags: undefined, offline: false, browser: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--scenario') opts.scenarios.push(argv[++i]);
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
            : 'failed';
      out.push({ name: el.name, status });
    }
  }
  return out;
}

if (import.meta.url === new URL(`file:///${process.argv[1]?.replace(/\\/g, '/')}`).href) {
  const opts = parseArgs(process.argv.slice(2));
  const written = extractFeatures();
  const total = written.reduce((n, w) => n + w.scenarios, 0);
  console.log(`acceptance: ${total} Gherkin blocks from ${written.length} acceptance files`);
  const report = 'test/acceptance/.features/report.json';
  const args = [
    'node_modules/@cucumber/cucumber/bin/cucumber.js',
    'test/acceptance/.features/*.feature',
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
  };
  const r = spawnSync(process.execPath, args, { stdio: 'inherit', env });
  if (existsSync(report)) {
    const json = JSON.parse(readFileSync(report, 'utf8'));
    for (const s of statusOf(json)) console.log(`${s.status.toUpperCase().padEnd(10)} ${s.name}`);
  }
  process.exit(r.status ?? 1);
}
