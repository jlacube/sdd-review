import { lstat, readFile, stat } from 'node:fs/promises';
import { delimiter, dirname, isAbsolute, join, resolve } from 'node:path';
import { ReviewError } from '../errors/review-error.js';
import type { ContextualLog } from '../log/log.js';
import { lookupAttribute, parseAttributeFile, type AttributeFile } from './attributes.js';
import { cleanFilterAttribution } from './clean-filter.js';
import { indexFileMtimeNs } from './index-stat.js';
import { attributeHistory, type HistoryCommit } from './line-attribution.js';
import { splitLines } from './line-diff.js';
import type {
  AttributionSides,
  ChangedFile,
  CommitInfo,
  DefaultBranch,
  GitAccessPort,
  HeadInfo,
  IndexEntryState,
  LineAttribution,
  ObjectFormat,
  RepositoryLocation,
  SubmoduleTree,
  TreeEntry,
  UpstreamInfo,
  UserIdentity,
  WorkingState,
} from './port.js';
import { CatFileBatch, GitProcessRunner, type GitTarget, type RunResult } from './process.js';
import { firstErrorEntry, GitAccessChecker } from './program-check.js';
import { detectRenames, type RenameSide } from './renames.js';
import {
  configBool,
  HashCache,
  indexEntryUpToDate,
  looksBinary,
  parseConfigList,
  parseEolListing,
  parseIndexListing,
  parseTreeListing,
  parseUntracked,
  readWorkingBytes,
  scanWorkingTree,
  workingMode,
  workingStat,
  type EolInfo,
  type IndexEntry,
  type ScanEntry,
} from './worktree-compare.js';

/**
 * The git access adapter (C001-COMP-003): the operations G-01 to G-16 of C001-IF-012 §3 on the
 * hardened, read-only runner of C001-T-005. Every error leaves through `ReviewError` and is
 * recorded in the contextual log when one is given.
 */

export interface AdapterOptions {
  /** The developer's environment; default `process.env`. */
  readonly baseEnv?: NodeJS.ProcessEnv;
  /**
   * A git executable to use instead of the first `git` of PATH: its directory is put first on the
   * PATH that the program check searches. For tests that run several git versions.
   */
  readonly gitPath?: string;
  readonly log?: ContextualLog;
  /** Test seam: the clock of the time-stamp rule of C001-IF-012 §8 item 3. */
  readonly now?: () => number;
}

const HASH = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

/** A git command ended with a status that the operation does not expect. */
export class GitCommandFailed extends Error {
  constructor(
    readonly command: string,
    readonly result: RunResult,
  ) {
    super(
      `git ${command} ended with status ${result.status ?? 'none'}: ${
        firstErrorEntry(result.stderr) || '(no message)'
      }`,
    );
    this.name = 'GitCommandFailed';
  }
}

interface ConfigView {
  readonly values: ReadonlyMap<string, string[]>;
  readonly autocrlf: 'true' | 'input' | 'false';
  readonly fileMode: boolean;
  readonly symlinks: boolean;
  readonly ignoreCase: boolean;
}

function configView(values: Map<string, string[]>): ConfigView {
  const raw = values.get('core.autocrlf')?.at(-1)?.trim().toLowerCase();
  const autocrlf =
    raw === 'input' ? 'input' : configBool(values.get('core.autocrlf'), false) ? 'true' : 'false';
  return {
    values,
    autocrlf,
    fileMode: configBool(values.get('core.filemode'), true),
    symlinks: configBool(values.get('core.symlinks'), true),
    ignoreCase: configBool(values.get('core.ignorecase'), false),
  };
}

/** G-09: the commits of a range, oldest first, and the paths each single-parent commit changed. */
interface RangeHistory {
  readonly commits: ReadonlyArray<{ readonly hash: string; readonly parents: readonly string[] }>;
  readonly inRange: ReadonlySet<string>;
  readonly changed: ReadonlyMap<string, ReadonlySet<string>>;
}

const last = (values: readonly string[] | undefined) => values?.[values.length - 1];

/** One repository read by the adapter: the repository of G-01 or a submodule repository (G-16). */
class Repo {
  private batchProcess: CatFileBatch | undefined;
  private readonly trees = new Map<string, Promise<TreeEntry[]>>();

  constructor(
    readonly runner: GitProcessRunner,
    readonly location: RepositoryLocation,
  ) {}

  get target(): GitTarget {
    return this.location.workTreeRoot
      ? { gitDir: this.location.gitDir, workTree: this.location.workTreeRoot }
      : { gitDir: this.location.gitDir };
  }

  get batch(): CatFileBatch {
    this.batchProcess ??= this.runner.batch(this.target);
    return this.batchProcess;
  }

  async run(command: string, args: readonly string[], ok: readonly number[] = [0]) {
    const result = await this.runner.run(command, args, { target: this.target });
    if (result.status === null || !ok.includes(result.status)) {
      throw new GitCommandFailed(`${command} ${args.slice(0, 3).join(' ')}`.trim(), result);
    }
    return result;
  }

  async config(): Promise<ConfigView> {
    const r = await this.run('config', ['--list', '--null']);
    return configView(parseConfigList(r.stdout));
  }

