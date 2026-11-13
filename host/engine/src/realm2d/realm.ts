/**
 * High-level Realm2D manager combining an ECS World, Anchor solver, and core sync.
 */

import type {
  Camera2DDesc,
  GalfusEngine,
  Light2DDesc,
  Material2DDesc,
  Model2DUIDesc,
  ParticleEmitter2DDesc,
  Shadow2DConfigDesc,
  Shape2DDesc,
  Sprite2DDesc,
  TransitionConfig,
  UiCommandDesc
} from '@galfus/transport-types';
import { assertValidLogicalId } from '@galfus/transport-types';
import type { Transform2DProps } from '../anchors/component';
import { HierarchyCoordinator } from '../anchors/hierarchy';
import { translateColliderHits } from '../collision/transport-hits';
import { AnchorSolveSystem } from '../anchors/solver';
import type { AnimationCoordinator } from '../animation/coordinator';
import { Collider2DComponent, type ColliderOptions } from '../collision/components';
import { queryPoint2D, raycast2D } from '../collision/query2d';
import type { EntityId } from '../ecs/entity';
import type { SystemContext } from '../ecs/system';
import { EcsWorld } from '../ecs/world';
import type { RealmConnector, RealmId, RealmKind } from '../multiverse/realm';
import { PhysicsWorld2D } from '../physics/index';
import type { TransitionId } from '../types';

import {
  createCamera2D,
  createLight2D,
  createModel2D,
  createModel2DUI,
  createParticleEmitter2D,
  createShape2D,
  createSprite2D,
  type Model2DUIComponent,
  type ParticleEmitter2DComponent
} from './components';
import { Realm2DSyncSystem } from './sync';

export class Realm2D implements RealmConnector {
  readonly realmKind: RealmKind = '2d';
  readonly realmId: RealmId;
  readonly world = new EcsWorld();
  readonly solver = new AnchorSolveSystem();
  readonly syncSystem: Realm2DSyncSystem;
  readonly hierarchy: HierarchyCoordinator<'2d'>;

  private _engine: GalfusEngine | null = null;
  private _physics: PhysicsWorld2D | null = null;
  private _nextResourceLogicalId = 1;
  private _preRenderSteppedFrame = -1;
  private _disposed = false;
  private readonly _materials = new Map<number, Material2DDesc>();

  constructor(realmId: RealmId | number) {
    this.realmId = realmId as RealmId;
    assertValidLogicalId(this.realmId, 'RealmId');
    this.hierarchy = new HierarchyCoordinator(this.world, '2d');
    this.syncSystem = new Realm2DSyncSystem(this.realmId, this.solver.cache);
    this._registerInternalSystems();
  }

  private _registerInternalSystems(): void {
    this.world.addSystem('preRender', this.solver.createSystem(), { kind: 'anchor' });
  }

  get id(): number {
    return this.realmId;
  }

  get transport(): GalfusEngine | null {
    return this._engine;
  }

  get physics(): PhysicsWorld2D {
    if (!this._physics) {
      this._physics = new PhysicsWorld2D(this);
    }
    return this._physics;
  }
  set physics(val: PhysicsWorld2D) {
    if (this._physics !== val) this._physics?.dispose();
    this._physics = val;
  }

  get isDisposed(): boolean {
    return this._disposed;
  }

  allocateResourceId(): number {
    const id = this._nextResourceLogicalId++;
    assertValidLogicalId(id, 'ResourceId');
    return id;
  }

  bindEngine(engine: GalfusEngine): void {
    if (this._disposed) return;
    this._engine = engine;
    this.hierarchy.bindEngine(engine, this.realmId);
    engine.realm2dCreate(this.realmId);
  }

  preRender(context: SystemContext): void {
    if (this._disposed) return;
    this.world.stepPreRender(context);
    this._preRenderSteppedFrame = context.frameId;
  }

