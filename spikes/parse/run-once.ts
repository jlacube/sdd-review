// Spike C001-T-014: ONE cold run of the parse front of the static analysis on one change, in a
// fresh process. Started by `npm run bench -- spike-parse` (spikes/parse/runner.ts), which times
// this process and samples the memory of its process tree; it can also be started by hand:
//
//   node --import tsx spikes/parse/run-once.ts --repo <dir> --base <commit> --head <commit>
//        --out <file.json> [--workers N] [--heap-mb M] [--g09 batched|adapter] [--eager-grammars]
//
// It prints `@@bench-phase <name>` before each phase (bench/harness/run.ts) and writes its own
// counts and phase times to `--out`.
import { writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { pathToFileURL } from 'node:url';
import { GitAdapter } from '../../src/core/git/operations.js';
import type { ChangedFile } from '../../src/core/git/port.js';
import { GitProcessRunner } from '../../src/core/git/process.js';
import { GitAccessChecker } from '../../src/core/git/program-check.js';
import { attributeBatched, attributeWithAdapter, type AttributionTotals } from './attribution.js';
import type { Extraction } from './extract.js';
import { languageOf, wasmPaths, type LanguageId } from './languages.js';
import { ParserPool, type ParseItem } from './pool.js';
import { IdentifierIndex, renameCandidates, renameSearchSet } from './rename-set.js';

export type G09Mode = 'batched' | 'adapter';

export interface RunOnceOptions {
  readonly repo: string;
  readonly base: string;
  readonly head: string;
  readonly workers: number;
  readonly heapMb: number;
  readonly g09: G09Mode;
  /** Load all five grammars at worker start; by default a worker loads a grammar on first use. */
  readonly eagerGrammars: boolean;
}

export interface PhaseTime {
  readonly name: string;
  readonly ms: number;
}

export interface RunOnceResult {
  schema: 'sdd-review-parse-spike-run/1';
  options: RunOnceOptions;
  /** Milliseconds from process start to the first phase (Node start, module loading). */
  startupMs: number;
  phases: PhaseTime[];
  /** Phase sums by kind: `git-*`, `parse-*`, `extract-*`; `other` = setup and shutdown. */
  totals: { git: number; parse: number; extract: number; other: number; work: number };
  counts: {
    changedFiles: number;
    changedTextFiles: number;
    changedDeepFiles: number;
    parsedSides: number;
    parsedChars: number;
    parseFailures: number;
    symbols: number;
    imports: number;
    references: number;
    byLanguage: Record<string, number>;
    g09: AttributionTotals;
    snapshotFilesIndexed: number;
    indexWords: number;
    renameOldNames: number;
    renameNewNames: number;
    renameSearchSetFiles: number;
    renameSearchSetChars: number;
    renameSearchSetParseFailures: number;
  };
  workers: Array<{
    heapUsed: number;
    external: number;
    arrayBuffers: number;
    peakTrees: number;
    grammars: string[];
  }>;
  /** Peak `process.memoryUsage().rss` of this process, sampled every 100 ms (cross-check). */
  selfPeakRssBytes: number;
}

export const PHASE_MARKER = '@@bench-phase ';
/** resourceLimits.maxOldGenerationSizeMb of each parser worker. */
export const DEFAULT_HEAP_MB = 256;

export function phaseTotals(phases: readonly PhaseTime[]): RunOnceResult['totals'] {
  const t = { git: 0, parse: 0, extract: 0, other: 0, work: 0 };
  for (const p of phases) {
    const kind = p.name.startsWith('git-')
      ? 'git'
      : p.name.startsWith('parse-')
        ? 'parse'
        : p.name.startsWith('extract-')
          ? 'extract'
          : 'other';
    t[kind] += p.ms;
    t.work += p.ms;
  }
  for (const k of Object.keys(t) as Array<keyof typeof t>) t[k] = Math.round(t[k] * 10) / 10;
  return t;
}

export function defaultWorkers(): number {
  return Math.max(1, availableParallelism() - 1);
}

const decoder = new TextDecoder('utf-8');
const text = (b: Buffer) => decoder.decode(b);

export async function runOnce(options: RunOnceOptions): Promise<RunOnceResult> {
  const startupMs = Math.round(performance.now());
  let selfPeak = process.memoryUsage.rss();
  const sampler = setInterval(() => {
    selfPeak = Math.max(selfPeak, process.memoryUsage.rss());
  }, 100);
  const phases: PhaseTime[] = [];
  const phase = async <T>(name: string, fn: () => Promise<T> | T): Promise<T> => {
    process.stdout.write(`${PHASE_MARKER}${name}\n`);
    const t0 = performance.now();
    try {
      return await fn();
    } finally {
      phases.push({ name, ms: Math.round((performance.now() - t0) * 10) / 10 });
    }
  };

  const adapter = new GitAdapter();
  let pool: ParserPool | undefined;
  try {
    // Worker start and grammar loading belong to parsing.
    pool = await phase('parse-setup', () =>
      ParserPool.start({
        size: options.workers,
        heapMb: options.heapMb,
        wasm: wasmPaths(),
        eagerGrammars: options.eagerGrammars,
      }),
    );

    const { location, baseHash, headHash } = await phase('git-discover', async () => {
      const location = await adapter.discover(options.repo);
      const baseHash = await adapter.resolveCommit(options.base);
      const headHash = await adapter.resolveCommit(options.head);
      const head = await adapter.head();
      if (head.commit !== headHash) {
        throw new Error(
          `the checkout is at ${head.commit}, not at the head ${headHash} of the change: ` +
            'check out the change first (G-07 compares the base with the working tree)',
        );
      }
      return { location, baseHash, headHash };
    });

    const changed = await phase('git-g07', () => adapter.changeAgainst(baseHash));
    const textFiles = changed.filter((f) => !f.binary);

    const g09 = await phase('git-g09', async () => {
      if (options.g09 === 'adapter') {
        return attributeWithAdapter(adapter, baseHash, headHash, textFiles, options.workers);
      }
      const program = await new GitAccessChecker().program(location.workTreeRoot);
      const runner = new GitProcessRunner({ gitPath: program.path });
      const rangeLog = async () => {
        const r = await runner.run(
          'log',
          [
            '--reverse',
            '-M',
            '--no-color',
            '--no-show-signature',
            '-z',
            '--name-status',
            '--format=%x01%H',
            `${baseHash}..${headHash}`,
          ],
          { target: { gitDir: location.gitDir, workTree: location.workTreeRoot } },
        );
        if (r.status !== 0) throw new Error(`git log ended with status ${r.status}: ${r.stderr}`);
        return r.stdout.toString('utf8');
      };
      return attributeBatched(adapter, rangeLog, baseHash, textFiles);
    });

    // Snapshot read for the identifier index: every deep-ecosystem file of the head tree (G-13,
    // blobs through cat-file --batch); changed files are taken from the G-07 result.
    const changedPaths = new Set(changed.map((f) => f.path));
    const snapshot = await phase('git-snapshot-read', async () => {
      const tree = await adapter.treeEntries(headHash);
      const wanted = tree.filter(
        (e) => e.mode !== 'submodule' && e.mode !== 'symlink' && languageOf(e.path) !== null,
      );
      const out = new Map<string, string>();
      await Promise.all(
        wanted.map(async (e) => {
          if (changedPaths.has(e.path)) return;
          const bytes = await adapter.readBlob(headHash, e.path);
          if (bytes) out.set(e.path, text(bytes));
        }),
      );
      for (const f of textFiles) {
        if (f.currentContent && languageOf(f.path)) out.set(f.path, text(f.currentContent));
      }
      return out;
    });

    const index = await phase('extract-identifier-index', () => {
      const idx = new IdentifierIndex();
      for (const [path, content] of snapshot) idx.add(path, content);
      return idx;
    });
    const snapshotFilesIndexed = snapshot.size;
    snapshot.clear();

    // Both sides of every changed file of a deep ecosystem.
    const deep: Array<{
      file: ChangedFile;
      language: LanguageId;
      baseKey: number;
      headKey: number;
    }> = [];
    const items: ParseItem[] = [];
    const byLanguage: Record<string, number> = {};
    let key = 0;
    for (const f of textFiles) {
      const language = languageOf(f.path);
      const baseLanguage = f.previousPath ? languageOf(f.previousPath) : language;
      if (!language && !baseLanguage) continue;
      const entry = { file: f, language: (language ?? baseLanguage)!, baseKey: -1, headKey: -1 };
      if (f.baseContent && baseLanguage) {
        entry.baseKey = key++;
        items.push({ key: entry.baseKey, language: baseLanguage, text: text(f.baseContent) });
      }
      if (f.currentContent && language) {
        entry.headKey = key++;
        items.push({ key: entry.headKey, language, text: text(f.currentContent) });
      }
      byLanguage[entry.language] = (byLanguage[entry.language] ?? 0) + 1;
      deep.push(entry);
    }
    const parsed = await phase('parse-changed', () => pool!.parse(items));
    const extractions = await phase('extract-changed', () =>
      pool!.extract(items.map((i) => i.key)),
    );

    const { oldNames, newNames, searchSet } = await phase('extract-rename-select', () => {
      const oldSet = new Set<string>();
      const newSet = new Set<string>();
      for (const d of deep) {
        const c = renameCandidates(
          extractions.get(d.baseKey) ?? null,
          extractions.get(d.headKey) ?? null,
        );
        c.oldNames.forEach((n) => oldSet.add(n));
        c.newNames.forEach((n) => newSet.add(n));
      }
      const searchSet = renameSearchSet(index, [...oldSet, ...newSet], changedPaths);
      return { oldNames: oldSet.size, newNames: newSet.size, searchSet };
    });

    const renameItems = await phase('git-rename-set-read', async () => {
      const read = await Promise.all(searchSet.map((p) => adapter.readBlob(headHash, p)));
      const out: ParseItem[] = [];
      read.forEach((bytes, i) => {
        const language = languageOf(searchSet[i]!);
        if (bytes && language) out.push({ key: key++, language, text: text(bytes) });
      });
      return out;
    });
    const renameParsed = await phase('parse-rename-set', () => pool!.parse(renameItems));
    const renameExtractions = await phase('extract-rename-set', () =>
      pool!.extract(renameItems.map((i) => i.key)),
    );

    const workerStats = await pool.stats();
    const all: Extraction[] = [...extractions.values()];
    const result: RunOnceResult = {
      schema: 'sdd-review-parse-spike-run/1',
      options,
      startupMs,
      phases,
      totals: phaseTotals(phases),
      counts: {
        changedFiles: changed.length,
        changedTextFiles: textFiles.length,
        changedDeepFiles: deep.length,
        parsedSides: parsed.files,
        parsedChars: parsed.chars,
        parseFailures: all.filter((e) => e.parseFailed).length,
        symbols: all.reduce((n, e) => n + e.symbols.length, 0),
        imports: all.reduce((n, e) => n + e.imports.length, 0),
        references: all.reduce((n, e) => n + e.references, 0),
        byLanguage,
        g09,
        snapshotFilesIndexed,
        indexWords: index.wordCount,
        renameOldNames: oldNames,
        renameNewNames: newNames,
        renameSearchSetFiles: renameParsed.files,
        renameSearchSetChars: renameParsed.chars,
        renameSearchSetParseFailures: [...renameExtractions.values()].filter((e) => e.parseFailed)
          .length,
      },
      workers: workerStats.map((w) => ({
        heapUsed: w.heapUsed,
        external: w.external,
        arrayBuffers: w.arrayBuffers,
        peakTrees: w.peakTrees,
        grammars: w.grammars,
      })),
      selfPeakRssBytes: 0,
    };
    await phase('shutdown', async () => {
      await pool!.close();
      pool = undefined;
      await adapter.close();
    });
    result.totals = phaseTotals(phases);
    clearInterval(sampler);
    result.selfPeakRssBytes = Math.max(selfPeak, process.memoryUsage.rss());
    return result;
  } finally {
    clearInterval(sampler);
    await pool?.close();
    await adapter.close();
  }
}

export function parseArgs(argv: readonly string[]): RunOnceOptions & { out: string } {
  const get = (name: string) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const repo = get('repo');
  const base = get('base');
  const out = get('out');
  if (!repo || !base || !out) {
    throw new Error('usage: run-once.ts --repo <dir> --base <commit> --head <commit> --out <file>');
  }
  const g09 = get('g09') ?? 'batched';
  if (g09 !== 'batched' && g09 !== 'adapter') throw new Error(`--g09 ${g09}: batched or adapter`);
  return {
    repo,
    base,
    head: get('head') ?? 'HEAD',
    out,
    workers: Number(get('workers') ?? defaultWorkers()),
    heapMb: Number(get('heap-mb') ?? DEFAULT_HEAP_MB),
    g09,
    eagerGrammars: argv.includes('--eager-grammars'),
  };
}

const isMain =
  process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  const { out, ...options } = parseArgs(process.argv.slice(2));
  runOnce(options).then(
    (result) => {
      writeFileSync(out, JSON.stringify(result, null, 2) + '\n', 'utf8');
      process.exit(0);
    },
    (error: unknown) => {
      console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
      process.exit(1);
    },
  );
}
