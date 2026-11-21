import { posix, win32 } from 'node:path';

/**
 * Link retargeting (C001-ADR-006 §4 and §7 item 3, C001-IF-013 §2 items 3 and 4, §9 item 1): no
 * path that the analysis core makes available in a workspace or a mutation copy leads into the
 * working tree, into the git directory, or (for a copy) into another evidence workspace.
 *
 * - In a copied directory, each symbolic link or junction is resolved to its final target. A
 *   relative link that stays inside the copy is kept as it is. Otherwise a target in the git
 *   directory is not created; a target under a redirected root (the working-tree root; for a
 *   mutation copy also the test run's workspace and the other workspaces of the snapshot) points
 *   to the same relative path under the destination root; any other target is kept.
 * - A symbolic link of the snapshot whose target leads under the working-tree root gets the
 *   equivalent target under the workspace root; one whose target leads into the git directory
 *   makes the preparation fail (ERR-EVID-002, raised by the caller).
 *
 * Pure path logic: the caller reads the links and their final targets.
 */

const isWin = (p: NodeJS.Platform) => p === 'win32';
const pathOf = (p: NodeJS.Platform) => (isWin(p) ? win32 : posix);

/** Folds a path for comparison: one separator, no trailing separator, case on Windows and macOS. */
function fold(path: string, platform: NodeJS.Platform): string {
  let p = isWin(platform) ? path.replace(/\//g, '\\') : path;
  const sep = isWin(platform) ? '\\' : '/';
  while (p.length > 1 && p.endsWith(sep) && !/^[A-Za-z]:\\$/.test(p)) p = p.slice(0, -1);
  return platform === 'win32' || platform === 'darwin' ? p.toLowerCase() : p;
}

/**
 * The path of `inner` below `outer` with '/' separators ('' when equal), or null when it does not
 * lie there. Both absolute; Windows and macOS compare without letter case.
 */
export function relativeWithin(
  inner: string,
  outer: string,
  platform: NodeJS.Platform,
): string | null {
  const sep = isWin(platform) ? '\\' : '/';
  const a = fold(inner, platform);
  const b = fold(outer, platform);
  if (a === b) return '';
  const prefix = b.endsWith(sep) ? b : b + sep;
  if (!a.startsWith(prefix)) return null;
  const original = isWin(platform) ? inner.replace(/\//g, '\\') : inner;
  return original
    .slice(prefix.length)
    .split(sep)
    .filter((c) => c !== '')
    .join('/');
}

export interface Redirect {
  /** Absolute real path of a root whose links are moved under the destination root. */
  readonly root: string;
  readonly label: 'working-tree' | 'workspace';
}

export interface LinkRules {
  readonly platform: NodeJS.Platform;
  /** Real paths of the git directory and the common git directory. */
  readonly forbidden: readonly string[];
  readonly redirects: readonly Redirect[];
  /** Root of the tree being written (the workspace or the mutation copy). */
  readonly destinationRoot: string;
  /**
   * The real path of a target that may not exist (default: unchanged). It places a dangling
   * target named through a link or an alias of a root (macOS `/var` for `/private/var`).
   */
  readonly realPath?: (path: string) => string;
}

export type TargetPlace =
  | { readonly kind: 'git-directory'; readonly root: string }
  | { readonly kind: 'redirect'; readonly label: Redirect['label']; readonly relative: string }
  | { readonly kind: 'outside' };

/** Where an absolute target lies: the git directory first, then the longest redirected root. */
export function classifyTarget(target: string, rules: LinkRules): TargetPlace {
  for (const root of rules.forbidden) {
    if (root && relativeWithin(target, root, rules.platform) !== null) {
      return { kind: 'git-directory', root };
    }
  }
  const redirects = [...rules.redirects].sort((a, b) => b.root.length - a.root.length);
  for (const r of redirects) {
    const relative = relativeWithin(target, r.root, rules.platform);
    if (relative !== null) return { kind: 'redirect', label: r.label, relative };
  }
  return { kind: 'outside' };
}

const under = (root: string, relative: string, platform: NodeJS.Platform) =>
  relative === '' ? root : pathOf(platform).join(root, ...relative.split('/'));

/** A link text with '/' separators (Windows link texts use '\'). */
const slashed = (text: string, platform: NodeJS.Platform) =>
  isWin(platform) ? text.replace(/\\/g, '/') : text;

const escapes = (p: string) => p === '..' || p.startsWith('../');

export interface CopiedLink {
  /** The link's path relative to the source tree root, '/' separators. */
  readonly linkPath: string;
  /** The link text as read (`readlink`). */
  readonly rawTarget: string;
  /** The real path of what the link finally leads to; null when it dangles. */
  readonly finalTarget: string | null;
  /** Absolute real path of the source tree (the working tree, or the test run's workspace). */
  readonly sourceRoot: string;
  /** The copied directory, relative to the source root ('' for the whole tree). */
  readonly copiedRoot: string;
}

export type LinkDecision =
  | { readonly action: 'keep'; readonly target: string }
  | {
      readonly action: 'point';
      readonly place: Redirect['label'] | 'outside';
      readonly absolute: string;
    }
  | { readonly action: 'drop'; readonly reason: string };

/** What a link of a copied directory becomes in the destination (C001-ADR-006 §4, §7 item 3). */
export function decideCopiedLink(link: CopiedLink, rules: LinkRules): LinkDecision {
  const path = pathOf(rules.platform);
  const text = slashed(link.rawTarget, rules.platform);
  if (!path.isAbsolute(link.rawTarget) && !posix.isAbsolute(text)) {
    const lexical = posix.normalize(posix.join(posix.dirname(link.linkPath), text));
    const inside =
      link.copiedRoot === ''
        ? !escapes(lexical)
        : lexical === link.copiedRoot || lexical.startsWith(`${link.copiedRoot}/`);
    if (inside) return { action: 'keep', target: link.rawTarget };
  }
  const sourceLink = under(link.sourceRoot, link.linkPath, rules.platform);
  const target =
    link.finalTarget ??
    (rules.realPath ?? ((p: string) => p))(path.resolve(path.dirname(sourceLink), link.rawTarget));
  const place = classifyTarget(target, rules);
  if (place.kind === 'git-directory') {
    return {
      action: 'drop',
      reason: `its target ${target} lies in the git directory ${place.root}`,
    };
  }
  if (place.kind === 'redirect') {
    return {
      action: 'point',
      place: place.label,
      absolute: under(rules.destinationRoot, place.relative, rules.platform),
    };
  }
  return { action: 'point', place: 'outside', absolute: target };
}

export interface SnapshotLinkRules {
  readonly platform: NodeJS.Platform;
  /** Real path of the working-tree root. */
  readonly workTreeRoot: string;
  /** Real paths of the git directory and the common git directory. */
  readonly forbidden: readonly string[];
  /** As `LinkRules.realPath`; applied to a target that leaves the repository or is absolute. */
  readonly realPath?: (path: string) => string;
}

export type SnapshotLinkDecision =
  | { readonly action: 'keep'; readonly target: string }
  | {
      readonly action: 'point';
      readonly absolute: string;
      /** The repository-relative path it leads to, when that lies under the working-tree root. */
      readonly relative?: string;
    }
  | { readonly action: 'git-directory'; readonly resolved: string };

/** A symbolic link of the snapshot leads into the git directory (ERR-EVID-002 at preparation). */
export class LinkIntoGitDirectory extends Error {
  constructor(
    readonly path: string,
    readonly target: string,
    readonly resolved: string,
  ) {
    super(
      `the symbolic link ${path} of the snapshot leads into the git directory (${target} → ${resolved})`,
    );
    this.name = 'LinkIntoGitDirectory';
  }
}

/**
 * What a symbolic link of the snapshot at `linkPath` with the blob text `rawTarget` becomes in
 * the workspace at `workspaceRoot`. The target is placed as git would resolve it in the working
 * tree (lexically): a relative target that stays inside the repository is kept, since it leads to
 * the same path in the workspace; a target under the working-tree root otherwise gets the
 * equivalent absolute target under the workspace root; a target elsewhere keeps its meaning.
 */
export function decideSnapshotLink(
  linkPath: string,
  rawTarget: string,
  workspaceRoot: string,
  rules: SnapshotLinkRules,
): SnapshotLinkDecision {
  const path = pathOf(rules.platform);
  const text = slashed(rawTarget, rules.platform);
  const absolute = path.isAbsolute(rawTarget) || posix.isAbsolute(text);
  const lexical = absolute ? null : posix.normalize(posix.join(posix.dirname(linkPath), text));
  const linkRules: LinkRules = {
    platform: rules.platform,
    forbidden: rules.forbidden,
    redirects: [{ root: rules.workTreeRoot, label: 'working-tree' }],
    destinationRoot: workspaceRoot,
  };
  if (lexical !== null && !escapes(lexical)) {
    // Inside the repository the workspace holds the snapshot's own paths, so the target is placed
    // lexically, as in the snapshot; only a target in the git directory is refused.
    const inRepo = under(rules.workTreeRoot, lexical === '.' ? '' : lexical, rules.platform);
    const place = classifyTarget(inRepo, linkRules);
    if (place.kind === 'git-directory') return { action: 'git-directory', resolved: inRepo };
    return { action: 'keep', target: rawTarget };
  }
  const lexicalAbsolute = absolute
    ? path.resolve(rawTarget)
    : path.resolve(rules.workTreeRoot, ...posix.dirname(linkPath).split('/'), rawTarget);
  const resolved = (rules.realPath ?? ((p: string) => p))(lexicalAbsolute);
  const place = classifyTarget(resolved, linkRules);
  if (place.kind === 'git-directory') return { action: 'git-directory', resolved };
  if (place.kind === 'redirect') {
    return {
      action: 'point',
      absolute: under(workspaceRoot, place.relative, rules.platform),
      relative: place.relative,
    };
  }
  return absolute ? { action: 'keep', target: rawTarget } : { action: 'point', absolute: resolved };
}
