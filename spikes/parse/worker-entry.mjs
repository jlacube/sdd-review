// Spike C001-T-014: entry of a parser worker thread. Node 22 does not carry the `--import tsx`
// loader of the main thread into worker threads, so the worker registers tsx itself before it
// loads the TypeScript worker module.
import { register } from 'tsx/esm/api';

register();
await import('./worker.ts');
