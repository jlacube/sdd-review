// Spike C001-T-023: the scripted session. A seeded, reproducible sequence of user actions on the
// hunk list and the file context view: open, scroll, mark and move (C001-NFR-003 names open, mark,
// move and decide; scrolling the two virtualised lists is what the spike adds, decide has no view
// in the prototype). The runner turns each step into real browser input.
import type { ActionType } from './stats.js';

export type Variant =
  | 'open-click' // click on a hunk header visible in the hunk list
  | 'open-next' // key j: next hunk
  | 'open-prev' // key k: previous hunk
  | 'scroll-hunks-pagedown'
  | 'scroll-hunks-pageup'
  | 'scroll-hunks-end'
  | 'scroll-hunks-home'
  | 'scroll-context-pagedown'
  | 'scroll-context-pageup'
  | 'scroll-context-end'
  | 'scroll-context-home'
  | 'mark-click' // click on the toolbar's read-mark button for the selected hunk
  | 'move-key'; // digit key 1..9, 0: move the selected hunk to that intent group

export interface SessionStep {
  readonly seq: number;
  readonly type: ActionType;
  readonly variant: Variant;
  /** open-click: which of the visible hunk headers, as a fraction in [0, 1). */
  readonly pick?: number;
  /** move-key: the digit key pressed ('1'..'9', '0' for the tenth group). */
  readonly key?: string;
}

/** Minimum session length of the task (C001-T-023 step 2); C001-NFR-003 itself uses 500. */
export const MIN_ACTIONS = 200;
export const DEFAULT_ACTIONS = 500;
export const DEFAULT_SEED = 23;

/** Mulberry32: a small deterministic PRNG, so that every browser replays the same session. */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Share of each action type in the session. */
export const MIX: Readonly<Record<ActionType, number>> = {
  open: 0.35,
  scroll: 0.35,
  mark: 0.15,
  move: 0.15,
};

function pickType(r: number): ActionType {
  let acc = 0;
  for (const type of Object.keys(MIX) as ActionType[]) {
    acc += MIX[type];
    if (r < acc) return type;
  }
  return 'move';
}

function scrollVariant(r: number, list: 'hunks' | 'context'): Variant {
  // Mostly reading forward, sometimes back, now and then a jump to an end of the list.
  const dir = r < 0.7 ? 'pagedown' : r < 0.9 ? 'pageup' : r < 0.95 ? 'end' : 'home';
  return `scroll-${list}-${dir}` as Variant;
}

/**
 * The scripted session: `actions` steps (at least MIN_ACTIONS), the first one an open, with the
 * mix of MIX. `groups` is the number of intent groups the move steps can name (2 to 10).
 */
export function scriptSession(actions: number, seed: number, groups: number): SessionStep[] {
  if (!Number.isInteger(actions) || actions < MIN_ACTIONS) {
    throw new RangeError(`a session has at least ${MIN_ACTIONS} actions (got ${actions})`);
  }
  if (!Number.isInteger(groups) || groups < 2 || groups > 10) {
    throw new RangeError(`moves need 2 to 10 intent groups (got ${groups})`);
  }
  const rnd = prng(seed);
  const steps: SessionStep[] = [];
  for (let seq = 0; seq < actions; seq++) {
    const type = seq === 0 ? 'open' : pickType(rnd());
    const r = rnd();
    switch (type) {
      case 'open':
        if (seq === 0 || r < 0.5) steps.push({ seq, type, variant: 'open-click', pick: rnd() });
        else steps.push({ seq, type, variant: r < 0.85 ? 'open-next' : 'open-prev' });
        break;
      case 'scroll':
        steps.push({ seq, type, variant: scrollVariant(rnd(), r < 0.5 ? 'hunks' : 'context') });
        break;
      case 'mark':
        steps.push({ seq, type, variant: 'mark-click' });
        break;
      case 'move':
        steps.push({
          seq,
          type,
          variant: 'move-key',
          key: String((Math.floor(r * groups) + 1) % 10),
        });
        break;
    }
  }
  return steps;
}
