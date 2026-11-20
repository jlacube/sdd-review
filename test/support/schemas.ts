import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

// Validates the documents of C001-IF-008 and the lines of C001-IF-009 against the schemas of
// 10-spec/50-interfaces/, for the tests and the acceptance steps that check "valid against its
// format".

const ROOT = resolve(import.meta.dirname, '..', '..');

function interfacesDir(): string {
  const change = readdirSync(join(ROOT, '.sdd')).find((d) => /^001-/.test(d));
  if (!change) throw new Error('the change folder of CHG-001 is missing');
  return join(ROOT, '.sdd', change, '10-spec', '50-interfaces');
}

export type DocumentName =
  | 'IntakeDocument'
  | 'ArchitectureDeltaDocument'
  | 'IntentMapDocument'
  | 'TriageDocument'
  | 'EvidenceDocument';

/** The schema definition (C001-IF-008 `$defs`) that each headless output file is valid against. */
export const FILE_DEFINITIONS: Readonly<Record<string, DocumentName>> = {
  'intake.json': 'IntakeDocument',
  'architecture-delta.json': 'ArchitectureDeltaDocument',
  'intent-map.json': 'IntentMapDocument',
  'triage.json': 'TriageDocument',
  'evidence.json': 'EvidenceDocument',
};

export interface SchemaValidator {
  /** The validation errors of `value` against a document of C001-IF-008, empty when valid. */
  document(name: DocumentName, value: unknown): string[];
  /** The validation errors of one line (header or entry) of C001-IF-009, empty when valid. */
  recordLine(value: unknown): string[];
}

let cached: SchemaValidator | undefined;

export function schemaValidator(): SchemaValidator {
  if (cached) return cached;
  const dir = interfacesDir();
  const read = (file: string) => JSON.parse(readFileSync(join(dir, file), 'utf8')) as object;
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  addFormats.default(ajv);
  ajv.addSchema(read('analysis-results.schema.json'), 'analysis-results.schema.json');
  ajv.addSchema(read('review-record.schema.json'), 'review-record.schema.json');
  const errors = (validate: {
    errors?: Array<{ instancePath: string; message?: string }> | null;
  }) => (validate.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message ?? ''}`.trim());
  cached = {
    document(name, value) {
      const validate = ajv.getSchema(`analysis-results.schema.json#/$defs/${name}`);
      if (!validate) throw new Error(`no schema definition ${name}`);
      return validate(value) ? [] : errors(validate);
    },
    recordLine(value) {
      const validate = ajv.getSchema('review-record.schema.json');
      if (!validate) throw new Error('no review record schema');
      return validate(value) ? [] : errors(validate);
    },
  };
  return cached;
}
