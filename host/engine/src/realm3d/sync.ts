/**
 * Realm 3D synchronization system syncing ECS state and resource registries with core GalfusEngine.
 */

import type {
  ColliderShape3D,
  GalfusEngine,
  Model3DDesc,
  Transform3D
} from '@galfus/transport-types';
import type { AnchorMatrixCache } from '../anchors/cache';
import {
  type Collider3DComponent,
  type ColliderEntry,
  getColliderEntries,
  type ColliderShape3D as HostColliderShape3D
} from '../collision/components';
import type { EntityId } from '../ecs/entity';
import type { EcsWorld } from '../ecs/world';
import { mat4, quat, vec3 } from '../math/index';
import { SpatialDirtyFlags } from '../spatial/flags';
import type {
  Camera3DComponent,
  GeometryResourceEntry,
  InstancedModel3DComponent,
  Light3DComponent,
  MaterialResourceEntry,
  Mesh3DComponent,
  Model3DComponent,
  ParticleEmitter3DComponent,
  Portal3DComponent,
  Primitive3DKind
} from './components';

export interface Realm3DResourceProvider {
  getGeometries(): Iterable<GeometryResourceEntry>;
  getMaterials(): Iterable<MaterialResourceEntry>;
}

const scratchTrans = vec3.create();
const scratchRot = quat.create();
const scratchScale = vec3.create();

export class Realm3DSyncSystem {
  private readonly _syncedGeometries = new Set<number>();
  private readonly _syncedMaterials = new Set<number>();
  private readonly _syncedModels = new Set<number>();
  private readonly _syncedCameras = new Set<number>();
  private readonly _syncedLights = new Set<number>();
  private readonly _syncedEmitters = new Set<number>();
  private readonly _syncedPortals = new Set<number>();
  private readonly _syncedInstancedModels = new Set<number>();
  private readonly _syncedColliders = new Map<
    number,
    { modelId: number; entry: ColliderEntry<HostColliderShape3D> }
  >();
  private readonly _transformCache = new Map<EntityId, Transform3D>();

  constructor(
    readonly realmId: number,
    readonly cache: AnchorMatrixCache
  ) {}

  /**
   * Extracts a Transform3D from the resolved model world matrix or cache.
   */
  getResolvedTransform(world: EcsWorld, id: EntityId): Transform3D {
    let tf = this._transformCache.get(id);
    if (!tf) {
      tf = {
        position: [0, 0, 0],
        rotation: [0, 0, 0, 1],
        scale: [1, 1, 1]
      };
      this._transformCache.set(id, tf);
    }

    const model = world.getComponent<Model3DComponent>(id, 'Model3D');
    const mat = model ? model.worldMatrix : this.cache.getWorld3D(id);

    if (mat) {
      mat4.getTranslation(scratchTrans, mat);
      mat4.getRotation(scratchRot, mat);
      mat4.getScaling(scratchScale, mat);

      const p = tf.position;
      p[0] = scratchTrans[0]!;
      p[1] = scratchTrans[1]!;
      p[2] = scratchTrans[2]!;

      const r = tf.rotation!;
      r[0] = scratchRot[0]!;
      r[1] = scratchRot[1]!;
      r[2] = scratchRot[2]!;
      r[3] = scratchRot[3]!;

      const s = tf.scale!;
      s[0] = scratchScale[0]!;
      s[1] = scratchScale[1]!;
      s[2] = scratchScale[2]!;
    } else {
      tf.position[0] = 0;
      tf.position[1] = 0;
      tf.position[2] = 0;
    }

    return tf;
  }

