/**
 * HierarchyCoordinator provides high-level scene graph and anchor management for a Realm.
 * Maintains an O(1) reverse lookup (target -> dependents), prevents cyclic relationships,
 * and enforces safe world-transform preservation upon target detachment.
 */

import type { EntityId } from '../ecs/entity';
import type { EcsWorld } from '../ecs/world';
import { mat2d, mat4 } from '../math/index';
import type { Model2DComponent } from '../realm2d/components';
import type { Model3DComponent } from '../realm3d/components';
import { SpatialDirtyFlags } from '../spatial/flags';
import {
  type AnchorComponent,
  type AnchorPresetDescriptor,
  type AnchorStrategyParams,
  createAnchor
} from './component';
import { presetsAnchor } from './presets';
import type { AnchorConstraintCallback2D, AnchorConstraintCallback3D } from './strategy';

export type EntityLike = EntityId | { entityId: EntityId };

export interface AnchorAttachOptions {
  readonly strategy: string | AnchorPresetDescriptor;
  readonly params?: AnchorStrategyParams;
  readonly offset?: readonly number[];
}

export type AnchorConstraint3D =
  string | AnchorPresetDescriptor | AnchorAttachOptions | AnchorConstraintCallback3D;
export type AnchorConstraint2D =
  string | AnchorPresetDescriptor | AnchorAttachOptions | AnchorConstraintCallback2D;

export interface AttachChainOptions {
  /** Link distance between consecutive entities (defaults to 1.0). */
  length?: number;
  /** Strategy used for each link ('chain' | 'rope' | 'spring' or a preset descriptor, defaults to 'chain'). */
  strategy?: 'chain' | 'rope' | 'spring' | AnchorPresetDescriptor;
  /** Whether to orient each link towards its predecessor (used by 'chain', defaults to true). */
  alignRotation?: boolean;
  /** Stiffness when strategy is 'spring' (defaults to 120). */
  stiffness?: number;
  /** Damping when strategy is 'spring' or 'rope' (defaults to 14). */
  damping?: number;
}

export function resolveEntityId(entity: EntityLike): EntityId {
  return typeof entity === 'number' ? entity : entity.entityId;
}

export class HierarchyCoordinator<Kind extends '2d' | '3d' = '2d' | '3d'> {
  private readonly _dependentsByTarget = new Map<EntityId, Set<EntityId>>();

  constructor(
    private readonly _world: EcsWorld,
    private readonly _dimension: Kind
  ) {}

  /**
   * Attaches an origin entity to a target reference entity with an optional constraint.
   * Rejects self-anchoring and cycles proactively.
   *
   * @param origin The dependent entity to anchor.
   * @param target The target entity to follow.
   * @param constraint Optional strategy name ('static', 'translation') or in-place zero-GC callback.
   */
  attach(
    origin: EntityLike,
    target: EntityLike,
    constraint?: Kind extends '3d' ? AnchorConstraint3D : AnchorConstraint2D
  ): void {
    const originId = resolveEntityId(origin);
    const targetId = resolveEntityId(target);

    if (originId === targetId) {
      throw new Error(`Anchor error: Entity ${originId} cannot anchor to itself.`);
    }

    if (!this._world.isAlive(originId) || !this._world.isAlive(targetId)) {
      throw new Error(
        `Anchor error: Both origin (${originId}) and target (${targetId}) must be alive.`
      );
    }

    // Proactive cycle detection
    let curr: EntityId | undefined = targetId;
    while (curr !== undefined) {
      if (curr === originId) {
        throw new Error(
          `Anchor cycle detected: cannot attach entity ${originId} to ${targetId} as it forms a cycle.`
        );
      }
      curr = this.getTarget(curr);
    }

    // Disconnect previous target from reverse index if re-anchoring
    const prevTarget = this.getTarget(originId);
    if (prevTarget !== undefined) {
      this._dependentsByTarget.get(prevTarget)?.delete(originId);
    }

    let strategy = 'static';
    let params: AnchorStrategyParams | undefined;
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
    } else if (constraint && typeof constraint === 'object') {
      if (typeof constraint.strategy === 'object' && constraint.strategy !== null) {
        const inner = constraint.strategy;
        strategy = inner.strategy;
        params = {
          ...inner.params,
          ...constraint.params,
          ...(constraint.offset ? { offset: constraint.offset } : {})
        };
      } else {
        strategy = constraint.strategy;
        params = constraint.params
          ? {
              ...constraint.params,
              ...('offset' in constraint && constraint.offset ? { offset: constraint.offset } : {})
            }
          : 'offset' in constraint && constraint.offset
            ? { offset: constraint.offset }
            : undefined;
      }
    }

