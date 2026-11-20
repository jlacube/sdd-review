// One-off transcription of errors.md into src/core/errors/catalogue.ts. The unit test
// test/unit/errors/catalogue.test.ts compares the result to errors.md on every run.
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

export function errorsMdPath() {
  const dir = readdirSync('.sdd').find((d) => /^001-/.test(d));
  return `.sdd/${dir}/10-spec/50-interfaces/errors.md`;
}

export function parseErrorsMd(text) {
  const rows = [];
  for (const line of text.split('\n')) {
    if (!line.startsWith('| ERR-')) continue;
    const cells = line.slice(2, -2).split(' | ');
    if (cells.length !== 7) throw new Error(`row with ${cells.length} cells: ${cells[0]}`);
    const [code, condition, message, fix, spec, kind, surface] = cells;
    const m = /^(\d+|—) \/ (\d+|—)(?: with notice)?$/.exec(surface);
    if (!m) throw new Error(`bad surface cell for ${code}: ${surface}`);
    rows.push({
      code,
      kind,
      exitCode: m[1] === '—' ? null : Number(m[1]),
      httpStatus: m[2] === '—' ? null : Number(m[2]),
      withNotice: surface.endsWith('with notice'),
      message,
      fix,
      spec,
      condition,
    });
  }
  return rows;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rows = parseErrorsMd(readFileSync(errorsMdPath(), 'utf8'));
  const body = JSON.stringify(rows, null, 2);
  writeFileSync(
    'src/core/errors/catalogue.ts',
    `// Transcribed from the error catalogue of 10-spec/50-interfaces/errors.md (C001-IF-001, C001-IF-002).\n` +
      `// The unit test test/unit/errors/catalogue.test.ts fails on any difference.\n\n` +
      `export type ErrorKind = 'error' | 'notice';\n\n` +
      `export interface ErrorEntry {\n  readonly code: string;\n  readonly kind: ErrorKind;\n  /** CLI exit code, or null when the CLI cannot raise the code. */\n  readonly exitCode: number | null;\n  /** HTTP status, or null when the UI server cannot raise the code. */\n  readonly httpStatus: number | null;\n  /** A notice answered with status 200 and a notice member. */\n  readonly withNotice: boolean;\n  readonly message: string;\n  readonly fix: string;\n  readonly spec: string;\n  readonly condition: string;\n}\n\n` +
      `export const ERROR_CATALOGUE: readonly ErrorEntry[] = ${body};\n\n` +
      `const BY_CODE = new Map(ERROR_CATALOGUE.map((e) => [e.code, e]));\n\n` +
      `export function lookupError(code: string): ErrorEntry {\n  const entry = BY_CODE.get(code);\n  if (!entry) throw new Error(\`unknown error code \${code}\`);\n  return entry;\n}\n`,
  );
  console.log(`transcribed ${rows.length} codes`);
}
