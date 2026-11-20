import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { lookupError } from '../errors/catalogue.js';
import { isReviewError, type ErrorContext } from '../errors/review-error.js';

export interface LogEntry {
  readonly time: string;
  readonly level: 'error' | 'notice';
  readonly code: string;
  readonly operation: string;
  readonly inputs: Record<string, unknown>;
  readonly cause: string;
  readonly message: string;
}

const SECRET_NAME = /key|secret|token|password|credential|authorization/i;

/** Removes the value of every input whose name looks like a secret (C001-CON-21). */
export function redact(inputs: Readonly<Record<string, unknown>> = {}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(inputs)) {
    out[name] = SECRET_NAME.test(name) ? '[redacted]' : value;
  }
  return out;
}

function causeText(cause: unknown): string {
  if (cause === undefined || cause === null) return '';
  return cause instanceof Error ? cause.message : String(cause);
}

/** The per-repository log: one JSON line per error and notice (NFR-D-04). */
export class ContextualLog {
  constructor(
    private readonly file: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Logs a catalogue code with its operation, identifying inputs and cause. */
  record(code: string, context: ErrorContext): LogEntry {
    const entry = lookupError(code);
    const line: LogEntry = {
      time: this.now().toISOString(),
      level: entry.kind,
      code,
      operation: context.operation,
      inputs: redact(context.inputs),
      cause: causeText(context.cause),
      message: entry.message,
    };
    mkdirSync(dirname(this.file), { recursive: true });
    appendFileSync(this.file, `${JSON.stringify(line)}\n`, 'utf8');
    return line;
  }

  /** Logs a ReviewError; any other error is logged as ERR-CLI-003 (internal error). */
  recordError(error: unknown, operation: string, inputs?: Record<string, unknown>): LogEntry {
    if (isReviewError(error)) {
      return this.record(error.code, {
        ...error.context,
        inputs: { ...error.context.inputs, ...inputs },
        cause: error.context.cause ?? error.message,
      });
    }
    return this.record('ERR-CLI-003', { operation, inputs, cause: error });
  }
}
