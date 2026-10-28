/**
 * HierarchyCoordinator provides high-level scene graph and anchor management for a Realm.
 */
import type { EntityId } from '../ecs/entity';
import type { EcsWorld } from '../ecs/world';
import { createAnchor, type AnchorComponent } from './component';
import type { AnchorConstraintCallback2D, AnchorConstraintCallback3D } from './strategy';

export type EntityLike = EntityId | { entityId: EntityId };

export type AnchorConstraint3D = string | AnchorConstraintCallback3D;
export type AnchorConstraint2D = string | AnchorConstraintCallback2D;

export function resolveEntityId(entity: EntityLike): EntityId {
  return typeof entity === 'number' ? entity : entity.entityId;
}

export class HierarchyCoordinator<Kind extends '2d' | '3d' = '2d' | '3d'> {
  constructor(
    private readonly _world: EcsWorld,
    private readonly _dimension: Kind
  ) {}

  /**
   * Attaches an origin entity (child) to a target entity (parent) with an optional constraint.
   * If constraint is omitted, uses the default 'static' anchor relationship.
   *
   * @param origin The child entity to anchor (EntityId or object with entityId).
   * @param target The parent entity to follow (EntityId or object with entityId).
   * @param constraint Optional strategy name ('static', etc.) or in-place zero-GC callback.
   */
  attach(
    origin: EntityLike,
    target: EntityLike,
    constraint?: Kind extends '3d' ? AnchorConstraint3D : AnchorConstraint2D
  ): void {
    const originId = resolveEntityId(origin);
    const targetId = resolveEntityId(target);

    let strategy = 'static';
    let callback2d: AnchorConstraintCallback2D | undefined;
    let callback3d: AnchorConstraintCallback3D | undefined;

    if (typeof constraint === 'string') {
      strategy = constraint;
    } else if (typeof constraint === 'function') {
      if (this._dimension === '3d') {
        callback3d = constraint as AnchorConstraintCallback3D;
      } else {
        callback2d = constraint as AnchorConstraintCallback2D;
      }
    }

    this._world.attachComponent(
      originId,
      createAnchor({
        targetEntityId: targetId,
        strategy,
        callback2d,
        callback3d
      })
    );
  }

  /**
   * Detaches an entity from its parent anchor.
   */
  detach(origin: EntityLike): void {
    const originId = resolveEntityId(origin);
    this._world.detachComponent(originId, 'Anchor');
  }

  /**
   * Checks whether an entity is currently attached to a parent.
   */
  isAttached(origin: EntityLike): boolean {
    const originId = resolveEntityId(origin);
    return this._world.hasComponent(originId, 'Anchor');
  }

  /**
   * Returns the parent target EntityId if attached, or undefined.
   */
  getParent(origin: EntityLike): EntityId | undefined {
    const originId = resolveEntityId(origin);
    const anchor = this._world.getComponent<AnchorComponent>(originId, 'Anchor');
    return anchor?.targetEntityId;
  }

  /**
   * Returns all child entity IDs attached to the given target entity.
   */
  getChildren(target: EntityLike): EntityId[] {
    const targetId = resolveEntityId(target);
    const entities = this._world.query('Anchor');
    const children: EntityId[] = [];
    for (const id of entities) {
      const anchor = this._world.getComponent<AnchorComponent>(id, 'Anchor');
      if (anchor?.targetEntityId === targetId) {
        children.push(id);
      }
    }
    return children;
  }
}
