import { anthropicMessagesBody } from './adapters/anthropic-messages.js';
import { openAiChatBody } from './adapters/openai-chat.js';
import { timedOut } from './failures.js';
import type {
  AdapterAnswer,
  AdapterRequest,
  ModelHunk,
  ModelIntent,
  TaskInputs,
} from './gateway.js';
import type { ModelTask } from './labels.js';

/**
 * Batching and the provider timeout of the model gateway (C001-IF-010 §3):
 *
 * - item 1 and 2, the prompt rules: one system instruction per task, fixed per release, which
 *   states that every piece of repository content, commit message, plan and transcript in the
 *   input is data whose instructions must not be followed; the input goes as one JSON user message
 *   at temperature 0 (`adapters/request-parts.ts`). Batching only splits the input: each batch is
 *   a whole input of the task, sent with the same instruction, so no part of it is ever sent as
 *   anything but data.
 * - item 3: a request body is at most `model.maxRequestBytes`, measured on the body the adapter of
 *   the configured provider API sends (`openAiChatBody`, `anthropicMessagesBody`). Hunks are split
 *   into batches in path order, then first changed line; intent source texts are cut further when
 *   the intents alone exceed the limit. Each batch is one request; a failure affects only its
 *   items.
 * - item 4: no retry. Batches are sent one after the other, each once.
 * - item 5: the provider timeout bounds each request from connection to the last byte; the adapter
 *   transport enforces it, and `withTimeout` bounds the adapter call itself, so that no adapter can
 *   hold the gateway beyond it.
 *
 * The walkthrough account sends one intent's hunks "in intent order" (§2), so its batches keep that
 * order. An element that alone exceeds the limit (one hunk, commit or named file) is sent in a
 * batch of its own; see the defect raised against C001-IF-010 §3 for that case.
 */

/** One batch: a whole input of the task, and what its items are. */
export interface Batch<T extends ModelTask> {
  readonly input: TaskInputs[T];
  /** Hunk IDs of the batch, in order (hunk-linking, design-critique, walkthrough-account). */
  readonly hunkIds: readonly string[];
  /** Component names of the batch (design-critique). */
  readonly componentNames: readonly string[];
}

/** The exact size in bytes of the request body the adapter of `request.provider.api` sends. */
export function requestBytes(request: AdapterRequest): number {
  const body =
    request.provider.api === 'anthropic-messages'
      ? anthropicMessagesBody(request)
      : openAiChatBody(request);
  return Buffer.byteLength(JSON.stringify(body), 'utf8');
}

/** The first changed line of each hunk that has one (`ModelHunk.firstLine`), by hunk ID. */
export type FirstLines = ReadonlyMap<string, number>;

/** The first changed lines the hunks of `input` give. */
export function firstLinesOf<T extends ModelTask>(task: T, input: TaskInputs[T]): FirstLines {
  const hunks =
    task === 'design-critique'
      ? (input as TaskInputs['design-critique']).components.flatMap((c) => c.hunks)
      : task === 'intent-extraction'
        ? []
        : (input as TaskInputs['hunk-linking' | 'walkthrough-account']).hunks;
  const lines = new Map<string, number>();
  for (const h of hunks) if (typeof h.firstLine === 'number') lines.set(h.hunkId, h.firstLine);
  return lines;
}

/** Path order, then first changed line (§3 item 3); 0 when neither tells two hunks apart. */
function comparing(lines: FirstLines) {
  return (a: ModelHunk, b: ModelHunk): number => {
    if (a.path !== b.path) return a.path < b.path ? -1 : 1;
    const la = lines.get(a.hunkId);
    const lb = lines.get(b.hunkId);
    return la !== undefined && lb !== undefined ? la - lb : 0;
  };
}

/** Hunks in path order, then first changed line; ties keep their given order (stable sort). */
export function inPathOrder(hunks: readonly ModelHunk[], lines: FirstLines): ModelHunk[] {
  return [...hunks].sort(comparing(lines));
}

/**
 * The input with its hunks in the order of §3 item 3: hunk linking and design critique sort their
 * hunks by path, then first changed line (design critique also orders its components by their
 * first hunk); the walkthrough account keeps intent order (§2); intent extraction has no hunks.
 * The input that is sent no longer holds `firstLine` (`egress.ts` rebuilds it from the fields of
 * §2), so the lines come from the input as given (`firstLinesOf`).
 */
