import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';

export interface LabelRecord {
  readonly label: string;
  readonly hash: string;
  readonly subject: string;
}

export interface CommitSpec {
  /** Files to write (path → content) before the commit. */
  readonly files?: Readonly<Record<string, string | Buffer>>;
  /** Files to delete before the commit. */
  readonly deletes?: readonly string[];
  /** Renames [from, to] done with `git mv`. */
  readonly renames?: ReadonlyArray<readonly [string, string]>;
  readonly subject?: string;
}

export interface BaseRepoSpec {
  /** A repository (path or URL) cloned as the starting point of the fixture. */
  readonly repository: string;
  readonly commit: string;
}

export interface FixtureOptions {
  /** Directory that holds a `git` executable to put first on PATH for this fixture's commands. */
  readonly gitBinDir?: string;
  /** Start from this repository at this commit instead of an empty repository. */
  readonly base?: BaseRepoSpec;
  readonly initialBranch?: string;
  /** The object format of the new repository; git 2.29 or later for sha256. */
  readonly objectFormat?: 'sha1' | 'sha256';
}

const IDENTITY = {
  GIT_AUTHOR_NAME: 'Fixture Author',
  GIT_AUTHOR_EMAIL: 'fixture@example.test',
  GIT_COMMITTER_NAME: 'Fixture Author',
  GIT_COMMITTER_EMAIL: 'fixture@example.test',
};

/**
 * A git repository built from declarative steps, on the developer's git and outside the system
 * under test. Commits are named by labels (B0, C1, ...); the builder records the hash and the
 * subject of each label so that steps can assert on them.
 */
export class FixtureRepo {
  readonly dir: string;
  private readonly labels = new Map<string, LabelRecord>();
  private tick = 0;

  private constructor(
    dir: string,
    private readonly options: FixtureOptions,
  ) {
    this.dir = dir;
  }

  /** Creates a fixture; by default an empty repository, or the given base repository. */
  static create(options: FixtureOptions = {}): FixtureRepo {
    const dir = mkdtempSync(join(tmpdir(), 'sddfx-'));
    const repo = new FixtureRepo(dir, options);
    if (options.base) {
      repo.cloneBase(options.base);
    } else {
      repo.git(
        'init',
        '-q',
        '-b',
        options.initialBranch ?? 'main',
        ...(options.objectFormat === 'sha256' ? ['--object-format=sha256'] : []),
      );
    }
    repo.git('config', 'user.name', 'Fixture Author');
    repo.git('config', 'user.email', 'fixture@example.test');
    repo.git('config', 'commit.gpgsign', 'false');
    repo.git('config', 'core.autocrlf', 'false');
    return repo;
  }

  /**
   * The base option of `npm run acceptance -- --repo <ecosystem>`: the repository and commit of an
   * ecosystem as recorded in bench/set/benchmark-set.json (C001-T-013 writes that file).
   */
  static baseFromBenchmarkSet(
    ecosystem: string,
    file = 'bench/set/benchmark-set.json',
  ): BaseRepoSpec {
    if (!existsSync(file)) {
      throw new Error(
        `--repo ${ecosystem}: ${file} does not exist yet (C001-T-013 writes it); ` +
          'the base repository of an ecosystem is unknown',
      );
    }
    const set = JSON.parse(readFileSync(file, 'utf8')) as {
      references?: Record<string, { repository: string; commit: string }>;
    };
    const ref = set.references?.[ecosystem];
    if (!ref) throw new Error(`--repo ${ecosystem}: ${file} has no reference repository for it`);
    return { repository: ref.repository, commit: ref.commit };
  }

  private cloneBase(base: BaseRepoSpec): void {
    rmSync(this.dir, { recursive: true, force: true });
    execFileSync('git', ['clone', '-q', '--no-checkout', base.repository, this.dir], {
      env: this.env(),
    });
    this.git('checkout', '-q', '-B', this.options.initialBranch ?? 'main', base.commit);
    // The clone's remote would give the fixture a default branch of the remote and an upstream
    // branch that its scenarios do not state (C001-REQ-103, C001-REQ-104): it is removed.
    this.git('remote', 'remove', 'origin');
  }

