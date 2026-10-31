/**
 * High-level Realm3D manager combining an ECS World, Anchor solver, and core sync.
 */
import type {
  AnimValue,
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
import type { AnimationCoordinator } from '../animation/coordinator';
import type { Transform3DProps } from '../anchors/component';
import { AnchorSolveSystem } from '../anchors/solver';
import { HierarchyCoordinator } from '../anchors/hierarchy';
import type { EntityId } from '../ecs/entity';
import type { SystemContext } from '../ecs/system';
import { EcsWorld } from '../ecs/world';
import type { RealmConnector, RealmId, RealmKind } from '../multiverse/realm';
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
  type Camera3DComponent,
  type GeometryResourceEntry,
  type MaterialResourceEntry,
  type Mesh3DComponent,
  type Mesh3DDesc,
  type Model3DComponent,
  type ParticleEmitter3DComponent,
  type Primitive3DKind,
  type Skin3DComponent
} from './components';
import {
  type GeometryData,
  type MorphTargetData,
  packGeometryData,
  packMorphTargets
} from './geometry';
import { SkinningSolveSystem } from './skinning';
import { Realm3DSyncSystem, type Realm3DResourceProvider } from './sync';

export class Realm3D implements RealmConnector, Realm3DResourceProvider {
  readonly realmKind: RealmKind = '3d';
  readonly realmId: RealmId;
  readonly world = new EcsWorld();
  readonly solver = new AnchorSolveSystem();
  readonly skinningSystem: SkinningSolveSystem;
  readonly syncSystem: Realm3DSyncSystem;
  readonly hierarchy: HierarchyCoordinator<'3d'>;

  private readonly _geometries = new Map<number, GeometryResourceEntry>();
  private readonly _materials = new Map<number, MaterialResourceEntry>();
  private _engine: GalfusEngine | null = null;
  private _nextResourceLogicalId = 1;
  private _preRenderSteppedFrame = -1;

  constructor(realmId: RealmId | number) {
    this.realmId = realmId as RealmId;
    assertValidLogicalId(this.realmId, 'RealmId');
    this.hierarchy = new HierarchyCoordinator(this.world, '3d');
    this.skinningSystem = new SkinningSolveSystem(this.realmId, this.solver.cache);
    this.syncSystem = new Realm3DSyncSystem(this.realmId, this.solver.cache);

    // Register anchor solver and skinning solver in preRender
    this.world.addSystem('preRender', this.solver.createSystem());
    this.world.addSystem(
      'preRender',
      this.skinningSystem.createSystem(() => this._engine)
    );
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
    this._engine = engine;
    engine.realm3dCreate(this.realmId);
  }

  preRender(context: SystemContext): void {
    this.world.stepPreRender(context);
    this._preRenderSteppedFrame = context.frameId;
  }

  sync(context: SystemContext): void {
    if (this._preRenderSteppedFrame !== context.frameId) {
      this.preRender(context);
    }
    if (this._engine) {
      this.syncSystem.sync(this.world, this._engine, this);
    }
  }

  postRender(context: SystemContext): void {
    this.world.stepPostRender(context);
  }

  dispose(): void {
    this.syncSystem.dispose(this._engine);
    if (this._engine) {
      this._engine.realm3dDestroy(this.realmId);
    }
    this._engine = null;
    this.world.clear();
    this.solver.cache.clear();
    this._geometries.clear();
    this._materials.clear();
  }

  flush(): void {
    if (this._engine) {
      this.syncSystem.sync(this.world, this._engine, this);
    }
  }

  // ---------------------------------------------------------------------------
  // Resource Management (Geometries & Materials outside ECS)
  // ---------------------------------------------------------------------------
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

    let primitive: Primitive3DKind;
    if ('positions' in data) {
      const packed = packGeometryData(data);
      primitive = {
        kind: 'custom',
        topology: packed.topology,
        vertexData: packed.vertexData,
        indices: packed.indices
      };
    } else {
      primitive = data;
    }

