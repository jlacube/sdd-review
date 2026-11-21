// Spike C001-T-023: `npm run bench -- spike-ui ...`. Prepares the data of a benchmark change (or a
// synthetic change for smoke tests), builds and serves the prototype page, replays the scripted
// session in each browser with Playwright (real mouse and keyboard input), reads the performance
// measures the page records per action, and writes one report per browser:
// bench/results/ui-spike-<bench-id>-<browser>-<time>.json and .md.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, firefox, type Browser, type BrowserType, type Page } from 'playwright';
import { hostInfo } from '../../bench/harness/run.js';
import { watchCspViolations } from '../../test/acceptance/support/csp-violations.js';
import type { SpikeDataset } from './app/dataset.js';
import { buildContextRows, buildHunkRows } from './app/model.js';
import { largestChange, prepareBenchDataset, readBenchChanges } from './prepare.js';
import { writeUiSpikeReport, type UiSpikeReport } from './report.js';
import { buildPage, servePage } from './serve.js';
import {
  DEFAULT_ACTIONS,
  DEFAULT_SEED,
  MIN_ACTIONS,
  scriptSession,
  type SessionStep,
} from './session.js';
import { ACTION_TYPES, NFR_003, evaluate, type ActionTiming, type ActionType } from './stats.js';
import { syntheticDataset } from './synthetic.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
export const CACHE_DIR = path.join(repoRoot, 'node_modules', '.cache', 'sdd-ui-spike');

export type BrowserKind = 'chrome' | 'edge' | 'firefox';
export const BROWSER_KINDS: readonly BrowserKind[] = ['chrome', 'edge', 'firefox'];
const TYPES: Record<BrowserKind, BrowserType> = { chrome: chromium, edge: chromium, firefox };
/** Default channels: the installed Chrome and Edge; Firefox is Playwright's own build. */
export const DEFAULT_CHANNELS: Record<BrowserKind, string | null> = {
  chrome: 'chrome',
  edge: 'msedge',
  firefox: null,
};
export const VIEWPORT = { width: 1600, height: 900 } as const;
export const DEFAULT_PAUSE_MS = 250;
/** No measure for this long after an input: the input reached no handler; the run stops. */
const ACTION_WAIT_MS = 15_000;

export interface UiSpikeTarget {
  readonly id: string;
  /** A benchmark change id, or null for a synthetic change. */
  readonly benchId: string | null;
  readonly syntheticLines: number | null;
}

export interface UiSpikeOptions {
  readonly browsers: readonly BrowserKind[];
  readonly channels: Readonly<Record<BrowserKind, string | null>>;
  readonly actions: number;
  readonly seed: number;
  readonly pauseMs: number;
  readonly headless: boolean;
  readonly prepareOnly: boolean;
}

export const SPIKE_UI_USAGE = `  spike-ui [<bench-id ...>|largest|all] [--browser chrome,edge,firefox] [--actions ${DEFAULT_ACTIONS}]
           [--seed ${DEFAULT_SEED}] [--pause-ms ${DEFAULT_PAUSE_MS}] [--channel <kind>=<channel>] [--headless] [--prepare-only]
                               C001-T-023: replays the scripted session on the hunk list and file
                               context prototype in each browser (default: the largest benchmark
                               change, chrome, edge and firefox, headed); writes
                               bench/results/ui-spike-<bench-id>-<browser>-<time>.json/.md
  spike-ui --synthetic <lines> [same options]
                               the same on a synthetic change (smoke tests of the harness)`;

