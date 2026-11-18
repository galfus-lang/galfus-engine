import { type EntityLike, resolveEntityId } from '../anchors/hierarchy';
import { mat2d } from '../math/index';
import { PhysicsWorld3D } from './world3d';
export { PhysicsWorld3D } from './world3d';
import type { Model2DComponent } from '../realm2d/components';
import type { Realm2D } from '../realm2d/realm';
import type { Realm3D } from '../realm3d/realm';
import { SpatialDirtyFlags } from '../spatial/flags';

interface PhysicsStepResult2D {
  poses?: Array<[number, number, number, number]>;
  events?: Array<{ type: PhysicsEventType; entityA: number; entityB: number; sensor: boolean }>;
}

export type RigidBodyType = 'dynamic' | 'fixed' | 'kinematicPosition' | 'kinematicVelocity';

export interface RigidBodyBaseDesc {
  type?: RigidBodyType;
  bodyType?: RigidBodyType;
  mass?: number;
  gravityScale?: number;
  linearDamping?: number;
  angularDamping?: number;
  restitution?: number;
  friction?: number;
  ccd?: boolean;
  lockTranslations?: boolean;
  lockRotations?: boolean;
  initialPosition?: any;
  initialRotation?: any;
  initialScale?: any;
}

export interface RigidBody2DDesc extends RigidBodyBaseDesc {
  linearVelocity?: [number, number];
  angularVelocity?: number;
}

export interface RigidBody3DDesc extends RigidBodyBaseDesc {
  linearVelocity?: [number, number, number];
  angularVelocity?: [number, number, number];
  enabledRotations?: [boolean, boolean, boolean];
}

export interface PhysicsWorld2DOptions {
  gravity?: [number, number];
  /** Interpolation is not implemented. */
  interpolate?: boolean;
}

export interface PhysicsWorld3DOptions {
  gravity?: [number, number, number];
  /** Interpolation is not implemented. */
  interpolate?: boolean;
}

export type PhysicsEventType =
  | 'collisionStart'
  | 'collisionEnd'
  | 'collisionEnter'
  | 'collisionExit'
  | 'sensorStart'
  | 'sensorEnd'
  | 'sensorEnter'
  | 'sensorExit';
export type PhysicsEventListener = (event: any) => void;

/**
 * Native Rapier 2D Physics World Controller.
 */
export class PhysicsWorld2D {
  private readonly _realm: Realm2D;
  private _gravity: [number, number];
  private readonly _listeners = new Map<PhysicsEventType, Set<PhysicsEventListener>>();
  private _initialized = false;
  private readonly _bodies = new Map<number, number>();
  private readonly _entities = new Map<number, number>();
  private _unsubscribeTick?: () => void;

  constructor(realm: Realm2D, options: PhysicsWorld2DOptions = {}) {
    if (options.interpolate) throw new Error('Physics interpolation is not implemented.');
    this._realm = realm;
    this._gravity = options.gravity ?? [0, -9.81];
    if (this._realm.transport) {
      this._realm.transport.realm2dEnablePhysics(
        this._realm.id,
        this._gravity[0],
        this._gravity[1]
      );
    }
  }

  bindTick(unsubscribe?: () => void): void {
    this._unsubscribeTick?.();
    this._unsubscribeTick = unsubscribe;
  }

  reset(): void {
    this._bodies.clear();
    this._entities.clear();
    this._initialized = false;
    this.setGravity(this._gravity);
  }

  dispose(): void {
    this.bindTick();
    this._bodies.clear();
    this._entities.clear();
    this._listeners.clear();
  }

  private _command(entity: EntityLike, command: object): any {
    const modelId = this._bodies.get(resolveEntityId(entity));
    if (modelId === undefined || !this._realm.transport) return null;
    return JSON.parse(
      this._realm.transport.realm2dBodyCommand(this._realm.id, modelId, JSON.stringify(command))
    );
  }

  setPosition(entity: EntityLike, position: [number, number]): void {
    const model = this._realm.world.getComponent<Model2DComponent>(
      resolveEntityId(entity),
      'Model2D'
    );
    if (!model || !this.hasRigidBody(entity)) return;
    const rotation = Math.atan2(model.localMatrix[1], model.localMatrix[0]);
    this._command(entity, { type: 'setPose', position, rotation });
    model.setPosition(position);
  }

  setGravity(gravity: [number, number]): void {
    this._gravity = [gravity[0], gravity[1]];
    if (this._realm.transport) {
      this._realm.transport.realm2dEnablePhysics(this._realm.id, gravity[0], gravity[1]);
    }
  }

