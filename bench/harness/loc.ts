import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/** Result of counting the lines of the files a git repository tracks. */
export interface LineCount {
  /** Lines of every counted text file (code, tests, configuration, documentation). */
  totalLines: number;
  /** Lines of files with a source-code extension (see SOURCE_EXTENSIONS). */
  sourceLines: number;
  /** Number of counted files. */
  files: number;
  /** Number of tracked files left out (binary, lock, minified, vendored). */
  excludedFiles: number;
  /** Lines per lower-case extension, counted files only. */
  byExtension: Record<string, number>;
}

export const SOURCE_EXTENSIONS: ReadonlySet<string> = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.cs',
  '.go',
  '.rs',
  '.java',
  '.kt',
  '.c',
  '.h',
  '.cpp',
  '.hpp',
  '.sh',
  '.ps1',
]);

const LOCK_FILES: ReadonlySet<string> = new Set([
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'cargo.lock',
  'packages.lock.json',
  'poetry.lock',
  'uv.lock',
  'gemfile.lock',
  'go.sum',
]);

const BINARY_EXTENSIONS: ReadonlySet<string> = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.ico',
  '.svg',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.snk',
  '.pfx',
  '.zip',
  '.gz',
  '.tgz',
  '.pdf',
  '.dll',
  '.exe',
  '.map',
]);

const VENDORED = /(^|\/)(node_modules|vendor|third_party|\.yarn)\//;

/** True when a tracked path is generated, vendored, a lock file, minified or binary by name. */
export function isExcludedPath(relPath: string): boolean {
  const lower = relPath.toLowerCase();
  const base = lower.slice(lower.lastIndexOf('/') + 1);
  const ext = path.extname(base);
  return (
    LOCK_FILES.has(base) ||
    BINARY_EXTENSIONS.has(ext) ||
    /\.min\.(js|css)$/.test(base) ||
    VENDORED.test(lower)
  );
}

/** Number of lines of a text buffer; a last line without a line feed counts. Binary gives null. */
export function countBufferLines(buf: Buffer): number | null {
  if (buf.length === 0) return 0;
  if (buf.includes(0)) return null;
  let lines = 0;
  for (const byte of buf) if (byte === 10) lines += 1;
  return buf[buf.length - 1] === 10 ? lines : lines + 1;
}

/** Count the lines of the files that `git ls-files` lists in `repoDir` (the working tree copy). */
export function countRepositoryLines(repoDir: string): LineCount {
  const listing = execFileSync('git', ['-C', repoDir, 'ls-files', '-z'], {
    maxBuffer: 256 * 1024 * 1024,
  }).toString('utf8');
  const result: LineCount = {
    totalLines: 0,
    sourceLines: 0,
    files: 0,
    excludedFiles: 0,
    byExtension: {},
  };
  for (const rel of listing.split('\0')) {
    if (rel === '') continue;
    if (isExcludedPath(rel)) {
      result.excludedFiles += 1;
      continue;
    }
    let lines: number | null;
    try {
      lines = countBufferLines(readFileSync(path.join(repoDir, rel)));
    } catch {
      lines = null; // a tracked path that is not a readable file (submodule, deleted)
    }
    if (lines === null) {
      result.excludedFiles += 1;
      continue;
    }
    const ext = path.extname(rel).toLowerCase();
    result.files += 1;
    result.totalLines += lines;
    result.byExtension[ext] = (result.byExtension[ext] ?? 0) + lines;
    if (SOURCE_EXTENSIONS.has(ext)) result.sourceLines += lines;
  }
  return result;
}