/** Parses the arguments of `spike-ui`. */
export function parseSpikeUiArgs(
  argv: readonly string[],
  setFile: string,
): { targets: UiSpikeTarget[]; options: UiSpikeOptions } {
  const ids: string[] = [];
  const flags = new Map<string, string>();
  const channels: Record<BrowserKind, string | null> = { ...DEFAULT_CHANNELS };
  let headless = false;
  let prepareOnly = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--headless') headless = true;
    else if (a === '--prepare-only') prepareOnly = true;
    else if (a === '--channel') {
      const [kind, channel] = (argv[++i] ?? '').split('=');
      if (!BROWSER_KINDS.includes(kind as BrowserKind) || channel === undefined) {
        throw new Error('--channel takes <kind>=<channel>, for example edge=msedge-beta');
      }
      channels[kind as BrowserKind] = channel === '' ? null : channel;
    } else if (a.startsWith('--')) {
      const value = argv[++i];
      if (value === undefined) throw new Error(`${a} needs a value`);
      flags.set(a, value);
    } else ids.push(a);
  }
  const int = (name: string, fallback: number) => {
    const v = flags.get(name);
    if (v === undefined) return fallback;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0) throw new Error(`${name} takes a whole number`);
    return n;
  };
  for (const f of flags.keys()) {
    if (!['--browser', '--actions', '--seed', '--pause-ms', '--synthetic'].includes(f)) {
      throw new Error(`unknown option ${f}`);
    }
  }
  const browsers = (flags.get('--browser') ?? BROWSER_KINDS.join(','))
    .split(',')
    .map((b) => b.trim());
  for (const b of browsers) {
    if (!BROWSER_KINDS.includes(b as BrowserKind)) throw new Error(`unknown browser ${b}`);
  }
  const actions = int('--actions', DEFAULT_ACTIONS);
  if (actions < MIN_ACTIONS) throw new Error(`--actions is at least ${MIN_ACTIONS}`);
  const options: UiSpikeOptions = {
    browsers: browsers as BrowserKind[],
    channels,
    actions,
    seed: int('--seed', DEFAULT_SEED),
    pauseMs: int('--pause-ms', DEFAULT_PAUSE_MS),
    headless,
    prepareOnly,
  };
  if (flags.has('--synthetic')) {
    if (ids.length > 0) throw new Error('--synthetic takes no benchmark change id');
    const lines = int('--synthetic', 0);
    return {
      targets: [{ id: `synthetic-${lines}`, benchId: null, syntheticLines: lines }],
      options,
    };
  }
  const changes = readBenchChanges(setFile);
  const wanted =
    ids.length === 0 || ids.includes('largest')
      ? [largestChange(changes).id]
      : ids.includes('all')
        ? changes.map((c) => c.id)
        : ids;
  for (const id of wanted) {
    if (!changes.some((c) => c.id === id)) throw new Error(`no benchmark change ${id}`);
  }
  return {
    targets: wanted.map((id) => ({ id, benchId: id, syntheticLines: null })),
    options,
  };
}

/** The dataset file of a target (prepared and cached when needed). */
export function datasetFile(target: UiSpikeTarget, setFile: string, benchRoot: string): string {
  if (target.benchId !== null) {
    const change = readBenchChanges(setFile).find((c) => c.id === target.benchId)!;
    return prepareBenchDataset(change, benchRoot, repoRoot, CACHE_DIR);
  }
  const file = path.join(CACHE_DIR, 'data', `${target.id}.json`);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(syntheticDataset(target.syntheticLines!)), 'utf8');
  return file;
}

function datasetFacts(data: SpikeDataset): UiSpikeReport['dataset'] {
  const byPath = new Map<string, SpikeDataset['hunks'][number][]>();
  for (const h of data.hunks) byPath.set(h.path, [...(byPath.get(h.path) ?? []), h]);
  const largest = Math.max(
    0,
    ...data.files.map((f) => buildContextRows(f, byPath.get(f.path) ?? []).rows.length),
  );
  return {
    source: data.source,
    changedLines: data.changedLines,
    files: data.files.length,
    hunks: data.hunks.length,
    groups: data.groups.length,
    hunkListRows: buildHunkRows(data.hunks, data.groups, data.assignment).rows.length,
    largestFileContextRows: largest,
  };
}