  tree(commit: string): Promise<TreeEntry[]> {
    let tree = this.trees.get(commit);
    if (!tree) {
      tree = this.run('ls-tree', ['-r', '-z', commit]).then((r) => parseTreeListing(r.stdout));
      tree.catch(() => this.trees.delete(commit));
      this.trees.set(commit, tree);
      if (this.trees.size > 8) this.trees.delete(this.trees.keys().next().value!);
    }
    return tree;
  }

  /** A blob by id: its bytes, or null when the object is missing or not a blob. */
  async blobById(oid: string): Promise<Buffer | null> {
    const object = await this.batch.read(oid);
    return object && object.type === 'blob' ? object.content : null;
  }

  async blobAt(commit: string, path: string): Promise<Buffer | null> {
    if (/[\r\n]/.test(path)) {
      // `cat-file --batch` reads one object name per line: find the blob through ls-tree.
      const r = await this.run('ls-tree', ['-z', commit, '--', `:(literal)${path}`]).catch(
        () => null,
      );
      const entry = r ? parseTreeListing(r.stdout).find((e) => e.path === path) : undefined;
      return entry && entry.mode !== 'submodule' ? this.blobById(entry.blob) : null;
    }
    const object = await this.batch.read(`${commit}:${path}`);
    return object && object.type === 'blob' ? object.content : null;
  }

  async close(): Promise<void> {
    const batch = this.batchProcess;
    this.batchProcess = undefined;
    await batch?.close();
  }
}

export class GitAdapter implements GitAccessPort {
  private readonly checker: GitAccessChecker;
  private readonly env: NodeJS.ProcessEnv;
  private root: Repo | undefined;
  private readonly submodules = new Map<string, { repo: Repo; commit: string }>();
  private readonly hashCache = new HashCache();
  private attributeFiles = new Map<string, Promise<AttributeFile[]>>();
  private readonly ranges = new Map<string, Promise<RangeHistory>>();

  constructor(private readonly options: AdapterOptions = {}) {
    const env = { ...(options.baseEnv ?? process.env) };
    if (options.gitPath) {
      const key = Object.keys(env).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH';
      env[key] = `${dirname(options.gitPath)}${delimiter}${env[key] ?? ''}`;
    }
    this.env = env;
    this.checker = new GitAccessChecker({ env });
  }

  // -------------------------------------------------------------------------------------------
  // Plumbing

  /** Ends the long-lived git processes of every repository this adapter read. */
  async close(): Promise<void> {
    await this.root?.close();
    for (const { repo } of this.submodules.values()) await repo.close();
    this.submodules.clear();
  }

  private async guard<T>(
    operation: string,
    inputs: Record<string, unknown>,
    work: () => Promise<T>,
  ): Promise<T> {
    try {
      return await work();
    } catch (error) {
      const failure =
        error instanceof ReviewError
          ? error
          : new ReviewError('ERR-CLI-003', {
              operation,
              inputs,
              params: { operation, cause: error instanceof Error ? error.message : String(error) },
              cause: error,
            });
      this.options.log?.recordError(failure, operation, inputs);
      throw failure;
    }
  }

  private repo(): Repo {
    if (!this.root) {
      throw new Error('discover() must be called before any other operation of the git adapter');
    }
    return this.root;
  }

  private async commitId(repo: Repo, value: string): Promise<string> {
    return HASH.test(value) ? value : this.resolveIn(repo, value);
  }

  private async resolveIn(repo: Repo, value: string): Promise<string> {
    const refuse = (cause?: unknown) =>
      new ReviewError('ERR-INTAKE-003', {
        operation: 'resolve-commit',
        inputs: { value },
        params: { value },
        cause,
      });
    // C001-IF-012 §3 G-03 and §2 item 4: never placed where it can be read as an option.
    if (
      value === '' ||
      value.startsWith('-') ||
      hasControlCharacter(value) ||
      value.includes('..')
    ) {
      throw refuse('the value has the shape of an option, holds a control character or "..".');
    }
    const r = await repo.runner.run(
      'rev-parse',
      ['--verify', '-q', '--end-of-options', `${value}^{commit}`],
      { target: repo.target },
    );
    const out = r.stdout.toString('utf8').trim();
    if (r.status !== 0 || !HASH.test(out)) throw refuse(r.stderr || `exit status ${r.status}`);
    return out;
  }

  // -------------------------------------------------------------------------------------------
  // G-01 to G-06

