import { stat as fsStat } from 'node:fs/promises';
import { join, posix, win32 } from 'node:path';
import {
  executeCopy,
  planCopy,
  type CopyOptions,
  type CopyPlan,
  type CopyResult,
} from './copier.js';
import { isSafeEntryPath, type WorkspaceEntry } from './fill.js';
import type { IgnoreRules } from './ignore.js';

/**
 * The ignored paths of the working tree made available in an evidence workspace (C001-ADR-006 §3,
 * C001-IF-013 §2 item 4). The built-in list, not configurable in this release:
 *
 * | Ecosystem | Made available |
 * |---|---|
 * | TypeScript/JavaScript | every `node_modules/` next to a `package.json` of the snapshot; the Yarn Plug'n'Play files `.pnp.cjs`, `.pnp.loader.mjs`, `.pnp.data.json`, `.yarn/cache/`, `.yarn/unplugged/`, `.yarn/install-state.gz` |
 * | Python | nothing: third-party distributions come from the developer's environment |
 * | C#/.NET | a packages folder that a `nuget.config` of the snapshot places under the working-tree root (`globalPackagesFolder`, `repositoryPath`, a local feed directory) |
 * | any | no local settings (`.env*` and similar) |
 *
 * Only candidates that exist in the working tree and that the snapshot's ignore rules exclude are
 * made available, so the workspace check never sees them. `obj/` and `bin/` are never made
 * available, and the transform caches of §3.2 are left out of every copy from the working tree
 * (`isLeftOut`). The selection is pure (`selectAvailable` takes a probe); `planAvailable` reads the
 * working tree and `makeAvailable` copies with the copier of §3.1.
 */

export type Ecosystem = 'typescript-javascript' | 'csharp-dotnet';

export interface AvailableCandidate {
  /** Repository-relative, '/' separators. */
  readonly path: string;
  readonly kind: 'dir' | 'file';
  readonly ecosystem: Ecosystem;
  /** The snapshot file that names it (`package.json`, `nuget.config`). */
  readonly source: string;
}

const dirOf = (path: string) => {
  const i = path.lastIndexOf('/');
  return i < 0 ? '' : path.slice(0, i);
};
const under = (dir: string, name: string) => (dir === '' ? name : `${dir}/${name}`);
const hasComponent = (path: string, names: readonly string[]) =>
  path.split('/').some((c) => names.includes(c));

const YARN_FILES = ['.pnp.cjs', '.pnp.loader.mjs', '.pnp.data.json', '.yarn/install-state.gz'];
const YARN_DIRS = ['.yarn/cache', '.yarn/unplugged'];