const KEY_OF: Record<string, string> = {
  pagedown: 'PageDown',
  pageup: 'PageUp',
  end: 'End',
  home: 'Home',
};

/** Turns one step into real input. Nothing here is timed: the page times from the input event. */
async function perform(page: Page, step: SessionStep): Promise<void> {
  switch (step.variant) {
    case 'open-click': {
      const targets = await page.$$eval('[data-list=hunks] [data-hunk-header]', (els) => {
        const list = document.querySelector('[data-list=hunks]')!.getBoundingClientRect();
        return els
          .map((el) => ({ el, r: el.getBoundingClientRect() }))
          .filter(({ r }) => r.top >= list.top && r.bottom <= list.bottom)
          .map(({ r }) => ({ x: r.left + Math.min(60, r.width / 2), y: r.top + r.height / 2 }));
      });
      if (targets.length === 0) {
        await page.keyboard.press('j'); // no hunk header in view: open the next hunk instead
        return;
      }
      const t =
        targets[Math.min(targets.length - 1, Math.floor((step.pick ?? 0) * targets.length))]!;
      await page.mouse.click(t.x, t.y);
      return;
    }
    case 'open-next':
      await page.keyboard.press('j');
      return;
    case 'open-prev':
      await page.keyboard.press('k');
      return;
    case 'mark-click': {
      const box = await page.locator('[data-action=mark]').boundingBox();
      if (!box) throw new Error('the mark button is not on the page');
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      return;
    }
    case 'move-key':
      await page.keyboard.press(step.key!);
      return;
    default: {
      const [, list, dir] = step.variant.split('-') as [string, 'hunks' | 'context', string];
      const changed = await page.evaluate((name) => {
        const el = document.querySelector<HTMLElement>(`[data-list=${name}]`)!;
        if (document.activeElement === el) return false;
        el.focus({ preventScroll: true });
        return true;
      }, list);
      if (changed) await page.waitForTimeout(50); // let the focus ring paint before the input
      await page.keyboard.press(KEY_OF[dir]!);
    }
  }
}

function parseMeasure(name: string, duration: number): ActionTiming {
  const [, seq, type, variant, timedOut] = name.split('|');
  return {
    seq: Number(seq),
    type: type as ActionType,
    variant: variant!,
    ms: Math.round(duration * 100) / 100,
    timedOut: timedOut === '1',
  };
}

async function launch(
  kind: BrowserKind,
  channel: string | null,
  headless: boolean,
): Promise<Browser> {
  return TYPES[kind].launch({ headless, ...(channel ? { channel } : {}) });
}

