/**
 * Rewrites test/fixtures/study/synthetic-record/ from the generator:
 * `npx tsx test/fixtures/study/write-synthetic-record.ts`.
 */
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { writeSyntheticRecord } from './synthetic.js';

const target = fileURLToPath(new URL('./synthetic-record/', import.meta.url));
rmSync(target, { recursive: true, force: true });
writeSyntheticRecord(target);
console.log(`written: ${target}`);
