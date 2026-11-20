import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// C001-REQ-913 and C001-CON-09: the analysis core loads and runs with the local review UI server
// and the web client neither installed nor imported. The ESLint rule `no-restricted-imports` in
// eslint.config.js enforces the same boundary on every edit; this test proves it on the real
// import graph of the core entry point, which is what a build without the UI contains.

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SRC = join(ROOT, 'src');
const ENTRY = join(SRC, 'core', 'api', 'index.ts');

const IMPORT = /(?:\bfrom\s+|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g;

function listTs(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listTs(path) : path.endsWith('.ts') ? [path] : [];
  });
}

function resolveRelative(from: string, specifier: string): string {
  const target = resolve(dirname(from), specifier);
  return target.replace(/\.js$/, '.ts');
}

/** Every source file reachable from `entry` through relative imports, with its specifiers. */
function closure(entry: string) {
  const files = new Map<string, string[]>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (files.has(file)) continue;
    const specifiers = [...readFileSync(file, 'utf8').matchAll(IMPORT)].map((m) => m[1] as string);
    files.set(file, specifiers);
    for (const s of specifiers) if (s.startsWith('.')) queue.push(resolveRelative(file, s));
  }
  return files;
}

const inUi = (path: string) => {
  const rel = relative(ROOT, path).split(sep).join('/');
  return rel.startsWith('src/ui-server/') || rel.startsWith('web/');
};

describe('the analysis core without the UI (C001-REQ-913)', () => {
  const graph = closure(ENTRY);

  it('reaches the git adapter, intake, store and orchestrator from the core API entry point', () => {
    const rel = [...graph.keys()].map((f) => relative(SRC, f).split(sep).join('/'));
    for (const part of [
      'core/intake/snapshot.ts',
      'core/store/snapshots.ts',
      'core/store/revisions.ts',
      'core/git/port.ts',
      'core/orchestrator/event-loop.ts',
      'core/orchestrator/jobs.ts',
      'core/orchestrator/identity.ts',
    ]) {
      expect(rel, part).toContain(part);
    }
  });

  it('imports no file of the UI server or the web client, directly or transitively', () => {
    const offenders = [...graph.entries()].flatMap(([file, specifiers]) =>
      specifiers
        .filter((s) => s.startsWith('.') && inUi(resolveRelative(file, s)))
        .map((s) => `${relative(ROOT, file)} -> ${s}`),
    );
    expect(offenders).toEqual([]);
  });

  it('imports no package of the UI side (a dev server or a web framework)', () => {
    const bare = new Set(
      [...graph.values()].flat().filter((s) => !s.startsWith('.') && !s.startsWith('node:')),
    );
    expect(
      [...bare].filter((s) => /^(vite|react|vue|svelte|express|fastify|ws)(\/|$)/.test(s)),
    ).toEqual([]);
  });

  it('keeps every file of src/core free of UI imports, not only those the entry point reaches', () => {
    const offenders = listTs(join(SRC, 'core')).flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(IMPORT)]
        .map((m) => m[1] as string)
        .filter((s) => /(^|\/)(ui-server|web)(\/|$)/.test(s))
        .map((s) => `${relative(ROOT, file)} -> ${s}`),
    );
    expect(offenders).toEqual([]);
  });
});
