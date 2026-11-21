import { ensurePrivateDir, type StoreLayout } from './root.js';
import { errnoCode, fsOf, writeFileAtomic, type StoreContext } from './fsutil.js';
import { withFileLock } from './lock.js';

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

const json = (value: unknown) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');

/**
 * The review opened most recently (`open` without a snapshot ID, C001-IF-001); on equal times the
 * one listed last. Undefined when there is no review.
 */
export function mostRecentlyOpened<T extends ReviewIndexEntry>(
  entries: readonly T[],
): T | undefined {
  let best: T | undefined;
  for (const entry of entries) {
    if (!best || entry.lastOpenedAt >= best.lastOpenedAt) best = entry;
  }
  return best;
}

/**
 * The repository's index of reviews, `reviews.json` (architecture §4.1, C001-REQ-118). It only
 * grows: a new snapshot adds its entry beside the earlier ones, taking the same snapshot again
 * keeps its creation time, and a reopen changes only the last-opened time. No operation removes an
 * entry. Writers take the index lock, re-read and replace the file atomically, so two intakes at
 * once both keep their entry.
 */
export class ReviewsIndex {
  constructor(
    private readonly ctx: StoreContext,
    private readonly layout: StoreLayout,
  ) {}

  /** The reviews in the order they were first created; empty when the repository has none. */
  list(): ReviewIndexEntry[] {
    return [...this.read().reviews];
  }

  /** The entry of one snapshot, or undefined. */
  find(snapshotId: string): ReviewIndexEntry | undefined {
    return this.read().reviews.find((r) => r.snapshotId === snapshotId);
  }

  /**
   * Adds the entry of a snapshot, or keeps the existing one's creation and last-opened times when
   * the snapshot is listed already. Every other entry is kept unchanged (C001-REQ-118).
   */
  async add(entry: Omit<ReviewIndexEntry, 'lastOpenedAt'>): Promise<void> {
    const at = this.now();
    await this.update((reviews) => {
      const previous = reviews.find((r) => r.snapshotId === entry.snapshotId);
      if (previous) {
        return reviews.map((r) =>
          r === previous
            ? { ...entry, createdAt: previous.createdAt, lastOpenedAt: previous.lastOpenedAt }
            : r,
        );
      }
      return [...reviews, { ...entry, lastOpenedAt: at }];
    });
  }

  /** Sets the last-opened time of a listed review to now (a reopen, C001-REQ-119). */
  async markOpened(snapshotId: string): Promise<void> {
    const at = this.now();
    await this.update((reviews) =>
      reviews.map((r) => (r.snapshotId === snapshotId ? { ...r, lastOpenedAt: at } : r)),
    );
  }

  private now(): string {
    return (this.ctx.now?.() ?? new Date()).toISOString();
  }

  private read(): ReviewsIndexFile {
    try {
      return JSON.parse(
        fsOf(this.ctx).readFileSync(this.layout.reviewsIndexFile, 'utf8'),
      ) as ReviewsIndexFile;
    } catch (error) {
      if (errnoCode(error) === 'ENOENT') return { formatVersion: 1, reviews: [] };
      throw error;
    }
  }

  private async update(
    change: (reviews: readonly ReviewIndexEntry[]) => readonly ReviewIndexEntry[],
  ): Promise<void> {
    ensurePrivateDir(this.ctx, this.layout.repositoryDir);
    const file = this.layout.reviewsIndexFile;
    await withFileLock(this.ctx, `${file}.lock`, async () => {
      const next: ReviewsIndexFile = { formatVersion: 1, reviews: change(this.read().reviews) };
      await writeFileAtomic(this.ctx, file, json(next));
    });
  }
}