  /** G-01. */
  discover(directory: string): Promise<RepositoryLocation> {
    return this.guard('discover', { directory }, async () => {
      const from = resolve(directory);
      const checked = await this.checker.check(from);
      const notInWorkTree = () =>
        new ReviewError('ERR-INTAKE-001', {
          operation: 'discover',
          inputs: { directory },
          params: { directory },
        });
      if (!checked.repositoryFound) throw notInWorkTree();
      const runner = new GitProcessRunner({ gitPath: checked.program.path, baseEnv: this.env });
      const found = await runner.run(
        'rev-parse',
        ['--show-toplevel', '--absolute-git-dir', '--path-format=absolute', '--git-common-dir'],
        { target: { discoverFrom: from } },
      );
      if (found.status !== 0) throw notInWorkTree();
      const [top, gitDir, common] = found.stdout.toString('utf8').split('\n');
      if (!top || !gitDir || !common) throw new Error('git rev-parse printed no repository paths');
      const configured = await runner.run('config', ['--get', 'extensions.objectformat'], {
        target: { gitDir: resolve(gitDir), workTree: resolve(top) },
      });
      const objectFormat: ObjectFormat =
        configured.status === 0 && configured.stdout.toString('utf8').trim() === 'sha256'
          ? 'sha256'
          : 'sha1';
      const location: RepositoryLocation = {
        workTreeRoot: resolve(top),
        gitDir: resolve(gitDir),
        commonGitDir: resolve(common),
        objectFormat,
      };
      await this.close();
      this.root = new Repo(runner, location);
      this.attributeFiles = new Map();
      return location;
    });
  }

  /** G-02. */
  head(): Promise<HeadInfo> {
    return this.guard('head', {}, async () => {
      const repo = this.repo();
      const commit = await repo.run('rev-parse', ['--verify', '-q', 'HEAD^{commit}'], [0, 1]);
      const hash = commit.stdout.toString('utf8').trim();
      if (commit.status !== 0 || !HASH.test(hash)) {
        throw new ReviewError('ERR-INTAKE-002', {
          operation: 'head',
          inputs: { directory: repo.location.workTreeRoot },
          params: { directory: repo.location.workTreeRoot },
        });
      }
      const symbolic = await repo.run('symbolic-ref', ['-q', 'HEAD'], [0, 1]);
      const branch = symbolic.status === 0 ? symbolic.stdout.toString('utf8').trim() : '';
      return { commit: hash, branch: branch || null };
    });
  }

  /** G-03. */
  resolveCommit(value: string): Promise<string> {
    return this.guard('resolve-commit', { value }, () => this.resolveIn(this.repo(), value));
  }

  /** G-04. */
  mergeBase(a: string, b: string): Promise<string | null> {
    return this.guard('merge-base', { a, b }, async () => {
      const repo = this.repo();
      const [x, y] = [await this.commitId(repo, a), await this.commitId(repo, b)];
      const r = await repo.run('merge-base', [x, y], [0, 1]);
      const out = r.stdout.toString('utf8').trim();
      return r.status === 0 && HASH.test(out) ? out : null;
    });
  }

  /** G-05. */
  upstream(branch: string): Promise<UpstreamInfo | null> {
    return this.guard('upstream', { branch }, async () => {
      const repo = this.repo();
      const name = branch.startsWith('refs/heads/') ? branch.slice('refs/heads/'.length) : branch;
      if (name === '' || name === 'HEAD') return null;
      const { values } = await repo.config();
      const remote = last(values.get(`branch.${name}.remote`));
      const merge = last(values.get(`branch.${name}.merge`));
      if (!remote || !merge || !merge.startsWith('refs/')) return null;
      let ref: string | null = null;
      if (remote === '.') ref = merge;
      else {
        for (const spec of values.get(`remote.${remote}.fetch`) ?? []) {
          ref = mapRefspec(spec, merge);
          if (ref) break;
        }
      }
      if (!ref || !ref.startsWith('refs/')) return null;
      const r = await repo.run('rev-parse', ['--verify', '-q', `${ref}^{commit}`], [0, 1]);
      const commit = r.stdout.toString('utf8').trim();
      return r.status === 0 && HASH.test(commit) ? { ref, commit } : null;
    });
  }

  /** G-06. */
  commitsBetween(base: string, head: string): Promise<readonly CommitInfo[]> {
    return this.guard('commits-between', { base, head }, async () => {
      const repo = this.repo();
      const range = `${await this.commitId(repo, base)}..${await this.commitId(repo, head)}`;
      const r = await repo.run('log', [
        '--no-color',
        '--no-show-signature',
        '--reverse',
        '--topo-order',
        '-z',
        '--diff-merges=first-parent',
        '--name-only',
        '--encoding=UTF-8',
        '--format=%x01%H%x1f%P%x1f%an%x1f%ae%x1f%aI%x1f%B%x1f',
        range,
        '--',
      ]);
      const commits: CommitInfo[] = [];
      for (const chunk of r.stdout.toString('utf8').split('\x01').slice(1)) {
        const fields = chunk.split('\x1f');
        const [hash, parents, authorName, authorEmail, authorTime, message] = fields;
        if (!hash || !HASH.test(hash))
          throw new Error('git log printed a commit this adapter cannot read');
        const files = (fields[6] ?? '')
          .split('\0')
          .map((f) => f.replace(/^\n+/, ''))
          .filter(Boolean);
        commits.push({
          hash,
          parents: parents ? parents.split(' ') : [],
          authorName: authorName ?? '',
          authorEmail: authorEmail ?? '',
          authorTime: authorTime ?? '',
          message: (message ?? '').replace(/\n+$/, ''),
          changedFiles: files,
        });
      }
      return commits;
    });
  }

  // -------------------------------------------------------------------------------------------
  // G-07, G-08, G-12: the working-tree comparison