  env(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
    const clean: NodeJS.ProcessEnv = { ...process.env };
    // The repository-locating variables are cleared so that git reads only this fixture.
    for (const name of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY']) {
      delete clean[name];
    }
    clean.GIT_CONFIG_NOSYSTEM = '1';
    if (this.options.gitBinDir) {
      clean.PATH = `${this.options.gitBinDir}${delimiter}${clean.PATH ?? ''}`;
    }
    return { ...clean, ...IDENTITY, ...extra };
  }

  git(...args: string[]): string {
    return execFileSync('git', args, {
      cwd: this.dir,
      env: this.env(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  }

  path(relative: string): string {
    return join(this.dir, relative);
  }

  write(relative: string, content: string | Buffer): this {
    const target = this.path(relative);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
    return this;
  }

  read(relative: string): string {
    return readFileSync(this.path(relative), 'utf8');
  }

  remove(relative: string): this {
    rmSync(this.path(relative), { recursive: true, force: true });
    return this;
  }

  /** Renames in the working tree only (the edit is not staged). */
  moveInWorkingTree(from: string, to: string): this {
    mkdirSync(dirname(this.path(to)), { recursive: true });
    renameSync(this.path(from), this.path(to));
    return this;
  }

  stage(...paths: string[]): this {
    this.git('add', '--', ...(paths.length ? paths : ['.']));
    return this;
  }

  /** Adds an ignore rule to `.gitignore` (written in the working tree, not committed). */
  ignore(rule: string): this {
    const existing = existsSync(this.path('.gitignore')) ? this.read('.gitignore') : '';
    return this.write(
      '.gitignore',
      `${existing}${existing.endsWith('\n') || !existing ? '' : '\n'}${rule}\n`,
    );
  }

  /** Adds a line to `.gitattributes` (written in the working tree, not committed). */
  attribute(line: string): this {
    const existing = existsSync(this.path('.gitattributes')) ? this.read('.gitattributes') : '';
    return this.write(
      '.gitattributes',
      `${existing}${existing.endsWith('\n') || !existing ? '' : '\n'}${line}\n`,
    );
  }

  setConfig(key: string, value: string): this {
    this.git('config', key, value);
    return this;
  }

  addRemote(name: string, url: string): this {
    this.git('remote', 'add', name, url);
    return this;
  }

  branch(name: string, at = 'HEAD'): this {
    this.git('branch', name, at);
    return this;
  }

  checkout(ref: string): this {
    this.git('checkout', '-q', ref);
    return this;
  }

  /** Makes one commit and records its label, hash and subject. */
  commit(label: string, spec: CommitSpec = {}): LabelRecord {
    if (this.labels.has(label)) throw new Error(`label ${label} is already recorded`);
    for (const [path, content] of Object.entries(spec.files ?? {})) this.write(path, content);
    for (const path of spec.deletes ?? []) this.remove(path);
    for (const [from, to] of spec.renames ?? []) {
      mkdirSync(dirname(this.path(to)), { recursive: true });
      this.git('mv', from, to);
    }
    this.git('add', '-A');
    const subject = spec.subject ?? `${label}: commit`;
    // A fixed, increasing date keeps hashes stable between runs of one fixture definition.
    const when = new Date(Date.UTC(2026, 0, 1, 0, 0, this.tick++)).toISOString();
    execFileSync('git', ['commit', '-q', '--allow-empty', '-m', subject], {
      cwd: this.dir,
      env: this.env({ GIT_AUTHOR_DATE: when, GIT_COMMITTER_DATE: when }),
    });
    const record = { label, hash: this.git('rev-parse', 'HEAD'), subject };
    this.labels.set(label, record);
    return record;
  }

  /** The recorded commit of a label; steps assert on its hash and subject. */
  label(name: string): LabelRecord {
    const record = this.labels.get(name);
    if (!record) throw new Error(`no commit labelled ${name} was recorded`);
    return record;
  }

  get recordedLabels(): readonly LabelRecord[] {
    return [...this.labels.values()];
  }

  dispose(): void {
    rmSync(this.dir, { recursive: true, force: true });
  }
}