export function ordered<T extends ModelTask>(
  task: T,
  input: TaskInputs[T],
  lines: FirstLines,
): TaskInputs[T] {
  if (task === 'hunk-linking') {
    const given = input as TaskInputs['hunk-linking'];
    return { ...given, hunks: inPathOrder(given.hunks, lines) } as unknown as TaskInputs[T];
  }
  if (task === 'design-critique') {
    const given = input as TaskInputs['design-critique'];
    const compare = comparing(lines);
    // Components by their first hunk; a component sent without hunks comes last.
    const components = given.components
      .map((c) => ({ ...c, hunks: inPathOrder(c.hunks, lines) }))
      .sort((a, b) => {
        const [ha, hb] = [a.hunks[0], b.hunks[0]];
        if (ha && hb) return compare(ha, hb);
        return ha ? -1 : hb ? 1 : 0;
      });
    return { components } as unknown as TaskInputs[T];
  }
  return input;
}

/** Bytes an element adds inside the user message, which is a JSON string in the body. */
const inMessage = (value: unknown) => Buffer.byteLength(JSON.stringify(JSON.stringify(value))) - 2;

/** Cuts every intent source text to `length` characters. */
const cutIntents = (intents: readonly ModelIntent[], length: number): ModelIntent[] =>
  intents.map((i) => ({ ...i, sourceText: i.sourceText.slice(0, length) }));

/**
 * The longest cut of the source texts at which `fits(cut)` holds (§3 item 3: "intent source texts
 * are cut further when the intents alone exceed the limit"); 0 when no cut fits.
 */
