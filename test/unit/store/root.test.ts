import { createHash } from 'node:crypto';
import { mkdirSync, realpathSync, statSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ReviewError } from '../../../src/core/errors/review-error.js';
import {
  StoreLayout,
  ensurePrivateDir,
  repositoryKey,
  storeRoot,
} from '../../../src/core/store/root.js';
import { SNAPSHOT_ID, cleanTempDirs, fixture, tempDir } from './helpers.js';

afterEach(cleanTempDirs);

describe('store root (C001-ADR-005 item 1)', () => {
  it('uses LOCALAPPDATA on Windows and falls back to the profile', () => {
    expect(storeRoot({ LOCALAPPDATA: 'C:\\L' }, 'win32', 'C:\\U')).toBe(
      join('C:\\L', 'sdd-review'),
    );
    expect(storeRoot({}, 'win32', 'C:\\U')).toBe(join('C:\\U', 'AppData', 'Local', 'sdd-review'));
  });

  it('uses Application Support on macOS', () => {
    expect(storeRoot({}, 'darwin', '/Users/a')).toBe(
      join('/Users/a', 'Library', 'Application Support', 'sdd-review'),
    );
  });

  it('takes the home folder from the HOME of the environment given (macOS and Linux)', () => {
    expect(storeRoot({ HOME: '/tmp/h' }, 'darwin')).toBe(
      join('/tmp/h', 'Library', 'Application Support', 'sdd-review'),
    );
    expect(storeRoot({ HOME: '/tmp/h' }, 'linux')).toBe(
      join('/tmp/h', '.local', 'share', 'sdd-review'),
    );
  });

  it('uses XDG_DATA_HOME on Linux, ~/.local/share when unset or empty', () => {
    expect(storeRoot({ XDG_DATA_HOME: '/x' }, 'linux', '/h')).toBe(join('/x', 'sdd-review'));
    expect(storeRoot({}, 'linux', '/h')).toBe(join('/h', '.local', 'share', 'sdd-review'));
    expect(storeRoot({ XDG_DATA_HOME: '' }, 'linux', '/h')).toBe(
      join('/h', '.local', 'share', 'sdd-review'),
    );
  });
});

describe('repository key (C001-ADR-005 item 2)', () => {
  it('is the SHA-256 of the canonical path of the common git directory', () => {
    const dir = tempDir();
    expect(repositoryKey(dir)).toBe(
      createHash('sha256').update(realpathSync.native(dir), 'utf8').digest('hex'),
    );
  });

  it('gives one key to two spellings of one path', () => {
    const dir = tempDir();
    mkdirSync(join(dir, 'a', 'b'), { recursive: true });
    expect(repositoryKey(join(dir, 'a', '..', 'a', 'b'))).toBe(repositoryKey(join(dir, 'a', 'b')));
  });

  it('resolves symbolic links (a junction on Windows)', () => {
    const dir = tempDir();
    mkdirSync(join(dir, 'real'));
    symlinkSync(
      join(dir, 'real'),
      join(dir, 'link'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    expect(repositoryKey(join(dir, 'link'))).toBe(repositoryKey(join(dir, 'real')));
  });

  it('gives different directories different keys', () => {
    const dir = tempDir();
    mkdirSync(join(dir, 'one'));
    mkdirSync(join(dir, 'two'));
    expect(repositoryKey(join(dir, 'one'))).not.toBe(repositoryKey(join(dir, 'two')));
  });
});

describe('layout', () => {
  it('puts snapshot folders below the repository key', () => {
    const layout = new StoreLayout('/r', 'abc');
    expect(layout.snapshotDir(SNAPSHOT_ID)).toBe(join('/r', 'abc', SNAPSHOT_ID));
    expect(layout.reviewsIndexFile).toBe(join('/r', 'abc', 'reviews.json'));
  });

  it('refuses a snapshot ID that is not a folder name of the store (ERR-STORE-004)', () => {
    const layout = new StoreLayout('/r', 'abc');
    for (const bad of ['..', '../x', 's-abc', '']) {
      expect(() => layout.snapshotDir(bad)).toThrow(ReviewError);
    }
  });
});

describe.skipIf(process.platform === 'win32')(
  'owner-only permissions (POSIX; Windows uses inherited rules)',
  () => {
    it('creates the root and every directory below it with mode 0700', () => {
      const f = fixture();
      const deep = join(f.dir, 'new-root', 'key', 'snap', 'analysis');
      ensurePrivateDir(f.ctx(), deep);
      for (const p of [
        'new-root',
        'new-root/key',
        'new-root/key/snap',
        'new-root/key/snap/analysis',
      ]) {
        expect(statSync(join(f.dir, p)).mode & 0o777, p).toBe(0o700);
      }
    });
  },
);
