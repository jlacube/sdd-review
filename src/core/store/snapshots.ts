import { createHash } from 'node:crypto';
import { join } from 'node:path';
import type { IntakeDocument } from '../../generated/analysis-results.js';
import { ReviewError } from '../errors/review-error.js';
import { ensurePrivateDir, type StoreLayout } from './root.js';
import { errnoCode, fsOf, guarded, writeFileAtomic, type StoreContext } from './fsutil.js';
import { withFileLock } from './lock.js';
import { RecordStore } from './record.js';

/** One line of `reviews.json` (architecture §4.1): snapshot ID, base, HEAD, created, last opened. */
export interface ReviewIndexEntry {
  readonly snapshotId: string;
  readonly baseCommit: string;
  readonly headCommit: string;
  readonly createdAt: string;
  readonly lastOpenedAt: string;
}

interface ReviewsIndexFile {
  readonly formatVersion: 1;
  readonly reviews: readonly ReviewIndexEntry[];
}

/** `review.json`: sample seed and job states for resume (architecture §4.1). */
export interface ReviewStateDocument {
  readonly formatVersion: 1;
  readonly sampleSeed: string | null;
  readonly jobStates: Readonly<Record<string, unknown>>;
}

const SHA256 = /^[0-9a-f]{64}$/;
const json = (value: unknown) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');

/**
 * Snapshot folders of one repository: `snapshot.json`, `content/<sha256>`, `review.json`, the
 * review record and the repository's `reviews.json` index.
 */
export class SnapshotStore {
  constructor(
    private readonly ctx: StoreContext,
    readonly layout: StoreLayout,
  ) {}

  snapshotDir(snapshotId: string): string {
    return this.layout.snapshotDir(snapshotId);
  }

  /** The review record of a snapshot. */
  record(snapshotId: string): RecordStore {
    return new RecordStore(this.ctx, this.snapshotDir(snapshotId), snapshotId);
  }

  /**
   * Creates the folder of a new snapshot: content blobs first, then `snapshot.json`,
   * `review.json` and the record header, the index entry last, so the index names only complete
   * snapshots. `repositoryRoot` goes into the record header. Earlier snapshots stay (C001-REQ-118).
   */
  async createSnapshot(
    intake: IntakeDocument,
    contents: Iterable<Uint8Array>,
    repositoryRoot: string,
  ): Promise<string> {
    const { snapshot } = intake;
    const id = snapshot.snapshotId;
    const dir = this.snapshotDir(id);
    return guarded(
      this.ctx,
      { operation: 'create-snapshot-folder', inputs: { snapshotId: id } },
      async () => {
        ensurePrivateDir(this.ctx, join(dir, 'content'));
        ensurePrivateDir(this.ctx, join(dir, 'analysis'));
        for (const bytes of contents) await this.putBlobUnguarded(dir, bytes);
        await writeFileAtomic(this.ctx, join(dir, 'snapshot.json'), json(intake));
        if (!fsOf(this.ctx).existsSync(join(dir, 'review.json'))) {
          await this.writeReviewStateUnguarded(dir, {
            formatVersion: 1,
            sampleSeed: null,
            jobStates: {},
          });
        }
        await this.record(id).create({
          repositoryRoot,
          baseCommit: snapshot.baseCommit.hash,
          headCommit: snapshot.headCommit,
          createdAt: snapshot.createdAt,
        });
        await this.updateIndex((reviews) => {
          const at = (this.ctx.now?.() ?? new Date()).toISOString();
          const others = reviews.filter((r) => r.snapshotId !== id);
          const previous = reviews.find((r) => r.snapshotId === id);
          return [
            ...others,
            {
              snapshotId: id,
              baseCommit: snapshot.baseCommit.hash,
              headCommit: snapshot.headCommit,
              createdAt: previous?.createdAt ?? snapshot.createdAt,
              lastOpenedAt: previous?.lastOpenedAt ?? at,
            },
          ];
        });
        return dir;
      },
    );
  }

  /** Stores snapshot-side content under its SHA-256 and returns the hash. */
  async putBlob(snapshotId: string, bytes: Uint8Array): Promise<string> {
    const dir = this.snapshotDir(snapshotId);
    return guarded(this.ctx, { operation: 'write-content-blob', inputs: { snapshotId } }, () =>
      this.putBlobUnguarded(dir, bytes),
    );
  }