  getGravity(): [number, number] {
    return [this._gravity[0], this._gravity[1]];
  }

  addRigidBody(entity: EntityLike, desc: RigidBody2DDesc = {}): any {
    const entityId = resolveEntityId(entity);
    const model = this._realm.world.getComponent<Model2DComponent>(entityId, 'Model2D');
    if (!model) throw new Error(`Rigid body requires a Model2D on entity ${entityId}.`);
    const previous = this._bodies.get(entityId);
    if (previous !== undefined) this._entities.delete(previous);
    this._bodies.set(entityId, model.modelId);
    this._entities.set(model.modelId, entityId);
    this._realm.hierarchy.setPhysicsBody(entityId, true);
    const augmentedDesc: any = {
      ...desc,
      bodyType: desc.bodyType ?? desc.type ?? 'dynamic'
    };
    delete augmentedDesc.type;
    if (model) {
      const pos: [number, number] = [model.localMatrix[4] ?? 0, model.localMatrix[5] ?? 0];
      const rot = Math.atan2(model.localMatrix[1] ?? 0, model.localMatrix[0] ?? 1);
      const sx = Math.hypot(model.localMatrix[0] ?? 1, model.localMatrix[1] ?? 0) || 1;
      const sy = Math.hypot(model.localMatrix[2] ?? 0, model.localMatrix[3] ?? 1) || 1;
      augmentedDesc.initialPosition = pos;
      augmentedDesc.initialRotation = rot;
      augmentedDesc.initialScale = [sx, sy];
    }
    if (this._realm.transport) {
      this._realm.transport.realm2dAttachRigidbody(this._realm.id, model.modelId, augmentedDesc);
    }
    return desc;
  }

  removeRigidBody(entity: EntityLike): boolean {
    const entityId = resolveEntityId(entity);
    const modelId = this._bodies.get(entityId);
    if (modelId === undefined) return false;
    if (this._realm.transport) {
      this._realm.transport.realm2dRemoveRigidbody(this._realm.id, modelId);
    }
    this._bodies.delete(entityId);
    this._entities.delete(modelId);
    this._realm.hierarchy.setPhysicsBody(entityId, false);
    return true;
  }

  applyTorqueImpulse(entity: EntityLike, torque: number): void {
    const modelId = this._bodies.get(resolveEntityId(entity));
    if (modelId !== undefined)
      this._realm.transport?.realm2dApplyTorque(this._realm.id, modelId, torque);
  }

  step(dt: number): void {
    if (!this._initialized) {
      if (typeof (this._realm as any).flush === 'function') {
        (this._realm as any).flush();
      }
      this._initialized = true;
    }
    if (
      this._realm.transport &&
      typeof (this._realm.transport as any).realm2dStepPhysics === 'function'
    ) {
      const resJson = (this._realm.transport as any).realm2dStepPhysics(this._realm.id, dt);
      if (resJson && typeof resJson === 'string') {
        try {
          const res: PhysicsStepResult2D = JSON.parse(resJson);
          if (res.poses) {
            for (const pose of res.poses) {
              const entityId = this._entities.get(pose[0]);
              if (entityId === undefined) continue;
              const model = this._realm.world.getComponent<Model2DComponent>(entityId, 'Model2D');
              if (model) {
                const sx = Math.hypot(model.localMatrix[0], model.localMatrix[1]) || 1;
                const sy = Math.hypot(model.localMatrix[2], model.localMatrix[3]) || 1;
                mat2d.fromRotationTranslationScale(model.localMatrix, [pose[1], pose[2]], pose[3], [
                  sx,
                  sy
                ]);
                mat2d.copy(model.worldMatrix, model.localMatrix);
                model.flags |= SpatialDirtyFlags.LocalDirty | SpatialDirtyFlags.WorldDirty;
              }
            }
          }
          if (res.events) {
            for (const ev of res.events) {
              const entityA = this._entities.get(ev.entityA);
              const entityB = this._entities.get(ev.entityB);
              if (entityA !== undefined && entityB !== undefined)
                this._emit({ ...ev, entityA, entityB });
            }
          }
        } catch {
          // ignore malformed JSON
        }
      }
    }
  }

  private _emit(event: {
    type: PhysicsEventType;
    entityA: number;
    entityB: number;
    sensor: boolean;
  }): void {
    const set = this._listeners.get(event.type);
    if (!set || set.size === 0) return;
    for (const listener of set) {
      listener(event);
    }
  }