  private async scan(
    repo: Repo,
    base: string,
    options: { reuse: boolean; keepContent: boolean },
  ): Promise<{ entries: ScanEntry[]; baseTree: Map<string, TreeEntry> }> {
    // The index file's time first: an index that git rewrites while it is listed then makes its
    // new entries racy, never up to date (§7 item 1).
    const indexMtimeNs = await indexFileMtimeNs(repo.location.gitDir);
    const [tree, index, untracked, config, attributeFiles] = await Promise.all([
      repo.tree(base),
      repo.run('ls-files', ['-s', '--debug', '-z']).then((r) => parseIndexListing(r.stdout)),
      repo
        .run('ls-files', ['-o', '--exclude-standard', '-z'])
        .then((r) => parseUntracked(r.stdout)),
      repo.config(),
      this.attributeFilesAt(repo, base),
    ]);
    const baseTree = new Map(tree.map((e) => [e.path, e]));
    // §7: only the base commit's `.gitattributes` files put a path under a clean filter.
    const filters = cleanFilterAttribution(attributeFiles, config.values);
    let eol: Promise<ReadonlyMap<string, EolInfo>> | undefined;
    const entries = await scanWorkingTree({
      workTree: repo.location.workTreeRoot,
      format: repo.location.objectFormat,
      baseTree,
      index,
      untracked,
      eolInfo: () =>
        (eol ??= repo
          .run('ls-files', ['--eol', '-z', '-c', '-o', '--exclude-standard'])
          .then((r) => parseEolListing(r.stdout))),
      settings: config,
      readBlob: (oid) => repo.blobById(oid),
      cleanFilter: filters.empty ? undefined : (path) => filters.driverOf(path),
      indexCheck: { fileMode: config.fileMode, symlinks: config.symlinks, indexMtimeNs },
      cache: this.hashCache,
      reuse: options.reuse,
      keepContent: options.keepContent,
      now: this.options.now,
    });
    return { entries, baseTree };
  }

  /** G-07. */
  changeAgainst(base: string): Promise<readonly ChangedFile[]> {
    return this.guard('change-against', { base }, async () => {
      const repo = this.repo();
      const baseHash = await this.commitId(repo, base);
      const { entries } = await this.scan(repo, baseHash, { reuse: false, keepContent: true });
      const changed = entries.filter((e) => e.differs);

      interface Side {
        readonly entry: ScanEntry;
        baseBytes: Buffer | null;
        binary: boolean;
      }
      const sides: Side[] = [];
      for (const entry of changed) {
        const baseBytes = entry.base ? await repo.blobById(entry.base.blob) : null;
        const binary =
          (baseBytes !== null && looksBinary(baseBytes)) ||
          (entry.current?.bytes != null && looksBinary(entry.current.bytes));
        sides.push({ entry, baseBytes, binary });
      }

      const deleted = sides.filter((s) => s.entry.base && !s.entry.current);
      const added = sides.filter((s) => !s.entry.base && s.entry.current);
      const renameSide = (
        s: Side,
        bytes: Buffer | null,
        hash: string,
        mode: string,
      ): RenameSide => ({
        path: s.entry.path,
        hash,
        symlink: mode === 'symlink',
        size: bytes?.length ?? 0,
        content: s.binary ? null : bytes,
      });
      const pairs = detectRenames(
        deleted.map((s) => renameSide(s, s.baseBytes, s.entry.base!.blob, s.entry.base!.mode)),
        added.map((s) =>
          renameSide(s, s.entry.current!.bytes, s.entry.current!.hash, s.entry.current!.mode),
        ),
      );
      const renamedTo = new Map(pairs.map(([from, to]) => [to, from]));
      const renamedAway = new Set(pairs.map(([from]) => from));
      const byPath = new Map(sides.map((s) => [s.entry.path, s]));

      const files: ChangedFile[] = [];
      for (const s of sides) {
        const { entry } = s;
        if (renamedAway.has(entry.path)) continue;
        const from = renamedTo.get(entry.path);
        const source = from ? byPath.get(from)! : undefined;
        const baseSide = source ? source.entry.base : entry.base;
        const baseBytes = source ? source.baseBytes : s.baseBytes;
        const binary = s.binary || (source?.binary ?? false);
        const type = from
          ? 'renamed'
          : !entry.base
            ? 'added'
            : !entry.current
              ? 'deleted'
              : 'modified';
        files.push({
          path: entry.path,
          previousPath: from ?? null,
          changeType: type,
          binary,
          contentHash: entry.current?.hash ?? null,
          baseMode: baseSide?.mode ?? null,
          currentMode: entry.current?.mode ?? null,
          baseContent: binary ? null : baseBytes,
          currentContent: binary ? null : (entry.current?.bytes ?? null),
          binaryContent: binary ? (entry.current?.bytes ?? null) : null,
          ...(entry.cleanFilter && !from ? { cleanFilter: entry.cleanFilter } : {}),
        });
      }
      return files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    });
  }

  /** G-08. */
  readBlob(commit: string, path: string): Promise<Buffer | null> {
    return this.guard('read-blob', { commit, path }, async () => {
      const repo = this.repo();
      return repo.blobAt(await this.commitId(repo, commit), path);
    });
  }

