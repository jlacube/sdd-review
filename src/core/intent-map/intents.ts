import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import type {
  ChangeCommit,
  IntakeDocument,
  Intent,
  PlanItem,
  SddChange,
} from '../../generated/analysis-results.js';
import { textHash } from '../intent-sources/text.js';

/**
 * The deterministic intents of a review (C001-COMP-009, C001-T-044): one per requirement of the
 * selected SDD change (C001-REQ-302, C001-REQ-305); without an SDD change and in model-free mode,
 * one extracted intent per commit of the change (C001-REQ-313) and one per plan item of the named
 * agent plans (C001-REQ-314). Each intent carries its intent source with its location
 * (C001-REQ-317), its intent key and intent ID (domain model §3, C001-INV-15) and its source order
 * (glossary: spec items in ID order, commits oldest first, plan items in file order).
 *
 * Linking hunks to the intents, orphan code and unmet intents are C001-T-045; model-extracted
 * intents C001-T-090; developer-named intents C001-T-047.
 */

/** What the intents are created from: the intent context of the snapshot (C001-IF-008 intake). */
export interface IntentSourcesInput {
  /** The SDD change the intents come from (C001-IF-007 §6), or `null` in intent fallback. */
  readonly sddChange: Pick<SddChange, 'id' | 'items'> | null;
  /** The commits of the change, oldest first (C001-IF-007 §11). */
  readonly commits: ReadonlyArray<Pick<ChangeCommit, 'hash' | 'subject' | 'message'>>;
  /** The plan items of the named agent plans, in the order the plans were named (§8). */
  readonly planItems: readonly PlanItem[];
}

export interface CreateIntentsOptions {
  /**
   * Whether the review runs in model-free mode: only then are commits and plan items turned into
   * extracted intents by the deterministic rules (C001-REQ-313, C001-REQ-314); with a model
   * provider in use the extraction is the model's (C001-REQ-315, C001-T-090).
   */
  readonly modelFree: boolean;
  /**
   * The plan file path of the intent key of a plan item (domain model §3): repository-relative when
   * the file lies in the repository, absolute otherwise. Default: the path as named, with `/`.
   */
  readonly planKeyPath?: (file: string) => string;
}

/** The intent ID of an intent key (domain model §3): `i-` and 16 hex digits of its SHA-256. */
export function intentIdOf(intentKey: string): string {
  return `i-${createHash('sha256').update(intentKey, 'utf8').digest('hex').slice(0, 16)}`;
}

/** The intent key of a requirement of an SDD change (domain model §3). */
export const specIntentKey = (changeId: string, requirementId: string): string =>
  `spec:${changeId}:${requirementId}`;

/** The intent key of a commit (domain model §3). */
export const commitIntentKey = (hash: string): string => `commit:${hash}`;

/** The intent key of a plan item (domain model §3). */
export const planIntentKey = (planPath: string, ordinal: number): string =>
  `plan:${planPath}#${ordinal}`;

/**
 * Compares spec item IDs in ID order: runs of digits by their number, the rest by code unit, so
 * that `C042-REQ-999` comes before `C042-REQ-1000`.
 */
export function compareIds(a: string, b: string): number {
  const parts = (id: string) => id.match(/\d+|\D+/g) ?? [];
  const x = parts(a);
  const y = parts(b);
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const p = x[i]!;
    const q = y[i]!;
    if (p === q) continue;
    const digits = /^\d/.test(p) && /^\d/.test(q);
    if (digits) {
      const d = BigInt(p) - BigInt(q);
      if (d !== 0n) return d < 0n ? -1 : 1;
      return p.length - q.length; // leading zeros: shorter first
    }
    return p < q ? -1 : 1;
  }
  return x.length - y.length;
}

