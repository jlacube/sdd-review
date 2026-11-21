/**
 * Sealed defect lists of `60-test-plan.md` §6 item 3 (used by the study seeder in C001-T-111 and
 * C001-T-102): `g8-seal` encrypts a change's list with AES-256-GCM under a key derived by scrypt
 * from a passphrase only the seeder holds; `g8-unseal` opens it after the last session and records
 * the defect IDs and kinds the analysis needs in `record/rating/seeded.json`. The plaintext list
 * never lives inside the repository. Node's crypto module only; no dependency.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import path from 'node:path';
import {
  CHANGES,
  DEFECT_ID,
  DEFECT_KINDS,
  MIN_DEFECTS_PER_CHANGE,
  type ChangeLabel,
} from './g8-model.js';

export interface PlainSealedList {
  change: ChangeLabel;
  /** HEAD of the seeded change in its private study repository (C001-T-111). */
  seededHead: string;
  defects: { id: string; kind: string; file: string; lines: string; description: string }[];
}

export interface SealedFile {
  format: 'g8-sealed-v1';
  change: ChangeLabel;
  seededHead: string;
  kdf: { name: 'scrypt'; N: number; r: number; p: number; salt: string };
  cipher: 'aes-256-gcm';
  iv: string;
  tag: string;
  ciphertext: string;
}

/** Environment variable the passphrase is read from (never a command-line argument). */
export const PASSPHRASE_ENV = 'G8_SEAL_PASSPHRASE';
const KDF = { N: 2 ** 15, r: 8, p: 1 };
const MAXMEM = 128 * 1024 * 1024;

export function validateSealedList(list: PlainSealedList): string[] {
  const errors: string[] = [];
  if (!CHANGES.includes(list.change)) errors.push(`change "${String(list.change)}" is not A to D`);
  if (!/^[0-9a-f]{40}([0-9a-f]{24})?$/.test(list.seededHead ?? '')) {
    errors.push('seededHead is not a full commit hash');
  }
  const defects = Array.isArray(list.defects) ? list.defects : [];
  if (defects.length < MIN_DEFECTS_PER_CHANGE) {
    errors.push(`${defects.length} defects; at least ${MIN_DEFECTS_PER_CHANGE} per change`);
  }
  const seen = new Set<string>();
  for (const d of defects) {
    if (!DEFECT_ID.test(d.id) || !d.id.startsWith(`${list.change}-`)) {
      errors.push(`defect ID "${d.id}" is not ${list.change}-<two digits>`);
    }
    if (seen.has(d.id)) errors.push(`duplicate defect ID ${d.id}`);
    seen.add(d.id);
    if (!DEFECT_KINDS.includes(d.kind as never))
      errors.push(`${d.id}: kind "${d.kind}" is not one of the six`);
    if (!d.file || !d.lines || !d.description)
      errors.push(`${d.id}: file, lines and description are required`);
  }
  const missing = DEFECT_KINDS.filter((k) => !defects.some((d) => d.kind === k));
  if (missing.length > 0) errors.push(`no defect of kind ${missing.join(', ')}`);
  return errors;
}

function key(passphrase: string, salt: Buffer): Buffer {
  return scryptSync(passphrase, salt, 32, { ...KDF, maxmem: MAXMEM });
}

export function sealList(list: PlainSealedList, passphrase: string): SealedFile {
  if (passphrase.length < 16) throw new Error('the passphrase must have at least 16 characters');
  const errors = validateSealedList(list);
  if (errors.length > 0) throw new Error(`sealed list refused:\n  ${errors.join('\n  ')}`);
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(passphrase, salt), iv);
  cipher.setAAD(Buffer.from(`g8-sealed-v1:${list.change}:${list.seededHead}`));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(list), 'utf8'), cipher.final()]);
  return {
    format: 'g8-sealed-v1',
    change: list.change,
    seededHead: list.seededHead,
    kdf: { name: 'scrypt', ...KDF, salt: salt.toString('base64') },
    cipher: 'aes-256-gcm',
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
}

export function openSealedList(sealed: SealedFile, passphrase: string): PlainSealedList {
  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      scryptSync(passphrase, Buffer.from(sealed.kdf.salt, 'base64'), 32, {
        N: sealed.kdf.N,
        r: sealed.kdf.r,
        p: sealed.kdf.p,
        maxmem: MAXMEM,
      }),
      Buffer.from(sealed.iv, 'base64'),
    );
    decipher.setAAD(Buffer.from(`g8-sealed-v1:${sealed.change}:${sealed.seededHead}`));
    decipher.setAuthTag(Buffer.from(sealed.tag, 'base64'));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(sealed.ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
    return JSON.parse(plain) as PlainSealedList;
  } catch {
    throw new Error(
      `the sealed list of change ${sealed.change} cannot be opened (wrong passphrase or changed file)`,
    );
  }
}

/** Plaintext sealed lists are written and read only outside the repository. */
export function assertOutsideRepository(file: string, repoRoot: string): void {
  const rel = path.relative(path.resolve(repoRoot), path.resolve(file));
  if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) {
    throw new Error(`${file}: a plaintext sealed list must stay outside the repository`);
  }
}