  /** G-12. */
  workingState(snapshot: {
    readonly base: string;
    readonly files: readonly ChangedFile[];
  }): Promise<WorkingState> {
    return this.guard('working-state', { base: snapshot.base }, async () => {
      const repo = this.repo();
      const head = (await this.head()).commit;
      const baseHash = await this.commitId(repo, snapshot.base);
      const { entries } = await this.scan(repo, baseHash, { reuse: true, keepContent: false });
      const inSnapshot = new Map(snapshot.files.map((f) => [f.path, f]));
      const movedAway = new Set(
        snapshot.files.flatMap((f) => (f.previousPath ? [f.previousPath] : [])),
      );
      const seen = new Set<string>();
      const differing: Array<{ path: string; contentHash: string | null }> = [];
      const same = (
        want: { hash: string; mode: string } | null,
        have: { hash: string; mode: string } | null,
      ) =>
        want === null || have === null
          ? want === have
          : want.hash === have.hash && want.mode === have.mode;
      for (const e of entries) {
        seen.add(e.path);
        const file = inSnapshot.get(e.path);
        const want = file
          ? file.contentHash !== null && file.currentMode
            ? { hash: file.contentHash, mode: file.currentMode as string }
            : null
          : movedAway.has(e.path)
            ? null
            : e.base
              ? { hash: e.base.blob, mode: e.base.mode as string }
              : null;
        const have = e.current ? { hash: e.current.hash, mode: e.current.mode as string } : null;
        if (!same(want, have))
          differing.push({ path: e.path, contentHash: e.current?.hash ?? null });
      }
      for (const file of snapshot.files) {
        if (!seen.has(file.path) && file.contentHash !== null) {
          differing.push({ path: file.path, contentHash: null });
        }
      }
      differing.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
      return { head, differing };
    });
  }

  // -------------------------------------------------------------------------------------------
  // G-09

