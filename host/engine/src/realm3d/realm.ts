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
import { createTransform3D, type Transform3DProps } from '../anchors/component';
import { AnchorSolveSystem } from '../anchors/solver';
import { HierarchyCoordinator } from '../anchors/hierarchy';
import type { EntityId } from '../ecs/entity';
import type { SystemContext } from '../ecs/system';
import { EcsWorld } from '../ecs/world';
import type { RealmConnector, RealmId, RealmKind } from '../multiverse/realm';
import type { TransitionId } from '../types';
import {
  createCamera3D,
  createGeometry3D,
  createInstancedModel3D,
  createLight3D,
  createMaterial3D,
  createModel3D,
  createParticleEmitter3D,
  createPortal3D,
  type Camera3DComponent,
  type Model3DComponent,
  type ParticleEmitter3DComponent,
  type Primitive3DKind
} from './components';
import {
  type GeometryData,
  type MorphTargetData,
  packGeometryData,
  packMorphTargets
} from './geometry';
import { Realm3DSyncSystem } from './sync';

export class Realm3D implements RealmConnector {
  readonly realmKind: RealmKind = '3d';
  readonly realmId: RealmId;
  readonly world = new EcsWorld();
  readonly solver = new AnchorSolveSystem();
  readonly syncSystem: Realm3DSyncSystem;
  readonly hierarchy: HierarchyCoordinator<'3d'>;

  private _engine: GalfusEngine | null = null;
  private _nextResourceLogicalId = 1;

