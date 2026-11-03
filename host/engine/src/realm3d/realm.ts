/**
 * High-level Realm3D manager combining an ECS World, Anchor solver, and core sync.
 */

import type {
  Camera3DDesc,
  CameraLookAt3D,
  CameraLookAt3DStateDesc,
  EnvironmentRealm3DDesc,
  GalfusEngine,
  InstancedModel3DDesc,
  Light3DDesc,
  Material3DDesc,
  Model3DDesc,
  ParticleEmitter3DDesc,
  Portal3DDesc,
  TransitionConfig
} from '@galfus/transport-types';
import { assertValidLogicalId } from '@galfus/transport-types';
import type { Transform3DProps } from '../anchors/component';
import { HierarchyCoordinator } from '../anchors/hierarchy';
import { AnchorSolveSystem } from '../anchors/solver';
import type { AnimationCoordinator } from '../animation/coordinator';
import { createAnimationPlaybackSystem } from '../animation/player';
import { Collider3DComponent, type ColliderOptions } from '../collision/components';
import { raycast3D } from '../collision/query3d';
import type { EntityId } from '../ecs/entity';
import { RESERVED_PRIORITY_INTERNAL_RESOLVERS, type SystemContext } from '../ecs/system';
import { EcsWorld } from '../ecs/world';
import type { RealmConnector, RealmId, RealmKind } from '../multiverse/realm';
import { ResourceManager } from '../resources/manager';
import type { TransitionId } from '../types';
import {
  createCamera3D,
  createInstancedModel3D,
  createLight3D,
  createMesh3D,
  createModel3D,
  createParticleEmitter3D,
  createPortal3D,
  createSkin3D,
  type GeometryResourceEntry,
  type MaterialResourceEntry,
  type Mesh3DComponent,
  type Mesh3DDesc,
  type Model3DComponent,
  type Primitive3DKind
} from './components';
import {
  type GeometryData,
  type MorphTargetData,
  packGeometryData,
  prepareMorphTargets
} from './geometry';
import * as primitives from './primitive-factory';
import { resolveCameraId, resolveEmitterId, storeCameraLookAt } from './resource-ids';
import { SkinningSolveSystem } from './skinning';
import { type Realm3DResourceProvider, Realm3DSyncSystem } from './sync';

export class Realm3D implements RealmConnector, Realm3DResourceProvider {
  readonly realmKind: RealmKind = '3d';
  readonly realmId: RealmId;
  readonly world = new EcsWorld();
  readonly solver = new AnchorSolveSystem();
  readonly skinningSystem: SkinningSolveSystem;
  readonly syncSystem: Realm3DSyncSystem;
  resources: ResourceManager = new ResourceManager();
  readonly hierarchy: HierarchyCoordinator<'3d'>;

  private readonly _geometries = new Map<number, GeometryResourceEntry>();
  private readonly _pendingMorphWeights = new Map<number, Float32Array>();
  private readonly _materials = new Map<number, MaterialResourceEntry>();
  private _engine: GalfusEngine | null = null;
  private _nextResourceLogicalId = 1;
  private _preRenderSteppedFrame = -1;
  private _disposed = false;

  constructor(realmId: RealmId | number) {
    this.realmId = realmId as RealmId;
    assertValidLogicalId(this.realmId, 'RealmId');
    this.hierarchy = new HierarchyCoordinator(this.world, '3d');
    this.skinningSystem = new SkinningSolveSystem(this.realmId, this.solver.cache);
    this.syncSystem = new Realm3DSyncSystem(this.realmId, this.solver.cache);
    this._registerInternalSystems();
  }

  private _registerInternalSystems(): void {
    this.world.addSystem('update', createAnimationPlaybackSystem(this), { kind: 'ordinary' });
    this.world.addSystem('preRender', this.solver.createSystem(), { kind: 'anchor' });
    this.world.addSystem(
      'preRender',
      this.skinningSystem.createSystem(() => this._engine),
      { kind: 'sync', priority: RESERVED_PRIORITY_INTERNAL_RESOLVERS }
    );
  }

