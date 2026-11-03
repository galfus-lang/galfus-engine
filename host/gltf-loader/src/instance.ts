/**
 * Concrete implementation of ModelInstance for spawned glTF scene graphs.
 */

import type { AnimationPlayer3DComponent, Realm3D } from '@galfus/engine';
import type { ModelInstance } from '@galfus/model-loader-types';

export interface GltfInstanceInit {
  instanceId: number;
  realm: Realm3D;
  rootEntityId: number;
  entities: number[];
  instancedModelIds?: number[];
  animationPlayer?: AnimationPlayer3DComponent;
  onDispose?: (instance: GltfInstance) => void;
}

/**
 * Concrete ModelInstance representing a live glTF scene graph in the ECS.
 *
 * @example
 * ```typescript
 * const instance = factory.instantiate();
 * const head = instance.getEntityByName('Head');
 * instance.dispose(); // Destroys entities while preserving shared GPU assets
 * ```
 */
export class GltfInstance implements ModelInstance {
  readonly instanceId: number;
  readonly rootEntityId: number;
  readonly entities: readonly number[];
  readonly animationPlayer?: AnimationPlayer3DComponent;

  private readonly _realm: Realm3D;
  private readonly _instancedModelIds: number[];
  private readonly _onDispose?: (instance: GltfInstance) => void;
  private _isDisposed = false;

  constructor(init: GltfInstanceInit) {
    this.instanceId = init.instanceId;
    this._realm = init.realm;
    this.rootEntityId = init.rootEntityId;
    this.entities = Object.freeze([...init.entities]);
    this._instancedModelIds = init.instancedModelIds ? [...init.instancedModelIds] : [];
    this.animationPlayer = init.animationPlayer;
    this._onDispose = init.onDispose;
  }

  /** Indicates whether this instance has already been destroyed. */
  get isDisposed(): boolean {
    return this._isDisposed;
  }

  /**
   * Resolves an entity ID by its assigned name within this instance.
   *
   * @param name The entity name to look up.
   * @returns Entity ID or undefined if not found.
   */
  getEntityByName(name: string): number | undefined {
    if (this._isDisposed) return undefined;
    for (const entityId of this.entities) {
      if (this._realm.getEntityName(entityId) === name) {
        return entityId;
      }
    }
    return undefined;
  }

  /**
   * Queries all entities within this instance matching a metadata key and optional value.
   *
   * @param key The metadata key.
   * @param value Optional expected value to match.
   * @returns Array of matching entity IDs.
   */
  getEntitiesByMetadata(key: string, value?: unknown): number[] {
    if (this._isDisposed) return [];
    const results: number[] = [];
    for (const entityId of this.entities) {
      const val = this._realm.getMetadataKV(entityId, key);
      if (val !== undefined) {
        if (value === undefined || val === value) {
          results.push(entityId);
        }
      }
    }
    return results;
  }

  /**
   * Destroys all ECS entities, stop bound animations, and frees hardware instanced draws.
   *
   * Safe and idempotent. Shared textures, materials, and geometries in the factory remain alive.
   */
  dispose(): void {
    if (this._isDisposed) return;
    this._isDisposed = true;

    // 1. Stop animation player if present
    if (this.animationPlayer) {
      this.animationPlayer.stop();
    }

    // 2. Destroy hardware instanced models
    for (const instId of this._instancedModelIds) {
      try {
        this._realm.destroyInstancedModel(instId);
      } catch {
        // Ignored during shutdown
      }
    }

    // 3. Destroy all ECS entities belonging to this instance
    for (const entityId of this.entities) {
      try {
        this._realm.destroyEntity(entityId);
      } catch {
        // Ignored if entity was already destroyed
      }
    }

    // 4. Notify parent factory of disposal
    this._onDispose?.(this);
  }
}
