import type { EcsWorld, EntityId, Realm2D } from '@galfus/engine';
import {
  createRigidBody2DComponent,
  type PhysicsCollisionEvent,
  type PhysicsEventListener,
  type PhysicsEventType,
  type PhysicsWorld2D,
  type PhysicsWorld2DOptions,
  type RigidBody2DComponent,
  type RigidBody2DDesc
} from '@galfus/physics-types';
import RAPIER from '@dimforge/rapier2d-compat';
import { BodySync2D } from './sync-bodies';
import { JointSync2D } from './sync-joints';

export class RapierPhysicsWorld2D implements PhysicsWorld2D {
  private readonly _ecsWorld: EcsWorld;
  private _rapierWorld: RAPIER.World;
  private _eventQueue: RAPIER.EventQueue;
  private readonly _bodySync: BodySync2D;
  private readonly _jointSync: JointSync2D;
  private readonly _listeners = new Map<PhysicsEventType, Set<PhysicsEventListener>>();
  private readonly _gravity: [number, number];
  private _disposed = false;
  private readonly _onDisposeCallback?: () => void;

  constructor(realm: Realm2D, options: PhysicsWorld2DOptions = {}, onDisposeCallback?: () => void) {
    this._ecsWorld = realm.world;
    const g = options.gravity ?? [0, -9.81];
    this._gravity = [g[0], g[1]];
    this._rapierWorld = new RAPIER.World({ x: g[0], y: g[1] });
    this._eventQueue = new RAPIER.EventQueue(true);
    this._bodySync = new BodySync2D(this._ecsWorld, this._rapierWorld);
    this._jointSync = new JointSync2D(this._ecsWorld, this._rapierWorld, this._bodySync);
    this._onDisposeCallback = onDisposeCallback;
  }

  get isDisposed(): boolean {
    return this._disposed;
  }

  setGravity(gravity: [number, number]): void {
    if (this._disposed) return;
    this._gravity[0] = gravity[0];
    this._gravity[1] = gravity[1];
    this._rapierWorld.gravity = { x: gravity[0], y: gravity[1] };
  }

  getGravity(): [number, number] {
    return [this._gravity[0], this._gravity[1]];
  }

  addRigidBody(entityId: EntityId, desc: RigidBody2DDesc = {}): RigidBody2DComponent {
    if (this._disposed) {
      throw new Error('Cannot add RigidBody2D to a disposed PhysicsWorld2D.');
    }
    if (this._ecsWorld.hasComponent(entityId, 'RigidBody2D')) {
      this.removeRigidBody(entityId);
    }
    const comp = createRigidBody2DComponent(desc);
    this._ecsWorld.attachComponent(entityId, comp);
    return comp;
  }

  removeRigidBody(entityId: EntityId): boolean {
    if (this._disposed) return false;
    this._jointSync.removeJointsForEntity(entityId);
    const removedRecord = this._bodySync.removeEntityBody(entityId);
    let removedComp = false;
    if (this._ecsWorld.isAlive(entityId) && this._ecsWorld.hasComponent(entityId, 'RigidBody2D')) {
      this._ecsWorld.detachComponent(entityId, 'RigidBody2D');
      removedComp = true;
    }
    return removedRecord || removedComp;
  }

  hasRigidBody(entityId: EntityId): boolean {
    if (this._disposed || !this._ecsWorld.isAlive(entityId)) return false;
    return this._ecsWorld.hasComponent(entityId, 'RigidBody2D');
  }

  applyForce(entityId: EntityId, force: [number, number]): void {
    const body = this._getOrSyncBody(entityId);
    if (!body) return;
    body.addForce({ x: force[0], y: force[1] }, true);
  }

  applyImpulse(entityId: EntityId, impulse: [number, number]): void {
    const body = this._getOrSyncBody(entityId);
    if (!body) return;
    body.applyImpulse({ x: impulse[0], y: impulse[1] }, true);
  }

  applyTorqueImpulse(entityId: EntityId, torqueImpulse: number): void {
    const body = this._getOrSyncBody(entityId);
    if (!body) return;
    body.applyTorqueImpulse(torqueImpulse, true);
  }

  setLinearVelocity(entityId: EntityId, velocity: [number, number]): void {
    const body = this._getOrSyncBody(entityId);
    if (!body) return;
    body.setLinvel({ x: velocity[0], y: velocity[1] }, true);
    const comp = this._ecsWorld.getComponent<RigidBody2DComponent>(entityId, 'RigidBody2D');
    if (comp) {
      comp.desc.linearVelocity[0] = velocity[0];
      comp.desc.linearVelocity[1] = velocity[1];
    }
  }

  getLinearVelocity(entityId: EntityId): [number, number] | undefined {
    const body = this._getOrSyncBody(entityId);
    if (!body) return undefined;
    const v = body.linvel();
    return [v.x, v.y];
  }

  setAngularVelocity(entityId: EntityId, omega: number): void {
    const body = this._getOrSyncBody(entityId);
    if (!body) return;
    body.setAngvel(omega, true);
    const comp = this._ecsWorld.getComponent<RigidBody2DComponent>(entityId, 'RigidBody2D');
    if (comp) {
      comp.desc.angularVelocity = omega;
    }
  }

  getAngularVelocity(entityId: EntityId): number | undefined {
    const body = this._getOrSyncBody(entityId);
    if (!body) return undefined;
    return body.angvel();
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
      y: this._gravity[1]
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
    if (!record && this._ecsWorld.hasComponent(entityId, 'RigidBody2D')) {
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
