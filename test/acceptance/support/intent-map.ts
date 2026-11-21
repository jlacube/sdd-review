import { strict as assert } from 'node:assert';
import type { AcceptanceWorld } from './world.js';
import { intakeOf } from './intent-context.js';

// The intents of the headless intent map (C001-IF-008, `Intent`) and the SDD changes that CAP-03
// scenarios add to a fixture's snapshot, for the CAP-03 steps (C001-T-031 and later).

export interface IntentView {
  kind: string;
  title: string;
  source: { type: string; reference: string };
}

/** The intents of the last run's intent map; fails with the CLI output when intake did not complete. */
export function intentsOf(world: AcceptanceWorld): IntentView[] {
  intakeOf(world);
  assert.ok(world.headless?.has('intent-map.json'), 'the headless output holds no intent-map.json');
  return world.headless.json<{ intents: IntentView[] }>('intent-map.json').intents;
}

/** What names an intent in a scenario: the requirement ID of a spec intent, else its title. */
export const intentName = (intent: IntentView): string =>
  intent.kind === 'spec-requirement' ? intent.source.reference : intent.title;

/**
 * Adds the open SDD change `id` (for example `CHG-043` in `.sdd/043-promo/`) with its requirements
 * to the snapshot, as an edit of the working tree.
 */
export function addOpenChange(
  world: AcceptanceWorld,
  id: string,
  requirements: readonly string[] = [],
): void {
  const repo = world.repo!;
  const folder = `.sdd/${id.replace(/^\D+/, '').padStart(3, '0')}-promo`;
  repo.write(`${folder}/change.md`, `---\nid: "${id}"\ntitle: "Promo"\nstatus: active\n---\n`);
  if (requirements.length > 0) {
    repo.write(
      `${folder}/10-spec/20-capabilities/CAP-01-promo/requirements.md`,
      requirements
        .map((r) => `### ${r} — Promo rule ${r}\n- **Statement:** THE cart SHALL apply ${r}.\n`)
        .join('\n'),
    );
  }
}
