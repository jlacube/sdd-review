import type { EffectiveProvider } from '../../config/effective.js';

/**
 * The key lookup of C001-IF-010 §7 (C001-REQ-809, C001-REQ-820, C001-ADR-008 with Amendment 1),
 * run by the model gateway when it prepares a request:
 * 1. the environment variable named by `keyEnv`, when it is set and not empty;
 * 2. else the credential-store entry `keyCredential`, by default service `sdd-review` and
 *    account = provider name (`50-interfaces/README.md` §2);
 * 3. else no key. A store that cannot be opened counts as holding no key.
 *
 * Nothing is cached: each request reads again, so a rotated key takes effect at the next request.
 * Keys are never read from the repository, and never stored, logged or written anywhere
 * (C001-CON-21): the lookup returns the key to the request being prepared and describes failures
 * with the provider, the entry and the cause class only (C001-ADR-008 §2).
 */

/** Default service of the credential-store entry of a provider key (README.md §2). */
export const DEFAULT_SERVICE = 'sdd-review';

/** The services a review configuration may name (C001-IF-004 `keyCredential.service` pattern). */
const ACCEPTED_SERVICE = /^sdd-review(\/.*)?$/s;

/** True for `sdd-review` and for a name beginning with `sdd-review/` (C001-REQ-820). */
export function isAcceptedService(service: string): boolean {
  return ACCEPTED_SERVICE.test(service);
}

/** Why a reader found no key (C001-ADR-008 §2: the cause classes that a log entry may name). */
export type LookupFailureClass =
  'not found' | 'locked' | 'store unavailable' | 'timed out' | 'access denied';

/** What a credential-store reader returns. The secret is held only by the caller's request. */
export type ReaderResult =
  | { readonly found: true; readonly secret: string }
  | {
      readonly found: false;
      readonly cause: LookupFailureClass;
      /** A short technical detail for the log (an exit status, an error name); never the secret. */
      readonly detail?: string;
    };

/** A reader of one operating system's credential store (C001-ADR-008 §1). Never throws. */
export interface CredentialReader {
  read(service: string, account: string): Promise<ReaderResult>;
}

export interface CredentialEntry {
  readonly service: string;
  readonly account: string;
}

/** The entry the lookup reads: `keyCredential`, else service `sdd-review`, account = provider. */
export function credentialEntry(provider: EffectiveProvider): CredentialEntry {
  return provider.keyCredential ?? { service: DEFAULT_SERVICE, account: provider.name };
}

/**
 * Whether the provider needs a key (§7): always for `anthropic-messages`; for `openai-chat` only
 * when `keyEnv` or `keyCredential` is configured (an unconfigured local runtime is called without
 * an `Authorization` header).
 */
export function keyRequired(provider: EffectiveProvider): boolean {
  return (
    provider.api === 'anthropic-messages' ||
    provider.keyEnv !== null ||
    provider.keyCredential !== null
  );
}

/**
 * Removes trailing spaces, tabs, carriage returns and line feeds (`security` ends its output with a
 * line feed); an empty result means no key (C001-ADR-008 §1, Normalisation).
 */
export function normaliseSecret(raw: string): string | null {
  const value = raw.replace(/[ \t\r\n]+$/, '');
  return value === '' ? null : value;
}

/** The outcome of one lookup; `key` lives only as long as the request being prepared. */
export interface KeyLookup {
  readonly key: string | null;
  /** Whether the provider needs a key; a required key that is missing gives ERR-MODEL-006. */
  readonly required: boolean;
  /**
   * Where the key was looked for, as ERR-MODEL-006 names it: `environment variable "<keyEnv>" or
   * credential-store entry "<service>/<account>"`, or the entry alone when no `keyEnv` is set.
   */
  readonly location: string;
  /** For the log (NFR-D-04): each source tried and its cause class; never a secret. */
  readonly cause: string;
}

export interface KeySourceDeps {
  /** The developer's environment; default `process.env`. Read at each lookup, never copied. */
  readonly env?: NodeJS.ProcessEnv;
  /** The reader of the operating system's credential store; default `platformReader()`. */
  readonly reader?: CredentialReader;
}

/** Looks up the key of `provider` once (§7). Never throws. */
export async function lookupKey(
  provider: EffectiveProvider,
  deps: KeySourceDeps = {},
): Promise<KeyLookup> {
  const env = deps.env ?? process.env;
  const required = keyRequired(provider);
  const entry = credentialEntry(provider);
  const entryName = `${entry.service}/${entry.account}`;
  const location =
    provider.keyEnv !== null
      ? `environment variable "${provider.keyEnv}" or credential-store entry "${entryName}"`
      : `credential-store entry "${entryName}"`;
  const tried: string[] = [];

  if (provider.keyEnv !== null) {
    const value = env[provider.keyEnv];
    if (value !== undefined && value !== '') {
      return { key: value, required, location, cause: '' };
    }
    tried.push(`environment variable "${provider.keyEnv}": ${value === '' ? 'empty' : 'not set'}`);
  }

  // Defence in depth (C001-REQ-820): the configuration loader already refuses another service
  // (ERR-CFG-004), so no reader is ever asked for another application's entry.
  if (!isAcceptedService(entry.service)) {
    tried.push(`credential-store entry "${entryName}": service not accepted`);
    return { key: null, required, location, cause: tried.join('; ') };
  }

  let result: ReaderResult;
  try {
    result = await (deps.reader ?? platformReader()).read(entry.service, entry.account);
  } catch (error) {
    // A reader must not throw; if one does, the store counts as holding no key. Only the error's
    // name is kept: its message could quote what the store returned.
    const name = error instanceof Error ? error.name : typeof error;
    result = { found: false, cause: 'store unavailable', detail: name };
  }
  if (result.found) {
    const key = normaliseSecret(result.secret);
    if (key !== null) return { key, required, location, cause: '' };
    tried.push(`credential-store entry "${entryName}": empty`);
  } else {
    const detail = result.detail ? ` (${result.detail})` : '';
    tried.push(`credential-store entry "${entryName}": ${result.cause}${detail}`);
  }
  return { key: null, required, location, cause: tried.join('; ') };
}

let platformReaderInstance: CredentialReader | undefined;

/** The reader of the operating system this process runs on (C001-ADR-008 §1), made on first use. */
export function platformReader(): CredentialReader {
  platformReaderInstance ??= readerFor(process.platform);
  return platformReaderInstance;
}

function readerFor(platform: NodeJS.Platform): CredentialReader {
  // Loaded lazily so that a platform's native binding is only touched on that platform.
  switch (platform) {
    case 'win32':
      return lazyReader(async () => new (await import('./windows.js')).WindowsCredentialReader());
    case 'darwin':
      return lazyReader(async () => new (await import('./macos.js')).MacosKeychainReader());
    default:
      return lazyReader(async () => new (await import('./linux.js')).SecretServiceReader());
  }
}

function lazyReader(make: () => Promise<CredentialReader>): CredentialReader {
  let made: Promise<CredentialReader> | undefined;
  return {
    async read(service, account) {
      made ??= make();
      return (await made).read(service, account);
    },
  };
}

/** The `keys` seam of the model gateway (C001-IF-010 §7): one lookup per request, no cache. */
export function createKeySource(
  deps: KeySourceDeps = {},
): (provider: EffectiveProvider) => Promise<KeyLookup> {
  return (provider) => lookupKey(provider, deps);
}