  private _uploadPrimitive(
    engine: GalfusEngine,
    geometryId: number,
    primitive: Primitive3DKind
  ): void {
    switch (primitive.kind) {
      case 'cube':
        engine.realm3dCreateCube(this.realmId, geometryId, primitive.size);
        break;
      case 'plane':
        engine.realm3dCreatePlane(this.realmId, geometryId, primitive.width, primitive.depth);
        break;
      case 'quad':
        engine.realm3dCreateQuad(this.realmId, geometryId, primitive.width, primitive.height);
        break;
      case 'sphere':
        engine.realm3dCreateSphere(
          this.realmId,
          geometryId,
          primitive.radius,
          primitive.rings,
          primitive.sectors
        );
        break;
      case 'cylinder':
        engine.realm3dCreateCylinder(
          this.realmId,
          geometryId,
          primitive.radius,
          primitive.height,
          primitive.sectors
        );
        break;
      case 'capsule':
        engine.realm3dCreateCapsule(
          this.realmId,
          geometryId,
          primitive.radius,
          primitive.cylinderHeight,
          primitive.rings,
          primitive.sectors
        );
        break;
      case 'pyramid':
        engine.realm3dCreatePyramid(
          this.realmId,
          geometryId,
          primitive.width,
          primitive.depth,
          primitive.height
        );
        break;
      case 'torus':
        engine.realm3dCreateTorus(
          this.realmId,
          geometryId,
          primitive.majorRadius,
          primitive.minorRadius,
          primitive.majorSegments,
          primitive.minorSegments
        );
        break;
      case 'custom':
        engine.realm3dCreateGeometry(
          this.realmId,
          geometryId,
          primitive.topology,
          primitive.vertexData,
          primitive.vertexData.byteLength,
          primitive.indices,
          primitive.indices.length
        );
        break;
    }
  }

