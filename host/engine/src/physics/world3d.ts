import { type EntityLike, resolveEntityId } from '../anchors/hierarchy';
import { mat4, quat, vec3 } from '../math/index';
import type { Model3DComponent } from '../realm3d/components';
import type { Realm3D } from '../realm3d/realm';
import { SpatialDirtyFlags } from '../spatial/flags';
import type {
  PhysicsEventListener,
  PhysicsEventType,
  PhysicsWorld3DOptions,
  RigidBody3DDesc
} from './index';

const SCRATCH_POS_3D = vec3.create();
const SCRATCH_ROT_3D = quat.create();
const SCRATCH_SCALE_3D = vec3.create();

interface PhysicsStepResult3D {
  poses?: Array<[number, number, number, number, number, number, number, number]>;
  events?: Array<{ type: PhysicsEventType; entityA: number; entityB: number; sensor: boolean }>;
}

/**
 * Native Rapier 3D Physics World Controller.
 */
export class PhysicsWorld3D {
  private readonly _realm: Realm3D;
  private _gravity: [number, number, number];
  private readonly _listeners = new Map<PhysicsEventType, Set<PhysicsEventListener>>();
  private _initialized = false;
  private readonly _bodies = new Map<number, number>();
  private readonly _entities = new Map<number, number>();
  private _unsubscribeTick?: () => void;

  constructor(realm: Realm3D, options: PhysicsWorld3DOptions = {}) {
    if (options.interpolate) throw new Error('Physics interpolation is not implemented.');
    this._realm = realm;
    this._gravity = options.gravity ?? [0, -9.81, 0];
    if (this._realm.transport) {
      this._realm.transport.realm3dEnablePhysics(
        this._realm.id,
        this._gravity[0],
        this._gravity[1],
        this._gravity[2]
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
      this._realm.transport.realm3dBodyCommand(this._realm.id, modelId, JSON.stringify(command))
    );
  }

  setPosition(entity: EntityLike, position: [number, number, number]): void {
    const model = this._realm.world.getComponent<Model3DComponent>(
      resolveEntityId(entity),
      'Model3D'
    );
    if (!model || !this.hasRigidBody(entity)) return;
    mat4.getRotation(SCRATCH_ROT_3D, model.localMatrix);
    const rotation = Array.from(SCRATCH_ROT_3D);
    this._command(entity, { type: 'setPose', position, rotation });
    model.setPosition(position);
  }

  setGravity(gravity: [number, number, number]): void {
    this._gravity = [gravity[0], gravity[1], gravity[2]];
    if (this._realm.transport) {
      this._realm.transport.realm3dEnablePhysics(
        this._realm.id,
        gravity[0],
        gravity[1],
        gravity[2]
      );
    }
  }

  getGravity(): [number, number, number] {
    return [this._gravity[0], this._gravity[1], this._gravity[2]];
  }

  addRigidBody(entity: EntityLike, desc: RigidBody3DDesc = {}): any {
    const entityId = resolveEntityId(entity);
    const model = this._realm.world.getComponent<Model3DComponent>(entityId, 'Model3D');
    if (!model) throw new Error(`Rigid body requires a Model3D on entity ${entityId}.`);
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
      mat4.getTranslation(SCRATCH_POS_3D, model.localMatrix);
      mat4.getRotation(SCRATCH_ROT_3D, model.localMatrix);
      mat4.getScaling(SCRATCH_SCALE_3D, model.localMatrix);
      augmentedDesc.initialPosition = [SCRATCH_POS_3D[0], SCRATCH_POS_3D[1], SCRATCH_POS_3D[2]];
      augmentedDesc.initialRotation = [
        SCRATCH_ROT_3D[0],
        SCRATCH_ROT_3D[1],
        SCRATCH_ROT_3D[2],
        SCRATCH_ROT_3D[3]
      ];
      augmentedDesc.initialScale = [SCRATCH_SCALE_3D[0], SCRATCH_SCALE_3D[1], SCRATCH_SCALE_3D[2]];
    }
    if (this._realm.transport) {
      this._realm.transport.realm3dAttachRigidbody(this._realm.id, model.modelId, augmentedDesc);
    }
    return desc;
  }

  removeRigidBody(entity: EntityLike): boolean {
    const entityId = resolveEntityId(entity);
    const modelId = this._bodies.get(entityId);
    if (modelId === undefined) return false;
    if (this._realm.transport) {
      this._realm.transport.realm3dRemoveRigidbody(this._realm.id, modelId);
    }
    this._bodies.delete(entityId);
    this._entities.delete(modelId);
    this._realm.hierarchy.setPhysicsBody(entityId, false);
    return true;
  }

