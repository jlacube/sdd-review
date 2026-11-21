import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertOutsideRepository,
  openSealedList,
  sealList,
  validateSealedList,
  type PlainSealedList,
} from '../../../scripts/study/g8-seal.js';
import { DEFECT_KINDS } from '../../../scripts/study/g8-model.js';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function list(count = 8): PlainSealedList {
  return {
    change: 'B',
    seededHead: 'a'.repeat(40),
    defects: Array.from({ length: count }, (_, i) => ({
      id: `B-${String(i + 1).padStart(2, '0')}`,
      kind: DEFECT_KINDS[i % DEFECT_KINDS.length],
      file: `src/m${i}.ts`,
      lines: '10-12',
      description: `defect ${i + 1}`,
    })),
  };
}

describe('sealed lists', () => {
  it('accepts at least 8 defects covering the six kinds', () => {
    expect(validateSealedList(list())).toEqual([]);
  });

  it('refuses fewer than 8 defects, a missing kind, a bad ID and a duplicate ID', () => {
    expect(validateSealedList(list(7)).join()).toMatch(/at least 8/);
    const l = list();
    l.defects = l.defects.map((d) => ({ ...d, kind: 'wrong-logic' }));
    expect(validateSealedList(l).join()).toMatch(/security-weakness/);
    const m = list();
    m.defects[0].id = 'A-01';
    m.defects[1].id = m.defects[2].id;
    const errors = validateSealedList(m).join('\n');
    expect(errors).toMatch(/A-01/);
    expect(errors).toMatch(/duplicate/);
  });

  it('round-trips through encryption and keeps only the seeded HEAD in clear', () => {
    const sealed = sealList(list(), 'correct horse battery staple');
    const text = JSON.stringify(sealed);
    expect(sealed.seededHead).toBe('a'.repeat(40));
    expect(text).not.toMatch(/src\/m0\.ts|defect 1|wrong-logic/);
    expect(openSealedList(sealed, 'correct horse battery staple')).toEqual(list());
  });

  it('refuses a wrong passphrase, a short passphrase and a tampered file', () => {
    const sealed = sealList(list(), 'correct horse battery staple');
    expect(() => openSealedList(sealed, 'wrong passphrase here')).toThrow(/cannot be opened/);
    expect(() => sealList(list(), 'short')).toThrow(/at least 16/);
    const tampered = { ...sealed, ciphertext: `A${sealed.ciphertext.slice(1)}` };
    if (tampered.ciphertext === sealed.ciphertext)
      tampered.ciphertext = `B${sealed.ciphertext.slice(1)}`;
    expect(() => openSealedList(tampered, 'correct horse battery staple')).toThrow(
      /cannot be opened/,
    );
  });

  it('refuses a plaintext path inside the repository', () => {
    const repo = mkdtempSync(path.join(os.tmpdir(), 'g8-repo-'));
    dirs.push(repo);
    expect(() => assertOutsideRepository(path.join(repo, 'study', 'list.json'), repo)).toThrow(
      /outside the repository/,
    );
    expect(() =>
      assertOutsideRepository(path.join(os.tmpdir(), 'elsewhere', 'list.json'), repo),
    ).not.toThrow();
  });
});
