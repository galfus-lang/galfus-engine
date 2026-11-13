/**
 * Realm 2D synchronization system syncing ECS state with core GalfusEngine.
 */

import type {
  ColliderShape2D,
  GalfusEngine,
  Material2DDesc,
  Transform2DDesc
} from '@galfus/transport-types';
import type { AnchorMatrixCache } from '../anchors/cache';
import {
  type Collider2DComponent,
  type ColliderEntry,
  getColliderEntries,
  type ColliderShape2D as HostColliderShape2D
} from '../collision/components';
import type { EntityId } from '../ecs/entity';
import type { EcsWorld } from '../ecs/world';
import { mat2d, vec2 } from '../math';
import { SpatialDirtyFlags } from '../spatial/flags';
import type {
  Camera2DComponent,
  Light2DComponent,
  Model2DComponent,
  Model2DUIComponent,
  ParticleEmitter2DComponent,
  Shape2DComponent,
  Sprite2DComponent
} from './components';

const SCALE = vec2.create();

export class Realm2DSyncSystem {
  private readonly _syncedMaterials = new Set<number>();
  private readonly _syncedSprites = new Set<number>();
  private readonly _syncedShapes = new Set<number>();
  private readonly _syncedLights = new Set<number>();
  private readonly _syncedCameras = new Set<number>();
  private readonly _syncedEmitters = new Set<number>();
  private readonly _syncedUis = new Set<number>();
  private readonly _syncedColliders = new Map<
    number,
    { modelId: number; entry: ColliderEntry<HostColliderShape2D> }
  >();

  constructor(
    readonly realmId: number,
    readonly cache: AnchorMatrixCache
  ) {}

  /**
   * Extracts a Transform2DDesc from the persistent cache and component metadata.
   */
  getResolvedTransform(world: EcsWorld, id: EntityId): Transform2DDesc {
    const model = world.getComponent<Model2DComponent>(id, 'Model2D');
    const mat = model ? model.worldMatrix : this.cache.getWorld2D(id);

    if (mat) {
      const tx = mat[4];
      const ty = mat[5];
      mat2d.getScaling(SCALE, mat);

      return {
        position: [tx, ty],
        rotation: mat2d.getRotation(mat),
        scale: [SCALE[0], SCALE[1]],
        zLayer: model?.zLayer ?? 0,
        drawOrder: model?.drawOrder ?? 0
      };
    }

    return { position: [0, 0] };
  }

