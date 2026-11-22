// Spike C001-T-023: performance marks per user action, as C001-NFR-003 measures them: from the
// input event to the updated view rendered.
//
// - Start: a mark at the input event's own time stamp (`event.timeStamp`, same time origin as
//   `performance.now()`), so the delay before the handler runs counts.
// - Settled: checked in each animation frame after the input. The action's predicate must hold:
//   React has committed the action's state, and each virtualised list has rows rendered over its
//   whole visible area at its current scroll position (plus the action's own target, for example
//   the opened hunk visible in the file context). The check reads layout, which the frame's paint
//   needs anyway.
// - End: a mark in a message task posted from the frame where the view first settled; that task
//   runs after the frame's paint, so the measure includes style, layout and paint of the view.
// - Measure: `spike|<seq>|<type>|<variant>|<timedOut 0|1>`; the runner reads these entries.

/** An action that has not settled after this long is closed and recorded as timed out. */
export const SETTLE_LIMIT_MS = 5000;
export const MEASURE_PREFIX = 'spike|';

interface Pending {
  readonly seq: number;
  readonly type: string;
  readonly variant: string;
  readonly start: string;
  readonly startTime: number;
  readonly settled: () => boolean;
}

let seq = 0;
let pending: Pending | null = null;
let committedVersion = 0;

const channel = new MessageChannel();
let afterPaint: (() => void) | null = null;
channel.port1.onmessage = () => {
  const run = afterPaint;
  afterPaint = null;
  run?.();
};

function finish(p: Pending, timedOut: boolean) {
  if (pending !== p) return;
  pending = null;
  const end = `spike:end:${p.seq}`;
  performance.mark(end);
  performance.measure(
    `${MEASURE_PREFIX}${p.seq}|${p.type}|${p.variant}|${timedOut ? 1 : 0}`,
    p.start,
    end,
  );
}

function check(p: Pending) {
  if (pending !== p) return;
  if (p.settled()) {
    afterPaint = () => finish(p, false);
    channel.port2.postMessage(null);
    return;
  }
  if (performance.now() - p.startTime > SETTLE_LIMIT_MS) {
    finish(p, true);
    return;
  }
  requestAnimationFrame(() => check(p));
}

/** Call first thing in the input handler. An earlier action still open is closed now. */
export function beginAction(
  type: string,
  variant: string,
  eventTimeStamp: number,
  settled: () => boolean,
): void {
  if (pending) finish(pending, false);
  seq += 1;
  const start = `spike:start:${seq}`;
  performance.mark(start, { startTime: eventTimeStamp });
  const p: Pending = { seq, type, variant, start, startTime: eventTimeStamp, settled };
  pending = p;
  requestAnimationFrame(() => check(p));
}

/** Called from a layout effect of the root: the state version React has committed. */
export function markCommitted(version: number): void {
  committedVersion = version;
}

export function committed(version: number): boolean {
  return committedVersion >= version;
}

/**
 * True when the rows (`[data-row]`) of the scroll container cover its whole visible area at the
 * current scroll position, or the list is shorter than the area and fully rendered.
 */
export function covered(container: HTMLElement | null): boolean {
  if (!container) return true;
  const rows = container.querySelectorAll<HTMLElement>('[data-row]');
  const box = container.getBoundingClientRect();
  const top = box.top + container.clientTop;
  const contentBottom = top - container.scrollTop + container.scrollHeight;
  const bottom = Math.min(top + container.clientHeight, contentBottom);
  if (rows.length === 0) return container.dataset.count === '0';
  // Every row rendered: the list covers what it can. scrollHeight is never below clientHeight, so
  // without this a list shorter than its area never settled (5 s timeouts on short files).
  if (rows.length >= Number(container.dataset.count)) return true;
  let minTop = Infinity;
  let maxBottom = -Infinity;
  for (const row of rows) {
    const r = row.getBoundingClientRect();
    if (r.top < minTop) minTop = r.top;
    if (r.bottom > maxBottom) maxBottom = r.bottom;
  }
  return minTop <= top + 0.5 && maxBottom >= bottom - 0.5;
}

/** True when an element matching `selector` inside the container intersects its visible area. */
export function visibleIn(container: HTMLElement | null, selector: string): boolean {
  if (!container) return false;
  const el = container.querySelector(selector);
  if (!el) return false;
  const box = container.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  return r.bottom > box.top && r.top < box.top + container.clientHeight;
}