  sync(context: SystemContext): void {
    if (this._disposed) return;
    if (this._preRenderSteppedFrame !== context.frameId) {
      this.preRender(context);
    }
    if (this._engine) {
      this.syncSystem.sync(this.world, this._engine, this._materials);
    }
  }

  postRender(context: SystemContext): void {
    if (this._disposed) return;
    this.world.stepPostRender(context);
  }

  flush(): void {
    if (this._disposed) return;
    if (this._engine) {
      this.solver.solve(this.world, { time: 0, dt: 0, frameId: 0, engine: this._engine });
      this.syncSystem.sync(this.world, this._engine, this._materials);
    }
  }

  reset(): void {
    if (this._disposed) throw new Error('Cannot reset a disposed Realm2D.');
    this.world.reset();
    this.hierarchy.reset();
    this.solver.cache.clear();
    this._materials.clear();
    this._preRenderSteppedFrame = -1;
    this._registerInternalSystems();
    if (this._engine) {
      this.syncSystem.dispose(this._engine);
      this._engine.realm2dDestroy(this.realmId);
      this._engine.realm2dCreate(this.realmId);
    }
    this._physics?.reset();
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    this._physics?.dispose();
    this.hierarchy.reset();
    this.syncSystem.dispose(this._engine);
    if (this._engine) {
      this._engine.realm2dDestroy(this.realmId);
    }
    this._engine = null;
    this.world.reset();
    this.solver.cache.clear();
    this._materials.clear();
  }

  /** Adds a collider to an entity with a matching Model component. */
  addCollider(
    entityId: EntityId,
    shape: import('../collision/components').ColliderShape2D,
    options?: ColliderOptions
  ): number {
    if (!this.world.isAlive(entityId) || !this.world.hasComponent(entityId, 'Model2D'))
      throw new Error('Collider requires a live entity with Model2D.');
    const existing = this.world.getComponent<Collider2DComponent>(entityId, 'Collider2D');
    const component = existing ?? new Collider2DComponent();
    const id = this.allocateResourceId();
    component.add(id, shape, options);
    if (!existing) this.world.attachComponent(entityId, component);
    return id;
  }

  queryPoint(point: [number, number], mask = 0xffffffff) {
    if (this._disposed) throw new Error('Cannot query a disposed Realm2D.');
    if (
      this._engine &&
      'realm2dQueryPoint' in this._engine &&
      typeof this._engine.realm2dQueryPoint === 'function'
    ) {
      const res = this._engine.realm2dQueryPoint(this.realmId, point[0], point[1], mask);
      if (typeof res === 'string') {
        try {
          return translateColliderHits(this.world, '2D', JSON.parse(res));
        } catch {
          return [];
        }
      }
      if (Array.isArray(res)) return translateColliderHits(this.world, '2D', res);
    }
    this.solver.solve(this.world, { time: 0, dt: 0, frameId: 0 });
    return queryPoint2D(this.world, point, mask);
  }
  raycast(
    origin: [number, number],
    direction: [number, number],
    maxDistance: number,
    mask = 0xffffffff
  ) {
    if (this._disposed) throw new Error('Cannot query a disposed Realm2D.');
    if (
      this._engine &&
      'realm2dRaycast' in this._engine &&
      typeof this._engine.realm2dRaycast === 'function'
    ) {
      const res = this._engine.realm2dRaycast(
        this.realmId,
        origin[0],
        origin[1],
        direction[0],
        direction[1],
        maxDistance,
        mask
      );
      if (typeof res === 'string') {
        try {
          return translateColliderHits(this.world, '2D', JSON.parse(res));
        } catch {
          return [];
        }
      }
      if (Array.isArray(res)) return translateColliderHits(this.world, '2D', res);
    }
    this.solver.solve(this.world, { time: 0, dt: 0, frameId: 0 });
    return raycast2D(this.world, origin, direction, maxDistance, mask);
  }

