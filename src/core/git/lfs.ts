import { createHash } from 'node:crypto';

/**
 * Git LFS pointer files and the match of C001-IF-012 §7 item 7 (C001-REQ-128): no Git LFS program
 * runs; the working-tree bytes of a Git LFS file are hashed with SHA-256 and sized, as they are and
 * without end-of-line conversion (git hands the clean filter the bytes before its own conversion),
 * and compared with the `oid` and `size` that a pointer file names.
 */

/** What a Git LFS pointer file names. */
export interface LfsPointer {
  /** 64 lower-case hexadecimal digits. */
  readonly oid: string;
  readonly size: number;
}

/** A Git LFS pointer file is a blob smaller than 1024 bytes (§7 item 7). */
export const LFS_POINTER_MAX_BYTES = 1024;

const POINTER =
  /^version https:\/\/git-lfs\.github\.com\/spec\/v1\noid sha256:([0-9a-f]{64})\nsize (0|[1-9][0-9]*)\n$/;

/**
 * The pointer a blob holds, or `null` when the blob is not a Git LFS pointer file in format version
 * 1: exactly the three lines `version …`, `oid sha256:…` and `size …`, each ended by a line feed,
 * and no other line. A pointer with extension lines (`ext-…`) names the hash of a transformed
 * content and does not count; neither does a size that is not a safe integer.
 */
export function parseLfsPointer(blob: Buffer | null | undefined): LfsPointer | null {
  if (!blob || blob.length >= LFS_POINTER_MAX_BYTES) return null;
  const m = POINTER.exec(blob.toString('latin1'));
  if (!m) return null;
  const size = Number(m[2]);
  if (!Number.isSafeInteger(size)) return null;
  return { oid: m[1]!, size };
}

/** The SHA-256 hash and size of working-tree bytes, read as they are. */
export interface LfsDigest {
  readonly sha256: string;
  readonly size: number;
}

export function lfsDigest(raw: Buffer): LfsDigest {
  return { sha256: createHash('sha256').update(raw).digest('hex'), size: raw.length };
}

/** §7 item 7: the bytes match a blob when the blob is a pointer file naming their hash and size. */
export function matchesLfsPointer(digest: LfsDigest, blob: Buffer | null | undefined): boolean {
  const pointer = parseLfsPointer(blob);
  return pointer !== null && pointer.size === digest.size && pointer.oid === digest.sha256;
}
