import { strict as assert } from 'node:assert';
import { join } from 'node:path';
import { HeadlessOutput } from './headless-output.js';
import type { AcceptanceWorld } from './world.js';

// Named intent-context files of the CAP-01 scenarios (C001-TC-112, C001-TC-113: C001-TS-127 to
// C001-TS-129). The files lie in a folder of the scenario outside the fixture repository, so that
// naming them does not change the snapshot; they are named to the CLI by their absolute path.

export const ROLE_OPTIONS = {
  'pull-request text': '--pr-text',
  'agent plan': '--plan',
  'agent transcript': '--transcript',
} as const;

export type RoleText = keyof typeof ROLE_OPTIONS;

export const ROLE_IDS: Readonly<Record<RoleText, string>> = {
  'pull-request text': 'pull-request-text',
  'agent plan': 'agent-plan',
  'agent transcript': 'agent-transcript',
};

export interface NamedFileJson {
  role: string;
  path: string;
  size: number;
  format: string;
  text: string;
}

const folders = new WeakMap<AcceptanceWorld, string>();

/** The scenario's folder of named files. */
export function namedFolder(world: AcceptanceWorld): string {
  let dir = folders.get(world);
  if (!dir) {
    dir = world.tempDir('sddnamed-');
    folders.set(world, dir);
  }
  return dir;
}

/** The absolute path of a named file of the scenario. */
export function namedPath(world: AcceptanceWorld, file: string): string {
  return join(namedFolder(world), file);
}

/** Runs `analyse --headless` naming the base commit and one named file under its role. */
export function startNamingFile(
  world: AcceptanceWorld,
  label: string,
  file: string,
  role: RoleText,
): void {
  const out = world.tempDir();
  const base = world.repo!.label(label).hash;
  world.cli([
    'analyse',
    '--headless',
    '--out',
    out,
    '--base',
    base,
    ROLE_OPTIONS[role],
    namedPath(world, file),
  ]);
  world.headless = new HeadlessOutput(out);
}

/** The named files of the intake document of the last run. */
export function namedFilesOf(world: AcceptanceWorld): NamedFileJson[] {
  const run = world.lastRun;
  assert.ok(run, 'the CLI was not run');
  assert.equal(run.status, 0, `the CLI exited with ${run.status}: ${run.stderr}${run.stdout}`);
  return world.headless!.json<{ intentContext: { namedFiles: NamedFileJson[] } }>('intake.json')
    .intentContext.namedFiles;
}
