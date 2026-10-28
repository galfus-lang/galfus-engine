/**
 * Realm 3D synchronization system syncing ECS state with core GalfusEngine.
 */
import type { GalfusEngine, Transform3D } from '@galfus/transport-types';
import type { AnchorMatrixCache } from '../anchors/cache';
import type { Transform3DComponent } from '../anchors/component';
import type { EntityId } from '../ecs/entity';
import type { EcsWorld } from '../ecs/world';
import { mat4, quat, vec3 } from '../math/index';
import type {
  Camera3DComponent,
  Geometry3DComponent,
  InstancedModel3DComponent,
  Light3DComponent,
  Material3DComponent,
  Model3DComponent,
  ParticleEmitter3DComponent,
  Portal3DComponent
} from './components';

export class Realm3DSyncSystem {
  private readonly _syncedGeometries = new Set<number>();
  private readonly _syncedMaterials = new Set<number>();
  private readonly _syncedModels = new Set<number>();
  private readonly _syncedCameras = new Set<number>();
  private readonly _syncedLights = new Set<number>();
  private readonly _syncedEmitters = new Set<number>();
  private readonly _syncedPortals = new Set<number>();
  private readonly _syncedInstancedModels = new Set<number>();

  constructor(
    readonly realmId: number,
    readonly cache: AnchorMatrixCache
  ) {}

  /**
   * Extracts a Transform3D from the persistent cache and component metadata.
   */
  getResolvedTransform(world: EcsWorld, id: EntityId): Transform3D {
    const mat = this.cache.getWorld3D(id);
    const tf = world.getComponent<Transform3DComponent>(id, 'Transform3D');

    if (mat) {
      const trans = vec3.create();
      const rot = quat.create();
      const sc = vec3.create();

      mat4.getTranslation(trans, mat);
      mat4.getRotation(rot, mat);
      mat4.getScaling(sc, mat);

      return {
        position: [trans[0], trans[1], trans[2]],
        rotation: [rot[0], rot[1], rot[2], rot[3]],
        scale: [sc[0], sc[1], sc[2]]
      };
    }

    if (tf) {
      return {
        position: [tf.position[0], tf.position[1], tf.position[2]],
        rotation: [tf.rotation[0], tf.rotation[1], tf.rotation[2], tf.rotation[3]],
        scale: [tf.scale[0], tf.scale[1], tf.scale[2]]
      };
    }

    return { position: [0, 0, 0] };
  }

