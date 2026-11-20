import { join } from 'node:path';
import {
  defaultSleep,
  errnoCode,
  fsOf,
  fsyncDir,
  guarded,
  step,
  writeFileAtomic,
  writeNewFileSync,
  type StoreContext,
} from './fsutil.js';
import { ensurePrivateDir } from './root.js';

/** The documents of one revision, a complete set (architecture §4.1, C001-IF-008). */
export const REVISION_DOCUMENTS = [
  'architecture-delta',
  'intent-map',
  'triage',
  'evidence',
] as const;
export type RevisionDocumentName = (typeof REVISION_DOCUMENTS)[number];
export type RevisionDocuments = Readonly<Record<RevisionDocumentName, unknown>>;

/** What `analysis/current` holds. */
export interface CurrentRevision {
  readonly revision: number;
  /** Sequence number of the last record entry applied in this revision (architecture §4.2 item 3). */
  readonly appliedSeq: number;
}

export interface LoadedRevision extends CurrentRevision {
  readonly documents: RevisionDocuments;
}

const json = (value: unknown) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');

/**
 * Revisions of analysis results of one snapshot folder (C001-ADR-005 item 5). Single writer per
 * snapshot (architecture §4.2 item 1): only the process that runs the snapshot's jobs writes.
 */
export class RevisionStore {
  private readonly analysisDir: string;
  private readonly currentFile: string;

  constructor(
    private readonly ctx: StoreContext,
    snapshotDir: string,
  ) {
    this.analysisDir = join(snapshotDir, 'analysis');
    this.currentFile = join(this.analysisDir, 'current');
  }

  /**
   * Writes revision `revision` as one complete set, makes it current and removes the older
   * revisions. Until the switch the previous revision stays current; if the switch fails
   * (ERR-STORE-001) the new revision does not become current and its job result is not shown.
   */
  async commit(revision: number, appliedSeq: number, documents: RevisionDocuments): Promise<void> {
    await guarded(
      this.ctx,
      {
        operation: 'save-revision',
        inputs: { analysisDir: this.analysisDir, revision, appliedSeq },
      },
      async () => {
        this.writeDocuments(revision, documents);
        await this.switchCurrent({ revision, appliedSeq });
        this.removeOthers(revision);
        step(this.ctx, 'older-removed');
      },
    );
  }

  /** Step 1 of the revision switch: the complete set, each file flushed, then the folder. */
  private writeDocuments(revision: number, documents: RevisionDocuments): void {
    assertRevision(revision);
    const fs = fsOf(this.ctx);
    for (const name of REVISION_DOCUMENTS) {
      if (!(name in documents)) throw new Error(`revision ${revision} lacks the document ${name}`);
    }
    const dir = join(this.analysisDir, String(revision));
    ensurePrivateDir(this.ctx, this.analysisDir);
    // A folder left by an earlier crash under this number never became current: start it again.
    fs.rmSync(dir, { recursive: true, force: true });
    ensurePrivateDir(this.ctx, dir);
    for (const name of REVISION_DOCUMENTS) {
      writeNewFileSync(this.ctx, join(dir, `${name}.json`), json(documents[name]));
    }
    fsyncDir(this.ctx, dir);
    fsyncDir(this.ctx, this.analysisDir);
    step(this.ctx, 'documents-written');
  }

  /** Step 2: temporary file, flush, rename over `current` (Windows retry), directory flush. */
  private async switchCurrent(current: CurrentRevision): Promise<void> {
    await writeFileAtomic(this.ctx, this.currentFile, json(current), () =>
      step(this.ctx, 'current-tmp-written'),
    );
    step(this.ctx, 'current-switched');
  }

  /** Step 3: removes the revisions other than `keep` and leftovers of crashed temporary writes. */
  private removeOthers(keep: number): void {
    const fs = fsOf(this.ctx);
    for (const name of fs.readdirSync(this.analysisDir)) {
      if (name === 'current' || name === String(keep)) continue;
      if (/^\d+$/.test(name) || name.startsWith('.tmp-')) {
        fs.rmSync(join(this.analysisDir, name), { recursive: true, force: true });
      }
    }
  }

  /** `current` alone, or null before the first revision. */
  readCurrent(): CurrentRevision | null {
    try {
      const value = JSON.parse(
        fsOf(this.ctx).readFileSync(this.currentFile, 'utf8'),
      ) as CurrentRevision;
      assertRevision(value.revision);
      return { revision: value.revision, appliedSeq: value.appliedSeq };
    } catch (error) {
      if (errnoCode(error) === 'ENOENT') return null;
      throw error;
    }
  }

  /** The next revision number: one above the current one. */
  nextRevision(): number {
    return (this.readCurrent()?.revision ?? 0) + 1;
  }

  /**
   * The current revision with its documents, or null before the first. A reader that finds the
   * revision removed because the writer switched meanwhile reads `current` again.
   */
  async load(): Promise<LoadedRevision | null> {
    const fs = fsOf(this.ctx);
    for (let attempt = 0; ; attempt++) {
      try {
        const current = this.readCurrent();
        if (!current) return null;
        const dir = join(this.analysisDir, String(current.revision));
        const documents = Object.fromEntries(
          REVISION_DOCUMENTS.map((name) => [
            name,
            JSON.parse(fs.readFileSync(join(dir, `${name}.json`), 'utf8')) as unknown,
          ]),
        ) as RevisionDocuments;
        return { ...current, documents };
      } catch (error) {
        // ENOENT: the writer removed the revision just named; on Windows a file being replaced
        // can be refused for a moment. Read `current` again.
        const code = errnoCode(error);
        const transient =
          code === 'ENOENT' ||
          ((this.ctx.platform ?? process.platform) === 'win32' &&
            (code === 'EPERM' || code === 'EBUSY' || code === 'EACCES'));
        if (!transient || attempt >= 8) throw error;
        await (this.ctx.sleep ?? defaultSleep)(5 * (attempt + 1));
      }
    }
  }
}

function assertRevision(revision: number): void {
  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw new Error(`a revision number is a positive integer, got ${String(revision)}`);
  }
}
