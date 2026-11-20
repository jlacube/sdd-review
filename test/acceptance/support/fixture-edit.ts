import type { AcceptanceWorld } from './world.js';

/** The change of the scenarios that say only "a change": an uncommitted edit of `fx-intake`. */
export function editFixture(world: AcceptanceWorld): void {
  const repo = world.fixture('fx-intake');
  repo.write('src/cart.ts', `${repo.read('src/cart.ts')}// edited\n`);
}