  private async workingContent(repo: Repo, path: string): Promise<Buffer | null> {
    const abs = join(repo.location.workTreeRoot, ...path.split('/'));
    let st;
    try {
      st = workingStat(await lstat(abs, { bigint: true }));
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === 'ENOENT' || code === 'ENOTDIR') return null;
      throw error;
    }
    if (st.kind !== 'file' && st.kind !== 'symlink') return null;
    const config = await repo.config();
    const { symlinkLike } = workingMode(st, null, config);
    return readWorkingBytes(
      abs,
      st,
      symlinkLike,
      async () => {
        const r = await repo.run('ls-files', [
          '--eol',
          '-z',
          '-c',
          '-o',
          '--exclude-standard',
          '--',
          `:(literal)${path}`,
        ]);
        return parseEolListing(r.stdout).get(path);
      },
      config,
    );
  }

  /** The commits of a range with their parents and, for single-parent commits, the paths changed. */
  private rangeHistory(repo: Repo, base: string, head: string): Promise<RangeHistory> {
    const key = `${base}..${head}`;
    let known = this.ranges.get(key);
    if (!known) {
      known = (async () => {
        const list = await repo.run('rev-list', ['--topo-order', '--reverse', '--parents', key]);
        const commits = list.stdout
          .toString('utf8')
          .split('\n')
          .filter(Boolean)
          .map((line) => {
            const [hash, ...parents] = line.trim().split(' ');
            return { hash: hash!, parents };
          });
        const changed = new Map<string, Set<string>>();
        if (commits.some((c) => c.parents.length === 1)) {
          const log = await repo.run('log', [
            '--no-merges',
            '--no-renames',
            '--no-color',
            '--no-show-signature',
            '-z',
            '--name-only',
            '--format=%x01%H',
            key,
            '--',
          ]);
          for (const chunk of log.stdout.toString('utf8').split('\x01').slice(1)) {
            const [hash, ...files] = chunk.split('\0');
            if (!hash) continue;
            changed.set(
              hash.trim(),
              new Set(files.map((f) => f.replace(/^\n+/, '')).filter(Boolean)),
            );
          }
        }
        return { commits, inRange: new Set(commits.map((c) => c.hash)), changed };
      })();
      known.catch(() => this.ranges.delete(key));
      this.ranges.set(key, known);
    }
    return known;
  }

  /** The renames of `commit` against `parent`: new path → old path. */
  private async renamesOf(
    repo: Repo,
    parent: string,
    commit: string,
  ): Promise<Map<string, string>> {
    const r = await repo.run('diff-tree', [
      '-r',
      '-z',
      '-M',
      '--no-commit-id',
      '--name-status',
      parent,
      commit,
      '--',
    ]);
    const tokens = r.stdout.toString('utf8').split('\0');
    const renames = new Map<string, string>();
    for (let k = 0; k < tokens.length;) {
      const status = tokens[k++] ?? '';
      if (status === '') continue;
      if (status.startsWith('R') || status.startsWith('C')) {
        const from = tokens[k++]!;
        const to = tokens[k++]!;
        if (status.startsWith('R')) renames.set(to, from);
      } else k++;
    }
    return renames;
  }

  /** G-09: the versions of the file along the range, then `attributeHistory`. */
  attributeLines(
    base: string,
    head: string,
    path: string,
    sides?: AttributionSides,
  ): Promise<LineAttribution> {
    return this.guard('attribute-lines', { base, head, path }, async () => {
      const repo = this.repo();
      const baseHash = await this.commitId(repo, base);
      const headHash = await this.commitId(repo, head);
      const range = await this.rangeHistory(repo, baseHash, headHash);
      const exists = async (commit: string, file: string) =>
        (await repo.blobAt(commit, file)) !== null;

      // The file's path at each commit, from HEAD back through renames (newest first).
      let headPath = path;
      if (sides && sides.basePath !== path && !(await exists(headHash, path))) {
        if (await exists(headHash, sides.basePath)) headPath = sides.basePath;
      }
      const names = new Map<string, string>([[headHash, headPath]]);
      for (let k = range.commits.length - 1; k >= 0; k--) {
        const { hash, parents } = range.commits[k]!;
        const name = names.get(hash) ?? headPath;
        for (const parent of parents) {
          if (names.has(parent)) continue;
          let parentName = name;
          const changed = parents.length === 1 ? range.changed.get(hash) : undefined;
          if (!(changed && !changed.has(name)) && !(await exists(parent, name))) {
            parentName = (await this.renamesOf(repo, parent, hash)).get(name) ?? name;
          }
          names.set(parent, parentName);
        }
      }

      const linesAt = async (commit: string, file: string): Promise<string[]> => {
        const bytes = await repo.blobAt(commit, file);
        return bytes && !looksBinary(bytes) ? splitLines(bytes) : [];
      };
      const commits: HistoryCommit[] = [];
      const boundary = new Map<string, string[]>();
      for (const { hash, parents } of range.commits) {
        const name = names.get(hash) ?? headPath;
        const changed = parents.length === 1 ? range.changed.get(hash) : undefined;
        const unchanged =
          changed !== undefined && !changed.has(name) && names.get(parents[0]!) === name;
        commits.push({ hash, parents, lines: unchanged ? null : await linesAt(hash, name) });
        for (const parent of parents) {
          if (!range.inRange.has(parent) && !boundary.has(parent)) {
            boundary.set(parent, await linesAt(parent, names.get(parent) ?? name));
          }
        }
      }
      if (!range.inRange.has(headHash) && !boundary.has(headHash)) {
        boundary.set(headHash, await linesAt(headHash, headPath));
      }

      let baseBytes: Buffer | null;
      let currentBytes: Buffer | null;
      if (sides) {
        baseBytes = sides.baseContent;
        currentBytes = sides.currentContent;
      } else {
        baseBytes = await repo.blobAt(baseHash, names.get(baseHash) ?? path);
        currentBytes = await this.workingContent(repo, path);
      }
      if ((baseBytes && looksBinary(baseBytes)) || (currentBytes && looksBinary(currentBytes))) {
        return { added: [], deleted: [] };
      }
      return attributeHistory({
        baseLines: baseBytes ? splitLines(baseBytes) : [],
        commits,
        boundary,
        head: headHash,
        currentLines: currentBytes ? splitLines(currentBytes) : [],
      });
    });
  }

  // -------------------------------------------------------------------------------------------
  // G-10, G-11

  /** G-10. */
  userIdentity(): Promise<UserIdentity> {
    return this.guard('user-identity', {}, async () => {
      const { values } = await this.repo().config();
      const read = (key: string) => {
        const value = last(values.get(key));
        return value === undefined || value.trim() === '' || value === '\u0000true' ? null : value;
      };
      return { name: read('user.name'), email: read('user.email') };
    });
  }

  /** G-11. */
  attributes(
    commit: string,
    paths: readonly string[],
    name: string,
  ): Promise<ReadonlyMap<string, string | null>> {
    return this.guard('attributes', { commit, name }, async () => {
      const repo = this.repo();
      const hash = await this.commitId(repo, commit);
      const parsed = await this.attributeFilesAt(repo, hash);
      return new Map(paths.map((p) => [p, lookupAttribute(parsed, p, name)] as const));
    });
  }

  /** The `.gitattributes` files of a commit's tree, parsed and ordered from the root downward. */
  private attributeFilesAt(repo: Repo, hash: string): Promise<AttributeFile[]> {
    let files = this.attributeFiles.get(hash);
    if (!files) {
      files = (async () => {
        const config = await repo.config();
        const tree = await repo.tree(hash);
        const found = tree
          .filter(
            (e) =>
              e.mode !== 'symlink' &&
              e.mode !== 'submodule' &&
              (e.path === '.gitattributes' || e.path.endsWith('/.gitattributes')),
          )
          .sort((a, b) => a.path.split('/').length - b.path.split('/').length);
        const parsed: AttributeFile[] = [];
        for (const e of found) {
          const bytes = await repo.blobById(e.blob);
          if (!bytes) continue;
          const directory =
            e.path === '.gitattributes' ? '' : e.path.slice(0, -'/.gitattributes'.length);
          parsed.push(parseAttributeFile(directory, bytes.toString('utf8'), config.ignoreCase));
        }
        return parsed;
      })();
      files.catch(() => this.attributeFiles.delete(hash));
      this.attributeFiles.set(hash, files);
    }
    return files;
  }

  // -------------------------------------------------------------------------------------------
  // G-13 to G-16

  /** G-13. */
  treeEntries(commit: string): Promise<readonly TreeEntry[]> {
    return this.guard('tree-entries', { commit }, async () => {
      const repo = this.repo();
      return repo.tree(await this.commitId(repo, commit));
    });
  }

  /** G-14. */
  defaultBranches(): Promise<readonly DefaultBranch[]> {
    return this.guard('default-branches', {}, async () => {
      const repo = this.repo();
      const { values } = await repo.config();
      const remotes = new Set<string>();
      for (const key of values.keys()) {
        const m = /^remote\.(.+)\.(url|pushurl|fetch)$/.exec(key);
        if (m) remotes.add(m[1]!);
      }
      const remote = remotes.has('origin')
        ? 'origin'
        : remotes.size === 1
          ? [...remotes][0]!
          : null;
      const wanted: string[] = [];
      if (remote) {
        const symbolic = await repo.run(
          'symbolic-ref',
          ['-q', `refs/remotes/${remote}/HEAD`],
          [0, 1],
        );
        const target = symbolic.stdout.toString('utf8').trim();
        if (symbolic.status === 0 && target.startsWith('refs/')) wanted.push(target);
      }
      wanted.push('refs/heads/main', 'refs/heads/master');
      const listed = await repo.run('for-each-ref', [
        '--format=%(refname) %(objectname) %(objecttype)',
        ...new Set(wanted),
      ]);
      const commits = new Map<string, string>();
      for (const line of listed.stdout.toString('utf8').split('\n')) {
        const [ref, oid, type] = line.split(' ');
        if (ref && oid && type === 'commit') commits.set(ref, oid);
      }
      const result: DefaultBranch[] = [];
      for (const ref of new Set(wanted)) {
        const commit = commits.get(ref);
        if (commit) result.push({ ref, commit });
      }
      return result;
    });
  }

  /** G-15. */
  indexState(paths: readonly string[]): Promise<ReadonlyMap<string, IndexEntryState | null>> {
    return this.guard('index-state', { paths: paths.length }, async () => {
      const repo = this.repo();
      // The index file's time before the listing, as in G-07 (§7 items 1 and 6).
      const indexMtimeNs = await indexFileMtimeNs(repo.location.gitDir);
      const [index, config] = await Promise.all([
        repo.run('ls-files', ['-s', '--debug', '-z']).then((r) => parseIndexListing(r.stdout)),
        repo.config(),
      ]);
      const byPath = new Map<string, IndexEntry>();
      for (const e of index) if (e.stage === 0) byPath.set(e.path, e);
      const result = new Map<string, IndexEntryState | null>();
      for (const path of paths) {
        const entry = byPath.get(path);
        if (!entry || entry.intentToAdd) {
          result.set(path, null);
          continue;
        }
        let st = null;
        try {
          st = workingStat(
            await lstat(join(repo.location.workTreeRoot, ...path.split('/')), { bigint: true }),
          );
        } catch (error) {
          const code = (error as { code?: string }).code;
          if (code !== 'ENOENT' && code !== 'ENOTDIR') throw error;
        }
        const upToDate = indexEntryUpToDate(entry, st, {
          fileMode: config.fileMode,
          symlinks: config.symlinks,
          indexMtimeNs,
        });
        const NS = 1_000_000_000n;
        result.set(path, {
          blob: entry.blob,
          mode: entry.mode,
          upToDate,
          stat: {
            size: Number(st?.size ?? 0n),
            mtimeSeconds: Number((st?.mtimeNs ?? 0n) / NS),
            mtimeNanoseconds: Number((st?.mtimeNs ?? 0n) % NS),
            ctimeSeconds: Number((st?.ctimeNs ?? 0n) / NS),
            ctimeNanoseconds: Number((st?.ctimeNs ?? 0n) % NS),
            inode: Number(st?.ino ?? 0n),
            uid: Number(st?.uid ?? 0n),
            gid: Number(st?.gid ?? 0n),
          },
        });
      }
      return result;
    });
  }

  /** G-16. */
  submoduleTree(parent: RepositoryLocation, path: string, commit: string): Promise<SubmoduleTree> {
    return this.guard('submodule-tree', { path, commit }, async () => {
      const absent = (
        cause: 'no-local-repository' | 'commit-not-in-repository' | 'repository-refused',
        gitMessage?: string,
      ): SubmoduleTree => ({ present: false, cause, ...(gitMessage ? { gitMessage } : {}) });

      const root = this.repo();
      const known = [...this.submodules.values()].find(
        (s) => s.repo.location.gitDir === parent.gitDir,
      );
      const parentRepo =
        parent.gitDir === root.location.gitDir
          ? root
          : (known?.repo ?? new Repo(root.runner, parent));
      if (/(^|\/)\.\.(\/|$)/.test(path) || isAbsolute(path) || path === '' || path.includes('\0')) {
        return absent('no-local-repository');
      }

      // The submodule name: the .gitmodules of the snapshot (the repository of G-01) or of the
      // recorded commit (a nested parent).
      let text: Buffer | null = null;
      if (parentRepo === root) {
        text = await readFile(join(parent.workTreeRoot, '.gitmodules')).catch(() => null);
        text ??= await parentRepo.blobById(':.gitmodules');
      } else if (known) {
        text = await parentRepo.blobAt(known.commit, '.gitmodules');
      }
      const name = text ? submoduleNameOf(text.toString('utf8'), path) : null;
      if (name === null || !isSafeSubmoduleName(name)) return absent('no-local-repository');

      let gitDir: string | null = null;
      let workTree = '';
      const inModules = join(parent.commonGitDir, 'modules', ...name.split('/'));
      if (await isDirectory(inModules)) gitDir = inModules;
      else if (parent.workTreeRoot) {
        const dotGit = join(parent.workTreeRoot, ...path.split('/'), '.git');
        const info = await stat(dotGit).catch(() => null);
        if (info?.isDirectory()) gitDir = dotGit;
        else if (info?.isFile()) {
          const pointer = /^gitdir:\s*(.+?)\s*$/m.exec(
            (await readFile(dotGit, 'utf8')).replace(/\r/g, ''),
          );
          if (pointer) {
            const target = resolve(dirname(dotGit), pointer[1]!);
            if (await isDirectory(target)) gitDir = target;
          }
        }
        if (gitDir) workTree = dirname(dotGit);
      }
      if (!gitDir) return absent('no-local-repository');

      // The repository check of §6, without a retry and without overriding a refusal.
      const probe = await root.runner.run('rev-parse', ['--git-dir'], { target: { gitDir } });
      if (probe.status !== 0) {
        return absent(
          'repository-refused',
          firstErrorEntry(probe.stderr) || `exit status ${probe.status}`,
        );
      }
      const bare = new Repo(root.runner, {
        workTreeRoot: '',
        gitDir,
        commonGitDir: gitDir,
        objectFormat: 'sha1',
      });
      const config = await bare.config();
      const objectFormat: ObjectFormat =
        last(config.values.get('extensions.objectformat'))?.trim() === 'sha256' ? 'sha256' : 'sha1';
      const configured = last(config.values.get('core.worktree'));
      if (configured) workTree = resolve(gitDir, configured);
      const location: RepositoryLocation = {
        workTreeRoot: workTree,
        gitDir,
        commonGitDir: gitDir,
        objectFormat,
      };
      const repo = new Repo(root.runner, location);
      if (!HASH.test(commit)) return absent('commit-not-in-repository');
      const present = await repo.run(
        'rev-parse',
        ['--verify', '-q', `${commit}^{commit}`],
        [0, 1, 128],
      );
      if (present.status !== 0) return absent('commit-not-in-repository');

      const previous = this.submodules.get(gitDir);
      await previous?.repo.close();
      this.submodules.set(gitDir, { repo, commit });
      return {
        present: true,
        location,
        commit,
        entries: await repo.tree(commit),
        readBlob: (file: string) => repo.blobAt(commit, file),
      };
    });
  }
}

