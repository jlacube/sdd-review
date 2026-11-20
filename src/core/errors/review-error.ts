import { lookupError, type ErrorEntry } from './catalogue.js';

export interface ErrorContext {
  /** The operation that failed, for example "intake" or "record-verdict". */
  readonly operation: string;
  /** Identifying inputs of the operation (paths, ids). Never a key or secret value. */
  readonly inputs?: Readonly<Record<string, unknown>>;
  /** Values for the `<placeholders>` of the catalogue message. */
  readonly params?: Readonly<Record<string, string | number>>;
  /** The underlying cause, as text or an Error. */
  readonly cause?: unknown;
}

export interface ProblemDetails {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly code: string;
  readonly detail: string;
  readonly fix: string;
}

export function fillMessage(template: string, params: Readonly<Record<string, unknown>> = {}) {
  return template.replace(/<([^<>]+)>/g, (whole, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : whole,
  );
}

/** The one error type that core operations reject with. */
export class ReviewError extends Error {
  readonly code: string;
  readonly entry: ErrorEntry;
  readonly context: ErrorContext;

  constructor(code: string, context: ErrorContext) {
    const entry = lookupError(code);
    super(fillMessage(entry.message, context.params), { cause: context.cause });
    this.name = 'ReviewError';
    this.code = code;
    this.entry = entry;
    this.context = context;
  }

  /** The CLI exit code; 1 (internal error) when the CLI has no exit code for this code. */
  get exitCode(): number {
    return this.entry.exitCode ?? 1;
  }

  /** The HTTP status; 500 when the API has no status for this code. */
  get httpStatus(): number {
    return this.entry.httpStatus ?? 500;
  }

  get fix(): string {
    return this.entry.fix;
  }

  toProblem(): ProblemDetails {
    return {
      type: `about:blank#${this.code}`,
      title: this.entry.condition,
      status: this.httpStatus,
      code: this.code,
      detail: this.message,
      fix: this.entry.fix,
    };
  }
}

export function isReviewError(value: unknown): value is ReviewError {
  return value instanceof ReviewError;
}