  /**
   * Synchronizes all active 3D resources and ECS components to the engine driver.
   */
  sync(world: EcsWorld, engine: GalfusEngine, resourceProvider?: Realm3DResourceProvider): void {
    // 1. Sync geometries from the resource registry
    const currentGeometries = new Set<number>();
    if (resourceProvider) {
      for (const geo of resourceProvider.getGeometries()) {
        currentGeometries.add(geo.geometryId);
        if (!this._syncedGeometries.has(geo.geometryId) || geo.isDirty) {
          this._uploadPrimitive(engine, geo.geometryId, geo.primitive);
          if (geo.morphTargets) {
            const { data, count } = geo.morphTargets;
            engine.realm3dSetGeometryMorphTargets(
              this.realmId,
              geo.geometryId,
              data,
              data.byteLength,
              count
            );
          }
          this._syncedGeometries.add(geo.geometryId);
          geo.isDirty = false;
        }
      }
    }
    for (const geoId of this._syncedGeometries) {
      if (!currentGeometries.has(geoId)) {
        engine.realm3dDestroyGeometry(this.realmId, geoId);
        this._syncedGeometries.delete(geoId);
      }
    }

    // 2. Sync materials from the resource registry
    const currentMaterials = new Set<number>();
    if (resourceProvider) {
      for (const mat of resourceProvider.getMaterials()) {
        currentMaterials.add(mat.materialId);
        if (!this._syncedMaterials.has(mat.materialId) || mat.isDirty) {
          engine.realm3dCreateMaterial(this.realmId, mat.materialId, mat.desc);
          this._syncedMaterials.add(mat.materialId);
          mat.isDirty = false;
        }
      }
    }
    for (const matId of this._syncedMaterials) {
      if (!currentMaterials.has(matId)) {
        engine.realm3dDestroyMaterial(this.realmId, matId);
        this._syncedMaterials.delete(matId);
      }
    }

    // 3. Sync Models & Meshes
    const modelEntities = world.query('Model3D');
    const currentModels = new Set<number>();
    for (const id of modelEntities) {
      const mesh = world.getComponent<Mesh3DComponent>(id, 'Mesh3D');
      // If the entity has no mesh AND has a dedicated spatial component (Camera, Light, Emitter, Portal, InstancedModel),
      // we do not register an empty Rust model for it.
      if (
        !mesh &&
        (world.hasComponent(id, 'Camera3D') ||
          world.hasComponent(id, 'Light3D') ||
          world.hasComponent(id, 'ParticleEmitter3D') ||
          world.hasComponent(id, 'Portal3D') ||
          world.hasComponent(id, 'InstancedModel3D'))
      ) {
        continue;
      }
      const model = world.getComponent<Model3DComponent>(id, 'Model3D');
      if (!model) continue;
      currentModels.add(model.modelId);

      const tf = this.getResolvedTransform(world, id);
      const isRegistered = this._syncedModels.has(model.modelId);
      const isSpatialDirty = (model.flags & SpatialDirtyFlags.WorldDirty) !== 0;
      const isMeshDirty = mesh ? mesh.isDirty : false;

      if (!isRegistered || isMeshDirty) {
        const desc: Model3DDesc = {
          geometryId: mesh ? mesh.geometryId : 0,
          materialId: mesh ? mesh.materialId : 0,
          castShadow: mesh ? mesh.castShadow : true,
          receiveShadow: mesh ? mesh.receiveShadow : true,
          castOutline: mesh ? mesh.castOutline : false,
          outlineColor: mesh ? mesh.outlineColor : [1, 1, 1, 1],
          active: mesh ? mesh.active : true,
          boneOffset: mesh ? mesh.boneOffset : 0,
          boneCount: mesh ? mesh.boneCount : 0
        };
        engine.realm3dCreateModel(this.realmId, model.modelId, desc, tf);
        this._syncedModels.add(model.modelId);
        if (mesh) mesh.isDirty = false;
      } else if (isSpatialDirty) {
        engine.realm3dSetModelTransform(this.realmId, model.modelId, tf);
      }
    }
    for (const modelId of this._syncedModels) {
      if (!currentModels.has(modelId)) {
        engine.realm3dDestroyModel(this.realmId, modelId);
        this._syncedModels.delete(modelId);
        this._transformCache.delete(modelId);
      }
    }

    // 4. Sync Cameras
    const cameraEntities = world.query('Camera3D');
    const currentCameras = new Set<number>();
    for (const id of cameraEntities) {
      const camera = world.getComponent<Camera3DComponent>(id, 'Camera3D');
      if (!camera) continue;
      currentCameras.add(camera.cameraId);

      const model = world.getComponent<Model3DComponent>(id, 'Model3D');
      const isSpatialDirty = model ? (model.flags & SpatialDirtyFlags.WorldDirty) !== 0 : false;
      const tf = this.getResolvedTransform(world, id);
      if (!this._syncedCameras.has(camera.cameraId) || camera.isDirty) {
        engine.realm3dCreateCamera(this.realmId, camera.cameraId, camera.desc, tf);
        this._syncedCameras.add(camera.cameraId);
        camera.isDirty = false;
      } else if (isSpatialDirty) {
        engine.realm3dSetCameraTransform(this.realmId, camera.cameraId, tf);
      }
    }
    for (const camId of this._syncedCameras) {
      if (!currentCameras.has(camId)) {
        engine.realm3dDestroyCamera(this.realmId, camId);
        this._syncedCameras.delete(camId);
      }
    }

    // 5. Sync Lights
    const lightEntities = world.query('Light3D');
    const currentLights = new Set<number>();
    for (const id of lightEntities) {
      const light = world.getComponent<Light3DComponent>(id, 'Light3D');
      if (!light) continue;
      currentLights.add(light.lightId);

      const model = world.getComponent<Model3DComponent>(id, 'Model3D');
      const isSpatialDirty = model ? (model.flags & SpatialDirtyFlags.WorldDirty) !== 0 : false;
      const tf = this.getResolvedTransform(world, id);
      if (!this._syncedLights.has(light.lightId) || light.isDirty) {
        engine.realm3dCreateLight(this.realmId, light.lightId, light.desc, tf);
        this._syncedLights.add(light.lightId);
        light.isDirty = false;
      } else if (isSpatialDirty) {
        engine.realm3dSetLightTransform(this.realmId, light.lightId, tf);
      }
    }
    for (const lightId of this._syncedLights) {
      if (!currentLights.has(lightId)) {
        engine.realm3dDestroyLight(this.realmId, lightId);
        this._syncedLights.delete(lightId);
      }
    }

    // 6. Sync Particle Emitters
    const emitterEntities = world.query('ParticleEmitter3D');
    const currentEmitters = new Set<number>();
    for (const id of emitterEntities) {
      const emitter = world.getComponent<ParticleEmitter3DComponent>(id, 'ParticleEmitter3D');
      if (!emitter) continue;
      currentEmitters.add(emitter.emitterId);

      const model = world.getComponent<Model3DComponent>(id, 'Model3D');
      const isSpatialDirty = model ? (model.flags & SpatialDirtyFlags.WorldDirty) !== 0 : false;
      const tf = this.getResolvedTransform(world, id);
      if (!this._syncedEmitters.has(emitter.emitterId) || emitter.isDirty) {
        engine.realm3dCreateParticleEmitter(this.realmId, emitter.emitterId, emitter.desc, tf);
        this._syncedEmitters.add(emitter.emitterId);
        emitter.isDirty = false;
      } else if (isSpatialDirty) {
        engine.realm3dSetParticleEmitterTransform(this.realmId, emitter.emitterId, tf);
      }
    }
    for (const emitterId of this._syncedEmitters) {
      if (!currentEmitters.has(emitterId)) {
        engine.realm3dDestroyParticleEmitter(this.realmId, emitterId);
        this._syncedEmitters.delete(emitterId);
      }
    }

    // 7. Sync Portals
    const portalEntities = world.query('Portal3D');
    const currentPortals = new Set<number>();
    for (const id of portalEntities) {
      const portal = world.getComponent<Portal3DComponent>(id, 'Portal3D');
      if (!portal) continue;
      currentPortals.add(portal.portalId);

      if (!this._syncedPortals.has(portal.portalId) || portal.isDirty) {
        engine.realm3dCreatePortal(this.realmId, portal.portalId, portal.desc);
        this._syncedPortals.add(portal.portalId);
        portal.isDirty = false;
      }
    }
    for (const portalId of this._syncedPortals) {
      if (!currentPortals.has(portalId)) {
        engine.realm3dDestroyPortal(this.realmId, portalId);
        this._syncedPortals.delete(portalId);
      }
    }

    // 8. Sync Instanced Models
    const instancedEntities = world.query('InstancedModel3D');
    const currentInstanced = new Set<number>();
    for (const id of instancedEntities) {
      const instanced = world.getComponent<InstancedModel3DComponent>(id, 'InstancedModel3D');
      if (!instanced) continue;
      currentInstanced.add(instanced.instancedModelId);

      if (!this._syncedInstancedModels.has(instanced.instancedModelId) || instanced.isDirty) {
        engine.realm3dCreateInstancedModel(
          this.realmId,
          instanced.instancedModelId,
          instanced.desc
        );
        this._syncedInstancedModels.add(instanced.instancedModelId);
        instanced.isDirty = false;
      }
    }
    for (const instancedId of this._syncedInstancedModels) {
      if (!currentInstanced.has(instancedId)) {
        engine.realm3dDestroyInstancedModel(this.realmId, instancedId);
        this._syncedInstancedModels.delete(instancedId);
      }
    }

    // 9. Sync Colliders
    const colliderEntities = world.query('Collider3D');
    const currentColliders = new Set<number>();
    for (const id of colliderEntities) {
      const colliderComp = world.getComponent<Collider3DComponent>(id, 'Collider3D');
      const model = world.getComponent<Model3DComponent>(id, 'Model3D');
      if (!colliderComp || !model) continue;

      for (const entry of getColliderEntries(colliderComp)) {
        if (!entry.active) continue;
        const previous = this._syncedColliders.get(entry.colliderId);
        if (
          entry.shape.type !== 'box' &&
          entry.shape.type !== 'sphere' &&
          entry.shape.type !== 'cylinder' &&
          entry.shape.type !== 'capsule' &&
          entry.shape.type !== 'plane'
        )
          continue;
        currentColliders.add(entry.colliderId);
        if (!previous || previous.modelId !== model.modelId || previous.entry !== entry) {
          let shapeDesc: ColliderShape3D;
          if (entry.shape.type === 'box') {
            shapeDesc = { type: 'box', halfExtents: entry.shape.halfExtents };
          } else if (entry.shape.type === 'sphere') {
            shapeDesc = { type: 'sphere', radius: entry.shape.radius };
          } else if (entry.shape.type === 'cylinder') {
            shapeDesc = {
              type: 'cylinder',
              radius: entry.shape.radius,
              halfHeight: entry.shape.halfHeight
            };
          } else if (entry.shape.type === 'capsule') {
            shapeDesc = {
              type: 'capsule',
              radius: entry.shape.radius,
              halfHeight: entry.shape.halfHeight
            };
          } else {
            shapeDesc = { type: 'rectangle', halfExtents: entry.shape.halfExtents };
          }
          engine.realm3dCreateCollider(this.realmId, entry.colliderId, model.modelId, {
            shape: shapeDesc,
            localMatrix: [...entry.matrix],
            sensor: entry.sensor ?? false,
            layer: entry.layer,
            mask: entry.mask
          });
          this._syncedColliders.set(entry.colliderId, { modelId: model.modelId, entry });
        }
      }
    }
    for (const colliderId of this._syncedColliders.keys()) {
      if (!currentColliders.has(colliderId)) {
        engine.realm3dDestroyCollider(this.realmId, colliderId);
        this._syncedColliders.delete(colliderId);
      }
    }

    // 10. Clear WorldDirty for all Model3D entities after all Core sync steps are complete
    for (const id of modelEntities) {
      const model = world.getComponent<Model3DComponent>(id, 'Model3D');
      if (model) {
        model.flags &= ~SpatialDirtyFlags.WorldDirty;
      }
    }
  }

