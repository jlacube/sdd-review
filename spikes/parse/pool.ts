// Spike C001-T-014: a pool of parser worker threads inside the one core process
// (C001-ADR-001 decision 4), each with a heap limit (`resourceLimits`). The heap limit bounds the
// JavaScript heap of a worker; the WebAssembly memory of its grammars and trees is outside it and
// shows only in the process's resident memory, which is what the spike measures.
import { Worker } from 'node:worker_threads';
import type { Extraction } from './extract.js';
import type { LanguageId } from './languages.js';

export interface ParseItem {
  readonly key: number;
  readonly language: LanguageId;
  readonly text: string;
}

export type ToWorker =
  | { type: 'parse'; id: number; items: ParseItem[] }
  | { type: 'extract'; id: number; keys: number[] }
  | { type: 'stats'; id: number };

export type FromWorker =
  | { type: 'ready'; id: -1 }
  | { type: 'parsed'; id: number; count: number; chars: number }
  | { type: 'extracted'; id: number; results: Array<{ key: number; extraction: Extraction }> }
  | {
      type: 'stats';
      id: number;
      heapUsed: number;
      external: number;
      arrayBuffers: number;
      treesHeld: number;
      peakTrees: number;
      grammars: LanguageId[];
    }
  | { type: 'error'; id: number; message: string };

/** `Omit<T, 'id'>` for each member of a union. */
type WithoutId<T> = T extends unknown ? Omit<T, 'id'> : never;

export interface PoolOptions {
  readonly size: number;
  /** `resourceLimits.maxOldGenerationSizeMb` of each worker. */
  readonly heapMb: number;
  readonly wasm: Record<LanguageId, string>;
  /** Load all five grammars at worker start instead of on first use. */
  readonly eagerGrammars?: boolean;
  /** Items per parse message. */
  readonly chunk?: number;
}

/**
 * The worker module: the compiled `worker.js` next to this file when the spike runs as compiled
 * JavaScript (how the runner starts it), or a tsx-registering entry when it runs from TypeScript.
 */
function workerUrl(): URL {
  return import.meta.url.endsWith('.ts')
    ? new URL('./worker-entry.mjs', import.meta.url)
    : new URL('./worker.js', import.meta.url);
}

interface Slot {
  readonly worker: Worker;
  readonly pending: Map<number, { resolve: (m: FromWorker) => void; reject: (e: Error) => void }>;
}

export class ParserPool {
  private readonly slots: Slot[] = [];
  private readonly owner = new Map<number, number>();
  private nextId = 0;
  private failure: Error | undefined;

  private constructor(private readonly options: PoolOptions) {}

  /** Starts the workers and waits until each has loaded its grammars. */
  static async start(options: PoolOptions): Promise<ParserPool> {
    const pool = new ParserPool(options);
    await Promise.all(Array.from({ length: options.size }, () => pool.spawn()));
    return pool;
  }

  get size(): number {
    return this.slots.length;
  }

  private spawn(): Promise<void> {
    const worker = new Worker(workerUrl(), {
      workerData: { wasm: this.options.wasm, eagerGrammars: this.options.eagerGrammars ?? false },
      resourceLimits: { maxOldGenerationSizeMb: this.options.heapMb },
    });
    const slot: Slot = { worker, pending: new Map() };
    this.slots.push(slot);
    return new Promise<void>((ready, failed) => {
      const fail = (error: Error) => {
        this.failure ??= error;
        failed(error);
        for (const p of slot.pending.values()) p.reject(error);
        slot.pending.clear();
      };
      worker.on('message', (message: FromWorker) => {
        if (message.type === 'ready') return ready();
        const p = slot.pending.get(message.id);
        if (!p) return;
        slot.pending.delete(message.id);
        if (message.type === 'error') p.reject(new Error(`parser worker: ${message.message}`));
        else p.resolve(message);
      });
      worker.on('error', (error) => fail(error));
      worker.on('exit', (code) => {
        if (code !== 0) fail(new Error(`parser worker exited with code ${code}`));
      });
    });
  }

  private send(index: number, message: WithoutId<ToWorker>): Promise<FromWorker> {
    if (this.failure) return Promise.reject(this.failure);
    const slot = this.slots[index]!;
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      slot.pending.set(id, { resolve, reject });
      slot.worker.postMessage({ ...message, id } as ToWorker);
    });
  }

  /**
   * Parses the items; each tree stays in the worker that parsed it until `extract`. Workers pull
   * chunks from one queue, largest texts first, so the load evens out.
   */
  async parse(items: readonly ParseItem[]): Promise<{ files: number; chars: number }> {
    const queue = [...items].sort((a, b) => b.text.length - a.text.length);
    const chunk = this.options.chunk ?? 4;
    let files = 0;
    let chars = 0;
    await Promise.all(
      this.slots.map(async (_, index) => {
        while (queue.length > 0) {
          const batch = queue.splice(0, chunk);
          for (const item of batch) this.owner.set(item.key, index);
          const reply = await this.send(index, { type: 'parse', items: batch });
          if (reply.type === 'parsed') {
            files += reply.count;
            chars += reply.chars;
          }
        }
      }),
    );
    return { files, chars };
  }

  /** Extracts and frees the trees of the given keys, in the workers that hold them. */
  async extract(keys: readonly number[]): Promise<Map<number, Extraction>> {
    const byWorker = new Map<number, number[]>();
    for (const key of keys) {
      const index = this.owner.get(key);
      if (index === undefined) throw new Error(`key ${key} was never parsed`);
      const list = byWorker.get(index) ?? [];
      list.push(key);
      byWorker.set(index, list);
    }
    const out = new Map<number, Extraction>();
    const chunk = 16;
    await Promise.all(
      [...byWorker].map(async ([index, list]) => {
        for (let i = 0; i < list.length; i += chunk) {
          const reply = await this.send(index, { type: 'extract', keys: list.slice(i, i + chunk) });
          if (reply.type === 'extracted') {
            for (const r of reply.results) {
              out.set(r.key, r.extraction);
              this.owner.delete(r.key);
            }
          }
        }
      }),
    );
    return out;
  }

  async stats(): Promise<Array<Extract<FromWorker, { type: 'stats' }>>> {
    const replies = await Promise.all(this.slots.map((_, i) => this.send(i, { type: 'stats' })));
    return replies.filter((r): r is Extract<FromWorker, { type: 'stats' }> => r.type === 'stats');
  }

  async close(): Promise<void> {
    await Promise.all(this.slots.map((s) => s.worker.terminate()));
    this.slots.length = 0;
  }
}
