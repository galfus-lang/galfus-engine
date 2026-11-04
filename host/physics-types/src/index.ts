/**
 * @module @galfus/physics-types
 *
 * Agnostic 2D and 3D physics contracts, ECS RigidBody components, and collision event types
 * for Galfus Engine host physics packages (`@galfus/physics-2d` and `@galfus/physics-3d`).
 */

import type { Component, EntityId } from '@galfus/engine';

export type RigidBodyType = 'dynamic' | 'fixed' | 'kinematicPosition' | 'kinematicVelocity';

export interface RigidBodyBaseDesc {
  /** Body simulation type (defaults to 'dynamic'). */
  type?: RigidBodyType;
  /** Additional mass in kg (defaults to 1.0 for dynamic bodies). */
  mass?: number;
  /** Multiplier applied to world gravity for this body (defaults to 1.0). */
  gravityScale?: number;
  /** Linear velocity damping factor (defaults to 0.0). */
  linearDamping?: number;
  /** Angular velocity damping factor (defaults to 0.0). */
  angularDamping?: number;
  /** Bounciness coefficient [0..1] applied to attached colliders (defaults to 0.2). */
  restitution?: number;
  /** Surface friction coefficient applied to attached colliders (defaults to 0.5). */
  friction?: number;
  /** Enables Continuous Collision Detection (CCD) to prevent fast tunneling (defaults to false). */
  ccd?: boolean;
  /** Prevents all translational movement when true. */
  lockTranslations?: boolean;
  /** Prevents all rotational movement when true. */
  lockRotations?: boolean;
}

export interface RigidBody2DDesc extends RigidBodyBaseDesc {
  /** Initial 2D linear velocity `[vx, vy]`. */
  linearVelocity?: [number, number];
  /** Initial 2D angular velocity in radians/sec. */
  angularVelocity?: number;
}

export interface RigidBody3DDesc extends RigidBodyBaseDesc {
  /** Initial 3D linear velocity `[vx, vy, vz]`. */
  linearVelocity?: [number, number, number];
  /** Initial 3D angular velocity `[wx, wy, wz]` in radians/sec. */
  angularVelocity?: [number, number, number];
  /** Per-axis rotation lock flags `[rotX, rotY, rotZ]`. */
  enabledRotations?: [boolean, boolean, boolean];
}

export interface RigidBody2DComponent extends Component {
  readonly type: 'RigidBody2D';
  desc: Required<
    Pick<
      RigidBody2DDesc,
      | 'type'
      | 'mass'
      | 'gravityScale'
      | 'linearDamping'
      | 'angularDamping'
      | 'restitution'
      | 'friction'
      | 'ccd'
      | 'lockTranslations'
      | 'lockRotations'
    >
  > & {
    linearVelocity: [number, number];
    angularVelocity: number;
  };
  isDirty: boolean;
}

export interface RigidBody3DComponent extends Component {
  readonly type: 'RigidBody3D';
  desc: Required<
    Pick<
      RigidBody3DDesc,
      | 'type'
      | 'mass'
      | 'gravityScale'
      | 'linearDamping'
      | 'angularDamping'
      | 'restitution'
      | 'friction'
      | 'ccd'
      | 'lockTranslations'
      | 'lockRotations'
    >
  > & {
    linearVelocity: [number, number, number];
    angularVelocity: [number, number, number];
    enabledRotations: [boolean, boolean, boolean];
  };
  isDirty: boolean;
}

export function createRigidBody2DComponent(desc: RigidBody2DDesc = {}): RigidBody2DComponent {
  return {
    type: 'RigidBody2D',
    desc: {
      type: desc.type ?? 'dynamic',
      mass: desc.mass ?? 1.0,
      gravityScale: desc.gravityScale ?? 1.0,
      linearDamping: desc.linearDamping ?? 0.0,
      angularDamping: desc.angularDamping ?? 0.0,
      restitution: desc.restitution ?? 0.2,
      friction: desc.friction ?? 0.5,
      ccd: desc.ccd ?? false,
      lockTranslations: desc.lockTranslations ?? false,
      lockRotations: desc.lockRotations ?? false,
      linearVelocity: desc.linearVelocity ? [...desc.linearVelocity] : [0, 0],
      angularVelocity: desc.angularVelocity ?? 0
    },
    isDirty: true
  };
}

export function createRigidBody3DComponent(desc: RigidBody3DDesc = {}): RigidBody3DComponent {
  return {
    type: 'RigidBody3D',
    desc: {
      type: desc.type ?? 'dynamic',
      mass: desc.mass ?? 1.0,
      gravityScale: desc.gravityScale ?? 1.0,
      linearDamping: desc.linearDamping ?? 0.0,
      angularDamping: desc.angularDamping ?? 0.0,
      restitution: desc.restitution ?? 0.2,
      friction: desc.friction ?? 0.5,
      ccd: desc.ccd ?? false,
      lockTranslations: desc.lockTranslations ?? false,
      lockRotations: desc.lockRotations ?? false,
      linearVelocity: desc.linearVelocity ? [...desc.linearVelocity] : [0, 0, 0],
      angularVelocity: desc.angularVelocity ? [...desc.angularVelocity] : [0, 0, 0],
      enabledRotations: desc.enabledRotations
        ? [...desc.enabledRotations]
        : [
            !(desc.lockRotations ?? false),
            !(desc.lockRotations ?? false),
            !(desc.lockRotations ?? false)
          ]
    },
    isDirty: true
  };
}

