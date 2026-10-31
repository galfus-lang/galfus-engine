/**
 * Spatial transform components and Anchor components for hierarchical relationships.
 */
import type { Component } from '../ecs/component';
import type { EntityId } from '../ecs/entity';
import type { EcsWorld } from '../ecs/world';
import {
  mat2d,
  mat4,
  quat,
  vec2,
  vec3,
  type Mat2d,
  type Mat4,
  type Quat,
  type Vec2,
  type Vec3
} from '../math/index';
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
 * Anchor component linking an origin entity to a target entity with an arbitrary strategy or functional constraint.
 */
export interface AnchorComponent extends Component {
  readonly type: 'Anchor';
  /** The target entity to which this entity is anchored. */
  targetEntityId: EntityId;
  /** Anchor solving strategy name (defaults to 'static'). */
  strategy: string;
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
}

export interface AnchorProps {
  targetEntityId: EntityId;
  strategy?: string;
  distance?: number;
  offset2d?: Mat2d;
  offset3d?: Mat4;
  callback2d?: AnchorConstraintCallback2D;
  callback3d?: AnchorConstraintCallback3D;
  active?: boolean;
}

export function createAnchor(props: AnchorProps): AnchorComponent {
  return {
    type: 'Anchor',
    targetEntityId: props.targetEntityId,
    strategy: props.strategy ?? 'static',
    distance: props.distance,
    offset2d: props.offset2d,
    offset3d: props.offset3d,
    callback2d: props.callback2d,
    callback3d: props.callback3d,
    active: props.active ?? true
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
