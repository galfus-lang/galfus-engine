/**
 * Anchor and hierarchical transform solver system.
 *
 * Runs during the `preRender` stage to calculate local and world matrices
 * directly into the persistent AnchorMatrixCache, resolving dependencies topologically
 * with cycle detection and fallback protection.
 */
import type { EntityId } from '../ecs/entity';
import type { System, SystemContext } from '../ecs/system';
import type { EcsWorld } from '../ecs/world';
import { mat2d, mat4, type Mat2d, type Mat4 } from '../math/index';
import { AnchorMatrixCache } from './cache';
import type { AnchorComponent, Transform2DComponent, Transform3DComponent } from './component';
import { AnchorStrategyRegistry } from './strategy';

export class AnchorSolveSystem {
  readonly cache = new AnchorMatrixCache();
  readonly strategies = new AnchorStrategyRegistry();

  /**
   * Resolves all 2D and 3D transforms for entities in the given world.
   */
  solve(world: EcsWorld, context: SystemContext): void {
    this.solve2D(world, context);
    this.solve3D(world, context);
  }

  // ---------------------------------------------------------------------------
  // 2D Solving
  // ---------------------------------------------------------------------------
  private solve2D(world: EcsWorld, context: SystemContext): void {
    const entities = world.query('Transform2D');
    const visiting = new Set<EntityId>();
    const resolved = new Set<EntityId>();

    for (const id of entities) {
      this.resolveEntity2D(id, world, context, visiting, resolved);
    }
  }

  private resolveEntity2D(
    id: EntityId,
    world: EcsWorld,
    context: SystemContext,
    visiting: Set<EntityId>,
    resolved: Set<EntityId>
  ): Mat2d {
    const worldMatrix = this.cache.getOrCreateWorld2D(id);
    if (resolved.has(id)) {
      return worldMatrix;
    }

    const tf = world.getComponent<Transform2DComponent>(id, 'Transform2D');
    if (!tf) return worldMatrix;

    const localMatrix = this.cache.getOrCreateLocal2D(id);
    if (tf.isDirty) {
      mat2d.fromRotationTranslationScale(localMatrix, tf.position, tf.rotation, tf.scale);
      tf.isDirty = false;
    }

    const anchor = world.getComponent<AnchorComponent>(id, 'Anchor');
    if (!anchor || !anchor.active) {
      mat2d.copy(worldMatrix, localMatrix);
      resolved.add(id);
      return worldMatrix;
    }

    // Cycle detection
    if (visiting.has(id)) {
      console.warn(
        `[AnchorSolveSystem] Cycle detected at entity ${id} in 2D anchor hierarchy. Falling back to local transform.`
      );
      mat2d.copy(worldMatrix, localMatrix);
      resolved.add(id);
      return worldMatrix;
    }

    visiting.add(id);
    const targetWorld = this.resolveEntity2D(
      anchor.targetEntityId,
      world,
      context,
      visiting,
      resolved
    );
    visiting.delete(id);

    if (anchor.callback2d) {
      anchor.callback2d(targetWorld, localMatrix, worldMatrix, context);
    } else {
      const strategy = this.strategies.get2D(anchor.strategy);
      strategy.apply(targetWorld, localMatrix, worldMatrix, anchor.offset2d, context);
    }

    resolved.add(id);
    return worldMatrix;
  }

  // ---------------------------------------------------------------------------
  // 3D Solving
  // ---------------------------------------------------------------------------
  private solve3D(world: EcsWorld, context: SystemContext): void {
    const entities = world.query('Transform3D');
    const visiting = new Set<EntityId>();
    const resolved = new Set<EntityId>();

    for (const id of entities) {
      this.resolveEntity3D(id, world, context, visiting, resolved);
    }
  }

  private resolveEntity3D(
    id: EntityId,
    world: EcsWorld,
    context: SystemContext,
    visiting: Set<EntityId>,
    resolved: Set<EntityId>
  ): Mat4 {
    const worldMatrix = this.cache.getOrCreateWorld3D(id);
    if (resolved.has(id)) {
      return worldMatrix;
    }

    const tf = world.getComponent<Transform3DComponent>(id, 'Transform3D');
    if (!tf) return worldMatrix;

    const localMatrix = this.cache.getOrCreateLocal3D(id);
    if (tf.isDirty) {
      mat4.fromRotationTranslationScale(localMatrix, tf.rotation, tf.position, tf.scale);
      tf.isDirty = false;
    }

    const anchor = world.getComponent<AnchorComponent>(id, 'Anchor');
    if (!anchor || !anchor.active) {
      mat4.copy(worldMatrix, localMatrix);
      resolved.add(id);
      return worldMatrix;
    }

    // Cycle detection
    if (visiting.has(id)) {
      console.warn(
        `[AnchorSolveSystem] Cycle detected at entity ${id} in 3D anchor hierarchy. Falling back to local transform.`
      );
      mat4.copy(worldMatrix, localMatrix);
      resolved.add(id);
      return worldMatrix;
    }

    visiting.add(id);
    const targetWorld = this.resolveEntity3D(
      anchor.targetEntityId,
      world,
      context,
      visiting,
      resolved
    );
    visiting.delete(id);

    if (anchor.callback3d) {
      anchor.callback3d(targetWorld, localMatrix, worldMatrix, context);
    } else {
      const strategy = this.strategies.get3D(anchor.strategy);
      strategy.apply(targetWorld, localMatrix, worldMatrix, anchor.offset3d, context);
    }

    resolved.add(id);
    return worldMatrix;
  }

  /**
   * Helper function creating an ECS System instance running this solver in `preRender`.
   */
  createSystem(): System<EcsWorld> {
    return (world, context) => this.solve(world, context);
  }
}
