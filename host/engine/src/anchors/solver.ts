/**
 * Anchor and hierarchical transform solver system.
 *
 * Runs during the `preRender` stage to calculate local and world matrices
 * directly into Model3D/Model2D components and the persistent AnchorMatrixCache,
 * resolving dependencies topologically with cycle detection, incremental dirty propagation,
 * and SpatialDirtyFlags transitions.
 */
import type { EntityId } from '../ecs/entity';
import type { System, SystemContext } from '../ecs/system';
import type { EcsWorld } from '../ecs/world';
import { mat2d, mat4, type Mat2d, type Mat4 } from '../math/index';
import type { Model2DComponent } from '../realm2d/components';
import type { Model3DComponent } from '../realm3d/components';
import { SpatialDirtyFlags } from '../spatial/flags';
import { AnchorMatrixCache } from './cache';
import type { AnchorComponent } from './component';
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
    const all2DEntities = world.query('Model2D');

    const visiting = new Set<EntityId>();
    const resolved = new Set<EntityId>();
    const dirtyTargets = new Set<EntityId>();

    for (const id of all2DEntities) {
      this.resolveEntity2D(id, world, context, visiting, resolved, dirtyTargets);
    }
  }

  private resolveEntity2D(
    id: EntityId,
    world: EcsWorld,
    context: SystemContext,
    visiting: Set<EntityId>,
    resolved: Set<EntityId>,
    dirtyTargets: Set<EntityId>
  ): Mat2d {
    const worldMatrix = this.cache.getOrCreateWorld2D(id);
    if (resolved.has(id)) {
      return worldMatrix;
    }

    const model = world.getComponent<Model2DComponent>(id, 'Model2D');
    if (!model) {
      return worldMatrix;
    }

    const localMatrix = this.cache.getOrCreateLocal2D(id);
    mat2d.copy(localMatrix, model.localMatrix);

    const anchor = world.getComponent<AnchorComponent>(id, 'Anchor');
    if (!anchor || !anchor.active) {
      const isLocalDirty = (model.flags & SpatialDirtyFlags.LocalDirty) !== 0;
      if (isLocalDirty) {
        mat2d.copy(worldMatrix, localMatrix);
        mat2d.copy(model.worldMatrix, worldMatrix);
        model.flags = (model.flags & ~SpatialDirtyFlags.LocalDirty) | SpatialDirtyFlags.WorldDirty;
        dirtyTargets.add(id);
      } else {
        mat2d.copy(worldMatrix, model.worldMatrix);
      }
      resolved.add(id);
      return worldMatrix;
    }

    // Cycle detection fallback
    if (visiting.has(id)) {
      console.warn(
        `[AnchorSolveSystem] Cycle detected at entity ${id} in 2D anchor hierarchy. Falling back to local transform.`
      );
      mat2d.copy(worldMatrix, localMatrix);
      mat2d.copy(model.worldMatrix, worldMatrix);
      model.flags = (model.flags & ~SpatialDirtyFlags.LocalDirty) | SpatialDirtyFlags.WorldDirty;
      dirtyTargets.add(id);
      resolved.add(id);
      return worldMatrix;
    }

    visiting.add(id);
    const targetWorld = this.resolveEntity2D(
      anchor.targetEntityId,
      world,
      context,
      visiting,
      resolved,
      dirtyTargets
    );
    visiting.delete(id);

    const isTargetDirty = dirtyTargets.has(anchor.targetEntityId);
    const isLocalDirty = model ? (model.flags & SpatialDirtyFlags.LocalDirty) !== 0 : true;

    // Incremental optimization: skip re-multiplication if neither target nor local changed
    if (!isTargetDirty && !isLocalDirty) {
      if (model) {
        mat2d.copy(worldMatrix, model.worldMatrix);
      }
      resolved.add(id);
      return worldMatrix;
    }

    if (anchor.callback2d) {
      anchor.callback2d(targetWorld, localMatrix, worldMatrix, context);
    } else {
      const strategy = this.strategies.get2D(anchor.strategy);
      strategy.apply(targetWorld, localMatrix, worldMatrix, anchor.offset2d, context);
    }

    if (model) {
      mat2d.copy(model.worldMatrix, worldMatrix);
      model.flags = (model.flags & ~SpatialDirtyFlags.LocalDirty) | SpatialDirtyFlags.WorldDirty;
      dirtyTargets.add(id);
    }

    resolved.add(id);
    return worldMatrix;
  }

  // ---------------------------------------------------------------------------
  // 3D Solving
  // ---------------------------------------------------------------------------
  private solve3D(world: EcsWorld, context: SystemContext): void {
    const all3DEntities = world.query('Model3D');

    const visiting = new Set<EntityId>();
    const resolved = new Set<EntityId>();
    const dirtyTargets = new Set<EntityId>();

    for (const id of all3DEntities) {
      this.resolveEntity3D(id, world, context, visiting, resolved, dirtyTargets);
    }
  }

  private resolveEntity3D(
    id: EntityId,
    world: EcsWorld,
    context: SystemContext,
    visiting: Set<EntityId>,
    resolved: Set<EntityId>,
    dirtyTargets: Set<EntityId>
  ): Mat4 {
    const worldMatrix = this.cache.getOrCreateWorld3D(id);
    if (resolved.has(id)) {
      return worldMatrix;
    }

    const model = world.getComponent<Model3DComponent>(id, 'Model3D');
    if (!model) {
      return worldMatrix;
    }

    const localMatrix = this.cache.getOrCreateLocal3D(id);
    mat4.copy(localMatrix, model.localMatrix);

    const anchor = world.getComponent<AnchorComponent>(id, 'Anchor');
    if (!anchor || !anchor.active) {
      const isLocalDirty = (model.flags & SpatialDirtyFlags.LocalDirty) !== 0;
      if (isLocalDirty) {
        mat4.copy(worldMatrix, localMatrix);
        mat4.copy(model.worldMatrix, worldMatrix);
        model.flags = (model.flags & ~SpatialDirtyFlags.LocalDirty) | SpatialDirtyFlags.WorldDirty;
        dirtyTargets.add(id);
      } else {
        mat4.copy(worldMatrix, model.worldMatrix);
      }
      resolved.add(id);
      return worldMatrix;
    }

    // Cycle detection fallback
    if (visiting.has(id)) {
      console.warn(
        `[AnchorSolveSystem] Cycle detected at entity ${id} in 3D anchor hierarchy. Falling back to local transform.`
      );
      mat4.copy(worldMatrix, localMatrix);
      mat4.copy(model.worldMatrix, worldMatrix);
      model.flags = (model.flags & ~SpatialDirtyFlags.LocalDirty) | SpatialDirtyFlags.WorldDirty;
      dirtyTargets.add(id);
      resolved.add(id);
      return worldMatrix;
    }

    visiting.add(id);
    const targetWorld = this.resolveEntity3D(
      anchor.targetEntityId,
      world,
      context,
      visiting,
      resolved,
      dirtyTargets
    );
    visiting.delete(id);

    const isTargetDirty = dirtyTargets.has(anchor.targetEntityId);
    const isLocalDirty = model ? (model.flags & SpatialDirtyFlags.LocalDirty) !== 0 : true;

    // Incremental optimization: skip re-multiplication if neither target nor local changed
    if (!isTargetDirty && !isLocalDirty) {
      if (model) {
        mat4.copy(worldMatrix, model.worldMatrix);
      }
      resolved.add(id);
      return worldMatrix;
    }

    if (anchor.callback3d) {
      anchor.callback3d(targetWorld, localMatrix, worldMatrix, context);
    } else {
      const strategy = this.strategies.get3D(anchor.strategy);
      strategy.apply(targetWorld, localMatrix, worldMatrix, anchor.offset3d, context);
    }

    if (model) {
      mat4.copy(model.worldMatrix, worldMatrix);
      model.flags = (model.flags & ~SpatialDirtyFlags.LocalDirty) | SpatialDirtyFlags.WorldDirty;
      dirtyTargets.add(id);
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
