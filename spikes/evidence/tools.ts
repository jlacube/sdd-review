// Spike C001-T-020 (spike-grade): the benchmark targets and the developer-installed tools the
// harness uses. Tools are programs installed outside this package (C001-ADR-007 §1 "Tool
// discovery"); for the spike they live under `<bench root>/tools/` (spikes/evidence/README.md).
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { SpikeTarget } from './session.js';

export interface SpikeTools {
  /** StrykerJS CLI entry (`@stryker-mutator/core/bin/stryker.js`). */
  readonly strykerJs: string | null;
  /** Directory of the StrykerJS installation's node_modules (its runner plugins). */
  readonly strykerJsModules: string | null;
  readonly strykerNet: string | null;
  readonly altcover: string | null;
  readonly pythonVendor: string | null;
}

const exe = (p: string) => (process.platform === 'win32' ? `${p}.exe` : p);
const first = (...candidates: Array<string | undefined>) =>
  candidates.find((c): c is string => c !== undefined && c !== '' && existsSync(c)) ?? null;

/** Finds the tools: `SDDR_*` variables first, then `<bench root>/tools/`. */
export function findTools(benchRoot: string, env: NodeJS.ProcessEnv = process.env): SpikeTools {
  const tools = path.join(benchRoot, 'tools');
  const strykerJs = first(
    env.SDDR_STRYKER_JS,
    path.join(tools, 'stryker-js', 'node_modules', '@stryker-mutator', 'core', 'bin', 'stryker.js'),
  );
  return {
    strykerJs,
    strykerJsModules: strykerJs ? path.resolve(path.dirname(strykerJs), '..', '..', '..') : null,
    strykerNet: first(env.SDDR_DOTNET_STRYKER, exe(path.join(tools, 'dotnet', 'dotnet-stryker'))),
    altcover: first(env.SDDR_ALTCOVER, exe(path.join(tools, 'dotnet', 'altcover'))),
    pythonVendor: first(env.SDDR_PYTHON_VENDOR, path.join(tools, 'python-vendor')),
  };
}

interface SetFile {
  references: Record<
    string,
    { localCheckout: string; testCommand: string; environmentFile: string }
  >;
  benchmarkChanges: Array<{
    id: string;
    ecosystem: 'typescript' | 'python' | 'csharp';
    baseCommit: string | null;
    headCommit: string | null;
    changeLocation: { checkout: string } | null;
  }>;
}

interface EnvironmentFile {
  testCommand: string;
  activeEnvironment: {
    variables: { set: Record<string, string>; mustBeUnset: string[] };
    virtualEnvironment?: string;
  };
}

/** Substitutes `<checkout>` in an environment value. */
export function substituteCheckout(value: string, checkout: string): string {
  return value.split('<checkout>').join(checkout);
}

/**
 * The benchmark targets of the frozen set with their environment (C001-T-013). `PATH` and
 * `VIRTUAL_ENV` of a Python environment become the activated virtual environment.
 */
export function loadTargets(repoRoot: string, benchRoot: string): SpikeTarget[] {
  const set = JSON.parse(
    readFileSync(path.join(repoRoot, 'bench', 'set', 'benchmark-set.json'), 'utf8'),
  ) as SetFile;
  return set.benchmarkChanges.map((c) => {
    const ref = set.references[c.ecosystem]!;
    const envFile = JSON.parse(
      readFileSync(path.join(repoRoot, ref.environmentFile), 'utf8'),
    ) as EnvironmentFile;
    const checkout = path.resolve(benchRoot, c.changeLocation?.checkout ?? ref.localCheckout);
    const venv = envFile.activeEnvironment.virtualEnvironment;
    const envSet: Record<string, string> = {};
    let pathPrepend: string | null = null;
    for (const [k, v] of Object.entries(envFile.activeEnvironment.variables.set)) {
      if (k === 'PATH') continue;
      envSet[k] = path.normalize(substituteCheckout(v, checkout));
      if (k !== 'VIRTUAL_ENV') envSet[k] = substituteCheckout(v, checkout);
    }
    if (venv) {
      const v = path.join(checkout, venv);
      envSet.VIRTUAL_ENV = v;
      pathPrepend = path.join(v, process.platform === 'win32' ? 'Scripts' : 'bin');
    }
    return {
      id: c.id,
      ecosystem: c.ecosystem,
      checkout,
      base: c.baseCommit ?? '',
      head: c.headCommit,
      testCommand: envFile.testCommand ?? ref.testCommand,
      envSet,
      envUnset: envFile.activeEnvironment.variables.mustBeUnset,
      pathPrepend,
    };
  });
}

/** The ecosystem of a target as the adapters name it. */
export function adapterEcosystem(
  target: SpikeTarget,
): 'typescript-javascript' | 'python' | 'csharp-dotnet' {
  return target.ecosystem === 'python'
    ? 'python'
    : target.ecosystem === 'csharp'
      ? 'csharp-dotnet'
      : 'typescript-javascript';
}
