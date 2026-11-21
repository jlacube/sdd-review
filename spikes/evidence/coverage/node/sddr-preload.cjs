// Spike C001-T-020 (spike-grade, never shipped): Node.js preload for per-test line coverage of the
// changed files (C001-ADR-007 §2, TypeScript/JavaScript row). Loaded through
// NODE_OPTIONS=--require <runtime>/node/sddr-preload.cjs; reads its configuration from the file
// named by SDDR_NODE_CONFIG (in <workspace>.aux/). C001-T-057 replaces it.
//
// What the prototype covers: Jest (jest-circus), whose test modules are compiled through
// `vm.Script` in the test environment's context. The changed files are instrumented with
// istanbul-lib-instrument after the framework's transform (ts-jest), under a private counter
// variable; statement start lines are mapped back through the inline source map with
// @jridgewell/trace-mapping. Both libraries are taken from the workspace's node_modules (Jest
// depends on them) — the product ships its own pinned copies (licence report S-08, S-09). Test
// boundaries come from a jest-circus event handler: counters are reset at `test_start` and read at
// `test_done`. Vitest, Mocha and node:test are not prototyped here.
//
// Load monitor: every script compiled from a snapshot path under the working tree or another
// workspace root of the snapshot is written as an `outside` record (ERR-EVID-008 / ERR-EVID-011).
'use strict';
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS preload loaded by --require */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Module = require('node:module');

