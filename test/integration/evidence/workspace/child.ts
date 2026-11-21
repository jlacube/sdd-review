/**
 * Child process of the workspace lifetime test: prepares one workspace under the given evidence
 * root, reports its root, then ends without removing it (killed, as a crash would end it).
 */
import { writeFileSync } from 'node:fs';
import { AttributeSet, nativeEolOf } from '../../../../src/core/evidence/workspace/fill.js';
import { prepareWorkspace } from '../../../../src/core/evidence/workspace/lifetime.js';

const spec = JSON.parse(process.argv[2] ?? '{}') as {
  evidenceRoot: string;
  repositoryKey: string;
  snapshotId: string;
  readyFile: string;
};

const prepared = await prepareWorkspace({
  evidenceRoot: spec.evidenceRoot,
  repositoryKey: spec.repositoryKey,
  snapshotId: spec.snapshotId,
  entries: [
    { path: 'src/a.ts', mode: 'regular', read: async () => Buffer.from('export const a = 1;\n') },
  ],
  checkout: { autocrlf: 'false', eol: null, nativeEol: nativeEolOf() },
  attributes: new AttributeSet({ files: [] }),
  symlinks: false,
});
writeFileSync(spec.readyFile, prepared.handle.root);
// No orderly close: the process ends as a kill would end it.
process.kill(process.pid, 'SIGKILL');
