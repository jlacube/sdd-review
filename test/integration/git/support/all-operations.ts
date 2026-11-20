import { GitAdapter } from '../../../../src/core/git/operations.js';
import type { ChangedFile } from '../../../../src/core/git/port.js';

/**
 * Runs every operation G-01 to G-16 of C001-IF-012 §3 against the repository at `directory` and
 * returns what they read in a comparable form. A ReviewError is part of the result (its code),
 * never an escape: the callers compare the whole record.
 */
export async function runAllOperations(
  adapter: GitAdapter,
  directory: string,
  paths: readonly string[],
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  const step = async (name: string, work: () => Promise<unknown>) => {
    try {
      out[name] = await work();
    } catch (error) {
      out[name] = { error: (error as { code?: string }).code ?? String(error) };
    }
  };
  let location!: Awaited<ReturnType<GitAdapter['discover']>>;
  await step('G-01', async () => {
    location = await adapter.discover(directory);
    return { ...location };
  });
  let head = '';
  await step('G-02', async () => {
    const h = await adapter.head();
    head = h.commit;
    return h;
  });
  let base = head;
  await step('G-03', async () => {
    base = await adapter.resolveCommit('HEAD~1').catch(() => head);
    return [await adapter.resolveCommit('HEAD'), base];
  });
  await step('G-04', () => adapter.mergeBase(head, base));
  await step('G-05', () => adapter.upstream('main'));
  await step('G-06', () => adapter.commitsBetween(base, head));
  let files: readonly ChangedFile[] = [];
  await step('G-07', async () => {
    files = await adapter.changeAgainst(base);
    return files.map((f) => ({
      ...f,
      baseContent: f.baseContent?.toString('base64') ?? null,
      currentContent: f.currentContent?.toString('base64') ?? null,
    }));
  });
  await step('G-08', async () => (await adapter.readBlob(head, paths[0]!))?.toString('base64'));
  await step('G-09', () => adapter.attributeLines(base, head, paths[0]!));
  await step('G-10', () => adapter.userIdentity());
  await step('G-11', async () => [...(await adapter.attributes(head, paths, 'filter'))]);
  await step('G-12', () => adapter.workingState({ base, files }));
  await step('G-13', () => adapter.treeEntries(head));
  await step('G-14', () => adapter.defaultBranches());
  await step('G-15', async () =>
    [...(await adapter.indexState(paths))].map(([path, s]) => [
      path,
      s ? { blob: s.blob, mode: s.mode } : null,
    ]),
  );
  await step('G-16', () => adapter.submoduleTree(location, 'no/such/submodule', head));
  return out;
}