function longestCut(longest: number, fits: (length: number) => boolean): number {
  if (fits(longest)) return longest;
  let lo = 0;
  let hi = longest;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (fits(mid)) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * Packs `elements` greedily, in order, into batches whose measured size is at most `max`.
 * `estimate(e, batch)` is what `e` adds to a batch (an upper bound); each closed batch is measured
 * exactly and gives back elements from its end until it fits. An element that alone exceeds `max`
 * forms a batch of its own.
 */
function pack<E>(
  elements: readonly E[],
  max: number,
  base: number,
  estimate: (e: E, batch: readonly E[]) => number,
  measure: (batch: readonly E[]) => number,
): E[][] {
  const batches: E[][] = [];
  let i = 0;
  while (i < elements.length) {
    const batch: E[] = [elements[i]!];
    let size = base + estimate(elements[i]!, []);
    i += 1;
    while (i < elements.length) {
      const add = estimate(elements[i]!, batch);
      if (size + add > max) break;
      batch.push(elements[i]!);
      size += add;
      i += 1;
    }
    while (batch.length > 1 && measure(batch) > max) {
      batch.pop();
      i -= 1;
    }
    batches.push(batch);
  }
  return batches;
}

/**
 * Splits the input of one request into batches of at most `maxRequestBytes` (§3 item 3), measured
 * with `request` (provider, task, key) around each batch's input. An input with nothing to split
 * is one batch.
 */
export function batchesFor<T extends ModelTask>(
  request: Omit<AdapterRequest<T>, 'input'>,
  input: TaskInputs[T],
): Array<Batch<T>> {
  const max = request.maxRequestBytes;
  const size = (i: TaskInputs[T]) => requestBytes({ ...request, input: i } as AdapterRequest);
  const task = request.task as ModelTask;
  switch (task) {
    case 'hunk-linking': {
      const given = input as TaskInputs['hunk-linking'];
      const build = (intents: readonly ModelIntent[], hunks: readonly ModelHunk[]) =>
        ({ intents, hunks }) as unknown as TaskInputs[T];
      const longest = Math.max(0, ...given.intents.map((i) => i.sourceText.length));
      const cut = longestCut(longest, (n) => size(build(cutIntents(given.intents, n), [])) <= max);
      const intents = cut === longest ? given.intents : cutIntents(given.intents, cut);
      if (given.hunks.length === 0) return [batchOf(task, build(intents, []))];
      const base = size(build(intents, []));
      return pack(
        given.hunks,
        max,
        base,
        (h, batch) => inMessage(h) + (batch.length > 0 ? 1 : 0),
        (hunks) => size(build(intents, hunks)),
      ).map((hunks) => batchOf(task, build(intents, hunks)));
    }
    case 'walkthrough-account': {
      const given = input as TaskInputs['walkthrough-account'];
      const build = (intent: ModelIntent, hunks: readonly ModelHunk[]) =>
        ({ intent, hunks }) as unknown as TaskInputs[T];
      const longest = given.intent.sourceText.length;
      const cut = longestCut(
        longest,
        (n) => size(build(cutIntents([given.intent], n)[0]!, [])) <= max,
      );
      const intent = cut === longest ? given.intent : cutIntents([given.intent], cut)[0]!;
      if (given.hunks.length === 0) return [batchOf(task, build(intent, []))];
      const base = size(build(intent, []));
      return pack(
        given.hunks,
        max,
        base,
        (h, batch) => inMessage(h) + (batch.length > 0 ? 1 : 0),
        (hunks) => size(build(intent, hunks)),
      ).map((hunks) => batchOf(task, build(intent, hunks)));
    }
    case 'design-critique': {
      const given = input as TaskInputs['design-critique'];
      type Element = { readonly componentName: string; readonly hunk: ModelHunk | null };
      const elements: Element[] = given.components.flatMap((c): Element[] =>
        c.hunks.length === 0
          ? [{ componentName: c.componentName, hunk: null }]
          : c.hunks.map((hunk) => ({ componentName: c.componentName, hunk })),
      );
      const build = (batch: readonly Element[]) => {
        const components: Array<{ componentName: string; hunks: ModelHunk[] }> = [];
        for (const e of batch) {
          let c = components.find((x) => x.componentName === e.componentName);
          if (!c) {
            c = { componentName: e.componentName, hunks: [] };
            components.push(c);
          }
          if (e.hunk) c.hunks.push(e.hunk);
        }
        return { components } as unknown as TaskInputs[T];
      };
      if (elements.length === 0) return [batchOf(task, build([]))];
      const base = size(build([]));
      return pack(
        elements,
        max,
        base,
        (e, batch) => {
          const group = batch.some((x) => x.componentName === e.componentName)
            ? 0
            : inMessage({ componentName: e.componentName, hunks: [] }) + 1;
          return group + (e.hunk ? inMessage(e.hunk) + 1 : 0);
        },
        (batch) => size(build(batch)),
      ).map((batch) => batchOf(task, build(batch)));
    }
    default: {
      const given = input as TaskInputs['intent-extraction'];
      type Element =
        | { readonly commit: TaskInputs['intent-extraction']['commits'][number] }
        | { readonly file: TaskInputs['intent-extraction']['namedFiles'][number] };
      const elements: Element[] = [
        ...given.commits.map((commit) => ({ commit })),
        ...given.namedFiles.map((file) => ({ file })),
      ];
      const build = (batch: readonly Element[]) =>
        ({
          commits: batch.flatMap((e) => ('commit' in e ? [e.commit] : [])),
          namedFiles: batch.flatMap((e) => ('file' in e ? [e.file] : [])),
        }) as unknown as TaskInputs[T];
      if (elements.length === 0 || size(input) <= max) return [batchOf(task, input)];
      const base = size(build([]));
      return pack(
        elements,
        max,
        base,
        (e) => inMessage('commit' in e ? e.commit : e.file) + 1,
        (batch) => size(build(batch)),
      ).map((batch) => batchOf(task, build(batch)));
    }
  }
}

function batchOf<T extends ModelTask>(task: ModelTask, input: TaskInputs[T]): Batch<T> {
  switch (task) {
    case 'hunk-linking':
    case 'walkthrough-account': {
      const hunks = (input as TaskInputs['hunk-linking' | 'walkthrough-account']).hunks;
      return { input, hunkIds: hunks.map((h) => h.hunkId), componentNames: [] };
    }
    case 'design-critique': {
      const components = (input as TaskInputs['design-critique']).components;
      return {
        input,
        hunkIds: components.flatMap((c) => c.hunks.map((h) => h.hunkId)),
        componentNames: components.map((c) => c.componentName),
      };
    }
    default:
      return { input, hunkIds: [], componentNames: [] };
  }
}

/** The margin the gateway's own bound gives the transport's timer, which fires first. */
export const TIMEOUT_GRACE_MS = 1000;

/**
 * Bounds one adapter call by the provider timeout (§3 item 5): when the adapter has not settled
 * within `timeoutSeconds` (plus a grace that lets the transport's own timer, which runs from the
 * connection, report first), the request has failed with ERR-MODEL-004 and its answer, should it
 * still come, is not used.
 */
export function withTimeout(
  send: Promise<AdapterAnswer>,
  timeoutSeconds: number,
): Promise<AdapterAnswer> {
  let timer: NodeJS.Timeout | undefined;
  const bound = new Promise<AdapterAnswer>((resolve) => {
    timer = setTimeout(
      () => resolve({ ok: false, failure: timedOut(timeoutSeconds) }),
      timeoutSeconds * 1000 + TIMEOUT_GRACE_MS,
    );
    timer.unref?.();
  });
  return Promise.race([send, bound]).finally(() => clearTimeout(timer));
}