  /**
   * Synchronizes all active 3D components to the engine driver.
   */
  sync(world: EcsWorld, engine: GalfusEngine): void {
    // 1. Sync Geometries
    const geoEntities = world.query('Geometry3D');
    const currentGeometries = new Set<number>();
    for (const id of geoEntities) {
      const geo = world.getComponent<Geometry3DComponent>(id, 'Geometry3D');
      if (!geo) continue;
      currentGeometries.add(geo.geometryId);

      if (!this._syncedGeometries.has(geo.geometryId) || geo.isDirty) {
        switch (geo.primitive.kind) {
          case 'cube':
            engine.realm3dCreateCube(this.realmId, geo.geometryId, geo.primitive.size);
            break;
          case 'plane':
            engine.realm3dCreatePlane(
              this.realmId,
              geo.geometryId,
              geo.primitive.width,
              geo.primitive.depth
            );
            break;
          case 'quad':
            engine.realm3dCreateQuad(
              this.realmId,
              geo.geometryId,
              geo.primitive.width,
              geo.primitive.height
            );
            break;
          case 'sphere':
            engine.realm3dCreateSphere(
              this.realmId,
              geo.geometryId,
              geo.primitive.radius,
              geo.primitive.rings,
              geo.primitive.sectors
            );
            break;
          case 'cylinder':
            engine.realm3dCreateCylinder(
              this.realmId,
              geo.geometryId,
              geo.primitive.radius,
              geo.primitive.height,
              geo.primitive.sectors
            );
            break;
          case 'capsule':
            engine.realm3dCreateCapsule(
              this.realmId,
              geo.geometryId,
              geo.primitive.radius,
              geo.primitive.cylinderHeight,
              geo.primitive.rings,
              geo.primitive.sectors
            );
            break;
          case 'pyramid':
            engine.realm3dCreatePyramid(
              this.realmId,
              geo.geometryId,
              geo.primitive.width,
              geo.primitive.depth,
              geo.primitive.height
            );
            break;
          case 'torus':
            engine.realm3dCreateTorus(
              this.realmId,
              geo.geometryId,
              geo.primitive.majorRadius,
              geo.primitive.minorRadius,
              geo.primitive.majorSegments,
              geo.primitive.minorSegments
            );
            break;
          case 'custom':
            engine.realm3dCreateGeometry(
              this.realmId,
              geo.geometryId,
              geo.primitive.topology,
              geo.primitive.vertexData,
              geo.primitive.vertexData.byteLength,
              geo.primitive.indices,
              geo.primitive.indices.length
            );
            break;
        }
        this._syncedGeometries.add(geo.geometryId);
        geo.isDirty = false;
      }
    }
    for (const geoId of this._syncedGeometries) {
      if (!currentGeometries.has(geoId)) {
        engine.realm3dDestroyGeometry(this.realmId, geoId);
        this._syncedGeometries.delete(geoId);
      }
    }

    // 2. Sync Materials
    const matEntities = world.query('Material3D');
    const currentMaterials = new Set<number>();
    for (const id of matEntities) {
      const matComp = world.getComponent<Material3DComponent>(id, 'Material3D');
      if (!matComp) continue;
      currentMaterials.add(matComp.materialId);

      if (!this._syncedMaterials.has(matComp.materialId) || matComp.isDirty) {
        engine.realm3dCreateMaterial(this.realmId, matComp.materialId, matComp.desc);
        this._syncedMaterials.add(matComp.materialId);
        matComp.isDirty = false;
      }
    }
    for (const matId of this._syncedMaterials) {
      if (!currentMaterials.has(matId)) {
        engine.realm3dDestroyMaterial(this.realmId, matId);
        this._syncedMaterials.delete(matId);
      }
    }

    // 3. Sync Models
    const modelEntities = world.query('Model3D');
    const currentModels = new Set<number>();
    for (const id of modelEntities) {
      const model = world.getComponent<Model3DComponent>(id, 'Model3D');
      if (!model) continue;
      currentModels.add(model.modelId);

      const tf = this.getResolvedTransform(world, id);
      if (!this._syncedModels.has(model.modelId) || model.isDirty) {
        engine.realm3dCreateModel(this.realmId, model.modelId, model.desc, tf);
        this._syncedModels.add(model.modelId);
        model.isDirty = false;
      } else {
        engine.realm3dSetModelTransform(this.realmId, model.modelId, tf);
      }
    }
    for (const modelId of this._syncedModels) {
      if (!currentModels.has(modelId)) {
        engine.realm3dDestroyModel(this.realmId, modelId);
        this._syncedModels.delete(modelId);
      }
    }

    // 4. Sync Cameras
    const cameraEntities = world.query('Camera3D');
    for (const id of cameraEntities) {
      const camera = world.getComponent<Camera3DComponent>(id, 'Camera3D');
      if (!camera) continue;

      const tf = this.getResolvedTransform(world, id);
      if (!this._syncedCameras.has(camera.cameraId) || camera.isDirty) {
        engine.realm3dCreateCamera(this.realmId, camera.cameraId, camera.desc, tf);
        this._syncedCameras.add(camera.cameraId);
        camera.isDirty = false;
      } else {
        engine.realm3dSetCameraTransform(this.realmId, camera.cameraId, tf);
      }
    }

    // 5. Sync Lights
    const lightEntities = world.query('Light3D');
    const currentLights = new Set<number>();
    for (const id of lightEntities) {
      const light = world.getComponent<Light3DComponent>(id, 'Light3D');
      if (!light) continue;
      currentLights.add(light.lightId);

      const tf = this.getResolvedTransform(world, id);
      if (!this._syncedLights.has(light.lightId) || light.isDirty) {
        engine.realm3dCreateLight(this.realmId, light.lightId, light.desc, tf);
        this._syncedLights.add(light.lightId);
        light.isDirty = false;
      } else {
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

      const tf = this.getResolvedTransform(world, id);
      if (!this._syncedEmitters.has(emitter.emitterId) || emitter.isDirty) {
        engine.realm3dCreateParticleEmitter(this.realmId, emitter.emitterId, emitter.desc, tf);
        this._syncedEmitters.add(emitter.emitterId);
        emitter.isDirty = false;
      } else {
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
    }
    this._syncedModels.clear();
    this._syncedLights.clear();
    this._syncedCameras.clear();
    this._syncedMaterials.clear();
    this._syncedGeometries.clear();
    this._syncedEmitters.clear();
    this._syncedPortals.clear();
    this._syncedInstancedModels.clear();
  }
}
