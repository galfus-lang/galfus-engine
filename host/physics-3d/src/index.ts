import type { MultiverseRuntime, Realm3D } from '@galfus/engine';
import type { PhysicsWorld3D, PhysicsWorld3DOptions } from '@galfus/physics-types';
import RAPIER from '@dimforge/rapier3d-compat';
import { RapierPhysicsWorld3D } from './world';

export * from '@galfus/physics-types';
export { RapierPhysicsWorld3D } from './world';

let initPromise3D: Promise<void> | null = null;

/**
 * Initializes the Rapier 3D WASM module once across the process/page.
 */
export function initPhysics3D(): Promise<void> {
  if (!initPromise3D) {
    initPromise3D = RAPIER.init();
  }
  return initPromise3D;
}

/**
 * Initializes Rapier 3D WASM and attaches a 3D physics world to `runtime` (`fixedTick`)
 * and `realm3D` (`Model3D`, `Collider3D`, `Anchor`).
 */
export async function attachPhysics3D(
  runtime: MultiverseRuntime,
  realm3D: Realm3D,
  options: PhysicsWorld3DOptions = {}
): Promise<PhysicsWorld3D> {
  await initPhysics3D();

  const unsubscribers: Array<() => void> = [];
  const world = new RapierPhysicsWorld3D(realm3D, options, () => {
    for (const unsub of unsubscribers) {
      unsub();
    }
    unsubscribers.length = 0;
  });

  unsubscribers.push(
    runtime.on('fixedTick', ({ fixedDt }) => {
      if (realm3D.isDisposed || runtime.isDisposed) {
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
