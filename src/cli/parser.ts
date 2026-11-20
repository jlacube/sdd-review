import { ReviewError } from '../core/api/index.js';

/** The command line of C001-IF-001 (Synopsis) as data. */

export interface IntakeOptions {
  readonly base?: string;
  readonly sddChange?: string;
  readonly prText?: string;
  readonly plans: readonly string[];
  readonly transcripts: readonly string[];
  readonly testCommand?: string;
}

export interface GlobalOptions {
  readonly repo?: string;
  readonly format: 'text' | 'json';
}

export type Command =
  | {
      readonly name: 'review';
      readonly intake: IntakeOptions;
      readonly port?: number;
      readonly noBrowser: boolean;
    }
  | {
      readonly name: 'open';
      readonly snapshotId?: string;
      readonly port?: number;
      readonly noBrowser: boolean;
    }
  | { readonly name: 'analyse'; readonly out: string; readonly intake: IntakeOptions }
  | { readonly name: 'reviews' }
  | { readonly name: 'status'; readonly snapshotId?: string }
  | { readonly name: 'intents'; readonly snapshotId?: string }
  | {
      readonly name: 'sign';
      readonly intent: string;
      readonly snapshotId?: string;
      readonly confirmOpenHunks?: number;
    }
  | {
      readonly name: 'reject';
      readonly intent: string;
      readonly reason: string;
      readonly snapshotId?: string;
    }
  | {
      readonly name: 'defer';
      readonly intent: string;
      readonly note: string;
      readonly snapshotId?: string;
    }
  | { readonly name: 'config-validate'; readonly file?: string };

export type CommandName = Command['name'];

export type Parsed =
  | { readonly kind: 'help' }
  | { readonly kind: 'version' }
  | { readonly kind: 'command'; readonly global: GlobalOptions; readonly command: Command };

type OptionKind = 'value' | 'flag';

interface OptionSpec {
  readonly kind: OptionKind;
  /** May be given more than once; the values are collected in order. */
  readonly repeatable?: boolean;
}

const INTAKE_OPTIONS: Readonly<Record<string, OptionSpec>> = {
  '--base': { kind: 'value' },
  '--sdd-change': { kind: 'value' },
  '--pr-text': { kind: 'value' },
  '--plan': { kind: 'value', repeatable: true },
  '--transcript': { kind: 'value', repeatable: true },
  '--test-command': { kind: 'value' },
};
const GLOBAL_OPTIONS: Readonly<Record<string, OptionSpec>> = {
  '--repo': { kind: 'value' },
  '--format': { kind: 'value' },
  '--help': { kind: 'flag' },
  '--version': { kind: 'flag' },
};
const SNAPSHOT: Readonly<Record<string, OptionSpec>> = { '--snapshot': { kind: 'value' } };

interface CommandSpec {
  readonly options: Readonly<Record<string, OptionSpec>>;
  /** Positional arguments: minimum and maximum count, and the name used in the message. */
  readonly positional: { readonly min: number; readonly max: number; readonly name: string };
}

const NONE = { min: 0, max: 0, name: '' } as const;
const INTENT = { min: 1, max: 1, name: 'intent' } as const;

const SPECS: Readonly<Record<string, CommandSpec>> = {
  review: {
    options: {
      ...INTAKE_OPTIONS,
      '--port': { kind: 'value' },
      '--no-browser': { kind: 'flag' },
    },
    positional: NONE,
  },
  open: {
    options: { '--port': { kind: 'value' }, '--no-browser': { kind: 'flag' } },
    positional: { min: 0, max: 1, name: 'snapshot ID' },
  },
  analyse: {
    options: { ...INTAKE_OPTIONS, '--headless': { kind: 'flag' }, '--out': { kind: 'value' } },
    positional: NONE,
  },
  reviews: { options: {}, positional: NONE },
  status: { options: SNAPSHOT, positional: NONE },
  intents: { options: SNAPSHOT, positional: NONE },
  sign: {
    options: { ...SNAPSHOT, '--confirm-open-hunks': { kind: 'value' } },
    positional: INTENT,
  },
  reject: { options: { ...SNAPSHOT, '--reason': { kind: 'value' } }, positional: INTENT },
  defer: { options: { ...SNAPSHOT, '--note': { kind: 'value' } }, positional: INTENT },
  'config-validate': { options: { '--file': { kind: 'value' } }, positional: NONE },
};

