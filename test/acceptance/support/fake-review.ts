import { createHash } from 'node:crypto';
import type { CoreApi } from '../../../src/core/api/index.js';

// A stateful stand-in for the core API behind the local review UI server, for the acceptance
// scenarios of C001-CAP-09 that test the server's own checks (C001-TS-907 to C001-TS-914). Its
// views hold the names the scenarios search for in a response, and every recorded action, job
// cancellation and bundle run changes its state, so a request that got past the server's guards
// is seen as a state change. The real core operations behind these routes arrive with
// C001-T-044 and later; the whole-product checks stay with C001-T-092.

const hash = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 16);

export const intentIdOf = (name: string) => `i-${hash(`intent:${name}`)}`;
export const hunkIdOf = (path: string, from: number, to: number) =>
  `h-${hash(`hunk:${path}:${from}-${to}`)}`;

export interface FakeHunk {
  readonly id: string;
  readonly path: string;
  readonly lines: string;
  intent: string | null;
  read: boolean;
  /** Cleared by the formatting rule, sampled and unread. */
  cleared: boolean;
  defectReports: number;
}

export interface FakeCommand {
  readonly id: string;
  readonly text: string;
  confirmed: boolean;
}

export class FakeReview {
  /** Entries of the review record. */
  entries = 0;
  /** Every call that reached an operation, by name: the server must make none for a refusal. */
  readonly calls: string[] = [];
  readonly verdicts = new Map<string, string>();
  readonly judgements = new Map<string, string>();
  readonly hunks = new Map<string, FakeHunk>();
  readonly bundles = new Map<string, FakeCommand[]>();
  bundleRuns = 0;
  markerCreated = false;
  testRunRunning = false;

  addHunk(path: string, from: number, to: number, intent: string | null, cleared = false) {
    const hunk: FakeHunk = {
      id: hunkIdOf(path, from, to),
      path,
      lines: `${from}-${to}`,
      intent,
      read: false,
      cleared,
      defectReports: 0,
    };
    this.hunks.set(hunk.id, hunk);
    return hunk;
  }

  hunk(path: string, from: number, to: number): FakeHunk {
    const hunk = this.hunks.get(hunkIdOf(path, from, to));
    if (!hunk) throw new Error(`no hunk ${path} ${from}-${to}`);
    return hunk;
  }

  addCommand(intent: string, text: string, confirmed: boolean): FakeCommand {
    const command = { id: `c-${hash(`command:${text}`)}`, text, confirmed };
    this.bundles.set(intent, [...(this.bundles.get(intent) ?? []), command]);
    return command;
  }

  /** Everything a view shows, so that "the response holds no ..." can look for it. */
  private view() {
    return {
      intents: [...new Set([...this.hunks.values()].map((h) => h.intent).filter(Boolean))],
      files: [...this.hunks.values()].map((h) => ({ path: h.path, text: `changed ${h.path}` })),
    };
  }

  private note(operation: string): void {
    this.calls.push(operation);
  }

  private record(operation: string) {
    this.note(operation);
    this.entries += 1;
    return { seq: this.entries, revision: this.entries, movedOn: null };
  }

  /** The core API over this state; operations not listed answer like an unbuilt operation. */
  api(): CoreApi {
    const operations: Partial<Record<keyof CoreApi, (...args: never[]) => unknown>> = {
      getSession: () => (this.note('getSession'), { snapshotId: 's-fake', ...this.view() }),
      getIntentMap: () => (this.note('getIntentMap'), this.view()),
      getIntakeSummary: () => (this.note('getIntakeSummary'), this.view()),
      getHunk: (_s: string, id: string) => (this.note('getHunk'), this.hunks.get(id) ?? null),
      markRead: (_s: string, ids: string[]) => {
        for (const id of ids) {
          const hunk = this.hunks.get(id);
          if (hunk) hunk.read = true;
        }
        return this.record('markRead');
      },
      reopenHunk: () => this.record('reopenHunk'),
      moveHunk: (_s: string, id: string, target: { intentId?: string }) => {
        const hunk = this.hunks.get(id);
        if (hunk) hunk.intent = target.intentId ?? null;
        return this.record('moveHunk');
      },
      reportDefect: (_s: string, id: string) => {
        const hunk = this.hunks.get(id);
        if (hunk) {
          hunk.defectReports += 1;
          hunk.cleared = false;
        }
        return { ...this.record('reportDefect'), escalatedRules: [], reopenedHunkIds: [] };
      },
      setTestJudgement: (_s: string, intent: string, value: string) => {
        this.judgements.set(intent, value);
        return this.record('setTestJudgement');
      },
      addBundleCommand: (_s: string, intent: string, text: string) => {
        this.bundles.set(intent, [
          ...(this.bundles.get(intent) ?? []),
          { id: `c-${hash(`command:${text}`)}`, text, confirmed: false },
        ]);
        return this.record('addBundleCommand');
      },
      confirmBundleCommand: (_s: string, intent: string, commandId: string) => {
        for (const command of this.bundles.get(intent) ?? []) {
          if (command.id === commandId) command.confirmed = true;
        }
        return this.record('confirmBundleCommand');
      },
      giveVerdict: (_s: string, intent: string, request: { kind: string }) => {
        this.verdicts.set(intent, request.kind);
        return { ...this.record('giveVerdict'), verdict: request.kind };
      },
      runEvidenceBundle: () => {
        this.note('runEvidenceBundle');
        this.bundleRuns += 1;
        this.markerCreated = true;
        return { jobId: 'job-bundle', kind: 'evidence-bundle', status: 'running' };
      },
      cancelJob: () => {
        this.note('cancelJob');
        this.testRunRunning = false;
        return [{ jobId: 'job-test-run', kind: 'test-run', status: 'cancelled' }];
      },
    };
    return new Proxy({} as CoreApi, {
      get(_target, name) {
        if (typeof name !== 'string') return undefined;
        const operation = operations[name as keyof CoreApi];
        return (...args: unknown[]) =>
          operation
            ? Promise.resolve((operation as (...a: unknown[]) => unknown)(...args))
            : Promise.reject(new Error(`${name} is not built yet`));
      },
    });
  }
}
