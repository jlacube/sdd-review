import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { classifyChange, hasHunks, snapshotBytes } from '../../../src/core/intake/classify.js';
import type { ChangedFile } from '../../../src/core/git/port.js';
import { isReviewError } from '../../../src/core/errors/review-error.js';

// C001-T-026: the empty change (C001-REQ-107, C001-TS-115/116) and binary files (C001-REQ-108,
// C001-TS-117) at the classification step of intake.

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

const file = (over: Partial<ChangedFile>): ChangedFile => ({
  path: 'p',
  previousPath: null,
  changeType: 'modified',
  binary: false,
  contentHash: 'g'.repeat(40),
  baseMode: 'regular',
  currentMode: 'regular',
  baseContent: Buffer.from('a\n'),
  currentContent: Buffer.from('b\n'),
  ...over,
});

describe('classifyChange', () => {
  it('stops an empty change with ERR-INTAKE-005 naming the base commit (C001-REQ-107)', () => {
    const base = 'b'.repeat(40);
    let caught: unknown;
    try {
      classifyChange([], base);
    } catch (error) {
      caught = error;
    }
    expect(isReviewError(caught)).toBe(true);
    expect(caught).toMatchObject({
      code: 'ERR-INTAKE-005',
      message: `The change is empty: the working tree matches base commit ${base}. No review was created.`,
    });
  });

  it('names the snapshot content of text and binary files by SHA-256 and sorts by path', () => {
    const png = Buffer.from([0x89, 0x50, 0, 1]);
    const files = classifyChange(
      [
        file({ path: 'z.ts' }),
        file({
          path: 'a.png',
          changeType: 'added',
          binary: true,
          baseContent: null,
          currentContent: null,
          binaryContent: png,
        }),
        file({ path: 'm.gif', changeType: 'deleted', binary: true, currentContent: null }),
      ],
      'b'.repeat(40),
    );
    expect(files.map((f) => [f.file.path, f.contentSha256])).toEqual([
      ['a.png', sha(png)],
      ['m.gif', null],
      ['z.ts', sha(Buffer.from('b\n'))],
    ]);
  });

  it('gives a binary file no hunks and its bytes as the snapshot side (C001-REQ-108)', () => {
    const bytes = Buffer.from([0, 1, 2]);
    const binary = file({ binary: true, currentContent: null, binaryContent: bytes });
    expect(hasHunks(binary)).toBe(false);
    expect(snapshotBytes(binary)).toBe(bytes);
    expect(hasHunks(file({}))).toBe(true);
    expect(snapshotBytes(file({ changeType: 'deleted', currentContent: null }))).toBeNull();
    // A port that gives no bytes for a binary file leaves its content unnamed.
    expect(snapshotBytes(file({ binary: true, currentContent: null }))).toBeNull();
  });
});
