// Spike C001-T-023: the prototype page. A virtualised hunk list grouped by stand-in intents, a
// virtualised file context of the open hunk's file, and a toolbar. Every input handler starts a
// timed action (timing.ts) before it changes anything.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { SpikeDataset, SpikeHunk } from './dataset';
import { FileContext, HunkList, type ScrollRequest } from './lists';
import { buildContextRows, buildHunkRows, groupIndexOfKey } from './model';
import { beginAction, committed, covered, markCommitted, visibleIn } from './timing';

const SCROLL_KEYS: Record<string, string> = {
  PageDown: 'pagedown',
  PageUp: 'pageup',
  End: 'end',
  Home: 'home',
};

const attr = (value: string) => CSS.escape(value);

export function App(props: { data: SpikeDataset }) {
  const { data } = props;
  const [assignment, setAssignment] = useState(data.assignment);
  const [read, setRead] = useState<ReadonlySet<string>>(() => new Set());
  const [selectedId, setSelectedId] = useState<string | null>(data.hunks[0]?.hunkId ?? null);
  const [hunkRequest, setHunkRequest] = useState<ScrollRequest | null>(null);
  const [contextRequest, setContextRequest] = useState<ScrollRequest | null>(null);
  const [version, setVersion] = useState(0);
  const versionRef = useRef(0);
  const tokenRef = useRef(0);
  const hunkListRef = useRef<HTMLDivElement | null>(null);
  const contextRef = useRef<HTMLDivElement | null>(null);

  const hunkById = useMemo(() => new Map(data.hunks.map((h) => [h.hunkId, h])), [data]);
  const hunksByPath = useMemo(() => {
    const m = new Map<string, SpikeHunk[]>();
    for (const h of data.hunks) m.set(h.path, [...(m.get(h.path) ?? []), h]);
    return m;
  }, [data]);
  const fileByPath = useMemo(() => new Map(data.files.map((f) => [f.path, f])), [data]);
  const totalLines = useMemo(() => data.hunks.reduce((n, h) => n + h.lines.length, 0), [data]);

  const hunkModel = useMemo(
    () => buildHunkRows(data.hunks, data.groups, assignment),
    [data, assignment],
  );
  const selected = selectedId === null ? null : (hunkById.get(selectedId) ?? null);
  const path = selected?.path ?? null;
  const contextModel = useMemo(() => {
    const file = path === null ? undefined : fileByPath.get(path);
    return file ? buildContextRows(file, hunksByPath.get(file.path) ?? []) : null;
  }, [path, fileByPath, hunksByPath]);
  const readLines = useMemo(() => {
    let n = 0;
    for (const id of read) n += hunkById.get(id)?.lines.length ?? 0;
    return n;
  }, [read, hunkById]);

  useLayoutEffect(() => markCommitted(version), [version]);

  /** The next state version; the action is settled once React has committed it. */
  const nextVersion = () => {
    versionRef.current += 1;
    setVersion(versionRef.current);
    return versionRef.current;
  };
  const token = () => (tokenRef.current += 1);
  const bothCovered = () => covered(hunkListRef.current) && covered(contextRef.current);

  const open = useCallback(
    (hunkId: string, variant: string, timeStamp: number, scrollList: boolean) => {
      const v = versionRef.current + 1;
      beginAction(
        'open',
        variant,
        timeStamp,
        () =>
          committed(v) &&
          bothCovered() &&
          visibleIn(hunkListRef.current, `[data-hunk-header="${attr(hunkId)}"]`) &&
          visibleIn(contextRef.current, `[data-ctx-start~="${attr(hunkId)}"]`),
      );
      nextVersion();
      setSelectedId(hunkId);
      if (scrollList) setHunkRequest({ hunkId, token: token(), align: 'auto' });
      setContextRequest({ hunkId, token: token(), align: 'start' });
    },
    [],
  );

  const onOpenClick = useCallback(
    (hunkId: string, timeStamp: number) => open(hunkId, 'open-click', timeStamp, false),
    [open],
  );

  const onMark = useCallback(
    (timeStamp: number) => {
      const v = versionRef.current + 1;
      beginAction('mark', 'mark-click', timeStamp, () => committed(v) && bothCovered());
      nextVersion();
      if (selectedId === null) return;
      setRead((prev) => {
        const next = new Set(prev);
        if (next.has(selectedId)) next.delete(selectedId);
        else next.add(selectedId);
        return next;
      });
    },
    [selectedId],
  );

  // Keyboard: j/k open the next or previous hunk, digits move the open hunk to an intent group,
  // PageDown/PageUp/End/Home scroll the focused list (instant: no smooth-scroll animation).
  const latest = useRef({ selectedId, hunkModel, assignment });
  latest.current = { selectedId, hunkModel, assignment };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { selectedId: sel, hunkModel: model, assignment: current } = latest.current;
      if (e.key === 'j' || e.key === 'k') {
        const at = sel === null ? -1 : model.order.indexOf(sel);
        const to = e.key === 'j' ? Math.min(model.order.length - 1, at + 1) : Math.max(0, at - 1);
        const id = model.order[to];
        if (id !== undefined)
          open(id, e.key === 'j' ? 'open-next' : 'open-prev', e.timeStamp, true);
        return;
      }
      const dir = SCROLL_KEYS[e.key];
      if (dir) {
        e.preventDefault();
        const inContext = contextRef.current?.contains(document.activeElement) ?? false;
        const el = inContext ? contextRef.current : hunkListRef.current;
        if (!el) return;
        beginAction(
          'scroll',
          `scroll-${inContext ? 'context' : 'hunks'}-${dir}`,
          e.timeStamp,
          bothCovered,
        );
        const max = el.scrollHeight - el.clientHeight;
        const page = Math.max(1, el.clientHeight - 20);
        const to =
          dir === 'pagedown'
            ? el.scrollTop + page
            : dir === 'pageup'
              ? el.scrollTop - page
              : dir === 'end'
                ? max
                : 0;
        el.scrollTop = Math.max(0, Math.min(max, to));
        return;
      }
      const index = groupIndexOfKey(e.key);
      if (index !== null && sel !== null) {
        const groups = data.groups;
        let target = groups[Math.min(index, groups.length - 1)]!;
        if (target.id === current[sel]) {
          target = groups[(groups.indexOf(target) + 1) % groups.length]!;
        }
        const v = versionRef.current + 1;
        beginAction(
          'move',
          'move-key',
          e.timeStamp,
          () =>
            committed(v) &&
            bothCovered() &&
            visibleIn(hunkListRef.current, `[data-hunk-header="${attr(sel)}"]`),
        );
        nextVersion();
        setAssignment({ ...current, [sel]: target.id });
        setHunkRequest({ hunkId: sel, token: token(), align: 'auto' });
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [data, open]);

  const group =
    selectedId === null ? null : data.groups.find((g) => g.id === assignment[selectedId]);
  return (
    <div className="app">
      <header className="toolbar">
        <span>{`${data.id}: ${data.hunks.length} hunks, ${totalLines} changed lines`}</span>
        <span>{`Read: ${readLines} of ${totalLines} lines`}</span>
        <span className="selected">
          {selected ? `${selected.path} (${group?.name ?? ''})` : 'No hunk open'}
        </span>
        <button
          type="button"
          data-action="mark"
          aria-pressed={selectedId !== null && read.has(selectedId)}
          onClick={(e) => onMark(e.timeStamp)}
        >
          {selectedId !== null && read.has(selectedId) ? 'Unmark read' : 'Mark read'}
        </button>
        <span className="keys">j/k open, 1-0 move, PageDown/PageUp/Home/End scroll</span>
      </header>
      <div className="panes">
        <HunkList
          model={hunkModel}
          selectedId={selectedId}
          read={read}
          request={hunkRequest}
          scrollRef={hunkListRef}
          onOpen={onOpenClick}
        />
        <FileContext
          path={path}
          model={contextModel}
          request={contextRequest}
          scrollRef={contextRef}
        />
      </div>
    </div>
  );
}
