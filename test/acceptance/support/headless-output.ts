import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The files of the headless output directory (C001-IF-001 Output). */
export const HEADLESS_FILES = [
  'intake.json',
  'architecture-delta.json',
  'intent-map.json',
  'triage.json',
  'evidence.json',
  'review-record.jsonl',
] as const;

export type HeadlessFile = (typeof HEADLESS_FILES)[number];

/** Reads the files written by `analyse --headless` (C001-IF-008, C001-IF-009). */
export class HeadlessOutput {
  constructor(readonly dir: string) {}

  has(file: HeadlessFile): boolean {
    return existsSync(join(this.dir, file));
  }

  missing(): HeadlessFile[] {
    return HEADLESS_FILES.filter((f) => !this.has(f));
  }

  json<T = unknown>(file: Exclude<HeadlessFile, 'review-record.jsonl'>): T {
    return JSON.parse(readFileSync(join(this.dir, file), 'utf8')) as T;
  }

  /** The review record: one parsed entry per line. */
  record<T = Record<string, unknown>>(): T[] {
    return readFileSync(join(this.dir, 'review-record.jsonl'), 'utf8')
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as T);
  }
}