/** TypeScript/JavaScript candidates: per `package.json` of the snapshot outside `node_modules`. */
export function nodeCandidates(snapshotPaths: Iterable<string>): AvailableCandidate[] {
  const out: AvailableCandidate[] = [];
  for (const path of snapshotPaths) {
    if (path !== 'package.json' && !path.endsWith('/package.json')) continue;
    if (hasComponent(path, ['node_modules'])) continue;
    const dir = dirOf(path);
    const add = (name: string, kind: 'dir' | 'file') =>
      out.push({ path: under(dir, name), kind, ecosystem: 'typescript-javascript', source: path });
    add('node_modules', 'dir');
    for (const f of YARN_FILES) add(f, 'file');
    for (const d of YARN_DIRS) add(d, 'dir');
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// nuget.config

export interface NugetFolders {
  readonly globalPackagesFolder?: string;
  readonly repositoryPath?: string;
  /** Every `<add value>` of `<packageSources>`, URLs included. */
  readonly sources: readonly string[];
}

const decodeXml = (s: string) =>
  s.replace(/&(lt|gt|quot|apos|amp|#x[0-9a-fA-F]+|#\d+);/g, (whole, e: string) => {
    if (e === 'lt') return '<';
    if (e === 'gt') return '>';
    if (e === 'quot') return '"';
    if (e === 'apos') return "'";
    if (e === 'amp') return '&';
    const code = e.startsWith('#x') ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
  });

function addElements(section: string): Array<Record<string, string>> {
  const out: Array<Record<string, string>> = [];
  for (const m of section.matchAll(/<add\b([^>]*?)\/?>/gi)) {
    const attrs: Record<string, string> = {};
    for (const a of m[1]!.matchAll(/([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) {
      attrs[a[1]!.toLowerCase()] = decodeXml(a[3] ?? a[4] ?? '');
    }
    out.push(attrs);
  }
  return out;
}

function sections(xml: string, name: string): string[] {
  const re = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}\\s*>`, 'gi');
  return [...xml.matchAll(re)].map((m) => m[1]!);
}

/** The folder settings of one `nuget.config`; a lenient reader of the elements NuGet uses. */
export function parseNugetConfig(content: string): NugetFolders {
  const xml = content.replace(/<!--[\s\S]*?-->/g, '');
  let globalPackagesFolder: string | undefined;
  let repositoryPath: string | undefined;
  for (const s of sections(xml, 'config')) {
    for (const a of addElements(s)) {
      const key = a.key?.toLowerCase();
      if (key === 'globalpackagesfolder' && a.value !== undefined) globalPackagesFolder = a.value;
      if (key === 'repositorypath' && a.value !== undefined) repositoryPath = a.value;
    }
  }
  const sources: string[] = [];
  for (const s of sections(xml, 'packageSources')) {
    for (const a of addElements(s)) if (a.value !== undefined) sources.push(a.value);
  }
  return {
    ...(globalPackagesFolder !== undefined ? { globalPackagesFolder } : {}),
    ...(repositoryPath !== undefined ? { repositoryPath } : {}),
    sources,
  };
}

export interface PlaceOptions {
  /** The working-tree root, to place an absolute folder (any separator). */
  readonly workTreeRoot: string;
  readonly platform?: NodeJS.Platform;
}

/**
 * The repository-relative path that a folder value of a `nuget.config` at `configPath` names, or
 * null when it lies outside the working-tree root, is a URL, or names an environment variable
 * (which is not expanded: its value is the developer's, not the snapshot's).
 */
export function placeFolder(configPath: string, value: string, o: PlaceOptions): string | null {
  const v = value.trim();
  if (v === '' || /^[a-z][a-z0-9+.-]*:\/\//i.test(v) || /%[^%]+%|\$/.test(v)) return null;
  const platform = o.platform ?? process.platform;
  const win = platform === 'win32';
  const slashed = v.replace(/\\/g, '/');
  const absolute = win ? win32.isAbsolute(v) : posix.isAbsolute(slashed);
  if (absolute) {
    const root = o.workTreeRoot.replace(/\\/g, '/').replace(/\/+$/, '');
    if (root === '') return null;
    const fold = (s: string) => (win || platform === 'darwin' ? s.toLowerCase() : s);
    const target = posix.normalize(slashed);
    if (fold(target) === fold(root)) return null;
    if (!fold(target).startsWith(`${fold(root)}/`)) return null;
    return target.slice(root.length + 1).replace(/\/+$/, '') || null;
  }
  const joined = posix.normalize(posix.join(dirOf(configPath), slashed)).replace(/\/+$/, '');
  if (joined === '.' || joined === '' || joined === '..' || joined.startsWith('../')) return null;
  return joined;
}

const NUGET_CONFIG = /(^|\/)nuget\.config$/i;

/** True for a `nuget.config` of the snapshot (NuGet matches the name whatever its letter case). */
export const isNugetConfig = (path: string) => NUGET_CONFIG.test(path);

/** C#/.NET candidates from the `nuget.config` files of the snapshot. */
export function nugetCandidates(
  configs: ReadonlyArray<{ readonly path: string; readonly content: string }>,
  o: PlaceOptions,
): AvailableCandidate[] {
  const out: AvailableCandidate[] = [];
  for (const c of configs) {
    const f = parseNugetConfig(c.content);
    const values = [f.globalPackagesFolder, f.repositoryPath, ...f.sources].filter(
      (v): v is string => v !== undefined,
    );
    for (const v of values) {
      const path = placeFolder(c.path, v, o);
      if (path !== null)
        out.push({ path, kind: 'dir', ecosystem: 'csharp-dotnet', source: c.path });
    }
  }
  return out;
}

/** Every candidate of the built-in list for a snapshot. */
export function availableCandidates(
  snapshotPaths: readonly string[],
  nugetConfigs: ReadonlyArray<{ readonly path: string; readonly content: string }>,
  o: PlaceOptions = { workTreeRoot: '' },
): AvailableCandidate[] {
  return [...nodeCandidates(snapshotPaths), ...nugetCandidates(nugetConfigs, o)];
}

// ---------------------------------------------------------------------------------------------
// Selection

export interface SelectOptions {
  readonly ignore: IgnoreRules;
  /** What the working tree holds at a repository-relative path (following links); null if none. */
  readonly probe: (path: string) => Promise<'dir' | 'file' | null>;
}

/**
 * The candidates made available: safe paths, never `obj/` or `bin/`, existing in the working tree
 * with the expected kind, excluded by the ignore rules, and not below another chosen path.
 * Sorted by path, without duplicates.
 */
export async function selectAvailable(
  candidates: readonly AvailableCandidate[],
  o: SelectOptions,
): Promise<AvailableCandidate[]> {
  const unique = new Map<string, AvailableCandidate>();
  for (const c of candidates) if (!unique.has(c.path)) unique.set(c.path, c);
  const sorted = [...unique.values()].sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
  );
  const chosen: AvailableCandidate[] = [];
  for (const c of sorted) {
    if (!isSafeEntryPath(c.path) || hasComponent(c.path, ['obj', 'bin'])) continue;
    if (chosen.some((p) => c.path.startsWith(`${p.path}/`))) continue;
    if (!o.ignore.isIgnored(c.path, c.kind === 'dir')) continue;
    if ((await o.probe(c.path)) !== c.kind) continue;
    chosen.push(c);
  }
  return chosen;
}

// ---------------------------------------------------------------------------------------------
// Left out (§3.2)

const LEFT_OUT_IN_NODE_MODULES = ['.cache', '.vite', '.vite-temp', '.vitest', '.prisma'];

/**
 * True for a path (relative, '/' separators) that no copy from the working tree takes: a
 * transform cache or generated code of the project's own files directly inside a `node_modules`
 * directory, at any depth (C001-ADR-006 §3.2).
 */
export function isLeftOut(path: string): boolean {
  const parts = path.split('/');
  for (let i = 0; i + 1 < parts.length; i++) {
    if (parts[i] === 'node_modules' && LEFT_OUT_IN_NODE_MODULES.includes(parts[i + 1]!))
      return true;
  }
  return false;
}

// ---------------------------------------------------------------------------------------------
// Making the paths available

export interface AvailablePlan {
  readonly chosen: readonly AvailableCandidate[];
  /** What the copy takes from the working tree; null when nothing is made available. */
  readonly plan: CopyPlan | null;
}

export interface PlanAvailableOptions {
  /** Real path of the working-tree root. */
  readonly workTreeRoot: string;
  /** The paths of the snapshot with their modes and content readers. */
  readonly entries: readonly WorkspaceEntry[];
  readonly ignore: IgnoreRules;
  readonly platform?: NodeJS.Platform;
  readonly concurrency?: number;
}

/**
 * Chooses the ignored paths of the working tree to make available and lists what their copy
 * takes, leaving out §3.2 and every snapshot path. Reads the working tree only.
 */
export async function planAvailable(o: PlanAvailableOptions): Promise<AvailablePlan> {
  const snapshotPaths = o.entries.filter((e) => e.mode !== 'submodule').map((e) => e.path);
  const configs: Array<{ path: string; content: string }> = [];
  for (const e of o.entries) {
    if (e.mode !== 'regular' && e.mode !== 'executable') continue;
    if (isNugetConfig(e.path))
      configs.push({ path: e.path, content: (await e.read()).toString('utf8') });
  }
  const candidates = availableCandidates(snapshotPaths, configs, {
    workTreeRoot: o.workTreeRoot,
    platform: o.platform,
  });
  if (candidates.length === 0) return { chosen: [], plan: null };
  const chosen = await selectAvailable(candidates, {
    ignore: o.ignore,
    probe: async (path) => {
      const st = await fsStat(join(o.workTreeRoot, ...path.split('/'))).catch(() => null);
      return st === null ? null : st.isDirectory() ? 'dir' : st.isFile() ? 'file' : null;
    },
  });
  if (chosen.length === 0) return { chosen, plan: null };
  const taken = new Set(snapshotPaths);
  const plan = await planCopy(
    o.workTreeRoot,
    chosen.map((c) => c.path),
    { exclude: isLeftOut, skip: (rel) => taken.has(rel), concurrency: o.concurrency },
  );
  return { chosen, plan };
}

export interface AvailableResult {
  readonly paths: readonly AvailableCandidate[];
  /** Size and modification time of each copied file, which the copy keeps. */
  readonly files: ReadonlyMap<string, { readonly size: number; readonly mtimeMs: number }>;
  readonly leftOut: readonly string[];
  readonly copy: CopyResult | null;
}

/** Copies what `planAvailable` chose into the workspace at `workspaceRoot`. */
export async function makeAvailable(
  p: AvailablePlan,
  workspaceRoot: string,
  options: CopyOptions,
): Promise<AvailableResult> {
  if (p.plan === null) return { paths: p.chosen, files: new Map(), leftOut: [], copy: null };
  const copy = await executeCopy(p.plan, workspaceRoot, options);
  const files = new Map<string, { size: number; mtimeMs: number }>();
  for (const e of p.plan.entries) {
    if (e.kind === 'file') files.set(e.rel, { size: e.size, mtimeMs: e.mtimeMs });
  }
  return { paths: p.chosen, files, leftOut: p.plan.leftOut, copy };
}
