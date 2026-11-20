import { afterEach, describe, expect, it } from 'vitest';
import {
  EventCancelled,
  SnapshotEventLoop,
  SnapshotLoops,
} from '../../../src/core/orchestrator/event-loop.js';
import { RevisionStore, type RevisionDocuments } from '../../../src/core/store/revisions.js';
import { ReviewError } from '../../../src/core/errors/review-error.js';
import { cleanTempDirs, errno, fixture, fsWith, SNAPSHOT_ID } from '../store/helpers.js';

// Architecture §4.2 items 1 and 3: one writer per snapshot, events one at a time in arrival order,
// a revision saved after each event, a result visible only once its revision is current.

afterEach(cleanTempDirs);

const docs = (tag: string) =>
  Object.fromEntries(
    ['architecture-delta', 'intent-map', 'triage', 'evidence'].map((d) => [d, { tag }]),
  ) as unknown as RevisionDocuments;

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

function rig() {
  const f = fixture();
  const revisions = new RevisionStore(f.ctx(), f.snapshotDir);
  const loop = new SnapshotEventLoop(SNAPSHOT_ID, revisions);
  return { f, revisions, loop };
}

/** An event that waits for `release()` before it returns. */
function gate<T>(result: T, tag: string, log: string[]) {
  let release!: () => void;
  const open = new Promise<void>((resolve) => (release = resolve));
  return {
    release,
    event: {
      kind: 'job-result' as const,
      run: async () => {
        log.push(`start ${tag}`);
        await open;
        log.push(`end ${tag}`);
        return { result, documents: docs(tag) };
      },
    },
  };
}

describe('event ordering (one writer per snapshot)', () => {
  it('never interleaves events and handles them in arrival order', async () => {
    const { loop } = rig();
    const log: string[] = [];
    const a = gate('a', 'a', log);
    const b = gate('b', 'b', log);
    const c = gate('c', 'c', log);
    const results = [loop.submit(a.event), loop.submit(b.event), loop.submit(c.event)];
    await tick();
    expect(log).toEqual(['start a']);
    // releasing a later event first does not let it overtake
    c.release();
    b.release();
    await tick();
    expect(log).toEqual(['start a']);
    a.release();
    expect(await Promise.all(results)).toEqual(['a', 'b', 'c']);
    expect(log).toEqual(['start a', 'end a', 'start b', 'end b', 'start c', 'end c']);
  });

  it('numbers the revisions in handling order, one per event', async () => {
    const { loop, revisions } = rig();
    const seen: number[] = [];
    for (const tag of ['x', 'y', 'z']) {
      await loop.submit({
        kind: 'action',
        run: (ctx) => {
          seen.push(ctx.revision);
          return { result: tag, documents: docs(tag), appliedSeq: seen.length };
        },
      });
    }
    expect(seen).toEqual([1, 2, 3]);
    expect(revisions.readCurrent()).toEqual({ revision: 3, appliedSeq: 3 });
  });

  it('hands each handler the revision left by the event before it', async () => {
    const { loop } = rig();
    const tags: Array<string | undefined> = [];
    const submit = (tag: string) =>
      loop.submit({
        kind: 'action',
        run: (ctx) => {
          tags.push((ctx.current?.documents.triage as { tag: string } | undefined)?.tag);
          return { result: tag, documents: docs(tag) };
        },
      });
    await Promise.all([submit('one'), submit('two'), submit('three')]);
    expect(tags).toEqual([undefined, 'one', 'two']);
  });

  it('carries the documents and appliedSeq of the current revision when an event changes none', async () => {
    const { loop, revisions } = rig();
    await loop.submit({
      kind: 'action',
      run: () => ({ result: 1, documents: docs('k'), appliedSeq: 7 }),
    });
    await loop.submit({ kind: 'action', run: () => ({ result: 2 }) });
    const loaded = await revisions.load();
    expect(loaded).toMatchObject({ revision: 2, appliedSeq: 7 });
    expect(loaded?.documents.triage).toEqual({ tag: 'k' });
  });

  it('keeps going after an event fails and shows nothing of the failed event', async () => {
    const { loop, revisions } = rig();
    const bad = loop.submit({
      kind: 'action',
      run: () => {
        throw new Error('handler failed');
      },
    });
    const good = loop.submit({
      kind: 'action',
      run: () => ({ result: 'ok', documents: docs('g') }),
    });
    await expect(bad).rejects.toThrow('handler failed');
    expect(await good).toBe('ok');
    expect(revisions.readCurrent()?.revision).toBe(1);
  });

  it('refuses an event that changes nothing before any revision exists', async () => {
    const { loop, revisions } = rig();
    await expect(loop.submit({ kind: 'action', run: () => ({ result: 1 }) })).rejects.toThrow(
      /no revision/,
    );
    expect(revisions.readCurrent()).toBeNull();
  });

  it('gives one loop per snapshot', () => {
    const { f } = rig();
    const loops = new SnapshotLoops(
      (id) => new SnapshotEventLoop(id, new RevisionStore(f.ctx(), f.snapshotDir)),
    );
    expect(loops.get(SNAPSHOT_ID)).toBe(loops.get(SNAPSHOT_ID));
    expect(loops.get(`s-${'c'.repeat(64)}`)).not.toBe(loops.get(SNAPSHOT_ID));
  });
});