/** One browser's run on one dataset. A browser that does not start gives a `not-run` report. */
export async function runInBrowser(
  kind: BrowserKind,
  target: UiSpikeTarget,
  data: SpikeDataset,
  url: string,
  options: UiSpikeOptions,
): Promise<UiSpikeReport> {
  const channel = options.channels[kind];
  const report: UiSpikeReport = {
    schema: 'sdd-review-ui-spike/1',
    task: 'C001-T-023',
    benchId: target.id,
    startedAt: new Date().toISOString(),
    host: hostInfo(),
    browser: {
      kind,
      channel,
      version: null,
      userAgent: null,
      headless: options.headless,
      viewport: { ...VIEWPORT },
    },
    dataset: datasetFacts(data),
    session: { actions: options.actions, seed: options.seed, pauseMs: options.pauseMs },
    threshold: NFR_003,
    result: 'not-run',
    error: null,
    pageReadyMs: null,
    evaluation: null,
    cspViolations: [],
    actions: [],
  };
  let browser: Browser;
  try {
    browser = await launch(kind, channel, options.headless);
  } catch (error) {
    report.error = `the browser did not start: ${(error as Error).message.split('\n')[0]}`;
    return report;
  }
  try {
    report.browser.version = browser.version();
    const context = await browser.newContext({ viewport: { ...VIEWPORT } });
    const page = await context.newPage();
    const csp = await watchCspViolations(page);
    await page.goto(url);
    await page.waitForSelector('body[data-ready="true"], body[data-error]', { timeout: 120_000 });
    const pageError = await page.evaluate(() => document.body.dataset.error ?? null);
    if (pageError) throw new Error(`the page failed: ${pageError}`);
    report.browser.userAgent = await page.evaluate(() => navigator.userAgent);
    report.pageReadyMs = await page.evaluate(
      () => performance.getEntriesByName('spike:ready')[0]?.startTime ?? null,
    );
    const steps = scriptSession(options.actions, options.seed, data.groups.length);
    for (const step of steps) {
      await perform(page, step);
      try {
        await page.waitForFunction(
          (n) =>
            performance.getEntriesByType('measure').filter((e) => e.name.startsWith('spike|'))
              .length >= n,
          step.seq + 1,
          { timeout: ACTION_WAIT_MS, polling: 25 },
        );
      } catch {
        throw new Error(
          `action ${step.seq + 1} (${step.variant}) recorded no measure within ${ACTION_WAIT_MS} ms: ` +
            'the input reached no handler',
        );
      }
      if (options.pauseMs > 0) await page.waitForTimeout(options.pauseMs);
    }
    const measures = await page.evaluate(() =>
      performance
        .getEntriesByType('measure')
        .filter((e) => e.name.startsWith('spike|'))
        .map((e) => ({ name: e.name, duration: e.duration })),
    );
    report.actions = measures.map((m) => parseMeasure(m.name, m.duration));
    report.evaluation = evaluate(report.actions);
    report.cspViolations = await csp.violations();
    report.result = report.evaluation.overall.verdict === 'pass' ? 'pass' : 'miss';
    await context.close();
  } catch (error) {
    report.result = 'error';
    report.error = (error as Error).message.split('\n')[0] ?? String(error);
  } finally {
    await browser.close();
  }
  return report;
}

export interface UiSpikeOutcome {
  readonly target: UiSpikeTarget;
  readonly reports: { report: UiSpikeReport; jsonPath: string; mdPath: string }[];
}

/** Prepares, builds, serves and runs every browser on one target; writes the reports. */
export async function runUiSpike(
  target: UiSpikeTarget,
  options: UiSpikeOptions,
  setFile: string,
  benchRoot: string,
  outDir: string,
): Promise<UiSpikeOutcome> {
  const dataFile = datasetFile(target, setFile, benchRoot);
  const data = JSON.parse(readFileSync(dataFile, 'utf8')) as SpikeDataset;
  if (options.prepareOnly) {
    console.log(
      `${target.id}: data ready in ${dataFile} (${datasetFacts(data).hunkListRows} hunk rows)`,
    );
    return { target, reports: [] };
  }
  const pageDir = path.join(CACHE_DIR, 'page');
  await buildPage(pageDir);
  const server = await servePage(pageDir, dataFile);
  const reports: UiSpikeOutcome['reports'] = [];
  try {
    for (const kind of options.browsers) {
      const report = await runInBrowser(kind, target, data, server.url, options);
      reports.push({ report, ...writeUiSpikeReport(report, outDir) });
    }
  } finally {
    await server.close();
  }
  return { target, reports };
}

/** One console line per report. */
export function outcomeLine(r: UiSpikeReport, mdPath: string): string {
  const head = `${r.benchId} ${r.browser.kind}${r.browser.version ? ` ${r.browser.version}` : ''}: ${r.result.toUpperCase()}`;
  if (!r.evaluation) return `${head} (${r.error ?? 'no data'}); ${mdPath}`;
  const o = r.evaluation.overall;
  const types = ACTION_TYPES.map(
    (t) => `${t} p95 ${r.evaluation!.byType[t].p95Ms} max ${r.evaluation!.byType[t].maxMs}`,
  ).join('; ');
  return `${head}, p95 ${o.p95Ms} ms, max ${o.maxMs} ms over ${o.count} actions (${types}); ${mdPath}`;
}
