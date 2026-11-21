import { strict as assert } from 'node:assert';
import type { AcceptanceWorld } from './world.js';

// Reading the intent context and the notices of the headless intake document (C001-IF-008), for
// the CAP-01 and CAP-02 steps of the intent sources (C001-T-029 and later).

export interface IntentItem {
  id: string;
  kind: string;
  title: string;
  text: string;
  links: Array<{ to: string; type: string }>;
  location?: { path: string; line: number };
}

export interface IntentChange {
  id: string;
  title: string;
  origin: string;
  location?: string;
  items: IntentItem[];
}

export interface IntakeView {
  intentContext: { sddChanges: IntentChange[]; documentedArchitecture: unknown };
  intakeSummary: {
    intentContext: {
      sddChanges: Array<{ id: string; specItems: number; selected: boolean }>;
      documentedArchitecture: string;
    };
  };
  notices: Array<{ code: string; message: string; subject?: string }>;
}

/** The intake document of the last run; fails with the CLI output when intake did not complete. */
export function intakeOf(world: AcceptanceWorld): IntakeView {
  const run = world.lastRun;
  assert.ok(run, 'the CLI was not run');
  assert.equal(run.status, 0, `the CLI exited with ${run.status}: ${run.stderr}${run.stdout}`);
  assert.ok(world.headless?.has('intake.json'), 'the headless output holds no intake.json');
  return world.headless.json<IntakeView>('intake.json');
}

export function allItems(intake: IntakeView): IntentItem[] {
  return intake.intentContext.sddChanges.flatMap((c) => c.items);
}

/** The IDs of a list such as `C042-REQ-003, C042-REQ-004 and C042-T-007` or `"R-1" and "R-2"`. */
export function idList(text: string): string[] {
  return text
    .split(/,\s*|\s+and\s+/)
    .map((id) => id.trim().replace(/^"(.*)"$/, '$1'))
    .filter((id) => id.length > 0);
}