  get isDisposed(): boolean {
    return this._disposed;
  }

  getGeometries(): Iterable<GeometryResourceEntry> {
    return this._geometries.values();
  }

  getMaterials(): Iterable<MaterialResourceEntry> {
    return this._materials.values();
  }

  allocateResourceId(): number {
    const id = this._nextResourceLogicalId++;
    assertValidLogicalId(id, 'ResourceId');
    return id;
  }

  bindEngine(engine: GalfusEngine): void {
    if (this._disposed) return;
    this._engine = engine;
    this.resources.bindEngine(engine);
    engine.realm3dCreate(this.realmId);
  }

  destroyInstancedModel(instancedModelId: number): void {
    this._engine?.realm3dDestroyInstancedModel(this.realmId, instancedModelId);
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
      this.syncSystem.sync(this.world, this._engine, this);
      for (const [modelId, weights] of this._pendingMorphWeights) {
        this._engine.realm3dSetModelMorphWeights(this.realmId, modelId, weights, weights.length);
      }
      this._pendingMorphWeights.clear();
    }
  }

  postRender(context: SystemContext): void {
    if (this._disposed) return;
    this.world.stepPostRender(context);
  }

  reset(): void {
    if (this._disposed) throw new Error('Cannot reset a disposed Realm3D.');
    this.world.reset();
    this.solver.cache.clear();
    this._geometries.clear();
    this._materials.clear();
    this._pendingMorphWeights.clear();
    this._preRenderSteppedFrame = -1;
    this._registerInternalSystems();
    if (this._engine) {
      this.syncSystem.dispose(this._engine);
      this._engine.realm3dDestroy(this.realmId);
      this._engine.realm3dCreate(this.realmId);
    }
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    this.syncSystem.dispose(this._engine);
    if (this._engine) {
      this._engine.realm3dDestroy(this.realmId);
    }
    this._engine = null;
    this.world.reset();
    this.solver.cache.clear();
    this._geometries.clear();
    this._materials.clear();
    this._pendingMorphWeights.clear();
  }

  /** Adds a collider to an entity with a matching Model component. */
  addCollider(
    entityId: EntityId,
    shape: import('../collision/components').ColliderShape3D,
    options?: ColliderOptions
  ): number {
    if (!this.world.isAlive(entityId) || !this.world.hasComponent(entityId, 'Model3D'))
      throw new Error('Collider requires a live entity with Model3D.');
    const existing = this.world.getComponent<Collider3DComponent>(entityId, 'Collider3D');
    const component = existing ?? new Collider3DComponent();
    const id = this.allocateResourceId();
    component.add(id, shape, options);
    if (!existing) this.world.attachComponent(entityId, component);
    return id;
  }

  raycast(
    origin: [number, number, number],
    direction: [number, number, number],
    maxDistance: number,
    mask = 0xffffffff
  ) {
    if (this._disposed) throw new Error('Cannot query a disposed Realm3D.');
    this.solver.solve(this.world, { time: 0, dt: 0, frameId: 0 });
    return raycast3D(this.world, origin, direction, maxDistance, mask);
  }

  destroyEntity(entityId: EntityId): boolean {
    if (!this.world.isAlive(entityId)) return false;
    const model = this.world.getComponent<Model3DComponent>(entityId, 'Model3D');
    if (model) this._pendingMorphWeights.delete(model.modelId);
    this.hierarchy.detach(entityId);
    this.hierarchy.handleTargetDestroyed(entityId);
    this.solver.cache.remove(entityId);
    return this.world.destroyEntity(entityId);
  }

  flush(): void {
    if (this._engine) {
      this.solver.solve(this.world, { time: 0, dt: 0, frameId: 0, engine: this._engine });
      this.syncSystem.sync(this.world, this._engine, this);
    }
  }

  // Resource Management (Geometries & Materials outside ECS)
  createMaterial(desc: Material3DDesc): { materialId: number } {
    const materialId = this.allocateResourceId();
    this._materials.set(materialId, { materialId, desc, isDirty: true });
    return { materialId };
  }

  destroyMaterial(materialId: number): void {
    this._materials.delete(materialId);
    this._engine?.realm3dDestroyMaterial(this.realmId, materialId);
  }

  createGeometry(data: GeometryData | Primitive3DKind): { geometryId: number } {
    const geometryId = this.allocateResourceId();
    const primitive: Primitive3DKind =
      'positions' in data ? { kind: 'custom', ...packGeometryData(data) } : data;
    this._geometries.set(geometryId, { geometryId, primitive, isDirty: true });
    return { geometryId };
  }

  destroyGeometry(geometryId: number): void {
    this._geometries.delete(geometryId);
    this._engine?.realm3dDestroyGeometry(this.realmId, geometryId);
  }

  // Fluent Entity Spawning Helpers
  private _attachModel(
    entityId: EntityId,
    id: number,
    transform?: Transform3DProps
  ): Model3DComponent {
    const model = createModel3D(id);
    if (transform) {
      model.setTRS(transform.position, transform.rotation, transform.scale);
    }
    this.world.attachComponent(entityId, model);
    return model;
  }

  /**
   * Creates a pure spatial node with Model3DComponent (no Mesh attached).
   */
  createSpatialNode(transform?: Transform3DProps): EntityId {
    const entityId = this.world.createEntity();
    this._attachModel(entityId, this.allocateResourceId(), transform);
    return entityId;
  }

  /**
   * Creates a renderable entity with Model3DComponent and Mesh3DComponent attached.
   */
  createModel(desc: Model3DDesc, transform?: Transform3DProps): EntityId {
    const entityId = this.world.createEntity();
    const model = this._attachModel(entityId, this.allocateResourceId(), transform);
    const mesh = createMesh3D(model.modelId, model.modelId, desc);
    this.world.attachComponent(entityId, mesh);
    return entityId;
  }

  /**
   * Attaches a Mesh3D rendering component to an existing spatial node entity.
   */
  createMesh(entityId: EntityId, desc: Mesh3DDesc): Mesh3DComponent {
    const model = this.world.getComponent<Model3DComponent>(entityId, 'Model3D');
    if (!model) {
      throw new Error(`Cannot attach Mesh3D: Entity ${entityId} does not have a Model3DComponent.`);
    }
    const meshId = this.allocateResourceId();
    const mesh = createMesh3D(meshId, model.modelId, desc);
    this.world.attachComponent(entityId, mesh);
    return mesh;
  }

  createSkin(
    modelEntityId: EntityId,
    joints: EntityId[],
    inverseBindMatrices: Float32Array
  ): { entityId: EntityId; skinId: number } {
    const entityId = this.world.createEntity(),
      skinId = this.allocateResourceId();
    this.world.attachComponent(
      entityId,
      createSkin3D(skinId, modelEntityId, joints, inverseBindMatrices)
    );
    return { entityId, skinId };
  }

  createCamera(
    desc: Camera3DDesc,
    transform?: Transform3DProps
  ): { entityId: EntityId; cameraId: number } {
    const entityId = this.world.createEntity(),
      cameraId = this.allocateResourceId();
    this._attachModel(entityId, cameraId, transform);
    this.world.attachComponent(entityId, createCamera3D(cameraId, desc));
    return { entityId, cameraId };
  }

  createLight(desc: Light3DDesc, transform?: Transform3DProps): EntityId {
    const entityId = this.world.createEntity(),
      lightId = this.allocateResourceId();
    this._attachModel(entityId, lightId, transform);
    this.world.attachComponent(entityId, createLight3D(lightId, desc));
    return entityId;
  }

  createPrimitive(
    primitive: Primitive3DKind,
    matId: number,
    t?: Transform3DProps,
    mesh?: Partial<Model3DDesc>
  ) {
    return primitives.createPrimitiveModel(this, primitive, matId, t, mesh);
  }

  createCube(size: number, mat: number, t?: Transform3DProps, m?: Partial<Model3DDesc>) {
    return primitives.createCube(this, size, mat, t, m);
  }

  createPlane(w: number, d: number, mat: number, t?: Transform3DProps, m?: Partial<Model3DDesc>) {
    return primitives.createPlane(this, w, d, mat, t, m);
  }

  createSphere(
    r: number,
    rg: number,
    s: number,
    mat: number,
    t?: Transform3DProps,
    m?: Partial<Model3DDesc>
  ) {
    return primitives.createSphere(this, r, rg, s, mat, t, m);
  }

  createCylinder(
    r: number,
    h: number,
    s: number,
    mat: number,
    t?: Transform3DProps,
    m?: Partial<Model3DDesc>
  ) {
    return primitives.createCylinder(this, r, h, s, mat, t, m);
  }

  createCapsule(
    r: number,
    ch: number,
    rg: number,
    s: number,
    mat: number,
    t?: Transform3DProps,
    m?: Partial<Model3DDesc>
  ) {
    return primitives.createCapsule(this, r, ch, rg, s, mat, t, m);
  }

  createPyramid(
    w: number,
    d: number,
    h: number,
    mat: number,
    t?: Transform3DProps,
    m?: Partial<Model3DDesc>
  ) {
    return primitives.createPyramid(this, w, d, h, mat, t, m);
  }

  createTorus(
    majR: number,
    minR: number,
    majS: number,
    minS: number,
    mat: number,
    t?: Transform3DProps,
    m?: Partial<Model3DDesc>
  ) {
    return primitives.createTorus(this, majR, minR, majS, minS, mat, t, m);
  }

  createCustomGeometry(
    top: number,
    vData: Uint8Array,
    idx: Uint32Array,
    mat: number,
    t?: Transform3DProps,
    m?: Partial<Model3DDesc>
  ) {
    return primitives.createCustomGeometry(this, top, vData, idx, mat, t, m);
  }

  // Camera LookAt, Environment & Debug Gizmos
  setCameraLookAt(
    camera: number | { cameraId?: number; entityId?: EntityId },
    lookAt: CameraLookAt3D
  ): void {
    const cameraId = resolveCameraId(this.world, camera);
    if (this._engine) {
      if (!this.syncSystem.isCameraSynced(cameraId)) this.flush();
      this._engine.realm3dSetCameraLookAt(this.realmId, cameraId, lookAt);
      storeCameraLookAt(this.world, cameraId, lookAt);
    }
  }

  getCameraLookAt(cameraId: number): CameraLookAt3DStateDesc | undefined {
    return this._engine?.realm3dGetCameraLookAt(this.realmId, cameraId);
  }

  clearCameraLookAt(cameraId: number): void {
    if (!this._engine) return;
    this._engine.realm3dClearCameraLookAt(this.realmId, cameraId);
    storeCameraLookAt(this.world, cameraId);
  }

  setEnvironment(environment: EnvironmentRealm3DDesc): void {
    this._engine?.realm3dSetEnvironment(this.realmId, environment);
  }

  drawLine(
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    r: number,
    g: number,
    b: number,
    a: number
  ): void {
    this._engine?.realm3dDrawLine(this.realmId, x0, y0, z0, x1, y1, z1, r, g, b, a);
  }

  drawAabb(
    minX: number,
    minY: number,
    minZ: number,
    maxX: number,
    maxY: number,
    maxZ: number,
    r: number,
    g: number,
    b: number,
    a: number
  ): void {
    this._engine?.realm3dDrawAabb(this.realmId, minX, minY, minZ, maxX, maxY, maxZ, r, g, b, a);
  }

  clearGizmos(): void {
    this._engine?.realm3dClearGizmos(this.realmId);
  }

  // Particles, Portals & Advanced Mesh Features
  createParticleEmitter(
    desc: ParticleEmitter3DDesc,
    transform?: Transform3DProps
  ): { entityId: EntityId; emitterId: number } {
    const entityId = this.world.createEntity();
    const emitterId = this.allocateResourceId();
    this._attachModel(entityId, emitterId, transform);
    this.world.attachComponent(entityId, createParticleEmitter3D(emitterId, desc));
    return { entityId, emitterId };
  }

  particleEmitterBurst(
    emitter: number | { emitterId?: number; entityId?: EntityId },
    count: number
  ): void {
    const emitterId = resolveEmitterId(this.world, emitter);
    if (this._engine) {
      if (!this.syncSystem.isEmitterSynced(emitterId)) this.flush();
      this._engine.realm3dParticleEmitterBurst(this.realmId, emitterId, count);
    }
  }

  createPortal(desc: Portal3DDesc): EntityId {
    const entityId = this.world.createEntity();
    const portalId = this.allocateResourceId();
    this.world.attachComponent(entityId, createPortal3D(portalId, desc));
    return entityId;
  }

  setPortalActive(portalId: number, active: boolean): void {
    this._engine?.realm3dSetPortalActive(this.realmId, portalId, active);
  }

  createInstancedModel(desc: InstancedModel3DDesc): EntityId {
    const entityId = this.world.createEntity();
    const instancedModelId = this.allocateResourceId();
    this.world.attachComponent(entityId, createInstancedModel3D(instancedModelId, desc));
    return entityId;
  }

  setInstancedModelData(instancedModelId: number, data: Float32Array): void {
    this._engine?.realm3dSetInstancedModelData(this.realmId, instancedModelId, data, data.length);
  }

  setModelMorphWeights(modelId: number, weights: Float32Array): void {
    this._pendingMorphWeights.set(modelId, new Float32Array(weights));
  }

  setGeometryMorphTargets(
    geometryId: number,
    targetData: Uint8Array | MorphTargetData[],
    vertexCount?: number
  ): void {
    const geometry = this._geometries.get(geometryId);
    if (!geometry) throw new Error(`Unknown geometry ${geometryId}`);
    const vertexBytes =
      geometry.primitive.kind === 'custom' ? geometry.primitive.vertexData.byteLength : undefined;
    geometry.morphTargets = prepareMorphTargets(targetData, vertexCount, vertexBytes);
    geometry.isDirty = true;
  }

  setInstancedModelMorphWeights(instancedModelId: number, weights: Float32Array): void {
    this._engine?.realm3dSetInstancedModelMorphWeights(
      this.realmId,
      instancedModelId,
      weights,
      weights.length
    );
  }

  updateBones(modelId: number, data: Float32Array): void {
    this._engine?.realm3dUpdateBones(this.realmId, modelId, data, data.length);
  }

  /**
   * Helper to animate a model transform directly through ECS.
   */
  animateModel(
    entityId: EntityId,
    targetValue: unknown,
    config: TransitionConfig,
    animation: AnimationCoordinator
  ): TransitionId | undefined {
    return animation.animateEcsProperty(this.world, entityId, 'transform3d', targetValue, config);
  }

  // Entity Name & Metadata Helpers
  setEntityName(entityId: EntityId, name: string): void {
    this.world.setEntityName(entityId, name);
  }
  getEntityName(entityId: EntityId): string | undefined {
    return this.world.getEntityName(entityId);
  }
  findEntityByName(name: string): EntityId | undefined {
    return this.world.findEntityByName(name);
  }
  findEntitiesByName(pattern: string | RegExp): EntityId[] {
    return this.world.findEntitiesByName(pattern);
  }
  setMetadataKV(entityId: EntityId, key: string, value: unknown): void {
    this.world.setMetadataKV(entityId, key, value);
  }
  getMetadataKV<T = unknown>(entityId: EntityId, key: string): T | undefined {
    return this.world.getMetadataKV<T>(entityId, key);
  }
  findEntitiesByMetadata(key: string, value?: unknown): EntityId[] {
    return this.world.findEntitiesByMetadata(key, value);
  }
}