  /**
   * Synchronizes all active 2D components to the engine driver.
   */
  sync(
    world: EcsWorld,
    engine: GalfusEngine,
    materials: ReadonlyMap<number, Material2DDesc> = new Map()
  ): void {
    for (const [id, desc] of materials) {
      if (!this._syncedMaterials.has(id)) {
        engine.realm2dCreateMaterial(this.realmId, id, desc);
        this._syncedMaterials.add(id);
      }
    }
    for (const id of this._syncedMaterials) {
      if (!materials.has(id)) {
        engine.realm2dDestroyMaterial(this.realmId, id);
        this._syncedMaterials.delete(id);
      }
    }
    // 1. Sync Sprites
    const spriteEntities = world.query('Sprite2D');
    const currentSprites = new Set<number>();
    for (const id of spriteEntities) {
      const sprite = world.getComponent<Sprite2DComponent>(id, 'Sprite2D');
      if (!sprite) continue;
      currentSprites.add(sprite.spriteId);

      const model = world.getComponent<Model2DComponent>(id, 'Model2D');
      const tf = this.getResolvedTransform(world, id);
      const isRegistered = this._syncedSprites.has(sprite.spriteId);
      const isSpatialDirty = model ? (model.flags & SpatialDirtyFlags.WorldDirty) !== 0 : false;

      if (!isRegistered || sprite.isDirty) {
        engine.realm2dCreateSprite(this.realmId, sprite.spriteId, sprite.desc, tf);
        this._syncedSprites.add(sprite.spriteId);
        sprite.isDirty = false;
      } else if (isSpatialDirty) {
        engine.realm2dSetSpriteTransform(this.realmId, sprite.spriteId, tf);
      }
    }
    for (const spriteId of this._syncedSprites) {
      if (!currentSprites.has(spriteId)) {
        engine.realm2dDestroySprite(this.realmId, spriteId);
        this._syncedSprites.delete(spriteId);
      }
    }

    // 2. Sync Shapes
    const shapeEntities = world.query('Shape2D');
    const currentShapes = new Set<number>();
    for (const id of shapeEntities) {
      const shape = world.getComponent<Shape2DComponent>(id, 'Shape2D');
      if (!shape) continue;
      currentShapes.add(shape.shapeId);

      const model = world.getComponent<Model2DComponent>(id, 'Model2D');
      const tf = this.getResolvedTransform(world, id);
      const isRegistered = this._syncedShapes.has(shape.shapeId);
      const isSpatialDirty = model ? (model.flags & SpatialDirtyFlags.WorldDirty) !== 0 : false;

      if (!isRegistered || shape.isDirty) {
        engine.realm2dCreateShape(this.realmId, shape.shapeId, shape.desc, tf);
        this._syncedShapes.add(shape.shapeId);
        shape.isDirty = false;
      } else if (isSpatialDirty) {
        engine.realm2dSetShapeTransform(this.realmId, shape.shapeId, tf);
      }
    }
    for (const shapeId of this._syncedShapes) {
      if (!currentShapes.has(shapeId)) {
        engine.realm2dDestroyShape(this.realmId, shapeId);
        this._syncedShapes.delete(shapeId);
      }
    }

    // 3. Sync Lights
    const lightEntities = world.query('Light2D');
    const currentLights = new Set<number>();
    for (const id of lightEntities) {
      const light = world.getComponent<Light2DComponent>(id, 'Light2D');
      if (!light) continue;
      currentLights.add(light.lightId);

      const model = world.getComponent<Model2DComponent>(id, 'Model2D');
      const isSpatialDirty = model ? (model.flags & SpatialDirtyFlags.WorldDirty) !== 0 : false;
      const tf = this.getResolvedTransform(world, id);
      if (!this._syncedLights.has(light.lightId) || light.isDirty) {
        engine.realm2dCreateLight(this.realmId, light.lightId, light.desc, tf);
        this._syncedLights.add(light.lightId);
        light.isDirty = false;
      } else if (isSpatialDirty) {
        engine.realm2dSetLightTransform(this.realmId, light.lightId, tf);
      }
    }
    for (const lightId of this._syncedLights) {
      if (!currentLights.has(lightId)) {
        engine.realm2dDestroyLight(this.realmId, lightId);
        this._syncedLights.delete(lightId);
      }
    }

    // 4. Sync Cameras
    const cameraEntities = world.query('Camera2D');
    const currentCameras = new Set<number>();
    for (const id of cameraEntities) {
      const camera = world.getComponent<Camera2DComponent>(id, 'Camera2D');
      if (!camera) continue;
      currentCameras.add(camera.cameraId);

      const model = world.getComponent<Model2DComponent>(id, 'Model2D');
      const isSpatialDirty = model ? (model.flags & SpatialDirtyFlags.WorldDirty) !== 0 : false;
      const tf = this.getResolvedTransform(world, id);
      if (!this._syncedCameras.has(camera.cameraId) || camera.isDirty) {
        engine.realm2dCreateCamera(this.realmId, camera.cameraId, camera.desc, tf);
        this._syncedCameras.add(camera.cameraId);
        camera.isDirty = false;
      } else if (isSpatialDirty) {
        engine.realm2dSetCameraTransform(this.realmId, camera.cameraId, tf);
      }
    }
    for (const camId of this._syncedCameras) {
      if (!currentCameras.has(camId)) {
        engine.realm2dDestroyCamera(this.realmId, camId);
        this._syncedCameras.delete(camId);
      }
    }

    // 5. Sync Particle Emitters
    const emitterEntities = world.query('ParticleEmitter2D');
    const currentEmitters = new Set<number>();
    for (const id of emitterEntities) {
      const emitter = world.getComponent<ParticleEmitter2DComponent>(id, 'ParticleEmitter2D');
      if (!emitter) continue;
      currentEmitters.add(emitter.emitterId);

      const model = world.getComponent<Model2DComponent>(id, 'Model2D');
      const isSpatialDirty = model ? (model.flags & SpatialDirtyFlags.WorldDirty) !== 0 : false;
      const tf = this.getResolvedTransform(world, id);
      if (!this._syncedEmitters.has(emitter.emitterId) || emitter.isDirty) {
        engine.realm2dCreateParticleEmitter(this.realmId, emitter.emitterId, emitter.desc, tf);
        this._syncedEmitters.add(emitter.emitterId);
        emitter.isDirty = false;
      } else if (isSpatialDirty) {
        engine.realm2dSetParticleEmitterTransform(this.realmId, emitter.emitterId, tf);
      }
    }
    for (const emitterId of this._syncedEmitters) {
      if (!currentEmitters.has(emitterId)) {
        engine.realm2dDestroyParticleEmitter(this.realmId, emitterId);
        this._syncedEmitters.delete(emitterId);
      }
    }

    // 7. Sync UIs
    const uiEntities = world.query('Model2DUI');
    const currentUis = new Set<number>();
    for (const id of uiEntities) {
      const ui = world.getComponent<Model2DUIComponent>(id, 'Model2DUI');
      if (!ui) continue;
      currentUis.add(ui.uiId);

      const model = world.getComponent<Model2DComponent>(id, 'Model2D');
      const isSpatialDirty = model ? (model.flags & SpatialDirtyFlags.WorldDirty) !== 0 : false;
      const tf = this.getResolvedTransform(world, id);
      if (!this._syncedUis.has(ui.uiId)) {
        engine.realm2dCreateUi(this.realmId, ui.uiId, ui.desc, tf);
        this._syncedUis.add(ui.uiId);
        ui.isDirty = false;
      } else if (ui.isDirty) {
        engine.realm2dSetUiContent(this.realmId, ui.uiId, ui.desc);
        ui.isDirty = false;
        if (isSpatialDirty) {
          engine.realm2dSetUiTransform(this.realmId, ui.uiId, tf);
        }
      } else if (isSpatialDirty) {
        engine.realm2dSetUiTransform(this.realmId, ui.uiId, tf);
      }
      while (ui.pendingCommands.length > 0) {
        engine.realm2dApplyUiCommands(this.realmId, ui.uiId, ui.pendingCommands[0]!);
        ui.pendingCommands.shift();
      }
    }
    for (const uiId of this._syncedUis) {
      if (!currentUis.has(uiId)) {
        engine.realm2dDestroyUi(this.realmId, uiId);
        this._syncedUis.delete(uiId);
      }
    }

    // 8. Sync Colliders
    const colliderEntities = world.query('Collider2D');
    const currentColliders = new Set<number>();
    for (const id of colliderEntities) {
      const colliderComp = world.getComponent<Collider2DComponent>(id, 'Collider2D');
      const model = world.getComponent<Model2DComponent>(id, 'Model2D');
      if (!colliderComp || !model) continue;

      for (const entry of getColliderEntries(colliderComp)) {
        if (!entry.active) continue;
        const previous = this._syncedColliders.get(entry.colliderId);
        currentColliders.add(entry.colliderId);
        if (!previous || previous.modelId !== model.modelId || previous.entry !== entry) {
          let shapeDesc: ColliderShape2D;
          if (entry.shape.type === 'rectangle') {
            shapeDesc = { type: 'rectangle', halfExtents: entry.shape.halfExtents };
          } else if (entry.shape.type === 'circle') {
            shapeDesc = { type: 'circle', radius: entry.shape.radius };
          } else {
            shapeDesc = { type: 'polygon', vertices: entry.shape.vertices };
          }
          engine.realm2dCreateCollider(this.realmId, entry.colliderId, model.modelId, {
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
        engine.realm2dDestroyCollider(this.realmId, colliderId);
        this._syncedColliders.delete(colliderId);
      }
    }

    // 8. Clear WorldDirty for all Model2D entities after all Core sync steps are complete
    for (const id of world.query('Model2D')) {
      const model = world.getComponent<Model2DComponent>(id, 'Model2D');
      if (model) {
        model.flags &= ~SpatialDirtyFlags.WorldDirty;
      }
    }
  }

  isEmitterSynced(emitterId: number): boolean {
    return this._syncedEmitters.has(emitterId);
  }

  isUiSynced(uiId: number): boolean {
    return this._syncedUis.has(uiId);
  }

  /**
   * Disposes all tracked IDs on the engine when the realm is destroyed.
   */
  dispose(engine: GalfusEngine | null): void {
    if (engine) {
      for (const id of this._syncedSprites) engine.realm2dDestroySprite(this.realmId, id);
      for (const id of this._syncedShapes) engine.realm2dDestroyShape(this.realmId, id);
      for (const id of this._syncedLights) engine.realm2dDestroyLight(this.realmId, id);
      for (const id of this._syncedCameras) engine.realm2dDestroyCamera(this.realmId, id);
      for (const id of this._syncedEmitters) engine.realm2dDestroyParticleEmitter(this.realmId, id);
      for (const id of this._syncedUis) engine.realm2dDestroyUi(this.realmId, id);
      for (const id of this._syncedMaterials) engine.realm2dDestroyMaterial(this.realmId, id);
      for (const id of this._syncedColliders.keys()) {
        try {
          engine.realm2dDestroyCollider(this.realmId, id);
        } catch {}
      }
    }
    this._syncedSprites.clear();
    this._syncedShapes.clear();
    this._syncedLights.clear();
    this._syncedCameras.clear();
    this._syncedEmitters.clear();
    this._syncedUis.clear();
    this._syncedMaterials.clear();
    this._syncedColliders.clear();
  }
}