    this._geometries.set(geometryId, { geometryId, primitive, isDirty: true });
    return { geometryId };
  }

  destroyGeometry(geometryId: number): void {
    this._geometries.delete(geometryId);
    this._engine?.realm3dDestroyGeometry(this.realmId, geometryId);
  }

  // ---------------------------------------------------------------------------
  // Fluent Entity Spawning Helpers
  // ---------------------------------------------------------------------------
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
    const entityId = this.world.createEntity();
    const skinId = this.allocateResourceId();
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
    const entityId = this.world.createEntity();
    const cameraId = this.allocateResourceId();
    this._attachModel(entityId, cameraId, transform);
    this.world.attachComponent(entityId, createCamera3D(cameraId, desc));
    return { entityId, cameraId };
  }

  createLight(desc: Light3DDesc, transform?: Transform3DProps): EntityId {
    const entityId = this.world.createEntity();
    const lightId = this.allocateResourceId();
    this._attachModel(entityId, lightId, transform);
    this.world.attachComponent(entityId, createLight3D(lightId, desc));
    return entityId;
  }

  createPrimitive(
    primitive: Primitive3DKind,
    materialId: number,
    transform?: Transform3DProps
  ): { entityId: EntityId; geometryId: number; modelId: number } {
    const { geometryId } = this.createGeometry(primitive);
    const entityId = this.createModel({ geometryId, materialId }, transform);
    const model = this.world.getComponent<Model3DComponent>(entityId, 'Model3D')!;
    return { entityId, geometryId, modelId: model.modelId };
  }

  createCube(size: number, materialId: number, transform?: Transform3DProps) {
    return this.createPrimitive({ kind: 'cube', size }, materialId, transform);
  }

  createPlane(width: number, depth: number, materialId: number, transform?: Transform3DProps) {
    return this.createPrimitive({ kind: 'plane', width, depth }, materialId, transform);
  }

  createSphere(
    radius: number,
    rings: number,
    sectors: number,
    materialId: number,
    transform?: Transform3DProps
  ) {
    return this.createPrimitive({ kind: 'sphere', radius, rings, sectors }, materialId, transform);
  }

  createCylinder(
    radius: number,
    height: number,
    sectors: number,
    materialId: number,
    transform?: Transform3DProps
  ) {
    return this.createPrimitive(
      { kind: 'cylinder', radius, height, sectors },
      materialId,
      transform
    );
  }

  createCapsule(
    radius: number,
    cylinderHeight: number,
    rings: number,
    sectors: number,
    materialId: number,
    transform?: Transform3DProps
  ) {
    return this.createPrimitive(
      { kind: 'capsule', radius, cylinderHeight, rings, sectors },
      materialId,
      transform
    );
  }

  createPyramid(
    width: number,
    depth: number,
    height: number,
    materialId: number,
    transform?: Transform3DProps
  ) {
    return this.createPrimitive({ kind: 'pyramid', width, depth, height }, materialId, transform);
  }

  createTorus(
    majorRadius: number,
    minorRadius: number,
    majorSegments: number,
    minorSegments: number,
    materialId: number,
    transform?: Transform3DProps
  ) {
    return this.createPrimitive(
      { kind: 'torus', majorRadius, minorRadius, majorSegments, minorSegments },
      materialId,
      transform
    );
  }

  createCustomGeometry(
    topology: number,
    vertexData: Uint8Array,
    indices: Uint32Array,
    materialId: number,
    transform?: Transform3DProps
  ) {
    return this.createPrimitive(
      { kind: 'custom', topology, vertexData, indices },
      materialId,
      transform
    );
  }

  // ---------------------------------------------------------------------------
  // Camera LookAt, Environment & Debug Gizmos
  // ---------------------------------------------------------------------------
  setCameraLookAt(
    camera: number | { cameraId?: number; entityId?: EntityId },
    lookAt: CameraLookAt3D
  ): void {
    const cameraId = this._resolveCameraId(camera);
    if (this._engine) {
      if (!this.syncSystem.isCameraSynced(cameraId)) this.flush();
      this._engine.realm3dSetCameraLookAt(this.realmId, cameraId, lookAt);
    }
  }

  getCameraLookAt(cameraId: number): CameraLookAt3DStateDesc | undefined {
    return this._engine?.realm3dGetCameraLookAt(this.realmId, cameraId);
  }

  clearCameraLookAt(cameraId: number): void {
    this._engine?.realm3dClearCameraLookAt(this.realmId, cameraId);
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

  // ---------------------------------------------------------------------------
  // Particles, Portals & Advanced Mesh Features
  // ---------------------------------------------------------------------------
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
    const emitterId = this._resolveEmitterId(emitter);
    if (this._engine) {
      if (!this.syncSystem.isEmitterSynced(emitterId)) this.flush();
      this._engine.realm3dParticleEmitterBurst(this.realmId, emitterId, count);
    }
  }

  private _resolveCameraId(camera: number | { cameraId?: number; entityId?: EntityId }): number {
    if (typeof camera === 'number') {
      return (
        this.world.getComponent<Camera3DComponent>(camera as EntityId, 'Camera3D')?.cameraId ??
        camera
      );
    }
    return (
      camera.cameraId ??
      (camera.entityId
        ? this.world.getComponent<Camera3DComponent>(camera.entityId, 'Camera3D')?.cameraId
        : undefined) ??
      1
    );
  }

  private _resolveEmitterId(emitter: number | { emitterId?: number; entityId?: EntityId }): number {
    if (typeof emitter === 'number') {
      return (
        this.world.getComponent<ParticleEmitter3DComponent>(
          emitter as EntityId,
          'ParticleEmitter3D'
        )?.emitterId ?? emitter
      );
    }
    return (
      emitter.emitterId ??
      (emitter.entityId
        ? this.world.getComponent<ParticleEmitter3DComponent>(emitter.entityId, 'ParticleEmitter3D')
            ?.emitterId
        : undefined) ??
      1
    );
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
    this._engine?.realm3dSetModelMorphWeights(this.realmId, modelId, weights, weights.length);
  }

  setGeometryMorphTargets(
    geometryId: number,
    targetData: Uint8Array | MorphTargetData[],
    vertexCount?: number
  ): void {
    if (!this._engine) return;
    if (targetData instanceof Uint8Array) {
      const count = vertexCount ? Math.floor(targetData.byteLength / (vertexCount * 48)) : 1;
      this._engine.realm3dSetGeometryMorphTargets(
        this.realmId,
        geometryId,
        targetData,
        targetData.byteLength,
        count
      );
    } else {
      const packed = packMorphTargets(targetData, vertexCount ?? 0);
      this._engine.realm3dSetGeometryMorphTargets(
        this.realmId,
        geometryId,
        packed.targetData,
        packed.targetData.byteLength,
        packed.targetCount
      );
    }
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
   * Helper to animate a model transform directly without manual target ID construction.
   */
  animateModel(
    entityId: EntityId,
    targetValue: AnimValue,
    config: TransitionConfig,
    animation: AnimationCoordinator
  ): TransitionId | undefined {
    const model = this.world.getComponent<Model3DComponent>(entityId, 'Model3D');
    if (!model) return undefined;
    return animation.createTransition(targetValue, config, {
      kind: 'modelTransform3D',
      realmId: this.realmId,
      modelId: model.modelId
    });
  }

  // ---------------------------------------------------------------------------
  // Entity Name & Metadata Helpers
  // ---------------------------------------------------------------------------
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
