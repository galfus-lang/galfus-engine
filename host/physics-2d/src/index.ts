import type { MultiverseRuntime, Realm2D } from '@galfus/engine';
import type { PhysicsWorld2D, PhysicsWorld2DOptions } from '@galfus/physics-types';
import RAPIER from '@dimforge/rapier2d-compat';
import { RapierPhysicsWorld2D } from './world';

export * from '@galfus/physics-types';
export { RapierPhysicsWorld2D } from './world';

let initPromise2D: Promise<void> | null = null;

/**
 * Initializes the Rapier 2D WASM module once across the process/page.
 */
export function initPhysics2D(): Promise<void> {
  if (!initPromise2D) {
    initPromise2D = RAPIER.init();
  }
  return initPromise2D;
}

/**
 * Initializes Rapier 2D WASM and attaches a 2D physics world to `runtime` (`fixedTick`)
 * and `realm2D` (`Model2D`, `Collider2D`, `Anchor`).
 */
export async function attachPhysics2D(
  runtime: MultiverseRuntime,
  realm2D: Realm2D,
  options: PhysicsWorld2DOptions = {}
): Promise<PhysicsWorld2D> {
  await initPhysics2D();

  const unsubscribers: Array<() => void> = [];
  const world = new RapierPhysicsWorld2D(realm2D, options, () => {
    for (const unsub of unsubscribers) {
      unsub();
    }
    unsubscribers.length = 0;
  });

  unsubscribers.push(
    runtime.on('fixedTick', ({ fixedDt }) => {
      if (realm2D.isDisposed || runtime.isDisposed) {
        world.dispose();
        return;
      }
      world.step(fixedDt);
    })
  );

  if (options.interpolate) {
    unsubscribers.push(
      runtime.on('tick', () => {
        if (!world.isDisposed) {
          world.interpolate(runtime.fixedAlpha);
        }
      })
    );
  }

  return world;
}
