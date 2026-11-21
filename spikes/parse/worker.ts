// Spike C001-T-014: one parser worker thread. It loads its own grammar instances (C001-ADR-003,
// Consequences), parses the texts it is sent, keeps the trees until the extraction message for
// them arrives, then extracts and frees them (WebAssembly trees live outside the JS heap).
import { parentPort, workerData } from 'node:worker_threads';
import { Parser, type Tree } from 'web-tree-sitter';
import { Grammars, parseText } from './extract.js';
import type { LanguageId } from './languages.js';
import type { ToWorker, FromWorker } from './pool.js';

const port = parentPort!;
const grammars = await Grammars.init(workerData.wasm as Record<LanguageId, string>);
if (workerData.eagerGrammars) await grammars.ensureAll();
const parser = new Parser();
const trees = new Map<number, { language: LanguageId; tree: Tree }>();
let peakTrees = 0;

const reply = (message: FromWorker) => port.postMessage(message);

port.on('message', async (message: ToWorker) => {
  try {
    if (message.type === 'parse') {
      let bytes = 0;
      for (const item of message.items) {
        const language = await grammars.ensure(item.language);
        trees.set(item.key, {
          language: item.language,
          tree: parseText(parser, language, item.text),
        });
        bytes += item.text.length;
      }
      peakTrees = Math.max(peakTrees, trees.size);
      reply({ type: 'parsed', id: message.id, count: message.items.length, chars: bytes });
    } else if (message.type === 'extract') {
      const results = message.keys.map((key) => {
        const held = trees.get(key);
        if (!held) throw new Error(`no tree held for key ${key}`);
        const extraction = grammars.extract(held.language, held.tree);
        held.tree.delete();
        trees.delete(key);
        return { key, extraction };
      });
      reply({ type: 'extracted', id: message.id, results });
    } else if (message.type === 'stats') {
      const m = process.memoryUsage();
      reply({
        type: 'stats',
        id: message.id,
        heapUsed: m.heapUsed,
        external: m.external,
        arrayBuffers: m.arrayBuffers,
        treesHeld: trees.size,
        peakTrees,
        grammars: grammars.loaded(),
      });
    }
  } catch (error) {
    reply({
      type: 'error',
      id: message.id,
      message: error instanceof Error ? (error.stack ?? error.message) : String(error),
    });
  }
});

reply({ type: 'ready', id: -1 });