describe('revision before show', () => {
  it('has the revision current when the result is delivered and when listeners hear of it', async () => {
    const f = fixture();
    const revisions = new RevisionStore(f.ctx(), f.snapshotDir);
    const heard: Array<{ revision: number; current: number | undefined }> = [];
    const loop = new SnapshotEventLoop(SNAPSHOT_ID, revisions, {
      onShown: (shown) =>
        heard.push({ revision: shown.revision, current: revisions.readCurrent()?.revision }),
    });
    const result = await loop.submit({
      kind: 'job-result',
      run: () => ({ result: 'shown', documents: docs('s') }),
    });
    expect(result).toBe('shown');
    expect(revisions.readCurrent()?.revision).toBe(1);
    expect(heard).toEqual([{ revision: 1, current: 1 }]);
  });

  it('does not show the result, and leaves the old revision current, when the save fails (ERR-STORE-001)', async () => {
    const f = fixture();
    let failSave = false;
    const fs = fsWith((real) => ({
      writeSync: ((...args: Parameters<typeof real.writeSync>) => {
        if (failSave) throw errno('ENOSPC', 'injected');
        return (real.writeSync as (...a: unknown[]) => number)(...args);
      }) as never,
    }));
    const revisions = new RevisionStore(f.ctx({ fs }), f.snapshotDir);
    const shown: number[] = [];
    const loop = new SnapshotEventLoop(SNAPSHOT_ID, revisions, {
      onShown: (s) => shown.push(s.revision),
    });
    await loop.submit({ kind: 'action', run: () => ({ result: 'first', documents: docs('1') }) });
    failSave = true;
    const failed = loop.submit({
      kind: 'job-result',
      run: () => ({ result: 'second', documents: docs('2') }),
    });
    await expect(failed).rejects.toBeInstanceOf(ReviewError);
    await expect(failed).rejects.toMatchObject({ code: 'ERR-STORE-001' });
    expect(revisions.readCurrent()?.revision).toBe(1);
    expect(shown).toEqual([1]);
    failSave = false;
    await loop.submit({ kind: 'action', run: () => ({ result: 'third', documents: docs('3') }) });
    expect(revisions.readCurrent()?.revision).toBe(2);
  });
});

describe('cancellation', () => {
  it('drops a queued event whose signal is aborted before its turn', async () => {
    const { loop, revisions } = rig();
    const log: string[] = [];
    const first = gate('first', 'first', log);
    const controller = new AbortController();
    const ran: string[] = [];
    const a = loop.submit(first.event);
    const b = loop.submit({
      kind: 'job-result',
      signal: controller.signal,
      run: () => {
        ran.push('b');
        return { result: 'b', documents: docs('b') };
      },
    });
    const c = loop.submit({ kind: 'action', run: () => ({ result: 'c', documents: docs('c') }) });
    controller.abort();
    first.release();
    expect(await a).toBe('first');
    await expect(b).rejects.toBeInstanceOf(EventCancelled);
    expect(await c).toBe('c');
    expect(ran).toEqual([]);
    // revisions: first and c only
    expect(revisions.readCurrent()?.revision).toBe(2);
  });

  it('discards the result of a running event that is cancelled before it returns', async () => {
    const { loop, revisions } = rig();
    const controller = new AbortController();
    const result = loop.submit({
      kind: 'job-result',
      signal: controller.signal,
      run: (ctx) => {
        controller.abort();
        expect(ctx.signal.aborted).toBe(true);
        return { result: 'late', documents: docs('late') };
      },
    });
    await expect(result).rejects.toBeInstanceOf(EventCancelled);
    expect(revisions.readCurrent()).toBeNull();
  });

  it('close() cancels the queued events and waits for the running one', async () => {
    const { loop, revisions } = rig();
    const log: string[] = [];
    const first = gate('first', 'first', log);
    const a = loop.submit(first.event);
    const b = loop.submit({ kind: 'action', run: () => ({ result: 'b', documents: docs('b') }) });
    await tick();
    const closed = loop.close();
    first.release();
    await closed;
    expect(await a).toBe('first');
    await expect(b).rejects.toBeInstanceOf(EventCancelled);
    await expect(
      loop.submit({ kind: 'action', run: () => ({ result: 'c', documents: docs('c') }) }),
    ).rejects.toBeInstanceOf(EventCancelled);
    expect(revisions.readCurrent()?.revision).toBe(1);
  });
});