  private async putBlobUnguarded(dir: string, bytes: Uint8Array): Promise<string> {
    const hash = createHash('sha256').update(bytes).digest('hex');
    const target = join(dir, 'content', hash);
    if (!fsOf(this.ctx).existsSync(target)) {
      ensurePrivateDir(this.ctx, join(dir, 'content'));
      await writeFileAtomic(this.ctx, target, Buffer.from(bytes));
    }
    return hash;
  }

  async readBlob(snapshotId: string, sha256: string): Promise<Buffer> {
    const dir = this.requireSnapshot(snapshotId);
    if (!SHA256.test(sha256)) throw new Error(`not a SHA-256 content name: ${sha256}`);
    return fsOf(this.ctx).readFileSync(join(dir, 'content', sha256));
  }

  async readSnapshot(snapshotId: string): Promise<IntakeDocument> {
    const dir = this.requireSnapshot(snapshotId);
    return JSON.parse(
      fsOf(this.ctx).readFileSync(join(dir, 'snapshot.json'), 'utf8'),
    ) as IntakeDocument;
  }

  async readReviewState(snapshotId: string): Promise<ReviewStateDocument> {
    const dir = this.requireSnapshot(snapshotId);
    return JSON.parse(
      fsOf(this.ctx).readFileSync(join(dir, 'review.json'), 'utf8'),
    ) as ReviewStateDocument;
  }

  async writeReviewState(snapshotId: string, state: ReviewStateDocument): Promise<void> {
    const dir = this.requireSnapshot(snapshotId);
    await guarded(this.ctx, { operation: 'write-review-state', inputs: { snapshotId } }, () =>
      this.writeReviewStateUnguarded(dir, state),
    );
  }

  private writeReviewStateUnguarded(dir: string, state: ReviewStateDocument) {
    return writeFileAtomic(this.ctx, join(dir, 'review.json'), json(state));
  }

  /** ERR-STORE-004 when the snapshot has no folder in this repository's store. */
  requireSnapshot(snapshotId: string): string {
    const dir = this.snapshotDir(snapshotId);
    if (!fsOf(this.ctx).existsSync(join(dir, 'snapshot.json'))) {
      const error = new ReviewError('ERR-STORE-004', {
        operation: 'open-snapshot',
        inputs: { snapshotId },
        params: { value: snapshotId },
      });
      try {
        this.ctx.log.recordError(error, 'open-snapshot');
      } catch {
        /* the error itself is what matters */
      }
      throw error;
    }
    return dir;
  }

  async listReviews(): Promise<ReviewIndexEntry[]> {
    return [...this.readIndex().reviews];
  }

  /** Sets the last-opened time of a review (reopen, C001-REQ-918). */
  async markOpened(snapshotId: string): Promise<void> {
    this.requireSnapshot(snapshotId);
    const at = (this.ctx.now?.() ?? new Date()).toISOString();
    await guarded(this.ctx, { operation: 'update-reviews-index', inputs: { snapshotId } }, () =>
      this.updateIndex((reviews) =>
        reviews.map((r) => (r.snapshotId === snapshotId ? { ...r, lastOpenedAt: at } : r)),
      ),
    );
  }

  private readIndex(): ReviewsIndexFile {
    try {
      return JSON.parse(
        fsOf(this.ctx).readFileSync(this.layout.reviewsIndexFile, 'utf8'),
      ) as ReviewsIndexFile;
    } catch (error) {
      if (errnoCode(error) === 'ENOENT') return { formatVersion: 1, reviews: [] };
      throw error;
    }
  }

  private async updateIndex(
    change: (reviews: readonly ReviewIndexEntry[]) => readonly ReviewIndexEntry[],
  ) {
    ensurePrivateDir(this.ctx, this.layout.repositoryDir);
    const file = this.layout.reviewsIndexFile;
    await withFileLock(this.ctx, `${file}.lock`, async () => {
      const next: ReviewsIndexFile = {
        formatVersion: 1,
        reviews: change(this.readIndex().reviews),
      };
      await writeFileAtomic(this.ctx, file, json(next));
    });
  }
}
