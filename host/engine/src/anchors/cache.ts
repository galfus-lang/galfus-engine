/**
 * Persistent matrix memory cache for anchors and transforms.
 *
 * Keeps pre-allocated TypedArray buffers in memory and mutates them in-place
 * across frames to eliminate Garbage Collector overhead and allocation jitter.
 */
import type { EntityId } from '../ecs/entity';
import { mat2d, mat4, type Mat2d, type Mat4 } from '../math/index';

export class AnchorMatrixCache {
  // 2D Matrix Buffers: Float32Array(6)
  private readonly _local2D = new Map<EntityId, Mat2d>();
  private readonly _world2D = new Map<EntityId, Mat2d>();

  // 3D Matrix Buffers: Float32Array(16)
  private readonly _local3D = new Map<EntityId, Mat4>();
  private readonly _world3D = new Map<EntityId, Mat4>();

  /**
   * Retrieves or creates a persistent local 2D matrix buffer for the given entity.
   */
  getOrCreateLocal2D(entityId: EntityId): Mat2d {
    let m = this._local2D.get(entityId);
    if (!m) {
      m = mat2d.create();
      this._local2D.set(entityId, m);
    }
    return m;
  }

  /**
   * Retrieves or creates a persistent world 2D matrix buffer for the given entity.
   */
  getOrCreateWorld2D(entityId: EntityId): Mat2d {
    let m = this._world2D.get(entityId);
    if (!m) {
      m = mat2d.create();
      this._world2D.set(entityId, m);
    }
    return m;
  }

  /**
   * Retrieves or creates a persistent local 3D matrix buffer for the given entity.
   */
  getOrCreateLocal3D(entityId: EntityId): Mat4 {
    let m = this._local3D.get(entityId);
    if (!m) {
      m = mat4.create();
      this._local3D.set(entityId, m);
    }
    return m;
  }

  /**
   * Retrieves or creates a persistent world 3D matrix buffer for the given entity.
   */
  getOrCreateWorld3D(entityId: EntityId): Mat4 {
    let m = this._world3D.get(entityId);
    if (!m) {
      m = mat4.create();
      this._world3D.set(entityId, m);
    }
    return m;
  }

  /**
   * Gets an existing world 2D matrix buffer if already resolved.
   */
  getWorld2D(entityId: EntityId): Mat2d | undefined {
    return this._world2D.get(entityId);
  }

  /**
   * Gets an existing world 3D matrix buffer if already resolved.
   */
  getWorld3D(entityId: EntityId): Mat4 | undefined {
    return this._world3D.get(entityId);
  }

  /**
   * Removes cached buffers for an entity upon destruction.
   */
  remove(entityId: EntityId): void {
    this._local2D.delete(entityId);
    this._world2D.delete(entityId);
    this._local3D.delete(entityId);
    this._world3D.delete(entityId);
  }

  /**
   * Clears all cached buffers.
   */
  clear(): void {
    this._local2D.clear();
    this._world2D.clear();
    this._local3D.clear();
    this._world3D.clear();
  }
}