/** ERR-CLI-001: unknown command, unknown option or missing argument. */
export function usageError(detail: string): ReviewError {
  return new ReviewError('ERR-CLI-001', {
    operation: 'parse-command-line',
    inputs: { detail },
    params: { detail },
  });
}

const quote = (token: string) => `"${token}"`;

/** A whole non-negative number in the range, from text that holds nothing else. */
function integerOption(option: string, text: string, max: number): number {
  if (!/^\d+$/.test(text) || Number(text) > max) {
    throw usageError(`${option} takes a whole number from 0 to ${max}, not ${quote(text)}`);
  }
  return Number(text);
}

interface Collected {
  readonly values: Map<string, string[]>;
  readonly flags: Set<string>;
  readonly positional: string[];
}

/**
 * Splits `args` into options and positional arguments by the option table. The token after a
 * value option is that option's value whatever it looks like (C001-IF-001: every value is passed
 * to the core as data), so a value that starts with `-` is never read as an option; `--` ends the
 * options.
 */
function collect(args: readonly string[], table: Readonly<Record<string, OptionSpec>>): Collected {
  const out: Collected = { values: new Map(), flags: new Set(), positional: [] };
  let optionsEnded = false;
  for (let i = 0; i < args.length; i++) {
    const token = args[i] as string;
    if (optionsEnded || !token.startsWith('-') || token === '-') {
      if (token === '-' && !optionsEnded) throw usageError(`Unknown option ${quote(token)}`);
      out.positional.push(token);
      continue;
    }
    if (token === '--') {
      optionsEnded = true;
      continue;
    }
    const equals = token.startsWith('--') ? token.indexOf('=') : -1;
    const name = equals > 0 ? token.slice(0, equals) : token;
    const spec = Object.hasOwn(table, name) ? (table[name] as OptionSpec) : undefined;
    if (!spec) throw usageError(`Unknown option ${quote(name)}`);
    if (spec.kind === 'flag') {
      if (equals > 0) throw usageError(`Option ${name} takes no value`);
      out.flags.add(name);
      continue;
    }
    let value: string;
    if (equals > 0) {
      value = token.slice(equals + 1);
    } else {
      if (i + 1 >= args.length) throw usageError(`Option ${name} needs a value`);
      value = args[++i] as string;
    }
    const seen = out.values.get(name);
    if (seen && !spec.repeatable) throw usageError(`Option ${name} was given more than once`);
    if (seen) seen.push(value);
    else out.values.set(name, [value]);
  }
  return out;
}

function intakeOf(found: Collected): IntakeOptions {
  const one = (name: string) => found.values.get(name)?.[0];
  const base = one('--base');
  const sddChange = one('--sdd-change');
  const prText = one('--pr-text');
  const testCommand = one('--test-command');
  return {
    ...(base !== undefined ? { base } : {}),
    ...(sddChange !== undefined ? { sddChange } : {}),
    ...(prText !== undefined ? { prText } : {}),
    plans: found.values.get('--plan') ?? [],
    transcripts: found.values.get('--transcript') ?? [],
    ...(testCommand !== undefined ? { testCommand } : {}),
  };
}

function required(found: Collected, option: string): string {
  const value = found.values.get(option)?.[0];
  if (value === undefined) throw usageError(`Option ${option} is required`);
  return value;
}