  destroyEntity(entityId: EntityId): boolean {
    if (!this.world.isAlive(entityId)) return false;
    this.hierarchy.detach(entityId);
    this.hierarchy.handleTargetDestroyed(entityId);
    this._physics?.removeRigidBody(entityId);
    this.solver.cache.remove(entityId);
    return this.world.destroyEntity(entityId);
  }

  // ---------------------------------------------------------------------------
  // Fluent Entity Spawning Helpers
  // ---------------------------------------------------------------------------
  /**
   * Creates a pure 2D spatial node holding Model2DComponent without visual attachment.
   */
  createSpatialNode(transform?: Transform2DProps): EntityId {
    const entityId = this.world.createEntity();
    const modelId = this.allocateResourceId();
    const model = createModel2D(modelId);
    if (transform) {
      model.setTRS(transform.position, transform.rotation, transform.scale);
      model.zLayer = transform.zLayer ?? 0;
      model.drawOrder = transform.drawOrder ?? 0;
    }
    this.world.attachComponent(entityId, model);
    return entityId;
  }

  createSprite(desc: Sprite2DDesc, transform?: Transform2DProps): EntityId {
    const entityId = this.world.createEntity();
    const spriteId = this.allocateResourceId();

    const model = createModel2D(spriteId);
    if (transform) {
      model.setTRS(transform.position, transform.rotation, transform.scale);
      model.zLayer = transform.zLayer ?? 0;
      model.drawOrder = transform.drawOrder ?? 0;
    }
    this.world.attachComponent(entityId, model);
    this.world.attachComponent(entityId, createSprite2D(spriteId, desc));
    return entityId;
  }

  createShape(desc: Shape2DDesc, transform?: Transform2DProps): EntityId {
    const entityId = this.world.createEntity();
    const shapeId = this.allocateResourceId();

    const model = createModel2D(shapeId);
    if (transform) {
      model.setTRS(transform.position, transform.rotation, transform.scale);
      model.zLayer = transform.zLayer ?? 0;
      model.drawOrder = transform.drawOrder ?? 0;
    }
    this.world.attachComponent(entityId, model);
    this.world.attachComponent(entityId, createShape2D(shapeId, desc));
    return entityId;
  }

  createLight(desc: Light2DDesc, transform?: Transform2DProps): EntityId {
    const entityId = this.world.createEntity();
    const lightId = this.allocateResourceId();
    const model = createModel2D(lightId);
    if (transform) {
      model.setTRS(transform.position, transform.rotation, transform.scale);
      model.zLayer = transform.zLayer ?? 0;
      model.drawOrder = transform.drawOrder ?? 0;
    }
    this.world.attachComponent(entityId, model);
    this.world.attachComponent(entityId, createLight2D(lightId, desc));
    return entityId;
  }

  createCamera(
    desc: Camera2DDesc,
    transform?: Transform2DProps
  ): { entityId: EntityId; cameraId: number } {
    const entityId = this.world.createEntity();
    const cameraId = this.allocateResourceId();
    const model = createModel2D(cameraId);
    if (transform) {
      model.setTRS(transform.position, transform.rotation, transform.scale);
    }
    this.world.attachComponent(entityId, model);
    this.world.attachComponent(entityId, createCamera2D(cameraId, desc));
    return { entityId, cameraId };
  }

  createUi(
    desc: Model2DUIDesc,
    transform?: Transform2DProps
  ): { entityId: EntityId; uiId: number } {
    const entityId = this.world.createEntity();
    const uiId = this.allocateResourceId();

    const model = createModel2D(uiId);
    if (transform) {
      model.setTRS(transform.position, transform.rotation, transform.scale);
      model.zLayer = transform.zLayer ?? 0;
      model.drawOrder = transform.drawOrder ?? 0;
    }
    this.world.attachComponent(entityId, model);
    this.world.attachComponent(entityId, createModel2DUI(uiId, desc));
    return { entityId, uiId };
  }

