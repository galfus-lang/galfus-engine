/**
 * Execution pipeline and 4-phase system scheduler.
 */
import type { GalfusEngine } from '@galfus/transport-types';

/**
 * Standard execution stages executed in fixed sequence each frame:
 * 1. `input`: Processes incoming platform events, gamepads, pointers, keyboards.
 * 2. `update`: Main game logic, physics integration, AI behavior.
 * 3. `preRender`: Anchor solving, spatial hierarchies, camera sync, scene graph updates.
 * 4. `postRender`: Frame metrics, debug diagnostics, cleanups.
 */
export type SystemStep = 'input' | 'update' | 'preRender' | 'postRender';

export const SYSTEM_STEPS: readonly SystemStep[] = [
  'input',
  'update',
  'preRender',
  'postRender'
] as const;

/**
 * Execution context passed to every system during frame execution.
 */
export interface SystemContext {
  /** Total elapsed simulation time in seconds. */
  time: number;
  /** Delta time of the current frame in seconds (`deltaMs / 1000`). */
  dt: number;
  /** Sequential frame identifier. */
  frameId: number;
  /** Direct access to the underlying native or WASM GalfusEngine ABI. */
  engine?: GalfusEngine;
}

/**
 * Pure function signature of an ECS system.
 */
export type System<TWorld = unknown> = (world: TWorld, context: SystemContext) => void;

/**
 * Manages systems registered across the 4 stages.
 */
export class SystemPipeline<TWorld = unknown> {
  private readonly _systems: Record<SystemStep, System<TWorld>[]> = {
    input: [],
    update: [],
    preRender: [],
    postRender: []
  };

  /**
   * Registers a system into a specified execution stage.
   */
  add(step: SystemStep, system: System<TWorld>): this {
    this._systems[step].push(system);
    return this;
  }

  /**
   * Removes a previously registered system from a stage.
   */
  remove(step: SystemStep, system: System<TWorld>): boolean {
    const list = this._systems[step];
    const index = list.indexOf(system);
    if (index !== -1) {
      list.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Runs all systems registered in a specific stage.
   */
  runStep(step: SystemStep, world: TWorld, context: SystemContext): void {
    const list = this._systems[step];
    for (const sys of list) {
      sys(world, context);
    }
  }

  /**
   * Runs all 4 stages in canonical sequence: input -> update -> preRender -> postRender.
   */
  runAll(world: TWorld, context: SystemContext): void {
    this.runStep('input', world, context);
    this.runStep('update', world, context);
    this.runStep('preRender', world, context);
    this.runStep('postRender', world, context);
  }

  /**
   * Clears all registered systems.
   */
  clear(): void {
    this._systems.input = [];
    this._systems.update = [];
    this._systems.preRender = [];
    this._systems.postRender = [];
  }
}
