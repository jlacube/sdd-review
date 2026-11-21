// Spike C001-T-023: the two virtualised lists (C001-ADR-002 item 1: TanStack Virtual, memoised
// rows, text-only rendering). Positions are set through React's style object (CSSOM), which the
// self-only Content-Security-Policy allows; there is no inline style attribute in any markup.
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  memo,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  type MouseEvent,
  type RefObject,
} from 'react';
import type { ContextModel, ContextRow, HunkListModel, HunkRow } from './model';

/** Fixed row height in pixels; must equal `.row { height }` in styles.css. */
export const ROW_HEIGHT = 20;
const OVERSCAN = 8;

export interface ScrollRequest {
  readonly hunkId: string;
  readonly token: number;
  readonly align: 'start' | 'auto';
}

const HunkRowView = memo(function HunkRowView(props: {
  row: HunkRow;
  start: number;
  selected: boolean;
  read: boolean;
}) {
  const { row, start, selected, read } = props;
  const style = { transform: `translateY(${start}px)` };
  if (row.kind === 'group') {
    return (
      <div data-row className="row group" style={style}>
        {`${row.name} (${row.hunks} hunks, ${row.lines} lines)`}
      </div>
    );
  }
  const state = `${selected ? ' selected' : ''}${read ? ' read' : ''}`;
  if (row.kind === 'hunk') {
    return (
      <div
        data-row
        data-hunk-header={row.hunkId}
        className={`row hunk-header${state}`}
        style={style}
      >
        {`${read ? '[read] ' : ''}${row.label}`}
      </div>
    );
  }
  return (
    <div data-row className={`row line ${row.lineKind}${state}`} style={style}>
      {`${row.lineKind === 'added' ? '+' : '-'}${row.text}`}
    </div>
  );
});

export function HunkList(props: {
  model: HunkListModel;
  selectedId: string | null;
  read: ReadonlySet<string>;
  request: ScrollRequest | null;
  scrollRef: RefObject<HTMLDivElement | null>;
  onOpen: (hunkId: string, timeStamp: number) => void;
}) {
  const { model, selectedId, read, request, scrollRef, onOpen } = props;
  const rows = model.rows;
  const getItemKey = useCallback((i: number) => rows[i]!.key, [rows]);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
    getItemKey,
  });
  const lastToken = useRef(-1);
  useLayoutEffect(() => {
    if (!request || request.token === lastToken.current) return;
    lastToken.current = request.token;
    const index = model.headerIndex.get(request.hunkId);
    if (index !== undefined) virtualizer.scrollToIndex(index, { align: request.align });
  }, [request, model, virtualizer]);
  const onClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      const header = (e.target as HTMLElement).closest<HTMLElement>('[data-hunk-header]');
      if (header?.dataset.hunkHeader) onOpen(header.dataset.hunkHeader, e.timeStamp);
    },
    [onOpen],
  );
  return (
    <div
      ref={scrollRef}
      className="list"
      tabIndex={0}
      aria-label="Hunks"
      data-list="hunks"
      data-count={rows.length}
      onClick={onClick}
    >
      <div className="sizer" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((item) => {
          const row = rows[item.index]!;
          const hunkId = row.kind === 'group' ? null : row.hunkId;
          return (
            <HunkRowView
              key={item.key}
              row={row}
              start={item.start}
              selected={hunkId !== null && hunkId === selectedId}
              read={hunkId !== null && read.has(hunkId)}
            />
          );
        })}
      </div>
    </div>
  );
}

const ContextRowView = memo(function ContextRowView(props: {
  row: ContextRow;
  start: number;
  startsHunks: string | undefined;
}) {
  const { row, start, startsHunks } = props;
  return (
    <div
      data-row
      data-ctx-start={startsHunks}
      className={`row ctx ${row.mark}`}
      style={{ transform: `translateY(${start}px)` }}
    >
      <span className="num">{row.number === null ? '' : String(row.number)}</span>
      <span className="text">{row.text}</span>
    </div>
  );
});

export function FileContext(props: {
  path: string | null;
  model: ContextModel | null;
  request: ScrollRequest | null;
  scrollRef: RefObject<HTMLDivElement | null>;
}) {
  const { path, model, request, scrollRef } = props;
  const rows = useMemo(() => model?.rows ?? [], [model]);
  const starts = useMemo(() => {
    const m = new Map<number, string>();
    for (const [hunkId, index] of model?.hunkRowIndex ?? []) {
      m.set(index, m.has(index) ? `${m.get(index)} ${hunkId}` : hunkId);
    }
    return m;
  }, [model]);
  const getItemKey = useCallback((i: number) => rows[i]!.key, [rows]);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
    getItemKey,
  });
  const lastToken = useRef(-1);
  useLayoutEffect(() => {
    if (!request || !model || request.token === lastToken.current) return;
    lastToken.current = request.token;
    const index = model.hunkRowIndex.get(request.hunkId);
    if (index !== undefined) virtualizer.scrollToIndex(index, { align: request.align });
  }, [request, model, virtualizer]);
  return (
    <section className="context" aria-label="File context">
      <h2 className="path">{path ?? 'No hunk open'}</h2>
      <div
        ref={scrollRef}
        className="list"
        tabIndex={0}
        aria-label="File text"
        data-list="context"
        data-count={rows.length}
      >
        <div className="sizer" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((item) => (
            <ContextRowView
              key={item.key}
              row={rows[item.index]!}
              start={item.start}
              startsHunks={starts.get(item.index)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