  setUiContent(handle: { entityId: EntityId; uiId: number }, desc: Model2DUIDesc): void {
    const comp = this.world.getComponent<Model2DUIComponent>(handle.entityId, 'Model2DUI');
    if (comp) {
      comp.desc = desc;
      comp.isDirty = true;
      comp.pendingCommands.length = 0;
    }
  }

  /** Queues an atomic batch of mutations against the core-owned UI tree. */
  applyUiCommands(
    handle: { entityId: EntityId; uiId: number },
    commands: readonly UiCommandDesc[]
  ): void {
    const comp = this.world.getComponent<Model2DUIComponent>(handle.entityId, 'Model2DUI');
    if (!comp || comp.uiId !== handle.uiId) throw new Error('UI model does not exist.');
    if (commands.length > 0) comp.pendingCommands.push(structuredClone([...commands]));
  }

  destroyUi(handle: { entityId: EntityId; uiId: number }): void {
    this.world.destroyEntity(handle.entityId);
  }

  // ---------------------------------------------------------------------------
  // 2D Polar Shadows, Fonts & Materials
  // ---------------------------------------------------------------------------
  setShadowConfig(config: Shadow2DConfigDesc): void {
    if (this._engine) {
      this._engine.realm2dSetShadowConfig(this.realmId, config);
    }
  }

  loadFontData(data: Uint8Array): string {
    if (!this._engine) {
      throw new Error('Cannot load font: Realm2D is not bound to an engine instance.');
    }
    return this._engine.realm2dLoadFontData(this.realmId, data, data.byteLength);
  }

  /** Registers a material for upload during the next sync or flush. */
  createMaterial(desc: Material2DDesc): number {
    const materialId = this.allocateResourceId();
    this._materials.set(materialId, desc);
    return materialId;
  }

  /** Removes a material on the next sync or flush; entities referencing it are not destroyed. */
  destroyMaterial(materialId: number): void {
    this._materials.delete(materialId);
  }

  // ---------------------------------------------------------------------------
  // 2D Particle Emitters
  // ---------------------------------------------------------------------------
  createParticleEmitter(
    desc: ParticleEmitter2DDesc,
    transform?: Transform2DProps
  ): { entityId: EntityId; emitterId: number } {
    const entityId = this.world.createEntity();
    const emitterId = this.allocateResourceId();
    const model = createModel2D(emitterId);
    if (transform) {
      model.setTRS(transform.position, transform.rotation, transform.scale);
      model.zLayer = transform.zLayer ?? 0;
      model.drawOrder = transform.drawOrder ?? 0;
    }
    this.world.attachComponent(entityId, model);
    this.world.attachComponent(entityId, createParticleEmitter2D(emitterId, desc));
    return { entityId, emitterId };
  }

  particleEmitterBurst(
    emitter: number | { emitterId?: number; entityId?: EntityId },
    count: number
  ): void {
    const emitterId =
      typeof emitter === 'number'
        ? (this.world.getComponent<ParticleEmitter2DComponent>(
            emitter as EntityId,
            'ParticleEmitter2D'
          )?.emitterId ?? emitter)
        : (emitter.emitterId ??
          (emitter.entityId
            ? this.world.getComponent<ParticleEmitter2DComponent>(
                emitter.entityId,
                'ParticleEmitter2D'
              )?.emitterId
            : undefined));
    if (emitterId === undefined) {
      throw new Error(
        'Cannot resolve ParticleEmitter2D ID: entity does not have a ParticleEmitter2DComponent.'
      );
    }
    if (this._engine) {
      if (!this.syncSystem.isEmitterSynced(emitterId)) {
        this.flush();
      }
      this._engine.realm2dParticleEmitterBurst(this.realmId, emitterId, count);
    }
  }

  /**
   * Helper to animate a 2D model transform directly through ECS.
   */
  animateModel(
    entityId: EntityId,
    targetValue: unknown,
    config: TransitionConfig,
    animation: AnimationCoordinator
  ): TransitionId | undefined {
    return animation.animateEcsProperty(this.world, entityId, 'transform2d', targetValue, config);
  }
}