function buildCommand(name: string, found: Collected): Command {
  const one = (option: string) => found.values.get(option)?.[0];
  const snapshot = one('--snapshot');
  const withSnapshot = snapshot !== undefined ? { snapshotId: snapshot } : {};
  const portText = one('--port');
  const port = portText !== undefined ? { port: integerOption('--port', portText, 65535) } : {};
  const noBrowser = found.flags.has('--no-browser');
  const intent = found.positional[0] as string;
  switch (name) {
    case 'review':
      return { name, intake: intakeOf(found), ...port, noBrowser };
    case 'open':
      return {
        name,
        ...(found.positional[0] !== undefined ? { snapshotId: found.positional[0] } : {}),
        ...port,
        noBrowser,
      };
    case 'analyse':
      if (!found.flags.has('--headless')) {
        throw usageError('The analyse command needs --headless (there is no other mode)');
      }
      return { name, out: required(found, '--out'), intake: intakeOf(found) };
    case 'reviews':
      return { name };
    case 'status':
    case 'intents':
      return { name, ...withSnapshot };
    case 'sign': {
      const confirm = one('--confirm-open-hunks');
      return {
        name,
        intent,
        ...withSnapshot,
        ...(confirm !== undefined
          ? {
              confirmOpenHunks: integerOption(
                '--confirm-open-hunks',
                confirm,
                Number.MAX_SAFE_INTEGER,
              ),
            }
          : {}),
      };
    }
    case 'reject':
      return { name, intent, reason: required(found, '--reason'), ...withSnapshot };
    case 'defer':
      return { name, intent, note: required(found, '--note'), ...withSnapshot };
    default: {
      const file = one('--file');
      return { name: 'config-validate', ...(file !== undefined ? { file } : {}) };
    }
  }
}

/**
 * Parses the arguments after `node main.js` (C001-IF-001). Throws ERR-CLI-001 for an unknown
 * command or option, a missing argument or a malformed value.
 */
export function parseCommandLine(argv: readonly string[]): Parsed {
  // The command word is the first token that is not an option or an option's value; global options
  // may stand before it, so find it with the global table first.
  let index = 0;
  while (index < argv.length) {
    const token = argv[index] as string;
    if (!token.startsWith('-')) break;
    const name =
      token.startsWith('--') && token.includes('=') ? token.slice(0, token.indexOf('=')) : token;
    const spec = Object.hasOwn(GLOBAL_OPTIONS, name)
      ? (GLOBAL_OPTIONS[name] as OptionSpec)
      : undefined;
    if (!spec) throw usageError(`Unknown option ${quote(name)}`);
    index += spec.kind === 'value' && !token.includes('=') ? 2 : 1;
  }
  const first = argv[index];
  const before = argv.slice(0, index);
  if (first === undefined) {
    const found = collect(before, GLOBAL_OPTIONS);
    if (found.flags.has('--version')) return { kind: 'version' };
    if (found.flags.has('--help')) return { kind: 'help' };
    throw usageError('No command given');
  }

  let name = first;
  let rest = argv.slice(index + 1);
  if (first === 'config') {
    const sub = rest.find((t) => !t.startsWith('-'));
    if (sub === undefined) throw usageError('The config command needs a subcommand: validate');
    if (sub !== 'validate') throw usageError(`Unknown config subcommand ${quote(sub)}`);
    name = 'config-validate';
    rest = [...rest.slice(0, rest.indexOf(sub)), ...rest.slice(rest.indexOf(sub) + 1)];
  }
  const spec = Object.hasOwn(SPECS, name) ? (SPECS[name] as CommandSpec) : undefined;
  if (!spec) throw usageError(`Unknown command ${quote(first)}`);

  const found = collect([...before, ...rest], { ...GLOBAL_OPTIONS, ...spec.options });
  if (found.flags.has('--help')) return { kind: 'help' };
  if (found.flags.has('--version')) return { kind: 'version' };

  const { min, max, name: positionalName } = spec.positional;
  if (found.positional.length > max) {
    throw usageError(`Unexpected argument ${quote(found.positional[max] as string)}`);
  }
  if (found.positional.length < min) {
    throw usageError(`The ${name} command needs the ${positionalName}`);
  }

  const format = found.values.get('--format')?.[0] ?? 'text';
  if (format !== 'text' && format !== 'json') {
    throw usageError(`--format takes text or json, not ${quote(format)}`);
  }
  const repo = found.values.get('--repo')?.[0];
  return {
    kind: 'command',
    global: { ...(repo !== undefined ? { repo } : {}), format },
    command: buildCommand(name, found),
  };
}
