/**
 * Spatial transform components and Anchor components for hierarchical relationships.
 */
import type { Component } from '../ecs/component';
import type { EntityId } from '../ecs/entity';
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

/**
 * 2D Spatial transform component.
 */
export interface Transform2DComponent extends Component {
  readonly type: 'Transform2D';
  position: Vec2;
  rotation: number;
  scale: Vec2;
  zLayer: number;
  drawOrder: number;
  isDirty: boolean;
}

export interface Transform2DProps {
  position?: [number, number] | Vec2;
  rotation?: number;
  scale?: [number, number] | Vec2;
  zLayer?: number;
  drawOrder?: number;
}

export function createTransform2D(props: Transform2DProps = {}): Transform2DComponent {
  const position = vec2.create();
  if (props.position) {
    vec2.set(position, props.position[0], props.position[1]);
  }

  const scale = vec2.fromValues(1, 1);
  if (props.scale) {
    vec2.set(scale, props.scale[0], props.scale[1]);
  }

  return {
    type: 'Transform2D',
    position,
    rotation: props.rotation ?? 0,
    scale,
    zLayer: props.zLayer ?? 0,
    drawOrder: props.drawOrder ?? 0,
    isDirty: true
  };
}

/**
 * 3D Spatial transform component.
 */
export interface Transform3DComponent extends Component {
  readonly type: 'Transform3D';
  position: Vec3;
  rotation: Quat;
  scale: Vec3;
  isDirty: boolean;
}

export interface Transform3DProps {
  position?: [number, number, number] | Vec3;
  rotation?: [number, number, number, number] | Quat;
  scale?: [number, number, number] | Vec3;
}

export function createTransform3D(props: Transform3DProps = {}): Transform3DComponent {
  const position = vec3.create();
  if (props.position) {
    vec3.set(position, props.position[0], props.position[1], props.position[2]);
  }

  const rotation = quat.create();
  if (props.rotation) {
    quat.set(rotation, props.rotation[0], props.rotation[1], props.rotation[2], props.rotation[3]);
  }

  const scale = vec3.fromValues(1, 1, 1);
  if (props.scale) {
    vec3.set(scale, props.scale[0], props.scale[1], props.scale[2]);
  }

  return {
    type: 'Transform3D',
    position,
    rotation,
    scale,
    isDirty: true
  };
}

import type { AnchorConstraintCallback2D, AnchorConstraintCallback3D } from './strategy';

/**
 * Anchor component linking an entity to a target entity with an arbitrary strategy or functional constraint.
 */
export interface AnchorComponent extends Component {
  readonly type: 'Anchor';
  /** The target entity to which this entity is anchored. */
  targetEntityId: EntityId;
  /** Anchor solving strategy name (defaults to 'static'). */
  strategy: string;
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
    offset2d: props.offset2d,
    offset3d: props.offset3d,
    callback2d: props.callback2d,
    callback3d: props.callback3d,
    active: props.active ?? true
  };
}