    if (
      (strategy === 'rope' || strategy === 'chain' || strategy === 'spring') &&
      !params?.initialDelta
    ) {
      let initialDelta: number[] | undefined;
      if (this._dimension === '3d') {
        const om = this._world.getComponent<Model3DComponent>(originId, 'Model3D')?.localMatrix;
        const tm = this._world.getComponent<Model3DComponent>(targetId, 'Model3D')?.localMatrix;
        if (om && tm) {
          initialDelta = [om[12] - tm[12], om[13] - tm[13], om[14] - tm[14]];
        }
      } else {
        const om = this._world.getComponent<Model2DComponent>(originId, 'Model2D')?.localMatrix;
        const tm = this._world.getComponent<Model2DComponent>(targetId, 'Model2D')?.localMatrix;
        if (om && tm) {
          initialDelta = [om[4] - tm[4], om[5] - tm[5]];
        }
      }
      if (initialDelta) {
        params = { ...params, initialDelta };
      }
    }

    this._world.attachComponent(
      originId,
      createAnchor({
        targetEntityId: targetId,
        strategy,
        params,
        callback2d,
        callback3d
      })
    );

    // Register in reverse index
    let set = this._dependentsByTarget.get(targetId);
    if (!set) {
      set = new Set<EntityId>();
      this._dependentsByTarget.set(targetId, set);
    }
    set.add(originId);

    // Invalidate origin spatial state immediately
    this._invalidateOrigin(originId);
  }

  /**
   * Detaches an origin entity from its target anchor.
   *
   * @param origin The entity to detach.
   * @param preserveWorldTransform When true (default), converts the last resolved worldMatrix
   * into the entity's independent localMatrix so it does not pop back to the origin.
   */
  detach(origin: EntityLike, preserveWorldTransform = true): void {
    const originId = resolveEntityId(origin);
    const targetId = this.getTarget(originId);

    if (targetId !== undefined) {
      this._dependentsByTarget.get(targetId)?.delete(originId);
    }

    if (preserveWorldTransform) {
      const model3d = this._world.getComponent<Model3DComponent>(originId, 'Model3D');
      if (model3d) {
        mat4.copy(model3d.localMatrix, model3d.worldMatrix);
        model3d.flags |= SpatialDirtyFlags.LocalDirty;
      }
      const model2d = this._world.getComponent<Model2DComponent>(originId, 'Model2D');
      if (model2d) {
        mat2d.copy(model2d.localMatrix, model2d.worldMatrix);
        model2d.flags |= SpatialDirtyFlags.LocalDirty;
      }
    }

    this._world.detachComponent(originId, 'Anchor');
  }

  /**
   * Connects a sequence of entities `[root, link1, link2, ...]` into an anchored chain.
   */
  attachChain(entities: readonly EntityLike[], options: AttachChainOptions = {}): void {
    if (entities.length < 2) return;
    let preset: AnchorPresetDescriptor;
    if (options.strategy && typeof options.strategy === 'object') {
      preset = {
        strategy: options.strategy.strategy,
        params: {
          ...options.strategy.params,
          ...(options.length !== undefined
            ? {
                length: options.length,
                maxLength: options.length,
                restLength: options.length
              }
            : {})
        }
      };
    } else {
      const len = options.length ?? 1.0;
      const mode = options.strategy ?? 'chain';
      preset =
        mode === 'rope'
          ? presetsAnchor.rope({ maxLength: len, damping: options.damping })
          : mode === 'spring'
            ? presetsAnchor.spring({
                restLength: len,
                stiffness: options.stiffness,
                damping: options.damping
              })
            : presetsAnchor.chain({ length: len, alignRotation: options.alignRotation });
    }

    for (let i = 1; i < entities.length; i++) {
      this.attach(entities[i]!, entities[i - 1]!, preset as any);
    }
  }

  /**
   * Checks whether an origin entity is currently attached to a target.
   */
  isAttached(origin: EntityLike): boolean {
    const originId = resolveEntityId(origin);
    return this._world.hasComponent(originId, 'Anchor');
  }

  /**
   * Returns the target EntityId if attached, or undefined.
   */
  getTarget(origin: EntityLike): EntityId | undefined {
    const originId = resolveEntityId(origin);
    const anchor = this._world.getComponent<AnchorComponent>(originId, 'Anchor');
    return anchor?.targetEntityId;
  }

  /**
   * Returns all dependent entity IDs anchored to the given target entity in O(1) time.
   */
  getDependents(target: EntityLike): EntityId[] {
    const targetId = resolveEntityId(target);
    const set = this._dependentsByTarget.get(targetId);
    return set ? Array.from(set) : [];
  }

  /**
   * Cleans up all dependent relationships when a target entity is destroyed,
   * safely detaching them and preserving their world transforms.
   */
  handleTargetDestroyed(target: EntityLike): void {
    const targetId = resolveEntityId(target);
    const dependents = this.getDependents(targetId);
    for (const depId of dependents) {
      this.detach(depId, true);
    }
    this._dependentsByTarget.delete(targetId);
  }

  private _invalidateOrigin(originId: EntityId): void {
    const model3d = this._world.getComponent<Model3DComponent>(originId, 'Model3D');
    if (model3d) {
      model3d.flags |= SpatialDirtyFlags.LocalDirty;
    }
    const model2d = this._world.getComponent<Model2DComponent>(originId, 'Model2D');
    if (model2d) {
      model2d.flags |= SpatialDirtyFlags.LocalDirty;
    }
  }
}
