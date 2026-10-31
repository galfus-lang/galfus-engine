/**
 * Execution pipeline and 4-phase system scheduler.
 */
import type { GalfusEngine } from '@galfus/transport-types';

/**
 * Standard execution stages executed in fixed sequence each frame:
 * 1. `input`: Processes incoming platform events, gamepads, pointers, keyboards.
 * 2. `update`: Main game logic, physics integration, AI behavior.
 * 3. `preRender`: Anchor solving, spatial hierarchies, camera sync, scene graph updates.
 * 4. `postRender`: Frame metrics, debug diagnostics, cleanups (executed after dispatch).
 */
export type SystemStep = 'input' | 'update' | 'preRender' | 'postRender';

export const SYSTEM_STEPS: readonly SystemStep[] = [
  'input',
  'update',
  'preRender',
  'postRender'
] as const;

/**
 * Functional classification of a registered system.
 */
export type SystemKind = 'ordinary' | 'anchor' | 'sync' | 'cleanup' | 'custom';

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
 * Options or configuration descriptor for registering an ECS system.
 */
export interface SystemDescriptor<TWorld = unknown> {
  step: SystemStep;
  fn: System<TWorld>;
  /**
   * Execution priority within the stage.
   * Higher priority systems execute earlier. Ties are resolved by stable insertion order.
   * Defaults to 0.
   */
  priority?: number;
  /** Functional category of the system. Defaults to 'ordinary'. */
  kind?: SystemKind;
}

/**
 * An immutable registration entry in the system scheduler.
 */
export interface RegisteredSystem<TWorld = unknown> {
  step: SystemStep;
  fn: System<TWorld>;
  priority: number;
  insertionOrder: number;
  kind: SystemKind;
}

/**
 * Manages systems registered across the 4 stages with stable priority and insertion ordering.
 */
export class SystemPipeline<TWorld = unknown> {
  private readonly _systems: Record<SystemStep, RegisteredSystem<TWorld>[]> = {
    input: [],
    update: [],
    preRender: [],
    postRender: []
  };
  private _insertionCounter = 0;

  /**
   * Registers a system into a specified execution stage with stable ordering.
   *
   * @param stepOrDesc Stage name or full {@link SystemDescriptor}.
   * @param systemFn The system function when passing step as string.
   * @param options Optional priority and kind configuration.
   */
  add(
    stepOrDesc: SystemStep | SystemDescriptor<TWorld>,
    systemFn?: System<TWorld>,
    options?: { priority?: number; kind?: SystemKind }
  ): this {
    let desc: SystemDescriptor<TWorld>;
    if (typeof stepOrDesc === 'string') {
      if (!systemFn) {
        throw new Error('System function must be provided when step is passed as a string');
      }
      desc = {
        step: stepOrDesc,
        fn: systemFn,
        priority: options?.priority ?? 0,
        kind: options?.kind ?? 'ordinary'
      };
    } else {
      desc = stepOrDesc;
    }

    const entry: RegisteredSystem<TWorld> = {
      step: desc.step,
      fn: desc.fn,
      priority: desc.priority ?? 0,
      insertionOrder: ++this._insertionCounter,
      kind: desc.kind ?? 'ordinary'
    };

    const list = this._systems[desc.step];
    list.push(entry);

    // Stably sort: higher priority first; equal priorities preserve ascending insertionOrder
    list.sort((a, b) => {
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      return a.insertionOrder - b.insertionOrder;
    });

    return this;
  }

  /**
   * Removes a previously registered system from a stage.
   */
  remove(step: SystemStep, system: System<TWorld>): boolean {
    const list = this._systems[step];
    const index = list.findIndex((s) => s.fn === system);
    if (index !== -1) {
      list.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Runs all systems registered in a specific stage in sorted order.
   */
  runStep(step: SystemStep, world: TWorld, context: SystemContext): void {
    const list = this._systems[step];
    for (const entry of list) {
      entry.fn(world, context);
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
   * Returns a copy of registered systems in the given stage or all stages.
   */
  getRegistered(step?: SystemStep): RegisteredSystem<TWorld>[] {
    if (step) {
      return [...this._systems[step]];
    }
    return [
      ...this._systems.input,
      ...this._systems.update,
      ...this._systems.preRender,
      ...this._systems.postRender
    ];
  }

  /**
   * Clears all registered systems.
   */
  clear(): void {
    this._systems.input = [];
    this._systems.update = [];
    this._systems.preRender = [];
    this._systems.postRender = [];
    this._insertionCounter = 0;
  }
}