function requirementIntents(change: NonNullable<IntentSourcesInput['sddChange']>): Intent[] {
  return change.items
    .filter((item) => item.kind === 'requirement')
    .sort((a, b) => compareIds(a.id, b.id))
    .map((item) => {
      const intentKey = specIntentKey(change.id, item.id);
      return {
        intentId: intentIdOf(intentKey),
        intentKey,
        title: item.title,
        kind: 'spec-requirement',
        source: {
          type: 'spec-item',
          reference: item.id,
          location: item.location ?? null,
          text: item.text,
          textHash: item.textHash,
        },
        sourceOrder: 0,
        unmet: true,
      } as Intent;
    });
}

function commitIntents(commits: IntentSourcesInput['commits']): Intent[] {
  return commits.map((commit) => {
    const intentKey = commitIntentKey(commit.hash);
    return {
      intentId: intentIdOf(intentKey),
      intentKey,
      title: commit.subject,
      kind: 'extracted-commit',
      source: {
        type: 'commit',
        reference: commit.hash,
        location: null,
        text: commit.message,
        textHash: textHash(commit.message),
      },
      sourceOrder: 0,
      unmet: true,
    } as Intent;
  });
}

function planItemIntents(
  items: readonly PlanItem[],
  planKeyPath: (file: string) => string,
): Intent[] {
  return items.map((item) => {
    const intentKey = planIntentKey(planKeyPath(item.file), item.ordinal);
    return {
      intentId: intentIdOf(intentKey),
      intentKey,
      title: item.title,
      kind: 'extracted-plan-item',
      source: {
        type: 'plan-item',
        reference: item.file,
        location: item.location,
        text: item.text,
        textHash: item.textHash,
      },
      sourceOrder: 0,
      unmet: true,
    } as Intent;
  });
}

/**
 * The intents of a review in source order, `sourceOrder` counting from 0. Every intent is `unmet`
 * until the hunks are linked (C001-REQ-311, C001-T-045). Two sources that would give the same intent
 * key (one plan named twice) give one intent, the first.
 */
export function createIntents(input: IntentSourcesInput, options: CreateIntentsOptions): Intent[] {
  const planKeyPath = options.planKeyPath ?? ((file: string) => file.replace(/\\/g, '/'));
  let intents: Intent[];
  if (input.sddChange !== null) {
    intents = requirementIntents(input.sddChange);
  } else if (options.modelFree) {
    intents = [...commitIntents(input.commits), ...planItemIntents(input.planItems, planKeyPath)];
  } else {
    intents = [];
  }
  const seen = new Set<string>();
  return intents
    .filter((intent) => !seen.has(intent.intentKey) && seen.add(intent.intentKey))
    .map((intent, sourceOrder) => ({ ...intent, sourceOrder }));
}

/**
 * The intent sources of a stored intake document: the SDD change intake selected (its summary
 * marks it, C001-IF-007 §6), the commits of the change and the plan items of the named plans.
 */
export function intentSourcesOf(intake: IntakeDocument): IntentSourcesInput {
  const selectedId = intake.intakeSummary.intentContext.sddChanges.find((c) => c.selected)?.id;
  const context = intake.intentContext;
  return {
    sddChange: context.sddChanges.find((c) => c.id === selectedId) ?? null,
    commits: context.commits,
    planItems: context.planItems,
  };
}

/** The real path of `path`, or of its nearest existing parent joined with the rest. */
function realPath(path: string): string {
  try {
    return realpathSync.native(path);
  } catch {
    const parent = dirname(path);
    return parent === path ? path : join(realPath(parent), basename(path));
  }
}

/**
 * The plan file path of an intent key (domain model §3): the named path resolved against `cwd`
 * (C001-IF-007 §7, a relative path names a file of the current directory), repository-relative with
 * `/` when it lies under `repositoryRoot`, else absolute. Both are compared as real paths, so a
 * symbolic link or an 8.3 name does not move a plan out of the repository.
 */
export function planKeyPath(file: string, repositoryRoot: string, cwd: string): string {
  const absolute = realPath(resolve(cwd, file));
  const rel = relative(realPath(resolve(repositoryRoot)), absolute);
  const inside = rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
  return inside ? rel.split(sep).join('/') : absolute;
}