export type PhysicsEventType = 'collisionStart' | 'collisionEnd' | 'sensorEnter' | 'sensorExit';

export interface PhysicsCollisionEvent {
  readonly type: PhysicsEventType;
  readonly entityA: EntityId;
  readonly entityB: EntityId;
  readonly colliderIdA: number;
  readonly colliderIdB: number;
  readonly sensor: boolean;
}

export type PhysicsEventListener = (event: PhysicsCollisionEvent) => void;

export interface PhysicsWorld2DOptions {
  /** World gravity vector `[gx, gy]` (defaults to `[0, -9.81]`). */
  gravity?: [number, number];
  /**
   * When true, `attachPhysics2D` interpolates visual `Model2D` transforms on `tick`
   * using `runtime.fixedAlpha` between the previous and current fixed steps. Defaults to false.
   */
  interpolate?: boolean;
}

export interface PhysicsWorld3DOptions {
  /** World gravity vector `[gx, gy, gz]` (defaults to `[0, -9.81, 0]`). */
  gravity?: [number, number, number];
  /**
   * When true, `attachPhysics3D` interpolates visual `Model3D` transforms on `tick`
   * using `runtime.fixedAlpha` between the previous and current fixed steps. Defaults to false.
   */
  interpolate?: boolean;
}

export interface PhysicsWorld2D {
  readonly isDisposed: boolean;
  setGravity(gravity: [number, number]): void;
  getGravity(): [number, number];
  addRigidBody(entityId: EntityId, desc?: RigidBody2DDesc): RigidBody2DComponent;
  removeRigidBody(entityId: EntityId): boolean;
  hasRigidBody(entityId: EntityId): boolean;
  applyForce(entityId: EntityId, force: [number, number]): void;
  applyForceAtPoint(entityId: EntityId, force: [number, number], point: [number, number]): void;
  applyImpulse(entityId: EntityId, impulse: [number, number]): void;
  applyImpulseAtPoint(entityId: EntityId, impulse: [number, number], point: [number, number]): void;
  applyTorque(entityId: EntityId, torque: number): void;
  applyTorqueImpulse(entityId: EntityId, torqueImpulse: number): void;
  setLinearVelocity(entityId: EntityId, velocity: [number, number]): void;
  getLinearVelocity(entityId: EntityId): [number, number] | undefined;
  setAngularVelocity(entityId: EntityId, omega: number): void;
  getAngularVelocity(entityId: EntityId): number | undefined;
  isSleeping(entityId: EntityId): boolean;
  wakeUp(entityId: EntityId): void;
  on(type: PhysicsEventType, listener: PhysicsEventListener): () => void;
  step(dt: number): void;
  interpolate(alpha: number): void;
  reset(): void;
  dispose(): void;
}

export interface PhysicsWorld3D {
  readonly isDisposed: boolean;
  setGravity(gravity: [number, number, number]): void;
  getGravity(): [number, number, number];
  addRigidBody(entityId: EntityId, desc?: RigidBody3DDesc): RigidBody3DComponent;
  removeRigidBody(entityId: EntityId): boolean;
  hasRigidBody(entityId: EntityId): boolean;
  applyForce(entityId: EntityId, force: [number, number, number]): void;
  applyForceAtPoint(
    entityId: EntityId,
    force: [number, number, number],
    point: [number, number, number]
  ): void;
  applyImpulse(entityId: EntityId, impulse: [number, number, number]): void;
  applyImpulseAtPoint(
    entityId: EntityId,
    impulse: [number, number, number],
    point: [number, number, number]
  ): void;
  applyTorque(entityId: EntityId, torque: [number, number, number]): void;
  applyTorqueImpulse(entityId: EntityId, torqueImpulse: [number, number, number]): void;
  setLinearVelocity(entityId: EntityId, velocity: [number, number, number]): void;
  getLinearVelocity(entityId: EntityId): [number, number, number] | undefined;
  setAngularVelocity(entityId: EntityId, omega: [number, number, number]): void;
  getAngularVelocity(entityId: EntityId): [number, number, number] | undefined;
  isSleeping(entityId: EntityId): boolean;
  wakeUp(entityId: EntityId): void;
  on(type: PhysicsEventType, listener: PhysicsEventListener): () => void;
  step(dt: number): void;
  interpolate(alpha: number): void;
  reset(): void;
  dispose(): void;
}

/**
 * Packs Galfus 32-bit `layer` (membership) and `mask` (filter) into Rapier's 32-bit
 * interaction groups `(membership << 16) | filter`.
 */
export function packInteractionGroups(layer = 1, mask = 0xffffffff): number {
  const membership = layer & 0xffff || 0x0001;
  const filter = mask & 0xffff;
  return ((membership << 16) | filter) >>> 0;
}
