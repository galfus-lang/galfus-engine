import type { EcsWorld, EntityId, Realm3D } from '@galfus/engine';
import {
  createRigidBody3DComponent,
  type PhysicsCollisionEvent,
  type PhysicsEventListener,
  type PhysicsEventType,
  type PhysicsWorld3D,
  type PhysicsWorld3DOptions,
  type RigidBody3DComponent,
  type RigidBody3DDesc
} from '@galfus/physics-types';
import RAPIER from '@dimforge/rapier3d-compat';
import { BodySync3D } from './sync-bodies';
import { JointSync3D } from './sync-joints';

export class RapierPhysicsWorld3D implements PhysicsWorld3D {
  private readonly _ecsWorld: EcsWorld;
  private _rapierWorld: RAPIER.World;
  private _eventQueue: RAPIER.EventQueue;
  private readonly _bodySync: BodySync3D;
  private readonly _jointSync: JointSync3D;
  private readonly _listeners = new Map<PhysicsEventType, Set<PhysicsEventListener>>();
  private readonly _gravity: [number, number, number];
  private _disposed = false;
  private readonly _onDisposeCallback?: () => void;

  constructor(realm: Realm3D, options: PhysicsWorld3DOptions = {}, onDisposeCallback?: () => void) {
    this._ecsWorld = realm.world;
    const g = options.gravity ?? [0, -9.81, 0];
    this._gravity = [g[0], g[1], g[2]];
    this._rapierWorld = new RAPIER.World({ x: g[0], y: g[1], z: g[2] });
    this._eventQueue = new RAPIER.EventQueue(true);
    this._bodySync = new BodySync3D(this._ecsWorld, this._rapierWorld);
    this._jointSync = new JointSync3D(this._ecsWorld, this._rapierWorld, this._bodySync);
    this._onDisposeCallback = onDisposeCallback;
  }

  get isDisposed(): boolean {
    return this._disposed;
  }

  setGravity(gravity: [number, number, number]): void {
    if (this._disposed) return;
    this._gravity[0] = gravity[0];
    this._gravity[1] = gravity[1];
    this._gravity[2] = gravity[2];
    this._rapierWorld.gravity = { x: gravity[0], y: gravity[1], z: gravity[2] };
  }

  getGravity(): [number, number, number] {
    return [this._gravity[0], this._gravity[1], this._gravity[2]];
  }

  addRigidBody(entityId: EntityId, desc: RigidBody3DDesc = {}): RigidBody3DComponent {
    if (this._disposed) {
      throw new Error('Cannot add RigidBody3D to a disposed PhysicsWorld3D.');
    }
    if (this._ecsWorld.hasComponent(entityId, 'RigidBody3D')) {
      this.removeRigidBody(entityId);
    }
    const comp = createRigidBody3DComponent(desc);
    this._ecsWorld.attachComponent(entityId, comp);
    return comp;
  }

  removeRigidBody(entityId: EntityId): boolean {
    if (this._disposed) return false;
    this._jointSync.removeJointsForEntity(entityId);
    const removedRecord = this._bodySync.removeEntityBody(entityId);
    let removedComp = false;
    if (this._ecsWorld.isAlive(entityId) && this._ecsWorld.hasComponent(entityId, 'RigidBody3D')) {
      this._ecsWorld.detachComponent(entityId, 'RigidBody3D');
      removedComp = true;
    }
    return removedRecord || removedComp;
  }

  hasRigidBody(entityId: EntityId): boolean {
    if (this._disposed || !this._ecsWorld.isAlive(entityId)) return false;
    return this._ecsWorld.hasComponent(entityId, 'RigidBody3D');
  }

  applyForce(entityId: EntityId, force: [number, number, number]): void {
    const body = this._getOrSyncBody(entityId);
    if (!body) return;
    body.addForce({ x: force[0], y: force[1], z: force[2] }, true);
  }

  applyForceAtPoint(
    entityId: EntityId,
    force: [number, number, number],
    point: [number, number, number]
  ): void {
    const body = this._getOrSyncBody(entityId);
    if (!body) return;
    body.addForceAtPoint(
      { x: force[0], y: force[1], z: force[2] },
      { x: point[0], y: point[1], z: point[2] },
      true
    );
  }

  applyImpulse(entityId: EntityId, impulse: [number, number, number]): void {
    const body = this._getOrSyncBody(entityId);
    if (!body) return;
    body.applyImpulse({ x: impulse[0], y: impulse[1], z: impulse[2] }, true);
  }

  applyImpulseAtPoint(
    entityId: EntityId,
    impulse: [number, number, number],
    point: [number, number, number]
  ): void {
    const body = this._getOrSyncBody(entityId);
    if (!body) return;
    body.applyImpulseAtPoint(
      { x: impulse[0], y: impulse[1], z: impulse[2] },
      { x: point[0], y: point[1], z: point[2] },
      true
    );
  }