  constructor(realmId: RealmId | number) {
    this.realmId = realmId as RealmId;
    assertValidLogicalId(this.realmId, 'RealmId');
    this.hierarchy = new HierarchyCoordinator(this.world, '3d');
    this.syncSystem = new Realm3DSyncSystem(this.realmId, this.solver.cache);

    // Register anchor solver in preRender
    this.world.addSystem('preRender', this.solver.createSystem());
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

  sync(context: SystemContext): void {
    // 1. Advance ECS simulation
    this.world.step(context);

    // 2. Synchronize state with native core
    if (this._engine) {
      this.syncSystem.sync(this.world, this._engine);
    }
  }

  dispose(): void {
    this.syncSystem.dispose(this._engine);
    if (this._engine) {
      this._engine.realm3dDestroy(this.realmId);
    }
    this._engine = null;
    this.world.clear();
    this.solver.cache.clear();
  }

  // ---------------------------------------------------------------------------
  // Fluent Entity Spawning Helpers
  // ---------------------------------------------------------------------------
  flush(): void {
    if (this._engine) {
      this.syncSystem.sync(this.world, this._engine);
    }
  }

  createModel(desc: Model3DDesc, transform?: Transform3DProps): EntityId {
    const entityId = this.world.createEntity();
    const modelId = this.allocateResourceId();
    this.world.attachComponent(entityId, createTransform3D(transform));
    this.world.attachComponent(entityId, createModel3D(modelId, desc));
    return entityId;
  }

  createCamera(
    desc: Camera3DDesc,
    transform?: Transform3DProps
  ): { entityId: EntityId; cameraId: number } {
    const entityId = this.world.createEntity();
    const cameraId = this.allocateResourceId();
    this.world.attachComponent(entityId, createTransform3D(transform));
    this.world.attachComponent(entityId, createCamera3D(cameraId, desc));
    return { entityId, cameraId };
  }

  createLight(desc: Light3DDesc, transform?: Transform3DProps): EntityId {
    const entityId = this.world.createEntity();
    const lightId = this.allocateResourceId();
    this.world.attachComponent(entityId, createTransform3D(transform));
    this.world.attachComponent(entityId, createLight3D(lightId, desc));
    return entityId;
  }

  createMaterial(desc: Material3DDesc): { entityId: EntityId; materialId: number } {
    const entityId = this.world.createEntity();
    const materialId = this.allocateResourceId();
    this.world.attachComponent(entityId, createMaterial3D(materialId, desc));
    return { entityId, materialId };
  }

  /**
   * Creates a 3D geometry from semantic vertex attributes or a primitive descriptor.
   */
  createGeometry(
    data: GeometryData | Primitive3DKind,
    materialId?: number,
    transform?: Transform3DProps
  ): { entityId: EntityId; geometryId: number; modelId?: number } {
    const entityId = this.world.createEntity();
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

    this.world.attachComponent(entityId, createTransform3D(transform));
    this.world.attachComponent(entityId, createGeometry3D(geometryId, primitive));

    let modelId: number | undefined;
    if (materialId !== undefined) {
      modelId = this.allocateResourceId();
      this.world.attachComponent(
        entityId,
        createModel3D(modelId, {
          geometryId,
          materialId
        })
      );
    }

    return { entityId, geometryId, modelId };
  }

  createPrimitive(
    primitive: Primitive3DKind,
    materialId: number,
    transform?: Transform3DProps
  ): { entityId: EntityId; geometryId: number; modelId: number } {
    const entityId = this.world.createEntity();
    const geometryId = this.allocateResourceId();
    const modelId = this.allocateResourceId();

    this.world.attachComponent(entityId, createTransform3D(transform));
    this.world.attachComponent(entityId, createGeometry3D(geometryId, primitive));
    this.world.attachComponent(
      entityId,
      createModel3D(modelId, {
        geometryId,
        materialId
      })
    );

    return { entityId, geometryId, modelId };
  }

  createCube(
    size: number,
    materialId: number,
    transform?: Transform3DProps
  ): { entityId: EntityId; geometryId: number; modelId: number } {
    return this.createPrimitive({ kind: 'cube', size }, materialId, transform);
  }

  createPlane(
    width: number,
    depth: number,
    materialId: number,
    transform?: Transform3DProps
  ): { entityId: EntityId; geometryId: number; modelId: number } {
    return this.createPrimitive({ kind: 'plane', width, depth }, materialId, transform);
  }

  createSphere(
    radius: number,
    rings: number,
    sectors: number,
    materialId: number,
    transform?: Transform3DProps
  ): { entityId: EntityId; geometryId: number; modelId: number } {
    return this.createPrimitive({ kind: 'sphere', radius, rings, sectors }, materialId, transform);
  }

  createCylinder(
    radius: number,
    height: number,
    sectors: number,
    materialId: number,
    transform?: Transform3DProps
  ): { entityId: EntityId; geometryId: number; modelId: number } {
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
  ): { entityId: EntityId; geometryId: number; modelId: number } {
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
  ): { entityId: EntityId; geometryId: number; modelId: number } {
    return this.createPrimitive({ kind: 'pyramid', width, depth, height }, materialId, transform);
  }

  createTorus(
    majorRadius: number,
    minorRadius: number,
    majorSegments: number,
    minorSegments: number,
    materialId: number,
    transform?: Transform3DProps
  ): { entityId: EntityId; geometryId: number; modelId: number } {
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
  ): { entityId: EntityId; geometryId: number; modelId: number } {
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
    const cameraId =
      typeof camera === 'number'
        ? (this.world.getComponent<Camera3DComponent>(camera as EntityId, 'Camera3D')?.cameraId ??
          camera)
        : (camera.cameraId ??
          (camera.entityId
            ? this.world.getComponent<Camera3DComponent>(camera.entityId, 'Camera3D')?.cameraId
            : undefined) ??
          1);
    if (this._engine) {
      if (!this.syncSystem.isCameraSynced(cameraId)) {
        this.flush();
      }
      this._engine.realm3dSetCameraLookAt(this.realmId, cameraId, lookAt);
    }
  }

  getCameraLookAt(cameraId: number): CameraLookAt3DStateDesc | undefined {
    return this._engine?.realm3dGetCameraLookAt(this.realmId, cameraId);
  }

  clearCameraLookAt(cameraId: number): void {
    if (this._engine) {
      this._engine.realm3dClearCameraLookAt(this.realmId, cameraId);
    }
  }

  setEnvironment(environment: EnvironmentRealm3DDesc): void {
    if (this._engine) {
      this._engine.realm3dSetEnvironment(this.realmId, environment);
    }
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
    if (this._engine) {
      this._engine.realm3dDrawLine(this.realmId, x0, y0, z0, x1, y1, z1, r, g, b, a);
    }
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
    if (this._engine) {
      this._engine.realm3dDrawAabb(this.realmId, minX, minY, minZ, maxX, maxY, maxZ, r, g, b, a);
    }
  }

  clearGizmos(): void {
    if (this._engine) {
      this._engine.realm3dClearGizmos(this.realmId);
    }
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
    this.world.attachComponent(entityId, createTransform3D(transform));
    this.world.attachComponent(entityId, createParticleEmitter3D(emitterId, desc));
    return { entityId, emitterId };
  }

  particleEmitterBurst(
    emitter: number | { emitterId?: number; entityId?: EntityId },
    count: number
  ): void {
    const emitterId =
      typeof emitter === 'number'
        ? (this.world.getComponent<ParticleEmitter3DComponent>(
            emitter as EntityId,
            'ParticleEmitter3D'
          )?.emitterId ?? emitter)
        : (emitter.emitterId ??
          (emitter.entityId
            ? this.world.getComponent<ParticleEmitter3DComponent>(
                emitter.entityId,
                'ParticleEmitter3D'
              )?.emitterId
            : undefined) ??
          1);
    if (this._engine) {
      if (!this.syncSystem.isEmitterSynced(emitterId)) {
        this.flush();
      }
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
    if (this._engine) {
      this._engine.realm3dSetPortalActive(this.realmId, portalId, active);
    }
  }

  createInstancedModel(desc: InstancedModel3DDesc): EntityId {
    const entityId = this.world.createEntity();
    const instancedModelId = this.allocateResourceId();
    this.world.attachComponent(entityId, createInstancedModel3D(instancedModelId, desc));
    return entityId;
  }

  setInstancedModelData(instancedModelId: number, data: Float32Array): void {
    if (this._engine) {
      this._engine.realm3dSetInstancedModelData(this.realmId, instancedModelId, data, data.length);
    }
  }

  setModelMorphWeights(modelId: number, weights: Float32Array): void {
    if (this._engine) {
      this._engine.realm3dSetModelMorphWeights(this.realmId, modelId, weights, weights.length);
    }
  }

  setGeometryMorphTargets(
    geometryId: number,
    targetData: Uint8Array | MorphTargetData[],
    vertexCount?: number
  ): void {
    if (this._engine) {
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
  }

  setInstancedModelMorphWeights(instancedModelId: number, weights: Float32Array): void {
    if (this._engine) {
      this._engine.realm3dSetInstancedModelMorphWeights(
        this.realmId,
        instancedModelId,
        weights,
        weights.length
      );
    }
  }

  updateBones(modelId: number, data: Float32Array): void {
    if (this._engine) {
      this._engine.realm3dUpdateBones(this.realmId, modelId, data, data.length);
    }
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