function main() {
  const configPath = process.env.SDDR_NODE_CONFIG;
  if (!configPath) return;
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    return;
  }
  const ci = cfg.caseInsensitive === true;
  const norm = (p) => {
    const s = String(p).replace(/\\/g, '/');
    return ci ? s.toLowerCase() : s;
  };
  const targets = new Set((cfg.files || []).map(norm));
  const snapshotPaths = new Set((cfg.snapshotPaths || []).map(norm));
  const outsideRoots = (cfg.outsideRoots || []).map((r) => norm(r).replace(/\/+$/, '') + '/');
  const outFile = path.join(cfg.outDir, `node-${process.pid}.jsonl`);
  const COV = '__sddr_cov__';
  const EVAL_RESULT = 'Object.<anonymous>';

  const write = (rec) => {
    try {
      fs.mkdirSync(cfg.outDir, { recursive: true });
      fs.appendFileSync(outFile, JSON.stringify(rec) + '\n');
    } catch {
      /* the run goes on without the record */
    }
  };

  // --- load monitor -------------------------------------------------------------------------
  const reported = new Set();
  const monitor = (filename) => {
    if (!filename || outsideRoots.length === 0) return;
    const f = norm(filename);
    if (reported.has(f)) return;
    for (const root of outsideRoots) {
      if (f.startsWith(root) && snapshotPaths.has(f.slice(root.length))) {
        reported.add(f);
        write({ kind: 'outside', file: filename });
        return;
      }
    }
  };

  // --- instrumentation ----------------------------------------------------------------------
  let req = null;
  let instrumenter = null;
  let traceMapping = null;
  const lineOf = new Map(); // filename -> { [statementId]: original line }
  const loadLibraries = () => {
    if (req) return instrumenter !== null;
    req = Module.createRequire(path.join(cfg.workspaceRoot, 'package.json'));
    try {
      const { createInstrumenter } = req('istanbul-lib-instrument');
      instrumenter = createInstrumenter({
        coverageVariable: COV,
        esModules: false,
        compact: true,
        produceSourceMap: false,
        autoWrap: true,
      });
    } catch (error) {
      write({ kind: 'error', message: `istanbul-lib-instrument: ${error.message}` });
      instrumenter = null;
    }
    try {
      traceMapping = req('@jridgewell/trace-mapping');
    } catch {
      traceMapping = null;
    }
    return instrumenter !== null;
  };
  const INLINE_MAP =
    /\/\/[#@] sourceMappingURL=data:application\/json;(?:charset=[^;,]+;)?base64,([A-Za-z0-9+/=]+)\s*$/m;

  const instrument = (code, filename) => {
    if (!loadLibraries()) return null;
    try {
      const out = instrumenter.instrumentSync(code, filename);
      const fc = instrumenter.lastFileCoverage();
      const map = {};
      let tracer = null;
      const m = INLINE_MAP.exec(code);
      if (m && traceMapping) {
        try {
          tracer = new traceMapping.TraceMap(Buffer.from(m[1], 'base64').toString('utf8'));
        } catch {
          tracer = null;
        }
      }
      for (const [id, loc] of Object.entries(fc.statementMap)) {
        let line = loc.start.line;
        if (tracer) {
          const pos = traceMapping.originalPositionFor(tracer, {
            line: loc.start.line,
            column: loc.start.column,
          });
          if (pos && pos.line) line = pos.line;
          else continue; // generated code with no source line (helpers)
        }
        map[id] = line;
      }
      lineOf.set(filename, map);
      return out;
    } catch (error) {
      write({ kind: 'error', message: `instrument ${filename}: ${error.message}` });
      return null;
    }
  };

  // --- per-test counters (jest-circus) --------------------------------------------------------
  const resetCounters = (ctx) => {
    const cov = ctx[COV];
    if (!cov) return;
    for (const fc of Object.values(cov)) for (const k of Object.keys(fc.s)) fc.s[k] = 0;
  };
  const executedLines = (ctx) => {
    const cov = ctx[COV];
    const out = {};
    if (!cov) return out;
    for (const [file, fc] of Object.entries(cov)) {
      const map = lineOf.get(file) || lineOf.get(fc.path) || {};
      const lines = new Set();
      for (const [k, n] of Object.entries(fc.s))
        if (n > 0 && map[k] !== undefined) lines.add(map[k]);
      if (lines.size > 0) out[file] = [...lines].sort((a, b) => a - b);
    }
    return out;
  };
  const testIdOf = (ctx, test) => {
    const names = [];
    for (let n = test; n && n.parent; n = n.parent) names.unshift(n.name);
    const testPathOf = () => {
      try {
        return ctx.expect && ctx.expect.getState ? ctx.expect.getState().testPath || '' : '';
      } catch {
        return '';
      }
    };
    const testPath = testPathOf();
    const rel = testPath
      ? path.relative(cfg.workspaceRoot, testPath).split(path.sep).join('/')
      : '';
    return `${rel} > ${names.join(' > ')}`;
  };
  const hookCircus = (circusExports, ctx) => {
    if (!circusExports || typeof circusExports.addEventHandler !== 'function') return;
    const started = new WeakMap();
    let loadFlushed = false;
    circusExports.addEventHandler((event) => {
      if (event.name === 'test_start') {
        if (!loadFlushed) {
          loadFlushed = true;
          const lines = executedLines(ctx);
          if (Object.keys(lines).length > 0) {
            write({
              kind: 'test',
              testId: `${testIdOf(ctx, { parent: null })}<load>`,
              outcome: 'passed',
              lines,
            });
          }
        }
        resetCounters(ctx);
        started.set(event.test, Date.now());
      } else if (event.name === 'test_done') {
        const errors = event.test.errors || [];
        write({
          kind: 'test',
          testId: testIdOf(ctx, event.test),
          outcome: errors.length > 0 ? 'failed' : 'passed',
          durationMs: Date.now() - (started.get(event.test) || Date.now()),
          failureMessage:
            errors.length > 0
              ? String(errors[0] && (errors[0].message || errors[0])).slice(0, 2000)
              : undefined,
          lines: executedLines(ctx),
        });
      } else if (event.name === 'test_skip' || event.name === 'test_todo') {
        write({ kind: 'test', testId: testIdOf(ctx, event.test), outcome: 'skipped', lines: {} });
      }
    });
  };

  const isCircusState = (filename) => /[\\/]jest-circus[\\/]build[\\/]state\.js$/.test(filename);

  const OriginalScript = vm.Script;
  class SddrScript extends OriginalScript {
    constructor(code, options) {
      const filename = typeof options === 'string' ? options : options && options.filename;
      let source = code;
      if (filename && targets.size > 0 && targets.has(norm(filename))) {
        const out = instrument(String(code), filename);
        if (out !== null) source = out;
      }
      monitor(filename);
      super(source, options);
      this.sddrFilename = filename || '';
    }

    runInContext(contextifiedObject, options) {
      const result = super.runInContext(contextifiedObject, options);
      if (isCircusState(this.sddrFilename) && result && typeof result[EVAL_RESULT] === 'function') {
        const fn = result[EVAL_RESULT];
        result[EVAL_RESULT] = function (module, ...rest) {
          const r = fn.call(this, module, ...rest);
          try {
            hookCircus(module.exports, contextifiedObject);
          } catch (error) {
            write({ kind: 'error', message: `jest-circus hook: ${error.message}` });
          }
          return r;
        };
      }
      return result;
    }
  }
  vm.Script = SddrScript;

  const originalCompile = Module.prototype._compile;
  Module.prototype._compile = function (content, filename) {
    monitor(filename);
    return originalCompile.call(this, content, filename);
  };
}

main();