  isCameraSynced(cameraId: number): boolean {
    return this._syncedCameras.has(cameraId);
  }

  isEmitterSynced(emitterId: number): boolean {
    return this._syncedEmitters.has(emitterId);
  }

  /**
   * Disposes all tracked IDs on the engine when the realm is destroyed.
   */
  dispose(engine: GalfusEngine | null): void {
    if (engine) {
      for (const id of this._syncedModels) engine.realm3dDestroyModel(this.realmId, id);
      for (const id of this._syncedLights) engine.realm3dDestroyLight(this.realmId, id);
      for (const id of this._syncedCameras) engine.realm3dDestroyCamera(this.realmId, id);
      for (const id of this._syncedMaterials) engine.realm3dDestroyMaterial(this.realmId, id);
      for (const id of this._syncedGeometries) engine.realm3dDestroyGeometry(this.realmId, id);
      for (const id of this._syncedEmitters) engine.realm3dDestroyParticleEmitter(this.realmId, id);
      for (const id of this._syncedPortals) engine.realm3dDestroyPortal(this.realmId, id);
      for (const id of this._syncedInstancedModels)
        engine.realm3dDestroyInstancedModel(this.realmId, id);
      for (const id of this._syncedColliders.keys()) {
        try {
          engine.realm3dDestroyCollider(this.realmId, id);
        } catch {}
      }
    }
    this._syncedModels.clear();
    this._syncedLights.clear();
    this._syncedCameras.clear();
    this._syncedMaterials.clear();
    this._syncedGeometries.clear();
    this._syncedEmitters.clear();
    this._syncedPortals.clear();
    this._syncedInstancedModels.clear();
    this._syncedColliders.clear();
    this._transformCache.clear();
  }
}
