/**
 * Child process of the Linux observer test, started inside a user namespace whose inotify limits
 * the parent lowered: starts the observer on the given repository, runs one empty run window and
 * prints the observation as JSON.
 */
import { linuxBackendFactory } from '../../../../src/core/evidence/observer/linux.js';
import { Observer, type ObserverScope } from '../../../../src/core/evidence/observer/observer.js';

const scope = JSON.parse(process.argv[2] ?? '{}') as ObserverScope;
const observer = await Observer.start({
  scope,
  factory: linuxBackendFactory({ pollMs: 20 }),
  schedule: () => undefined,
});
const run = await observer.beginRun();
const result = await observer.endRun(run);
await observer.stop();
process.stdout.write(JSON.stringify(result));