  applyTorqueImpulse(entity: EntityLike, torque: [number, number, number] | number): void {
    const modelId = this._bodies.get(resolveEntityId(entity));
    const value = typeof torque === 'number' ? [0, torque, 0] : torque;
    if (modelId !== undefined)
      this._realm.transport?.realm3dApplyTorque(
        this._realm.id,
        modelId,
        value[0]!,
        value[1]!,
        value[2]!
      );
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
      typeof (this._realm.transport as any).realm3dStepPhysics === 'function'
    ) {
      const resJson = (this._realm.transport as any).realm3dStepPhysics(this._realm.id, dt);
      if (resJson && typeof resJson === 'string') {
        try {
          const res: PhysicsStepResult3D = JSON.parse(resJson);
          if (res.poses) {
            for (const pose of res.poses) {
              const entityId = this._entities.get(pose[0]);
              if (entityId === undefined) continue;
              const model = this._realm.world.getComponent<Model3DComponent>(entityId, 'Model3D');
              if (model) {
                mat4.getScaling(SCRATCH_SCALE_3D, model.localMatrix);
                mat4.fromRotationTranslationScale(
                  model.localMatrix,
                  [pose[4], pose[5], pose[6], pose[7]],
                  [pose[1], pose[2], pose[3]],
                  SCRATCH_SCALE_3D
                );
                mat4.copy(model.worldMatrix, model.localMatrix);
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

  setLinearVelocity(entity: EntityLike, velocity: [number, number, number]): void {
    const entityId = this._bodies.get(resolveEntityId(entity));
    if (entityId === undefined) return;
    if (
      this._realm.transport &&
      typeof (this._realm.transport as any).realm3dSetLinearVelocity === 'function'
    ) {
      (this._realm.transport as any).realm3dSetLinearVelocity(
        this._realm.id,
        entityId,
        velocity[0],
        velocity[1],
        velocity[2]
      );
    }
  }

  setAngularVelocity(entity: EntityLike, velocity: [number, number, number] | number): void {
    const entityId = this._bodies.get(resolveEntityId(entity));
    if (entityId === undefined) return;
    const v: [number, number, number] = typeof velocity === 'number' ? [0, velocity, 0] : velocity;
    if (
      this._realm.transport &&
      typeof (this._realm.transport as any).realm3dSetAngularVelocity === 'function'
    ) {
      (this._realm.transport as any).realm3dSetAngularVelocity(
        this._realm.id,
        entityId,
        v[0],
        v[1],
        v[2]
      );
    }
  }
  getLinearVelocity(entity: EntityLike): [number, number, number] {
    return this._command(entity, { type: 'velocity' })?.linear ?? [0, 0, 0];
  }
  getAngularVelocity(entity: EntityLike): [number, number, number] {
    return this._command(entity, { type: 'velocity' })?.angular ?? [0, 0, 0];
  }

  hasRigidBody(entity: EntityLike): boolean {
    const entityId = resolveEntityId(entity);
    return this._bodies.has(entityId);
  }

  applyImpulse(entity: EntityLike, impulse: [number, number, number]): void {
    const entityId = this._bodies.get(resolveEntityId(entity));
    if (entityId === undefined) return;
    if (this._realm.transport) {
      this._realm.transport.realm3dApplyImpulse(
        this._realm.id,
        entityId,
        impulse[0],
        impulse[1],
        impulse[2]
      );
    }
  }

  applyImpulseAtPoint(
    entity: EntityLike,
    impulse: [number, number, number],
    point?: [number, number, number]
  ): void {
    if (point) this._command(entity, { type: 'impulseAtPoint', impulse, point });
    else this.applyImpulse(entity, impulse);
  }

  /** Applies force for the next physics step; reapply each step for continuous force. */
  applyForce(entity: EntityLike, force: [number, number, number]): void {
    const entityId = this._bodies.get(resolveEntityId(entity));
    if (entityId === undefined) return;
    if (this._realm.transport) {
      this._realm.transport.realm3dApplyForce(
        this._realm.id,
        entityId,
        force[0],
        force[1],
        force[2]
      );
    }
  }

  applyForceAtPoint(
    entity: EntityLike,
    force: [number, number, number],
    point?: [number, number, number]
  ): void {
    if (point) this._command(entity, { type: 'forceAtPoint', force, point });
    else this.applyForce(entity, force);
  }

  applyTorque(entity: EntityLike, torque: [number, number, number]): void {
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