  applyTorque(entityId: EntityId, torque: [number, number, number]): void {
    const body = this._getOrSyncBody(entityId);
    if (!body) return;
    body.addTorque({ x: torque[0], y: torque[1], z: torque[2] }, true);
  }

  applyTorqueImpulse(entityId: EntityId, torqueImpulse: [number, number, number]): void {
    const body = this._getOrSyncBody(entityId);
    if (!body) return;
    body.applyTorqueImpulse(
      { x: torqueImpulse[0], y: torqueImpulse[1], z: torqueImpulse[2] },
      true
    );
  }

  setLinearVelocity(entityId: EntityId, velocity: [number, number, number]): void {
    const body = this._getOrSyncBody(entityId);
    if (!body) return;
    body.setLinvel({ x: velocity[0], y: velocity[1], z: velocity[2] }, true);
    const comp = this._ecsWorld.getComponent<RigidBody3DComponent>(entityId, 'RigidBody3D');
    if (comp) {
      comp.desc.linearVelocity[0] = velocity[0];
      comp.desc.linearVelocity[1] = velocity[1];
      comp.desc.linearVelocity[2] = velocity[2];
    }
  }

  getLinearVelocity(entityId: EntityId): [number, number, number] | undefined {
    const body = this._getOrSyncBody(entityId);
    if (!body) return undefined;
    const v = body.linvel();
    return [v.x, v.y, v.z];
  }

  setAngularVelocity(entityId: EntityId, omega: [number, number, number]): void {
    const body = this._getOrSyncBody(entityId);
    if (!body) return;
    body.setAngvel({ x: omega[0], y: omega[1], z: omega[2] }, true);
    const comp = this._ecsWorld.getComponent<RigidBody3DComponent>(entityId, 'RigidBody3D');
    if (comp) {
      comp.desc.angularVelocity[0] = omega[0];
      comp.desc.angularVelocity[1] = omega[1];
      comp.desc.angularVelocity[2] = omega[2];
    }
  }

  getAngularVelocity(entityId: EntityId): [number, number, number] | undefined {
    const body = this._getOrSyncBody(entityId);
    if (!body) return undefined;
    const w = body.angvel();
    return [w.x, w.y, w.z];
  }

  isSleeping(entityId: EntityId): boolean {
    const body = this._getOrSyncBody(entityId);
    return body ? body.isSleeping() : false;
  }

  wakeUp(entityId: EntityId): void {
    const body = this._getOrSyncBody(entityId);
    body?.wakeUp();
  }

  on(type: PhysicsEventType, listener: PhysicsEventListener): () => void {
    let set = this._listeners.get(type);
    if (!set) {
      set = new Set();
      this._listeners.set(type, set);
    }
    set.add(listener);
    return () => {
      set.delete(listener);
    };
  }

  step(dt: number): void {
    if (this._disposed || dt <= 0) return;

    this._bodySync.syncBeforeStep();
    this._jointSync.syncBeforeStep();

    this._rapierWorld.timestep = dt;
    this._rapierWorld.step(this._eventQueue);

    this._bodySync.syncAfterStep();
    this._bodySync.drainCollisionEvents(this._eventQueue, (event) => this._emit(event));
  }

  interpolate(alpha: number): void {
    if (this._disposed) return;
    this._bodySync.interpolate(alpha);
  }

  reset(): void {
    if (this._disposed) return;
    this._jointSync.releaseAllManagedFlags();
    this._eventQueue.free();
    this._rapierWorld.free();

    this._rapierWorld = new RAPIER.World({
      x: this._gravity[0],
      y: this._gravity[1],
      z: this._gravity[2]
    });
    this._eventQueue = new RAPIER.EventQueue(true);
    this._bodySync.setRapierWorld(this._rapierWorld);
    this._jointSync.setRapierWorld(this._rapierWorld);
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    this._onDisposeCallback?.();
    this._jointSync.releaseAllManagedFlags();
    this._listeners.clear();
    this._bodySync.records.clear();
    this._bodySync.colliderMetaByHandle.clear();
    this._eventQueue.free();
    this._rapierWorld.free();
  }

  private _getOrSyncBody(entityId: EntityId): RAPIER.RigidBody | undefined {
    if (this._disposed || !this._ecsWorld.isAlive(entityId)) return undefined;
    let record = this._bodySync.records.get(entityId);
    if (!record && this._ecsWorld.hasComponent(entityId, 'RigidBody3D')) {
      this._bodySync.syncBeforeStep();
      record = this._bodySync.records.get(entityId);
    }
    return record?.body;
  }

  private _emit(event: PhysicsCollisionEvent): void {
    const set = this._listeners.get(event.type);
    if (!set || set.size === 0) return;
    for (const listener of set) {
      listener(event);
    }
  }
}