// ---------------------------------------------------------------------------------------------

/** Whether a value holds a control character (C0 or DEL). */
function hasControlCharacter(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) return true;
  }
  return false;
}

async function isDirectory(path: string): Promise<boolean> {
  return (await stat(path).catch(() => null))?.isDirectory() ?? false;
}

/** The destination of `refspec` for `ref`, when the source pattern matches it. */
export function mapRefspec(refspec: string, ref: string): string | null {
  const spec = refspec.replace(/^\+/, '');
  const colon = spec.indexOf(':');
  if (colon < 0) return null;
  const src = spec.slice(0, colon);
  const dst = spec.slice(colon + 1);
  const star = src.indexOf('*');
  if (star < 0) return src === ref && dst !== '' ? dst : null;
  const prefix = src.slice(0, star);
  const suffix = src.slice(star + 1);
  if (
    !ref.startsWith(prefix) ||
    !ref.endsWith(suffix) ||
    ref.length < prefix.length + suffix.length
  ) {
    return null;
  }
  const middle = ref.slice(prefix.length, ref.length - suffix.length);
  return dst.replace('*', middle);
}

/** A submodule name that git would refuse: empty, or with a `..` component. */
export function isSafeSubmoduleName(name: string): boolean {
  return name !== '' && !name.includes('\0') && !name.split(/[\\/]/).includes('..');
}

/** The name of the `[submodule "<name>"]` section of a .gitmodules text whose `path` is `path`. */
export function submoduleNameOf(text: string, path: string): string | null {
  let section: string | null = null;
  let found: string | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const header = /^\s*\[\s*submodule\s+"((?:[^"\\]|\\.)*)"\s*\]/i.exec(raw);
    if (header) {
      section = header[1]!.replace(/\\(.)/g, '$1');
      continue;
    }
    if (/^\s*\[/.test(raw)) {
      section = null;
      continue;
    }
    const key = /^\s*path\s*=\s*(.*?)\s*$/i.exec(raw);
    if (section !== null && key) {
      let value = key[1]!;
      if (value.startsWith('"'))
        value = value.replace(/^"((?:[^"\\]|\\.)*)".*$/, '$1').replace(/\\(.)/g, '$1');
      else value = value.replace(/\s+[#;].*$/, '');
      if (value === path) found = section;
    }
  }
  return found;
}
