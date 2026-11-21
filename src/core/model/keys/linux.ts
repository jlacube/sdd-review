import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DbusConnection, DbusError, type DbusValue } from './dbus.js';
import type { CredentialReader, LookupFailureClass, ReaderResult } from './key-source.js';

/**
 * The Secret Service reader (C001-ADR-008 §1, Ubuntu 22.04+ and other Linux row): an item with the
 * attributes `service` = `<service>` and `account` = `<account>` in any collection, read over the
 * session bus with `OpenSession` ("plain" algorithm), `SearchItems` and `GetSecrets`. Among
 * unlocked matches the default collection comes first, then the most recently modified item.
 *
 * No matching item is "not found". No session bus, no `org.freedesktop.secrets` service, only
 * locked matches (the reader never calls `Unlock`, so it never starts a prompt), or no answer
 * within 5 s is a store that cannot be opened, which counts as no key (C001-RISK-018). The D-Bus
 * client is the built-in one of `dbus.ts` (no libdbus, no libsecret, no dependency); it offers only
 * the "plain" algorithm, whose secret crosses the per-user session bus socket only.
 */

export const SECRET_SERVICE_TIMEOUT_MS = 5_000;

const BUS_NAME = 'org.freedesktop.secrets';
const SERVICE_PATH = '/org/freedesktop/secrets';
const SERVICE_IFACE = 'org.freedesktop.Secret.Service';
const ITEM_IFACE = 'org.freedesktop.Secret.Item';
const SESSION_IFACE = 'org.freedesktop.Secret.Session';
const PROPERTIES_IFACE = 'org.freedesktop.DBus.Properties';

/** The session bus address: `DBUS_SESSION_BUS_ADDRESS`, else `$XDG_RUNTIME_DIR/bus` if present. */
export function sessionBusAddress(env: NodeJS.ProcessEnv): string | null {
  const address = env.DBUS_SESSION_BUS_ADDRESS;
  if (address) return address;
  const runtime = env.XDG_RUNTIME_DIR;
  if (runtime && existsSync(join(runtime, 'bus'))) return `unix:path=${join(runtime, 'bus')}`;
  return null;
}

/** The cause class of a D-Bus error name (or of a connection error, which has none). */
export function classifyDbusError(error: unknown): { cause: LookupFailureClass; detail: string } {
  if (error instanceof DbusError) {
    const name = error.dbusName;
    if (name === 'org.freedesktop.DBus.Error.AccessDenied') {
      return { cause: 'access denied', detail: name };
    }
    if (name === 'org.freedesktop.Secret.Error.IsLocked') return { cause: 'locked', detail: name };
    return { cause: 'store unavailable', detail: name };
  }
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return { cause: 'store unavailable', detail: code ?? (error as Error)?.name ?? 'error' };
}

/** One unlocked match with what the choice needs. */
export interface Candidate {
  readonly path: string;
  readonly modified: bigint;
}

/** Default collection first, then the most recently modified item (C001-ADR-008 §1). */
export function chooseItem(candidates: readonly Candidate[], defaultCollection: string | null) {
  const inDefault = (path: string) =>
    defaultCollection !== null &&
    defaultCollection !== '/' &&
    path.startsWith(`${defaultCollection}/`);
  return [...candidates].sort((a, b) => {
    const d = Number(inDefault(b.path)) - Number(inDefault(a.path));
    if (d !== 0) return d;
    return a.modified === b.modified ? 0 : a.modified < b.modified ? 1 : -1;
  })[0];
}

export interface SecretServiceReaderOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly timeoutMs?: number;
}

export class SecretServiceReader implements CredentialReader {
  constructor(private readonly options: SecretServiceReaderOptions = {}) {}

  async read(service: string, account: string): Promise<ReaderResult> {
    const address = sessionBusAddress(this.options.env ?? process.env);
    if (address === null) {
      return { found: false, cause: 'store unavailable', detail: 'no session bus' };
    }
    const timeoutMs = this.options.timeoutMs ?? SECRET_SERVICE_TIMEOUT_MS;
    let connection: DbusConnection | undefined;
    let timer: NodeJS.Timeout | undefined;
    let timedOut = false;
    const timeout = new Promise<ReaderResult>((resolve) => {
      timer = setTimeout(() => {
        timedOut = true;
        connection?.close();
        resolve({ found: false, cause: 'timed out', detail: `no answer within ${timeoutMs} ms` });
      }, timeoutMs);
    });
    const work = (async (): Promise<ReaderResult> => {
      try {
        connection = await DbusConnection.open(address);
        if (timedOut) connection.close();
        return await lookup(connection, service, account);
      } catch (error) {
        return { found: false, ...classifyDbusError(error) };
      } finally {
        connection?.close();
      }
    })();
    try {
      return await Promise.race([work, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }
}

async function lookup(c: DbusConnection, service: string, account: string): Promise<ReaderResult> {
  const call = (path: string, iface: string, member: string, sig = '', body: DbusValue[] = []) =>
    c.call({ destination: BUS_NAME, path, interface: iface, member, signature: sig, body });

  const [unlocked, locked] = (await call(SERVICE_PATH, SERVICE_IFACE, 'SearchItems', 'a{ss}', [
    [
      ['service', service],
      ['account', account],
    ],
  ])) as [string[], string[]];
  if (unlocked.length === 0) {
    return locked.length > 0
      ? { found: false, cause: 'locked', detail: `${locked.length} locked match(es)` }
      : { found: false, cause: 'not found' };
  }

  let chosen = unlocked[0]!;
  if (unlocked.length > 1) {
    const [alias] = (await call(SERVICE_PATH, SERVICE_IFACE, 'ReadAlias', 's', ['default'])) as [
      string,
    ];
    const candidates: Candidate[] = [];
    for (const path of unlocked) {
      const [[, modified]] = (await call(path, PROPERTIES_IFACE, 'Get', 'ss', [
        ITEM_IFACE,
        'Modified',
      ])) as [[string, bigint]];
      candidates.push({ path, modified: BigInt(modified) });
    }
    chosen = chooseItem(candidates, alias)!.path;
  }

  const [, session] = (await call(SERVICE_PATH, SERVICE_IFACE, 'OpenSession', 'sv', [
    'plain',
    ['s', ''],
  ])) as [unknown, string];
  try {
    const [secrets] = (await call(SERVICE_PATH, SERVICE_IFACE, 'GetSecrets', 'aoo', [
      [chosen],
      session,
    ])) as [Array<[string, [string, Buffer, Buffer, string]]>];
    const entry = secrets.find(([path]) => path === chosen);
    if (!entry) return { found: false, cause: 'locked', detail: 'no secret returned' };
    const value = entry[1][2];
    try {
      return { found: true, secret: value.toString('utf8') };
    } finally {
      value.fill(0);
    }
  } finally {
    await call(session, SESSION_IFACE, 'Close').catch(() => undefined);
  }
}
