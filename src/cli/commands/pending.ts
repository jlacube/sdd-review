import { ReviewError } from '../../core/api/index.js';
import type { CommandName } from '../parser.js';

/** The task that provides the operation of each command that is parsed but not built yet. */
export const PROVIDED_BY: Readonly<Partial<Record<CommandName, string>>> = {
  review: 'C001-T-012',
  open: 'C001-T-012',
  reviews: 'C001-T-034',
  status: 'C001-T-082',
  intents: 'C001-T-082',
  sign: 'C001-T-082',
  reject: 'C001-T-082',
  defer: 'C001-T-082',
  'config-validate': 'C001-T-035',
};

const WORDS: Readonly<Partial<Record<CommandName, string>>> = {
  'config-validate': 'config validate',
};

/** ERR-CLI-003 for a command whose operation the later task has not built, naming that task. */
export function notImplemented(name: CommandName): ReviewError {
  const command = WORDS[name] ?? name;
  const task = PROVIDED_BY[name] ?? 'a later task';
  const cause = `the ${command} command is not implemented yet; ${task} provides it`;
  return new ReviewError('ERR-CLI-003', {
    operation: command,
    inputs: { command },
    params: { operation: command, cause },
    cause,
  });
}