  setLinearVelocity(entity: EntityLike, velocity: [number, number]): void {
    const entityId = this._bodies.get(resolveEntityId(entity));
    if (entityId === undefined) return;
    if (
      this._realm.transport &&
      typeof (this._realm.transport as any).realm2dSetLinearVelocity === 'function'
    ) {
      (this._realm.transport as any).realm2dSetLinearVelocity(
        this._realm.id,
        entityId,
        velocity[0],
        velocity[1]
      );
    }
  }

  setAngularVelocity(entity: EntityLike, velocity: number): void {
    const entityId = this._bodies.get(resolveEntityId(entity));
    if (entityId === undefined) return;
    if (
      this._realm.transport &&
      typeof (this._realm.transport as any).realm2dSetAngularVelocity === 'function'
    ) {
      (this._realm.transport as any).realm2dSetAngularVelocity(this._realm.id, entityId, velocity);
    }
  }
  getLinearVelocity(entity: EntityLike): [number, number] {
    return this._command(entity, { type: 'velocity' })?.linear ?? [0, 0];
  }
  getAngularVelocity(entity: EntityLike): number {
    return this._command(entity, { type: 'velocity' })?.angular ?? 0;
  }

  hasRigidBody(entity: EntityLike): boolean {
    const entityId = resolveEntityId(entity);
    return this._bodies.has(entityId);
  }

  applyImpulse(entity: EntityLike, impulse: [number, number]): void {
    const entityId = this._bodies.get(resolveEntityId(entity));
    if (entityId === undefined) return;
    if (this._realm.transport) {
      this._realm.transport.realm2dApplyImpulse(this._realm.id, entityId, impulse[0], impulse[1]);
    }
  }

  applyImpulseAtPoint(
    entity: EntityLike,
    impulse: [number, number],
    point?: [number, number]
  ): void {
    if (point) this._command(entity, { type: 'impulseAtPoint', impulse, point });
    else this.applyImpulse(entity, impulse);
  }

  /** Applies force for the next physics step; reapply each step for continuous force. */
  applyForce(entity: EntityLike, force: [number, number]): void {
    const entityId = this._bodies.get(resolveEntityId(entity));
    if (entityId === undefined) return;
    if (this._realm.transport) {
      this._realm.transport.realm2dApplyForce(this._realm.id, entityId, force[0], force[1]);
    }
  }

  applyForceAtPoint(entity: EntityLike, force: [number, number], point?: [number, number]): void {
    if (point) this._command(entity, { type: 'forceAtPoint', force, point });
    else this.applyForce(entity, force);
  }

  applyTorque(entity: EntityLike, torque: number): void {
    this._command(entity, { type: 'torque', torque });
  }

  on(type: PhysicsEventType, listener: PhysicsEventListener): void {
    if (!this._listeners.has(type)) {
      this._listeners.set(type, new Set());
    }
    this._listeners.get(type)!.add(listener);
  }

  off(type: PhysicsEventType, listener: PhysicsEventListener): void {
    this._listeners.get(type)?.delete(listener);
  }
}

/**
 * Attaches native 2D Rapier physics to a 2D Realm.
 */
export async function attachPhysics2D(
  runtime: any,
  realm: Realm2D,
  options: PhysicsWorld2DOptions = {}
): Promise<PhysicsWorld2D> {
  if (options.interpolate) throw new Error('Physics interpolation is not implemented.');
  const world = realm.physics;
  if (options.gravity) world.setGravity(options.gravity);
  if (runtime && typeof runtime.on === 'function') {
    world.bindTick(
      runtime.on('fixedTick', ({ fixedDt }: { fixedDt: number }) => {
        world.step(fixedDt);
      })
    );
  } else {
    world.bindTick();
  }
  return world;
}

/**
 * Attaches native 3D Rapier physics to a 3D Realm.
 */
export async function attachPhysics3D(
  runtime: any,
  realm: Realm3D,
  options: PhysicsWorld3DOptions = {}
): Promise<PhysicsWorld3D> {
  if (options.interpolate) throw new Error('Physics interpolation is not implemented.');
  const world = realm.physics;
  if (options.gravity) world.setGravity(options.gravity);
  if (runtime && typeof runtime.on === 'function') {
    world.bindTick(
      runtime.on('fixedTick', ({ fixedDt }: { fixedDt: number }) => {
        world.step(fixedDt);
      })
    );
  } else {
    world.bindTick();
  }
  return world;
}
