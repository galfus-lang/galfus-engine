/**
 * Spatial transform components and Anchor components for hierarchical relationships.
 */

import type { Component } from '../ecs/component';
import type { EntityId } from '../ecs/entity';
import type { EcsWorld } from '../ecs/world';
import { type Mat2d, type Mat4, type Quat, type Vec2, type Vec3 } from '../math/index';
import type { Model2DComponent } from '../realm2d/components';
import type { Model3DComponent } from '../realm3d/components';
import { SpatialDirtyFlags } from '../spatial/flags';
import type { AnchorConstraintCallback2D, AnchorConstraintCallback3D } from './strategy';

/**
 * Spatial transform descriptors for initial setup.
 */
export interface Transform2DProps {
  position?: [number, number] | Vec2;
  rotation?: number;
  scale?: [number, number] | Vec2;
  zLayer?: number;
  drawOrder?: number;
}

export interface Transform3DProps {
  position?: [number, number, number] | Vec3;
  rotation?: [number, number, number, number] | Quat;
  scale?: [number, number, number] | Vec3;
}

/**
 * Parameters for built-in kinematic and physical anchor strategies ('rope', 'chain', 'spring').
 */
export interface AnchorStrategyParams {
  /** Maximum distance before pulling origin (used by 'rope'). */
  maxLength?: number;
  /** Fixed link distance between origin and target (used by 'chain'). */
  length?: number;
  /** Whether to orient origin towards target (used by 'chain', defaults to true). */
  alignRotation?: boolean;
  /** Spring stiffness coefficient (used by 'spring', defaults to 120). */
  stiffness?: number;
  /** Damping coefficient (used by 'spring' and 'rope'). */
  damping?: number;
  /** Rest distance for spring (defaults to 0). */
  restLength?: number;
  /** Optional world/target offset vector ([x, y] or [x, y, z]). */
  offset?: readonly number[];
  /** Optional local anchor attachment point on origin entity ([x, y] or [x, y, z]). */
  localAnchorOrigin?: readonly number[];
  /** Optional local anchor attachment point on target entity ([x, y] or [x, y, z]). */
  localAnchorTarget?: readonly number[];
  /** Whether connected physics bodies should collide with each other (defaults to false). */
  collideConnected?: boolean;
  /** Local rotation axis on 3D hinge joints ([x, y, z], defaults to [0, 1, 0]). */
  axis?: readonly number[];
  /** Minimum rotation angle in radians for hinge/revolute joints. */
  minAngle?: number;
  /** Maximum rotation angle in radians for hinge/revolute joints. */
  maxAngle?: number;
  /** Angular limit pair [minAngle, maxAngle] in radians for hinge joints. */
  limits?: readonly [number, number];
  /** Target equilibrium rotation angle in radians for angular/torsional springs (defaults to 0). */
  targetAngle?: number;
  /** Rotational/torsional stiffness coefficient for angular springs. */
  angularStiffness?: number;
  /** Rotational/torsional damping coefficient for angular springs. */
  angularDamping?: number;
  /** Internal initial relative vector from target to origin at attach time. */
  initialDelta?: readonly number[];
}

/**
 * Structured preset descriptor accepted by `hierarchy.attach(origin, target, preset)`.
 */
export interface AnchorPresetDescriptor {
  readonly strategy:
    | 'static'
    | 'translation'
    | 'rope'
    | 'chain'
    | 'spring'
    | 'hinge'
    | 'revolute'
    | 'angularSpring'
    | 'torsionSpring';
  readonly params?: AnchorStrategyParams;
}

/**
 * Anchor component linking an origin entity to a target entity with an arbitrary strategy or functional constraint.
 */
export interface AnchorComponent extends Component {
  readonly type: 'Anchor';
  /** The target entity to which this entity is anchored. */
  targetEntityId: EntityId;
  /** Anchor solving strategy name (defaults to 'static'). */
  strategy: string;
  /** Optional strategy configuration parameters (for 'rope', 'chain', 'spring', etc.). */
  params?: AnchorStrategyParams;
  /** Optional distance constraint parameter. */
  distance?: number;
  /** Optional 2D offset matrix if anchoring in 2D space. */
  offset2d?: Mat2d;
  /** Optional 3D offset matrix if anchoring in 3D space. */
  offset3d?: Mat4;
  /** Optional custom in-place constraint callback for 2D. */
  callback2d?: AnchorConstraintCallback2D;
  /** Optional custom in-place constraint callback for 3D. */
  callback3d?: AnchorConstraintCallback3D;
  /** Whether this anchor is currently active. */
  active: boolean;
  /**
   * When true, native physics manages this anchor as a physical Joint,
   * and `AnchorSolveSystem` skips matrix multiplication.
   */
  managedByPhysics?: boolean;
}

export interface AnchorProps {
  targetEntityId: EntityId;
  strategy?: string;
  params?: AnchorStrategyParams;
  distance?: number;
  offset2d?: Mat2d;
  offset3d?: Mat4;
  callback2d?: AnchorConstraintCallback2D;
  callback3d?: AnchorConstraintCallback3D;
  active?: boolean;
  managedByPhysics?: boolean;
}

export function createAnchor(props: AnchorProps): AnchorComponent {
  return {
    type: 'Anchor',
    targetEntityId: props.targetEntityId,
    strategy: props.strategy ?? 'static',
    params: props.params,
    distance: props.distance ?? props.params?.maxLength ?? props.params?.length,
    offset2d: props.offset2d,
    offset3d: props.offset3d,
    callback2d: props.callback2d,
    callback3d: props.callback3d,
    active: props.active ?? true,
    managedByPhysics: props.managedByPhysics ?? false
  };
}

/**
 * Observable anchor mutation helpers that invalidate origin spatial dirty flags immediately.
 */
export function setAnchorDistance(world: EcsWorld, entityId: EntityId, distance: number): boolean {
  const anchor = world.getComponent<AnchorComponent>(entityId, 'Anchor');
  if (!anchor) return false;
  anchor.distance = distance;
  _invalidateOrigin(world, entityId);
  return true;
}

export function setAnchorStrategy(world: EcsWorld, entityId: EntityId, strategy: string): boolean {
  const anchor = world.getComponent<AnchorComponent>(entityId, 'Anchor');
  if (!anchor) return false;
  anchor.strategy = strategy;
  _invalidateOrigin(world, entityId);
  return true;
}

export function setAnchorOffset3D(world: EcsWorld, entityId: EntityId, offset: Mat4): boolean {
  const anchor = world.getComponent<AnchorComponent>(entityId, 'Anchor');
  if (!anchor) return false;
  anchor.offset3d = offset;
  _invalidateOrigin(world, entityId);
  return true;
}

export function setAnchorOffset2D(world: EcsWorld, entityId: EntityId, offset: Mat2d): boolean {
  const anchor = world.getComponent<AnchorComponent>(entityId, 'Anchor');
  if (!anchor) return false;
  anchor.offset2d = offset;
  _invalidateOrigin(world, entityId);
  return true;
}

function _invalidateOrigin(world: EcsWorld, entityId: EntityId): void {
  const model3d = world.getComponent<Model3DComponent>(entityId, 'Model3D');
  if (model3d) {
    model3d.flags |= SpatialDirtyFlags.LocalDirty;
  }
  const model2d = world.getComponent<Model2DComponent>(entityId, 'Model2D');
  if (model2d) {
    model2d.flags |= SpatialDirtyFlags.LocalDirty;
  }
}
