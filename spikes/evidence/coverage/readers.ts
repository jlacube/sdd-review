// Spike C001-T-020 (spike-grade): readers of what the three prototype adapters write in
// `<workspace>.aux/`, each turned into the common PerTestCoverage. Pure (text in, data out).
// C001-T-057 to C001-T-059 replace them.
import type { PerTestCoverage, SpikeTest, TestOutcome } from '../changed.js';

/** An absolute path as a repository path below `root`, or null outside it. */
export function relativeTo(root: string, file: string, caseInsensitive: boolean): string | null {
  const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '');
  const r = norm(root);
  const f = norm(file);
  const a = caseInsensitive ? r.toLowerCase() : r;
  const b = caseInsensitive ? f.toLowerCase() : f;
  if (!b.startsWith(`${a}/`)) return null;
  return f.slice(r.length + 1);
}

type Lines = Map<string, Map<number, Set<string>>>;

function addLine(lines: Lines, path: string, line: number, test: string): void {
  const byLine = lines.get(path) ?? new Map<number, Set<string>>();
  const set = byLine.get(line) ?? new Set<string>();
  set.add(test);
  byLine.set(line, set);
  lines.set(path, byLine);
}

const freeze = (lines: Lines) =>
  new Map([...lines].map(([p, m]) => [p, new Map([...m].map(([l, s]) => [l, [...s].sort()]))]));

// ---------------------------------------------------------------------------------------------
// Node preload: JSON lines

/**
 * Lines written by `node/sddr-preload.cjs`:
 * `{"kind":"test","testId","outcome","durationMs","failureMessage","lines":{"<abs>":[n,...]}}`
 * and `{"kind":"outside","file":"<abs>"}`.
 */
export function readNodeLines(
  text: string,
  workspaceRoot: string,
  caseInsensitive: boolean,
): PerTestCoverage {
  const tests = new Map<string, SpikeTest>();
  const lines: Lines = new Map();
  const outside = new Set<string>();
  for (const raw of text.split('\n')) {
    if (raw.trim() === '') continue;
    let rec: Record<string, unknown>;
    try {
      rec = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      continue; // a line cut by a killed worker
    }
    if (rec.kind === 'outside' && typeof rec.file === 'string') outside.add(rec.file);
    if (rec.kind !== 'test' || typeof rec.testId !== 'string') continue;
    const testId = rec.testId;
    const outcome = (rec.outcome as TestOutcome) ?? 'passed';
    const prev = tests.get(testId);
    if (!prev || outcome === 'failed') {
      tests.set(testId, {
        testId,
        outcome,
        durationMs: typeof rec.durationMs === 'number' ? rec.durationMs : undefined,
        failureMessage: typeof rec.failureMessage === 'string' ? rec.failureMessage : undefined,
      });
    }
    for (const [file, ls] of Object.entries((rec.lines as Record<string, number[]>) ?? {})) {
      const rel = relativeTo(workspaceRoot, file, caseInsensitive);
      if (rel === null) continue;
      for (const l of ls) addLine(lines, rel, l, testId);
    }
  }
  return {
    ecosystem: 'typescript-javascript',
    tests: [...tests.values()],
    lines: freeze(lines),
    loadedOutside: [...outside].sort(),
  };
}

// ---------------------------------------------------------------------------------------------
// Python pytest plugin: one JSON file per process

export interface PythonResultFile {
  readonly interpreter: string;
  readonly tests: ReadonlyArray<{
    nodeid: string;
    outcome: string;
    duration?: number;
    message?: string;
  }>;
  /** Absolute file → line (as a string key) → contexts (test node IDs; '' for none). */
  readonly lines: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>>;
  readonly loadedOutside?: readonly string[];
}

export function readPythonResult(
  file: PythonResultFile,
  workspaceRoot: string,
  caseInsensitive: boolean,
): PerTestCoverage {
  const tests: SpikeTest[] = file.tests.map((t) => ({
    testId: t.nodeid,
    outcome: t.outcome === 'failed' ? 'failed' : t.outcome === 'skipped' ? 'skipped' : 'passed',
    durationMs: t.duration !== undefined ? Math.round(t.duration * 1000) : undefined,
    failureMessage: t.message,
  }));
  const lines: Lines = new Map();
  for (const [abs, byLine] of Object.entries(file.lines)) {
    const rel = relativeTo(workspaceRoot, abs, caseInsensitive);
    if (rel === null) continue;
    for (const [line, contexts] of Object.entries(byLine)) {
      for (const c of contexts) {
        // coverage.py appends "|run" style suffixes only with dynamic_context; ours are bare IDs.
        if (c !== '') addLine(lines, rel, Number(line), c);
      }
    }
  }
  return {
    ecosystem: 'python',
    tests,
    lines: freeze(lines),
    loadedOutside: [...(file.loadedOutside ?? [])],
    interpreter: file.interpreter,
  };
}

// ---------------------------------------------------------------------------------------------
// .NET: AltCover OpenCover report with tracked methods, joined with VSTest TRX results

const unescapeXml = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([A-Za-z_:][\w:.-]*)="([^"]*)"/g)) out[m[1]!] = unescapeXml(m[2]!);
  return out;
}

/**
 * The test identity of an OpenCover tracked-method name: `System.Void Ns.C/Inner::M(System.Int32)`
 * → `Ns.C+Inner.M`, which is TRX's `className` + `.` + `name` without arguments.
 */
