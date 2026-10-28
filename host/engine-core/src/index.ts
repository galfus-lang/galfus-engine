/**
 * @galfus/engine-core: Foundation runtime, ECS, and zero-allocation math.
 */
import type { GalfusEngine } from '@galfus/transport-types';
import { assertValidLogicalId } from '@galfus/transport-types';
import type { EntityId } from './ecs/entity';
import type { SystemContext } from './ecs/system';

export * from './math/index';
export * from './ecs/index';

export type RealmId = number;
export type WindowId = number;
export type TargetId = number;
export type InvocationId = number;

export interface EngineInitOptions {
  engine: GalfusEngine;
  debug?: boolean;
}

/** Central engine runtime holding driver connection, lifecycle and frame orchestration. */
export class EngineRuntime {
  private static _instance: EngineRuntime | null = null;
  private _engine: GalfusEngine | null = null;
  private _frameId = 0;
  private _lastTime = 0;
  private _initialized = false;
  private _nextEntityId = 1;

  static getInstance(): EngineRuntime {
    if (!this._instance) {
      this._instance = new EngineRuntime();
    }
    return this._instance;
  }

  get engine(): GalfusEngine {
    if (!this._engine) {
      throw new Error('EngineRuntime not initialized. Call initEngine(...) first.');
    }
    return this._engine;
  }

  get isInitialized(): boolean {
    return this._initialized;
  }

  init(options: EngineInitOptions): void {
    if (this._initialized) {
      throw new Error('EngineRuntime is already initialized.');
    }
    this._engine = options.engine;
    this._initialized = true;
  }

  dispose(): void {
    if (!this._initialized) return;
    this._engine = null;
    this._initialized = false;
    this._frameId = 0;
  }

  allocateEntityId(): EntityId {
    const id = this._nextEntityId++;
    assertValidLogicalId(id, 'EntityId');
    return id;
  }

  tick(timeMs: number, deltaMs: number): void {
    if (!this._initialized || !this._engine) {
      throw new Error('Cannot tick: EngineRuntime is not initialized.');
    }
    this._frameId++;
    const dtSeconds = Math.max(0, deltaMs) / 1000;
    this._lastTime = timeMs;

    // Dispatch frame in multiverse
    this._engine.multiverseDispatch(this._frameId, dtSeconds);
  }
}

export function initEngine(options: EngineInitOptions): void {
  EngineRuntime.getInstance().init(options);
}

export function disposeEngine(): void {
  EngineRuntime.getInstance().dispose();
}

export function tick(timeMs: number, deltaMs: number): void {
  EngineRuntime.getInstance().tick(timeMs, deltaMs);
}