export function trackedMethodTestId(name: string): string {
  const sig = name.includes(' ') ? name.slice(name.indexOf(' ') + 1) : name;
  const noArgs = sig.replace(/\(.*$/, '');
  const [cls, method] = noArgs.split('::');
  return `${(cls ?? '').replace(/\//g, '+')}.${method ?? ''}`;
}

export interface TrxResult {
  readonly testId: string;
  readonly outcome: TestOutcome;
  readonly durationMs: number;
  readonly message?: string;
}

const durationMs = (d: string | undefined) => {
  const m = /^(\d+):(\d+):(\d+(?:\.\d+)?)$/.exec(d ?? '');
  return m ? Math.round(((+m[1]! * 60 + +m[2]!) * 60 + +m[3]!) * 1000) : 0;
};

/** TRX results keyed by test method (`className.name`), theory rows folded into one. */
export function readTrx(text: string): TrxResult[] {
  const methodOf = new Map<string, string>();
  for (const m of text.matchAll(/<UnitTest\b([^>]*)>([\s\S]*?)<\/UnitTest>/g)) {
    const id = attrs(m[1]!).id;
    const tm = /<TestMethod\b([^>]*)\/?>/.exec(m[2]!);
    if (!id || !tm) continue;
    const a = attrs(tm[1]!);
    // A theory row is `Name (hash)` (xUnit v2) or `Name(args)`: fold rows into the method.
    methodOf.set(id, `${a.className ?? ''}.${(a.name ?? '').replace(/[\s(].*$/, '')}`);
  }
  const results = new Map<string, TrxResult>();
  for (const m of text.matchAll(/<UnitTestResult\b([^>]*?)(\/>|>([\s\S]*?)<\/UnitTestResult>)/g)) {
    const a = attrs(m[1]!);
    const testId = methodOf.get(a.testId ?? '');
    if (!testId) continue;
    const outcome: TestOutcome =
      a.outcome === 'Failed' || a.outcome === 'Error' || a.outcome === 'Timeout'
        ? 'failed'
        : a.outcome === 'Passed'
          ? 'passed'
          : 'skipped';
    const message = /<Message>([\s\S]*?)<\/Message>/.exec(m[3] ?? '')?.[1];
    const prev = results.get(testId);
    const ms = durationMs(a.duration);
    if (!prev) {
      results.set(testId, {
        testId,
        outcome,
        durationMs: ms,
        message: message && unescapeXml(message),
      });
      continue;
    }
    const merged: TestOutcome =
      prev.outcome === 'failed' || outcome === 'failed'
        ? 'failed'
        : prev.outcome === 'passed' || outcome === 'passed'
          ? 'passed'
          : 'skipped';
    results.set(testId, { ...prev, outcome: merged, durationMs: prev.durationMs + ms });
  }
  return [...results.values()];
}

/** Per-test lines from an OpenCover report with tracked methods (AltCover `--callContext`). */
export function readOpenCover(
  text: string,
  workspaceRoot: string,
  caseInsensitive: boolean,
): { lines: Lines; trackedTests: Set<string> } {
  const tracked = new Map<string, string>();
  for (const m of text.matchAll(/<TrackedMethod\b([^>]*)\/?>/g)) {
    const a = attrs(m[1]!);
    if (a.uid && a.name) tracked.set(a.uid, trackedMethodTestId(a.name));
  }
  const lines: Lines = new Map();
  for (const mod of text.split(/<Module\b/).slice(1)) {
    const files = new Map<string, string>();
    for (const f of mod.matchAll(/<File\b([^>]*)\/?>/g)) {
      const a = attrs(f[1]!);
      if (a.uid && a.fullPath) files.set(a.uid, a.fullPath);
    }
    for (const sp of mod.matchAll(/<SequencePoint\b([^>]*?)(\/>|>([\s\S]*?)<\/SequencePoint>)/g)) {
      const a = attrs(sp[1]!);
      const file = files.get(a.fileid ?? '');
      if (!file || !sp[3]) continue;
      const rel = relativeTo(workspaceRoot, file, caseInsensitive);
      if (rel === null) continue;
      const sl = Number(a.sl);
      const el = Number(a.el || a.sl);
      for (const ref of sp[3].matchAll(/<TrackedMethodRef\b([^>]*)\/?>/g)) {
        const r = attrs(ref[1]!);
        const test = tracked.get(r.uid ?? '');
        if (!test || Number(r.vc ?? '1') <= 0) continue;
        for (let l = sl; l <= el; l++) addLine(lines, rel, l, test);
      }
    }
  }
  return { lines, trackedTests: new Set(tracked.values()) };
}

/** OpenCover reports and TRX files of one run, joined by test method name. */
export function readDotnetResults(
  openCover: readonly string[],
  trx: readonly string[],
  workspaceRoot: string,
  caseInsensitive: boolean,
): PerTestCoverage & { unmatchedTrackedTests: number } {
  const lines: Lines = new Map();
  const tracked = new Set<string>();
  for (const text of openCover) {
    const r = readOpenCover(text, workspaceRoot, caseInsensitive);
    for (const [p, m] of r.lines)
      for (const [l, s] of m) for (const t of s) addLine(lines, p, l, t);
    for (const t of r.trackedTests) tracked.add(t);
  }
  const results = new Map<string, TrxResult>();
  for (const text of trx) for (const r of readTrx(text)) results.set(r.testId, r);
  const tests: SpikeTest[] = [...results.values()].map((r) => ({
    testId: r.testId,
    outcome: r.outcome,
    durationMs: r.durationMs,
    failureMessage: r.message,
  }));
  return {
    ecosystem: 'csharp-dotnet',
    tests,
    lines: freeze(lines),
    loadedOutside: [],
    unmatchedTrackedTests: [...tracked].filter((t) => !results.has(t)).length,
  };
}
